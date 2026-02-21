import React, { useState, useEffect } from 'react';
import { App, Spin, Button, Tag, Empty, Tabs, Badge, Popconfirm, message } from 'antd';
import { BellOutlined, SwapOutlined, CheckOutlined, CloseOutlined, UndoOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import Cookies from 'js-cookie';
import { io } from 'socket.io-client';

export default function Notifications() {
    const { message: antdMessage } = App.useApp();
    const location = useLocation();

    // URL Params for Deep Linking
    const queryParams = new URLSearchParams(location.search);
    const urlTab = queryParams.get('tab') || '1';
    const urlId = queryParams.get('id');

    const [loading, setLoading] = useState(true);
    const [transfersLoading, setTransfersLoading] = useState(false);

    // States
    const [notifications, setNotifications] = useState([]);
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [approvingId, setApprovingId] = useState(null);
    const [activeTab, setActiveTab] = useState(urlTab);
    const [pushPermission, setPushPermission] = useState(Notification.permission);

    const currentUser = JSON.parse(Cookies.get('rememberedUser') || '{}');
    const isMonitor = currentUser?.ROLE === 'MONITOR';

    const PUBLIC_VAPID_KEY = 'BFJGcJs3zH5JigFKbeWomDRIyERD4ea7RcDIdb-kNEg7djAEsBbg1mLa168kY4DsZFfdoqPHyncEiM62KRWWt9A';

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    const fetchNotifications = async () => {
        try {
            const response = await axios.get('/api/notifications');
            if (response.data.success) {
                setNotifications(response.data.result || []);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        }
    };

    const fetchPendingTransfers = async () => {
        setTransfersLoading(true);
        try {
            const response = await axios.get('/api/stock-transfers/pending');
            if (response.data.success) {
                setPendingTransfers(response.data.requests || []);
            }
        } catch (error) {
            console.error('Error fetching transfers:', error);
        } finally {
            setTransfersLoading(false);
        }
    };

    const markAsRead = async () => {
        try {
            await axios.post('/api/notifications/mark-read');
            window.dispatchEvent(new CustomEvent('notifications-read'));
        } catch (error) {
            console.error('Failed to mark notifications as read:', error);
        }
    };

    const fetchAll = async () => {
        setLoading(true);
        await Promise.all([
            fetchNotifications(),
            fetchPendingTransfers(),
            markAsRead()
        ]);
        setLoading(false);
    };

    useEffect(() => {
        fetchAll();

        // Socket.IO for real-time list updates
        const socket = io('/', { path: '/socket.io' });
        socket.on('new_notification', (data) => {
            fetchNotifications();
            fetchPendingTransfers();
            markAsRead();
        });

        const handleReadEvent = () => fetchNotifications();
        window.addEventListener('notifications-read', handleReadEvent);

        return () => {
            socket.disconnect();
            window.removeEventListener('notifications-read', handleReadEvent);
        };
    }, []);

    useEffect(() => {
        if (urlId && !loading && !transfersLoading) {
            setTimeout(() => {
                const prefix = activeTab === '1' ? 'transfer-' : 'system-';
                const el = document.getElementById(`${prefix}${urlId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 300);
        }
    }, [urlId, activeTab, loading, transfersLoading]);

    const enablePushNotifications = async () => {
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted' && 'serviceWorker' in navigator && 'PushManager' in window) {
                const registration = await navigator.serviceWorker.ready;
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
                });
                await axios.post('/api/push/subscribe', subscription);
                setPushPermission('granted');
                antdMessage.success('Browser Push Notifications Enabled!');
            } else {
                setPushPermission(permission);
                antdMessage.error('Push Notifications were denied by your browser.');
            }
        } catch (error) {
            console.error('Push configuration error:', error);
            antdMessage.error('Failed to enable push notifications.');
        }
    };

    const handleApproveTransfer = async (transferId, clearanceType = 'PARTIAL') => {
        setApprovingId(transferId);
        try {
            const response = await axios.post('/api/stock-transfers/approve', {
                transferId,
                approvedBy: currentUser?.USER_ID || currentUser?.id,
                approvedByName: currentUser?.NAME || currentUser?.name || 'Unknown',
                comments: `Approved via Web App (${clearanceType})`,
                clearanceType
            });
            if (response.data.success) {
                antdMessage.success('Transfer approved successfully');
                fetchPendingTransfers();
            } else {
                antdMessage.error('Approval failed: ' + response.data.message);
            }
        } catch (error) {
            console.error('Error approving transfer:', error);
            antdMessage.error('Approval failed');
        } finally {
            setApprovingId(null);
        }
    };

    const handleDeclineTransfer = async (transferId) => {
        const reason = window.prompt("Enter reason for declining:");
        if (reason === null) return;

        setApprovingId(transferId);
        try {
            const response = await axios.post('/api/stock-transfers/decline', {
                transferId,
                approvedBy: currentUser?.USER_ID || currentUser?.id,
                approvedByName: currentUser?.NAME || currentUser?.name || 'Unknown',
                comments: reason || 'Declined'
            });
            if (response.data.success) {
                antdMessage.success('Transfer declined');
                fetchPendingTransfers();
            } else {
                antdMessage.error('Decline failed: ' + response.data.message);
            }
        } catch (error) {
            console.error('Error declining transfer:', error);
            antdMessage.error('Decline failed');
        } finally {
            setApprovingId(null);
        }
    };

    const systemAlerts = notifications.filter(n => n.type === 'RETURN' || n.type === 'SYSTEM');

    const tabItems = [
        {
            key: '1',
            label: <span className="font-semibold px-2 md:px-4 text-sm md:text-base tracking-wide whitespace-nowrap"><SwapOutlined className="mr-1 md:mr-2" /> Requests {pendingTransfers.length > 0 && <Badge count={pendingTransfers.length} style={{ backgroundColor: '#10b981', marginLeft: 8 }} />}</span>,
            children: (
                <div className="glass-card p-3 md:p-6 rounded-2xl md:rounded-3xl mt-4 border border-white/5 relative overflow-hidden min-h-[400px]">
                    {transfersLoading ? (
                        <div className="flex justify-center items-center py-20">
                            <Spin size="large" />
                        </div>
                    ) : pendingTransfers.length === 0 ? (
                        <div className="flex justify-center items-center py-20">
                            <Empty description={<span className="text-gray-400">No pending transfer requests</span>} />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {pendingTransfers.map(request => (
                                <div id={`transfer-${request.id}`} key={request.id} className={`bg-white/5 backdrop-blur-md rounded-2xl p-4 md:p-5 border shadow-sm transition-all duration-300 ${urlId == request.id ? 'border-emerald-500 ring-2 ring-emerald-500/50' : 'border-white/5 hover:border-emerald-500/30'}`}>
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative">
                                        <div className="flex-1 w-full">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-[10px] md:text-xs font-bold bg-purple-500/20 text-purple-400 px-2 py-0.5 md:px-2.5 md:py-1 rounded-full uppercase tracking-widest border border-purple-500/20">
                                                    Transfer Request
                                                </span>
                                                <span className="text-xs text-gray-500 font-mono hidden md:inline-block">({request.local_id})</span>
                                            </div>
                                            <div className="flex items-start md:items-center gap-1 md:gap-4 mb-2 flex-col md:flex-row">
                                                <div className="text-base md:text-xl font-bold text-gray-800 dark:text-white">
                                                    {request.main_item_name}
                                                </div>
                                                {request.has_conversion ? (
                                                    <Tag color="orange" className="font-bold m-0 border-orange-500/30 text-xs md:text-sm">Auto Conversion</Tag>
                                                ) : (
                                                    <div className="text-base md:text-xl font-bold text-emerald-500">
                                                        {request.main_item_qty > 0 ? `${request.main_item_qty} Kg` : 'FULL CLEAR'}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-xs md:text-sm text-gray-500 flex items-center gap-2 mb-3">
                                                <span>From: <strong className="text-gray-300">Store {request.store_from_id}</strong></span>
                                                <span>→</span>
                                                <span>To: <strong className="text-gray-300">Store {request.store_to_id}</strong></span>
                                            </div>
                                            {request.has_conversion && request.conversions && request.conversions.length > 0 && (
                                                <div className="bg-black/20 rounded-xl p-2 md:p-3 border border-white/5 mt-2">
                                                    <div className="text-[10px] md:text-xs text-gray-400 mb-1 md:mb-2 uppercase tracking-wider font-semibold">Outputs</div>
                                                    <div className="flex flex-wrap gap-1.5 md:gap-2">
                                                        {request.conversions.map(conv => (
                                                            <Tag key={conv.id} color="blue" className="bg-blue-500/10 border-blue-500/20 text-blue-300 px-2 py-0.5 md:px-3 md:py-1 text-[10px] md:text-sm m-0">
                                                                {conv.dest_item_name}: <span className="font-bold ml-1">{conv.dest_qty} Kg</span>
                                                            </Tag>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {request.comments && (
                                                <div className="mt-3 text-xs md:text-sm text-gray-400 bg-white/5 p-2 md:p-3 rounded-xl border border-white/5 italic break-words">
                                                    "{request.comments}" - <span className="text-[10px] md:text-xs not-italic text-gray-500">{request.created_by_name}</span>
                                                </div>
                                            )}
                                        </div>
                                        {!isMonitor && (
                                            <div className="flex flex-row md:flex-col gap-2 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-white/10 md:pl-4 md:border-l">
                                                <Popconfirm title="Approve Full Transfer?" description="Are you sure you want to approve this full transfer?" onConfirm={() => handleApproveTransfer(request.id, 'FULL')} okText="Yes" cancelText="No">
                                                    <Button type="primary" size="middle" icon={<CheckOutlined />} loading={approvingId === request.id} className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-500 border-none rounded-xl font-semibold shadow-lg shadow-emerald-500/20 text-xs md:text-sm">
                                                        <span className="hidden md:inline">Approve </span>Full
                                                    </Button>
                                                </Popconfirm>
                                                <Popconfirm title="Approve Partial Transfer?" description="Are you sure you want to approve as a partial transfer?" onConfirm={() => handleApproveTransfer(request.id, 'PARTIAL')} okText="Yes" cancelText="No">
                                                    <Button type="primary" size="middle" icon={<CheckOutlined />} loading={approvingId === request.id} className="flex-1 md:flex-none bg-teal-600 hover:bg-teal-500 border-none rounded-xl font-semibold shadow-lg shadow-teal-500/20 text-xs md:text-sm">
                                                        <span className="hidden md:inline">Approve </span>Partial
                                                    </Button>
                                                </Popconfirm>
                                                <Popconfirm title="Decline Transfer?" description="You will be prompted for a reason if you click Yes." onConfirm={() => handleDeclineTransfer(request.id)} okText="Yes, Decline" cancelText="Cancel" okButtonProps={{ danger: true }}>
                                                    <Button danger type="primary" size="middle" icon={<CloseOutlined />} disabled={approvingId === request.id} className="flex-1 md:flex-none !bg-red-500/20 hover:!bg-red-500/30 text-red-400 hover:text-red-300 !border-red-500/50 rounded-xl font-semibold backdrop-blur-sm text-xs md:text-sm">
                                                        Decline
                                                    </Button>
                                                </Popconfirm>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )
        },
        {
            key: '2',
            label: <span className="font-semibold px-2 md:px-4 text-sm md:text-base tracking-wide whitespace-nowrap"><BellOutlined className="mr-1 md:mr-2" /> Alerts & System {systemAlerts.length > 0 && <Badge count={systemAlerts.length} style={{ backgroundColor: '#f97316', marginLeft: 8 }} />}</span>,
            children: (
                <div className="glass-card p-3 md:p-6 rounded-2xl md:rounded-3xl mt-4 border border-white/5 relative overflow-hidden min-h-[400px]">
                    {loading ? (
                        <div className="flex justify-center items-center py-20">
                            <Spin size="large" />
                        </div>
                    ) : systemAlerts.length === 0 ? (
                        <div className="flex justify-center items-center py-20">
                            <Empty description={<span className="text-gray-400">No recent alerts found</span>} />
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {systemAlerts.map(alert => (
                                <div id={`system-${alert.id}`} key={alert.id} className={`bg-white/5 hover:bg-white/10 transition-colors backdrop-blur-md rounded-2xl p-3 md:p-4 border flex flex-col sm:flex-row gap-3 md:gap-4 items-start sm:items-center ${urlId == alert.id ? 'border-orange-500 ring-2 ring-orange-500/50' : 'border-white/5'}`}>
                                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-orange-500/20 flex-shrink-0 flex items-center justify-center text-orange-400 shadow-inner ring-1 ring-orange-500/30">
                                        {alert.type === 'RETURN' ? <UndoOutlined className="text-sm md:text-base" /> : <BellOutlined className="text-sm md:text-base" />}
                                    </div>
                                    <div className="flex-1">
                                        <div className="font-bold text-gray-200 text-sm md:text-lg mb-0.5 md:mb-1">{alert.title}</div>
                                        <div className="text-gray-400 text-xs md:text-sm leading-relaxed">{alert.message}</div>
                                    </div>
                                    <div className="text-[10px] md:text-xs text-gray-500 font-mono opacity-50 whitespace-nowrap pt-1 sm:pt-0">
                                        {dayjs(alert.created_at).format('DD MMM YY, hh:mm A')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4 sm:mb-8">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800 dark:text-white tracking-tight flex items-center">
                        <BellOutlined className="mr-3 text-emerald-500" /> Notifications
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2">View and manage system alerts and inventory requests</p>
                </div>
                {pushPermission !== 'granted' && (
                    <Button
                        type="primary"
                        size="large"
                        icon={<BellOutlined />}
                        onClick={enablePushNotifications}
                        className="!bg-emerald-500 hover:!bg-emerald-600 !border-none rounded-xl text-xs sm:text-sm shadow-lg shadow-emerald-500/20"
                    >
                        Turn on Desktop Notifications
                    </Button>
                )}
            </div>

            <div className="relative">
                <Tabs activeKey={activeTab} onChange={setActiveTab} className="notifications-tabs" items={tabItems} />
            </div>
        </div>
    );
}
