import React, { useState, useEffect } from 'react';
import { Spin, Tag, Card, Button, Table, App, Badge, Popconfirm, Space, Tabs, Alert } from 'antd';
import {
    ReloadOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
    WalletOutlined,
    RiseOutlined,
    SwapOutlined,
    UserOutlined,
    BankOutlined,
    ExclamationCircleOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    BellOutlined,
    CalendarOutlined
} from '@ant-design/icons';
import Cookies from 'js-cookie';
import axios from 'axios';
import dayjs from 'dayjs';
import TerminalMonitor from '../components/TerminalMonitor';

export default function Dashboard() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState({
        global: { sales: 0, buying: 0, expenses: 0, profit: 0, avgProfit: 0 },
        todayInwardKg: 0,
        todayInwardRecords: 0,
        todayInwardBags: 0,
        stockMovement: [],
        chequeAlerts: { overdue: [], dueToday: [], upcoming: [] },
        staffMembers: []
    });

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/mill/dashboard/stats', { withCredentials: true });
            if (res.data.success) {
                setData(res.data.data);
            } else {
                message.error('Failed to load dashboard data');
            }
        } catch (error) {
            console.error('Dashboard fetch error:', error);
            message.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const handleChequeStatusUpdate = async (chequeId, newStatus) => {
        try {
            const res = await axios.post('/api/mill/cheques/update-status', {
                CHEQUE_ID: chequeId,
                STATUS: newStatus
            }, { withCredentials: true });

            if (res.data.success) {
                message.success(`Cheque status updated to ${newStatus}`);
                fetchDashboardData();
            } else {
                message.error(res.data.message || 'Failed to update cheque status');
            }
        } catch (e) {
            console.error(e);
            message.error('Error updating cheque status');
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-LK', {
            style: 'currency',
            currency: 'LKR',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    const handleLogout = () => {
        Cookies.remove('rememberedUser');
        window.location.href = '/';
    };

    const StatCard = ({ title, value, icon, color, type, className = "" }) => (
        <div className={`glass-card p-6 rounded-2xl border border-blue-100 dark:border-white/5 shadow-sm relative overflow-hidden group hover:scale-[1.02] transition-all duration-300 ${className}`}>
            <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
                {icon}
            </div>
            <div className="relative z-10">
                <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">{title}</p>
                <div className={`text-2xl lg:text-3xl font-bold ${type === 'danger' ? 'text-red-500' : type === 'success' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-800 dark:text-white'} truncate`}>
                    {value}
                </div>
            </div>
        </div>
    );

    const totalOverdueCount = (data.chequeAlerts?.overdue?.length || 0) + (data.chequeAlerts?.dueToday?.length || 0);

    return (
        <Spin spinning={loading}>
            <div className="animate-fade-in p-4 pb-24 md:pb-8 max-w-[1600px] mx-auto space-y-8">
                {/* Header Action Row */}
                <div className="flex justify-end gap-2">
                    <Button
                        icon={<ReloadOutlined spin={loading} />}
                        onClick={fetchDashboardData}
                        className="rounded-xl h-10 border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 shadow-sm text-xs md:text-sm"
                    >
                        Refresh Analytics
                    </Button>
                    <Button onClick={handleLogout} danger className="rounded-xl h-10 font-medium text-xs md:text-sm">
                        Logout
                    </Button>
                </div>

                {/* Real-Time Terminal Monitor */}
                <div>
                    <TerminalMonitor />
                </div>

                {/* Global Financial Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                    <StatCard
                        title="Today Average Profit"
                        value={formatCurrency(data.global.avgProfit || 0)}
                        icon={<RiseOutlined style={{ fontSize: '48px' }} />}
                        color="text-blue-600"
                        type={data.global.avgProfit >= 0 ? 'success' : 'danger'}
                        className="xl:col-span-4 bg-gradient-to-r from-blue-600/10 via-indigo-500/10 to-transparent border-blue-200"
                    />
                    <StatCard
                        title="Today's Sales"
                        value={formatCurrency(data.global.sales)}
                        icon={<ArrowUpOutlined style={{ fontSize: '48px' }} />}
                        color="text-blue-600"
                        type="success"
                    />
                    <StatCard
                        title="Buying (Paddy)"
                        value={formatCurrency(data.global.buying)}
                        icon={<ArrowDownOutlined style={{ fontSize: '48px' }} />}
                        color="text-orange-500"
                        type="danger"
                    />
                    <StatCard
                        title="Expenses"
                        value={formatCurrency(data.global.expenses)}
                        icon={<WalletOutlined style={{ fontSize: '48px' }} />}
                        color="text-red-500"
                        type="danger"
                    />
                    <StatCard
                        title="Net Cash Flow"
                        value={formatCurrency(data.global.profit)}
                        icon={<span className="text-4xl">💰</span>}
                        color="text-blue-600"
                        type={data.global.profit >= 0 ? 'success' : 'danger'}
                    />
                </div>

                {/* DEDICATED CHEQUE NOTIFICATION & REMINDER SECTION */}
                <div className="glass-card p-4 md:p-6 rounded-2xl border border-blue-200 dark:border-blue-900/50 bg-gradient-to-br from-blue-50/50 via-white to-white dark:from-zinc-900 dark:to-zinc-900 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-blue-100 dark:border-gray-800 pb-3 gap-2">
                        <div className="flex items-center gap-2">
                            <BankOutlined className="text-xl md:text-2xl text-blue-600 shrink-0" />
                            <h2 className="text-base md:text-xl font-bold text-blue-950 dark:text-white m-0">
                                Cheque Reminders & Alerts
                            </h2>
                            {totalOverdueCount > 0 && (
                                <Badge count={totalOverdueCount} style={{ backgroundColor: '#ef4444' }} />
                            )}
                        </div>
                        <span className="text-[11px] md:text-xs font-semibold text-blue-600 bg-blue-100/70 dark:bg-blue-900/40 dark:text-blue-300 px-3 py-1 rounded-full self-start sm:self-auto">
                            {totalOverdueCount} Urgent Action Items
                        </span>
                    </div>

                    {totalOverdueCount === 0 && (data.chequeAlerts?.upcoming?.length || 0) === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                            <CheckCircleOutlined className="text-3xl text-emerald-500 mb-2" />
                            <p className="text-sm font-medium">All cheques are collected or settled!</p>
                        </div>
                    ) : (
                        <Tabs
                            defaultActiveKey="1"
                            type="card"
                            items={[
                                {
                                    key: '1',
                                    label: (
                                        <span className="font-bold text-red-500 text-xs sm:text-sm flex items-center gap-1">
                                            <ExclamationCircleOutlined /> Overdue ({data.chequeAlerts?.overdue?.length || 0})
                                        </span>
                                    ),
                                    children: (
                                        <div className="space-y-3 pt-2">
                                            {data.chequeAlerts?.overdue?.length === 0 ? (
                                                <div className="text-center py-4 text-gray-400 text-xs">No overdue cheques date passed.</div>
                                            ) : (
                                                data.chequeAlerts?.overdue?.map(chq => (
                                                    <div key={chq.CHEQUE_ID} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-red-50/70 dark:bg-red-950/30 rounded-xl border border-red-200 dark:border-red-900/50 shadow-sm gap-2">
                                                        <div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-mono font-bold text-red-700 dark:text-red-300 text-sm">
                                                                    Chq #{chq.CHEQUE_NUMBER} ({chq.BANK || 'Bank'})
                                                                </span>
                                                                <Tag color="red" className="font-bold text-[10px]">OVERDUE</Tag>
                                                            </div>
                                                            <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                                                Invoice: <span className="font-bold text-blue-600">{chq.INVOICE_NO || '-'}</span> • Customer: <span className="font-bold">{chq.CUSTOMER_NAME || 'Retail'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 justify-between sm:justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-red-200/40">
                                                            <span className="text-sm sm:text-base font-bold text-red-600 font-mono">
                                                                Rs. {parseFloat(chq.AMOUNT || 0).toFixed(2)}
                                                            </span>
                                                            <Space>
                                                                <Button
                                                                    size="small"
                                                                    type="primary"
                                                                    icon={<CheckCircleOutlined />}
                                                                    className="!bg-emerald-600 hover:!bg-emerald-700 text-xs"
                                                                    onClick={() => handleChequeStatusUpdate(chq.CHEQUE_ID, 'Collected')}
                                                                >
                                                                    Collected
                                                                </Button>
                                                                <Popconfirm
                                                                    title="Mark Returned?"
                                                                    onConfirm={() => handleChequeStatusUpdate(chq.CHEQUE_ID, 'Returned')}
                                                                    okText="Yes"
                                                                    cancelText="No"
                                                                >
                                                                    <Button size="small" danger icon={<CloseCircleOutlined />} className="text-xs">
                                                                        Returned
                                                                    </Button>
                                                                </Popconfirm>
                                                            </Space>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )
                                },
                                {
                                    key: '2',
                                    label: (
                                        <span className="font-bold text-amber-500 text-xs sm:text-sm flex items-center gap-1">
                                            <BellOutlined /> Due Today ({data.chequeAlerts?.dueToday?.length || 0})
                                        </span>
                                    ),
                                    children: (
                                        <div className="space-y-3 pt-2">
                                            {data.chequeAlerts?.dueToday?.length === 0 ? (
                                                <div className="text-center py-4 text-gray-400 text-xs">No cheques due today.</div>
                                            ) : (
                                                data.chequeAlerts?.dueToday?.map(chq => (
                                                    <div key={chq.CHEQUE_ID} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/50 shadow-sm gap-2">
                                                        <div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-mono font-bold text-amber-800 dark:text-amber-300 text-sm">
                                                                    Chq #{chq.CHEQUE_NUMBER} ({chq.BANK || 'Bank'})
                                                                </span>
                                                                <Tag color="gold" className="font-bold text-[10px]">DUE TODAY</Tag>
                                                            </div>
                                                            <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                                                Invoice: <span className="font-bold text-blue-600">{chq.INVOICE_NO || '-'}</span> • Customer: <span className="font-bold">{chq.CUSTOMER_NAME || 'Retail'}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 justify-between sm:justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-amber-200/40">
                                                            <span className="text-sm sm:text-base font-bold text-amber-600 font-mono">
                                                                Rs. {parseFloat(chq.AMOUNT || 0).toFixed(2)}
                                                            </span>
                                                            <Space>
                                                                <Button
                                                                    size="small"
                                                                    type="primary"
                                                                    icon={<CheckCircleOutlined />}
                                                                    className="!bg-emerald-600 text-xs"
                                                                    onClick={() => handleChequeStatusUpdate(chq.CHEQUE_ID, 'Collected')}
                                                                >
                                                                    Collected
                                                                </Button>
                                                                <Button size="small" danger onClick={() => handleChequeStatusUpdate(chq.CHEQUE_ID, 'Returned')} className="text-xs">
                                                                    Returned
                                                                </Button>
                                                            </Space>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    )
                                },
                                {
                                    key: '3',
                                    label: (
                                        <span className="font-bold text-blue-400 text-xs sm:text-sm flex items-center gap-1">
                                            <CalendarOutlined /> Upcoming ({data.chequeAlerts?.upcoming?.length || 0})
                                        </span>
                                    ),
                                    children: (
                                        <div className="space-y-3 pt-2">
                                            {data.chequeAlerts?.upcoming?.map(chq => (
                                                <div key={chq.CHEQUE_ID} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white dark:bg-zinc-850 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm gap-2">
                                                    <div>
                                                        <div className="font-mono font-bold text-blue-400 text-sm">
                                                            Chq #{chq.CHEQUE_NUMBER} ({chq.BANK || 'Bank'})
                                                        </div>
                                                        <div className="text-xs text-gray-400">
                                                            Invoice: {chq.INVOICE_NO || '-'} • Customer: {chq.CUSTOMER_NAME || 'Retail'} • Due: <span className="font-mono font-bold">{dayjs(chq.DUE_DATE).format('DD/MM/YYYY')}</span>
                                                        </div>
                                                    </div>
                                                    <span className="text-sm sm:text-base font-bold text-white font-mono">
                                                        Rs. {parseFloat(chq.AMOUNT || 0).toFixed(2)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                }
                            ]}
                        />
                    )}
                </div>

                {/* Today's Stock Movement Section */}
                <div>
                    <h2 className="text-lg md:text-xl font-bold text-blue-950 dark:text-white mb-3 flex items-center gap-2">
                        <SwapOutlined className="text-blue-600" /> Today's Stock Movement
                        <span className="text-xs font-normal text-gray-400">({data.stockMovement?.length || 0} items)</span>
                    </h2>

                    {/* Desktop Table View */}
                    <div className="hidden md:block glass-card p-4 rounded-2xl shadow-sm overflow-hidden border border-blue-100 dark:border-blue-900/30">
                        <Table
                            dataSource={data.stockMovement || []}
                            rowKey="id"
                            size="small"
                            pagination={false}
                            scroll={{ x: 'max-content', y: 320 }}
                            columns={[
                                {
                                    title: 'Code',
                                    dataIndex: 'code',
                                    width: 100,
                                    render: c => <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{c}</span>
                                },
                                {
                                    title: 'Item Name',
                                    dataIndex: 'name',
                                    ellipsis: true,
                                    render: n => <span className="font-bold text-gray-800 dark:text-gray-200">{n}</span>
                                },
                                {
                                    title: 'Inward / Buy (KG)',
                                    dataIndex: 'buyQty',
                                    width: 150,
                                    align: 'right',
                                    render: val => <span className="text-red-500 font-semibold">{Number(val || 0).toFixed(1)} KG</span>
                                },
                                {
                                    title: 'Sales / Sell (KG)',
                                    dataIndex: 'sellQty',
                                    width: 150,
                                    align: 'right',
                                    render: val => <span className="text-emerald-600 font-semibold">{Number(val || 0).toFixed(1)} KG</span>
                                },
                                {
                                    title: 'Net Stock Change',
                                    dataIndex: 'netChange',
                                    width: 150,
                                    align: 'right',
                                    render: val => (
                                        <span className={`font-bold ${val >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                                            {val >= 0 ? '+' : ''}{Number(val || 0).toFixed(1)} KG
                                        </span>
                                    )
                                }
                            ]}
                        />
                    </div>

                    {/* Mobile Cards View */}
                    <div className="md:hidden space-y-3">
                        {(data.stockMovement || []).length === 0 ? (
                            <div className="p-6 text-center glass-card rounded-2xl text-gray-400 text-xs">
                                No stock movements today
                            </div>
                        ) : (
                            data.stockMovement.map((item, i) => (
                                <div key={item.id || i} className="p-3.5 rounded-2xl glass-card border border-white/10 space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-white text-sm">{item.name}</div>
                                            <div className="text-xs text-gray-400 font-mono">Code: {item.code}</div>
                                        </div>
                                        <div className="text-right">
                                            <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-lg ${item.netChange >= 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-orange-500/20 text-orange-400'}`}>
                                                {item.netChange >= 0 ? '+' : ''}{Number(item.netChange || 0).toFixed(1)} kg
                                            </span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-900/60 p-2 rounded-xl border border-white/5">
                                        <div>
                                            <span className="text-gray-400 block text-[10px]">Inward (Buy)</span>
                                            <span className="font-bold text-red-400 font-mono">{Number(item.buyQty || 0).toFixed(1)} kg</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-400 block text-[10px]">Sales (Sell)</span>
                                            <span className="font-bold text-emerald-400 font-mono">{Number(item.sellQty || 0).toFixed(1)} kg</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Active Mill Staff & Personnel Section */}
                <div>
                    <h2 className="text-lg md:text-xl font-bold text-blue-950 dark:text-white mb-3 flex items-center gap-2">
                        <UserOutlined className="text-blue-600" /> Active Mill Staff & Personnel
                    </h2>

                    {data.staffMembers?.length === 0 ? (
                        <div className="glass-card p-6 rounded-2xl text-center text-gray-400 border-dashed border-2 text-xs">
                            <p>No staff personnel added yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                            {data.staffMembers?.map(staff => (
                                <div key={staff.STAFF_ID} className="glass-card p-3.5 rounded-2xl border border-blue-100 dark:border-blue-900/30 shadow-sm space-y-2">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-bold text-gray-800 dark:text-white text-sm">{staff.NAME}</div>
                                            <div className="text-xs text-gray-400">{staff.PHONE_NUMBER || staff.PHONE || 'No Phone'}</div>
                                        </div>
                                        <Tag color={staff.ROLE === 'driver' ? 'blue' : staff.ROLE === 'officer' ? 'purple' : 'orange'}>
                                            {(staff.ROLE || 'Labor').toUpperCase()}
                                        </Tag>
                                    </div>
                                    {staff.USERNAME && (
                                        <div className="text-xs text-purple-400 font-mono font-semibold pt-1 border-t border-white/5">
                                            User: @{staff.USERNAME}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Spin>
    );
}
