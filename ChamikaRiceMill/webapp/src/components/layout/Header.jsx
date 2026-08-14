import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SunOutlined, MoonOutlined, LogoutOutlined, BellOutlined, CheckCircleOutlined, CloseCircleOutlined, RightOutlined, ClockCircleOutlined, AlertOutlined } from '@ant-design/icons';
import { Dropdown, Button, message, Badge, Popover, Tag, Spin, Drawer } from 'antd';
import { useTheme } from '../ui/ThemeProvider';
import Cookies from 'js-cookie';
import axios from 'axios';

export default function Header() {
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const pageTitle = location.pathname.split('/')[1]?.replace(/-/g, ' ') || 'Dashboard';

    const [chequesList, setChequesList] = useState([]);
    const [loadingCheques, setLoadingCheques] = useState(false);
    const [mobileNotifDrawer, setMobileNotifDrawer] = useState(false);

    useEffect(() => {
        fetchPendingCheques();
    }, []);

    const fetchPendingCheques = async () => {
        setLoadingCheques(true);
        try {
            const res = await axios.get('/api/mill/cheques/list', { withCredentials: true });
            if (res.data.success) {
                const pending = (res.data.result || []).filter(c => c.STATUS === 'PENDING');
                setChequesList(pending);
            }
        } catch (e) {
            console.error('Failed to load pending cheques:', e);
        } finally {
            setLoadingCheques(false);
        }
    };

    const handleQuickStatusChange = async (chequeId, status, e) => {
        if (e) e.stopPropagation();
        try {
            const res = await axios.post('/api/mill/cheques/update-status', { CHEQUE_ID: chequeId, STATUS: status }, { withCredentials: true });
            if (res.data.success) {
                message.success(`Cheque marked as ${status}`);
                fetchPendingCheques();
            }
        } catch (err) {
            console.error(err);
            message.error('Failed to update status');
        }
    };

    const getUserData = () => {
        try {
            const cookieData = Cookies.get('millUser');
            if (cookieData) return JSON.parse(cookieData);
        } catch (e) { console.error('Error parsing user cookie:', e); }
        return {};
    };

    const userData = getUserData();
    const userName = userData.NAME || 'User';
    const userRole = userData.ROLE || 'Staff';
    const userPhoto = userData.PHOTO || null;
    const userInitial = userName.charAt(0).toUpperCase();

    const handleLogout = () => {
        Cookies.remove('millUser', { path: '/' });
        Cookies.remove('millUser');
        Cookies.remove('rememberedUser', { path: '/' });
        Cookies.remove('rememberedUser');
        localStorage.removeItem('millUser');
        sessionStorage.clear();
        message.success('Logged out successfully');
        window.location.href = '/login';
    };

    // Helper to calculate due status
    const getChequeInfo = (dueStr) => {
        if (!dueStr) return { type: 'UPCOMING', label: 'Upcoming', color: 'default', canAction: false, order: 3 };
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dueDate = new Date(dueStr);
        dueDate.setHours(0, 0, 0, 0);
        
        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { 
                type: 'OVERDUE', 
                label: `Overdue by ${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'day' : 'days'}`, 
                color: 'error', 
                canAction: true, 
                order: 1 
            };
        } else if (diffDays === 0) {
            return { 
                type: 'DUE_TODAY', 
                label: 'Due Today!', 
                color: 'warning', 
                canAction: true, 
                order: 2 
            };
        } else {
            return { 
                type: 'UPCOMING', 
                label: `Due in ${diffDays} ${diffDays === 1 ? 'day' : 'days'}`, 
                color: 'processing', 
                canAction: false, // NO quick action buttons for upcoming reminders
                order: 3 
            };
        }
    };

    // Categorize and sort cheques
    const categorizedCheques = chequesList.map(c => ({
        ...c,
        info: getChequeInfo(c.DUE_DATE)
    })).sort((a, b) => a.info.order - b.info.order);

    const urgentCount = categorizedCheques.filter(c => c.info.canAction).length;

    // Profile Dropdown Menu Items
    const profileMenuItems = [
        {
            key: 'user-info',
            label: (
                <div className="flex items-center gap-3 py-2 px-1">
                    {userPhoto ? (
                        <img src={userPhoto} alt="Profile" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-sky-500 flex items-center justify-center text-white font-bold">
                            {userInitial}
                        </div>
                    )}
                    <div>
                        <div className="font-semibold text-gray-800 dark:text-white">{userName}</div>
                        <div className="text-xs text-gray-500">{userRole}</div>
                    </div>
                </div>
            ),
            disabled: true,
        },
        { type: 'divider' },
        {
            key: 'logout',
            danger: true,
            icon: <LogoutOutlined />,
            label: 'Logout',
            onClick: handleLogout,
        },
    ];

    // Notification Popover Content
    const notificationContent = (
        <div className="w-80 md:w-96 max-h-[420px] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 mb-2 border-b dark:border-gray-700">
                <span className="font-bold text-gray-800 dark:text-white">Cheque Reminders</span>
                <div className="flex gap-1">
                    {urgentCount > 0 && <Tag color="error">{urgentCount} Action Needed</Tag>}
                    <Tag color="blue">{categorizedCheques.length} Total</Tag>
                </div>
            </div>

            {loadingCheques ? (
                <div className="text-center py-4"><Spin size="small" /></div>
            ) : categorizedCheques.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">No pending cheque reminders right now</div>
            ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {categorizedCheques.map(c => {
                        const { info } = c;
                        return (
                            <div 
                                key={c.CHEQUE_ID} 
                                onClick={() => navigate('/cheques')}
                                className="py-2.5 px-1.5 hover:bg-gray-50 dark:hover:bg-slate-800/60 rounded cursor-pointer transition-colors"
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-semibold text-xs text-blue-600 dark:text-blue-400">
                                                Chq #{c.CHEQUE_NUMBER} ({c.BANK || 'Bank'})
                                            </span>
                                            <Tag color={info.color} className="!mr-0 text-[10px] py-0 px-1.5">
                                                {info.label}
                                            </Tag>
                                        </div>
                                        <div className="text-[11px] text-gray-500 mt-0.5">
                                            {c.CUSTOMER_NAME || 'Walk-in'} • Inv: {c.INVOICE_NO || '-'}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-xs text-gray-800 dark:text-gray-200">
                                            Rs. {parseFloat(c.AMOUNT || 0).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                {/* Conditional Render: Quick Buttons ONLY for Due Today or Overdue */}
                                {info.canAction ? (
                                    <div className="flex gap-2 mt-2 pt-1.5 border-t border-gray-100 dark:border-slate-800" onClick={e => e.stopPropagation()}>
                                        <Button 
                                            size="small" 
                                            type="primary"
                                            className="!bg-emerald-600 hover:!bg-emerald-700 !border-none text-[10px] h-6 px-2 flex-1"
                                            icon={<CheckCircleOutlined />}
                                            onClick={(e) => handleQuickStatusChange(c.CHEQUE_ID, 'CLEARED', e)}
                                        >
                                            Collected / Cleared
                                        </Button>
                                        <Button 
                                            size="small" 
                                            danger 
                                            className="text-[10px] h-6 px-2 flex-1"
                                            icon={<CloseCircleOutlined />}
                                            onClick={(e) => handleQuickStatusChange(c.CHEQUE_ID, 'RETURNED', e)}
                                        >
                                            Returned
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="mt-1 text-[10px] text-gray-400 italic">
                                        Reminder: Due on {c.DUE_DATE ? new Date(c.DUE_DATE).toLocaleDateString() : '-'} (Action buttons active on due date)
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="pt-3 mt-2 border-t dark:border-gray-700 text-center">
                <Button 
                    type="link" 
                    size="small" 
                    onClick={() => navigate('/cheques')} 
                    className="text-xs font-semibold"
                >
                    View All Cheques <RightOutlined className="text-[10px]" />
                </Button>
            </div>
        </div>
    );

    return (
        <header className="sticky top-0 z-40 w-full max-w-full overflow-hidden h-16 md:h-20 bg-gray-50/80 dark:bg-[#0f1012]/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-white/5 flex items-center justify-between px-3 md:px-8 transition-all pt-safe-top">
            {/* Title Area */}
            <div className="flex-1 flex items-center gap-2.5">
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-slate-900/60 ring-1 ring-white/10 flex items-center justify-center overflow-hidden p-0.5 shrink-0">
                    <img src="/logo-dark.png" alt="Chamika Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                    <h1 className="text-lg md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 capitalize m-0 leading-tight">
                        {pageTitle}
                    </h1>
                    <p className="hidden md:block text-[11px] text-gray-400 m-0">
                        Chamika Rice Mill Management
                    </p>
                </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 md:gap-4">
                {/* Cheque Notifications Bell - Desktop Popover */}
                <div className="hidden md:block">
                    <Popover content={notificationContent} trigger="click" placement="bottomRight">
                        <button
                            className="relative w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 flex items-center justify-center text-gray-600 dark:text-gray-300 transition-all active:scale-95"
                        >
                            <Badge count={urgentCount > 0 ? urgentCount : categorizedCheques.length} overflowCount={99} offset={[-2, 2]}>
                                <BellOutlined className="text-xl" />
                            </Badge>
                        </button>
                    </Popover>
                </div>

                {/* Cheque Notifications Bell - Mobile Drawer */}
                <div className="md:hidden">
                    <button
                        onClick={() => setMobileNotifDrawer(true)}
                        className="relative w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 flex items-center justify-center text-gray-600 dark:text-gray-300 transition-all active:scale-95"
                    >
                        <Badge count={urgentCount > 0 ? urgentCount : categorizedCheques.length} overflowCount={99} offset={[-2, 2]}>
                            <BellOutlined className="text-xl" />
                        </Badge>
                    </button>

                    <Drawer
                        placement="bottom"
                        onClose={() => setMobileNotifDrawer(false)}
                        open={mobileNotifDrawer}
                        height="auto"
                        closeIcon={null}
                        styles={{
                            wrapper: { boxShadow: 'none' },
                            section: { background: 'transparent', boxShadow: 'none', height: 'auto' },
                            body: { padding: 0 }
                        }}
                    >
                        <div className="bg-[#18181b]/95 backdrop-blur-2xl rounded-t-[32px] p-5 pb-8 border-t border-white/10 shadow-2xl relative max-h-[85vh] overflow-y-auto">
                            <div className="w-12 h-1.5 bg-zinc-700/50 rounded-full mx-auto mb-4" />
                            <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                                <span className="font-bold text-white text-base">Cheque Reminders</span>
                                <div className="flex gap-1.5">
                                    {urgentCount > 0 && <Tag color="error">{urgentCount} Action Needed</Tag>}
                                    <Tag color="blue">{categorizedCheques.length} Total</Tag>
                                </div>
                            </div>

                            {loadingCheques ? (
                                <div className="text-center py-6"><Spin size="small" /></div>
                            ) : categorizedCheques.length === 0 ? (
                                <div className="text-center py-6 text-gray-400 text-xs">No pending cheque reminders right now</div>
                            ) : (
                                <div className="divide-y divide-white/10 space-y-2">
                                    {categorizedCheques.map(c => {
                                        const { info } = c;
                                        return (
                                            <div 
                                                key={c.CHEQUE_ID} 
                                                onClick={() => { setMobileNotifDrawer(false); navigate('/cheques'); }}
                                                className="pt-2.5 pb-1 px-1.5 hover:bg-white/5 rounded-xl cursor-pointer transition-colors"
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <div>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-bold text-sm text-blue-400 font-mono">
                                                                Chq #{c.CHEQUE_NUMBER} ({c.BANK || 'Bank'})
                                                            </span>
                                                            <Tag color={info.color} className="!mr-0 text-[10px] py-0 px-1.5 font-bold">
                                                                {info.label}
                                                            </Tag>
                                                        </div>
                                                        <div className="text-xs text-gray-400 mt-1">
                                                            {c.CUSTOMER_NAME || 'Walk-in'} • Inv: <span className="font-mono text-blue-400">{c.INVOICE_NO || '-'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-bold text-sm text-emerald-400 font-mono">
                                                            Rs. {parseFloat(c.AMOUNT || 0).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>

                                                {info.canAction ? (
                                                    <div className="flex gap-2 mt-2 pt-2 border-t border-white/10" onClick={e => e.stopPropagation()}>
                                                        <Button 
                                                            size="small" 
                                                            type="primary"
                                                            className="!bg-emerald-600 hover:!bg-emerald-700 !border-none text-xs h-8 px-3 flex-1 font-bold rounded-lg"
                                                            icon={<CheckCircleOutlined />}
                                                            onClick={(e) => handleQuickStatusChange(c.CHEQUE_ID, 'CLEARED', e)}
                                                        >
                                                            Collected / Cleared
                                                        </Button>
                                                        <Button 
                                                            size="small" 
                                                            danger 
                                                            className="text-xs h-8 px-3 flex-1 font-bold rounded-lg"
                                                            icon={<CloseCircleOutlined />}
                                                            onClick={(e) => handleQuickStatusChange(c.CHEQUE_ID, 'RETURNED', e)}
                                                        >
                                                            Returned
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="mt-1 text-[11px] text-gray-400 italic">
                                                        Reminder: Due on {c.DUE_DATE ? new Date(c.DUE_DATE).toLocaleDateString() : '-'}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <Button 
                                type="primary" 
                                block 
                                size="large" 
                                onClick={() => { setMobileNotifDrawer(false); navigate('/cheques'); }} 
                                className="mt-4 !bg-blue-600 font-bold rounded-xl h-11"
                            >
                                View All Cheques ({categorizedCheques.length})
                            </Button>
                        </div>
                    </Drawer>
                </div>


                {/* User Profile with Dropdown */}
                <div className="pl-2 md:pl-3 border-l border-gray-200 dark:border-white/10 flex items-center gap-3">
                    <div className="text-right hidden md:block">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{userName}</p>
                        <p className="text-xs text-gray-500">{userRole}</p>
                    </div>

                    <Dropdown
                        menu={{ items: profileMenuItems }}
                        trigger={['click']}
                        placement="bottomRight"
                    >
                        <div className="relative cursor-pointer ring-2 ring-transparent hover:ring-blue-500/50 active:ring-blue-500 rounded-full transition-all">
                            {userPhoto ? (
                                <img src={userPhoto} alt="Profile" className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover shadow-lg" />
                            ) : (
                                <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-r from-blue-500 to-sky-500 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">
                                    {userInitial}
                                </div>
                            )}
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-[#0f1012] rounded-full" />
                        </div>
                    </Dropdown>
                </div>
            </div>
        </header>
    );
}
