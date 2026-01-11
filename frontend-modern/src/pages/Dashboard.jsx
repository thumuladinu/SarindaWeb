import React, { useEffect, useState } from 'react';
import { Button, Card, Spin, App, Tag, Table } from 'antd';
import { ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined, UserOutlined, WalletOutlined, SwapOutlined } from '@ant-design/icons';
import Cookies from 'js-cookie';
import axios from 'axios';
import TerminalMonitor from '../components/TerminalMonitor';

const { Meta } = Card;

export default function Dashboard() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState({
        global: { sales: 0, buying: 0, expenses: 0, profit: 0 },
        users: [],
        stockMovement: []
    });

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/api/getDailyDashboardStats');
            if (response.data.success) {
                setData(response.data.data);
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

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-LK', {
            style: 'currency',
            currency: 'LKR',
            minimumFractionDigits: 2
        }).format(amount);
    };

    const handleLogout = () => {
        Cookies.remove('rememberedUser');
        window.location.href = '/';
    };

    const StatCard = ({ title, value, icon, color, subValue, type }) => (
        <div className="glass-card p-6 rounded-2xl border border-white/20 dark:border-white/5 relative overflow-hidden group hover:scale-[1.02] transition-all duration-300">
            <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
                {icon}
            </div>
            <div className="relative z-10">
                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wider mb-2">{title}</p>
                <h3 className={`text-2xl md:text-3xl font-bold ${type === 'danger' ? 'text-red-500' : type === 'success' ? 'text-emerald-500' : 'text-gray-800 dark:text-white'}`}>
                    {value}
                </h3>
            </div>
        </div>
    );

    // Stock Movement Item Card for Mobile
    const StockItemCard = ({ item }) => (
        <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3 border border-gray-100 dark:border-white/5">
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-400">{item.code}</div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</div>
                </div>
                <div className={`text-right font-bold ${item.netChange >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                    {item.netChange >= 0 ? '+' : ''}{Number(item.netChange).toFixed(1)}
                    <div className="text-[10px] text-gray-400">KG</div>
                </div>
            </div>
            <div className="text-[10px] space-y-1">
                <div className="flex justify-between items-center bg-blue-50 dark:bg-blue-900/20 rounded px-2 py-1">
                    <span className="text-gray-500">S1</span>
                    <div className="flex gap-2">
                        <span className="text-red-500">B:{Number(item.buyQtyS1).toFixed(1)}</span>
                        <span className="text-emerald-600">S:{Number(item.sellQtyS1).toFixed(1)}</span>
                    </div>
                </div>
                <div className="flex justify-between items-center bg-purple-50 dark:bg-purple-900/20 rounded px-2 py-1">
                    <span className="text-gray-500">S2</span>
                    <div className="flex gap-2">
                        <span className="text-red-500">B:{Number(item.buyQtyS2).toFixed(1)}</span>
                        <span className="text-emerald-600">S:{Number(item.sellQtyS2).toFixed(1)}</span>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div className="hidden md:block">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-1">Dashboard</h1>
                    <p className="text-gray-500 dark:text-gray-400">Today's Overview & Active Users</p>
                </div>
                <div className="hidden md:flex gap-3">
                    <Button
                        icon={<ReloadOutlined spin={loading} />}
                        onClick={fetchDashboardData}
                        className="rounded-xl h-10 border-none bg-white/50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 shadow-sm"
                    >
                        Refresh
                    </Button>
                    <Button onClick={handleLogout} danger className="rounded-xl h-10 font-medium">
                        Logout
                    </Button>
                </div>
            </header>

            {/* Real-Time Terminal Monitor */}
            <div className="mb-8">
                <TerminalMonitor />
            </div>

            {/* Global Stats Grid */}

            {/* Global Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                    title="Today's Sales"
                    value={formatCurrency(data.global.sales)}
                    icon={<ArrowUpOutlined style={{ fontSize: '48px' }} />}
                    color="text-emerald-500"
                    type="success"
                />
                <StatCard
                    title="Buying"
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
                    color="text-blue-500"
                    type={data.global.profit >= 0 ? 'success' : 'danger'}
                />
            </div>

            {/* Today's Stock Movement Section */}
            {data.stockMovement && data.stockMovement.length > 0 && (
                <div className="mb-8">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                        <SwapOutlined /> Today's Stock Movement
                        <span className="text-sm font-normal text-gray-400">({data.stockMovement.length} items)</span>
                    </h2>

                    {/* Desktop: Table View */}
                    <div className="hidden md:block glass-card p-4 rounded-2xl">
                        <Table
                            dataSource={data.stockMovement}
                            rowKey="id"
                            size="small"
                            pagination={false}
                            scroll={{ y: 300 }}
                            columns={[
                                { title: 'Code', dataIndex: 'code', width: 80 },
                                { title: 'Item', dataIndex: 'name', ellipsis: true },
                                {
                                    title: 'S1 Buy',
                                    dataIndex: 'buyQtyS1',
                                    width: 70,
                                    align: 'right',
                                    render: v => <span className="text-red-500">{Number(v).toFixed(1)}</span>
                                },
                                {
                                    title: 'S1 Sell',
                                    dataIndex: 'sellQtyS1',
                                    width: 70,
                                    align: 'right',
                                    render: v => <span className="text-emerald-600">{Number(v).toFixed(1)}</span>
                                },
                                {
                                    title: 'S2 Buy',
                                    dataIndex: 'buyQtyS2',
                                    width: 70,
                                    align: 'right',
                                    render: v => <span className="text-red-500">{Number(v).toFixed(1)}</span>
                                },
                                {
                                    title: 'S2 Sell',
                                    dataIndex: 'sellQtyS2',
                                    width: 70,
                                    align: 'right',
                                    render: v => <span className="text-emerald-600">{Number(v).toFixed(1)}</span>
                                },
                                {
                                    title: 'Net',
                                    dataIndex: 'netChange',
                                    width: 80,
                                    align: 'right',
                                    render: v => (
                                        <span className={`font-bold ${v >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                                            {v >= 0 ? '+' : ''}{Number(v).toFixed(1)}
                                        </span>
                                    )
                                }
                            ]}
                        />
                    </div>

                    {/* Mobile: Card View */}
                    <div className="md:hidden">
                        <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto pr-1">
                            {data.stockMovement.map((item, index) => (
                                <StockItemCard key={item.id || index} item={item} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Active Users Section */}
            <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                    <UserOutlined /> Active Team Members
                </h2>

                {data.users.length === 0 ? (
                    <div className="glass-card p-12 rounded-2xl text-center text-gray-500 dark:text-gray-400 bg-white/30 dark:bg-white/5 border-dashed border-2 border-gray-200 dark:border-white/10">
                        <p className="text-lg">No active users found for today.</p>
                        <p className="text-sm opacity-60">Users with opening floats or transactions will appear here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {data.users.map(user => (
                            <div key={user.USER_ID} className="glass-card p-0 rounded-2xl overflow-hidden border border-gray-100 dark:border-white/5 shadow-lg group hover:shadow-xl transition-all duration-300">
                                {/* Only show valid photo, else fallback */}
                                <div className="h-24 bg-gradient-to-r from-emerald-600 to-teal-600 relative">
                                    <div className="absolute -bottom-10 left-6">
                                        {user.PHOTO ? (
                                            <img
                                                src={user.PHOTO}
                                                alt={user.NAME}
                                                className="w-20 h-20 rounded-2xl object-cover border-4 border-white dark:border-zinc-900 shadow-md bg-white"
                                            />
                                        ) : (
                                            <div className="w-20 h-20 rounded-2xl bg-white dark:bg-zinc-800 border-4 border-white dark:border-zinc-900 shadow-md flex items-center justify-center text-3xl font-bold text-emerald-600">
                                                {user.NAME?.charAt(0)?.toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                    <div className="absolute top-4 right-4">
                                        <Tag color="cyan" className="m-0 border-none bg-white/20 backdrop-blur text-white font-bold px-3 py-1 text-xs uppercase rounded-full">
                                            {user.ROLE}
                                        </Tag>
                                    </div>
                                </div>

                                <div className="pt-12 px-6 pb-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800 dark:text-white">{user.NAME}</h3>
                                        <p className="text-xs text-gray-400 font-mono mb-4">@{user.USERNAME || 'user'}</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm mb-4 bg-gray-50 dark:bg-white/5 p-4 rounded-xl">
                                        <div className="flex flex-col">
                                            <span className="text-gray-400 text-xs uppercase tracking-wider">Opening</span>
                                            <span className="font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(user.opening)}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-gray-400 text-xs uppercase tracking-wider">Sales</span>
                                            <span className="font-semibold text-emerald-600">{formatCurrency(user.sales)}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-gray-400 text-xs uppercase tracking-wider">Buying</span>
                                            <span className="font-semibold text-orange-500">{formatCurrency(user.buying)}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-gray-400 text-xs uppercase tracking-wider">Expenses</span>
                                            <span className="font-semibold text-red-500">{formatCurrency(user.expenses)}</span>
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-100 dark:border-white/10 pt-4 flex justify-between items-center">
                                        <span className="text-gray-500 font-medium">Cash in Hand</span>
                                        <span className={`text-xl font-bold ${user.balance >= 0 ? 'text-gray-800 dark:text-white' : 'text-red-500'}`}>
                                            {formatCurrency(user.balance)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
