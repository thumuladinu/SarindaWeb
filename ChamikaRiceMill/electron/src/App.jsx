import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
    ConfigProvider, theme as antdTheme, App as AntdApp, 
    Dropdown, Avatar, Tooltip, Tag, Modal 
} from 'antd';
import { 
    ShoppingCartOutlined, CarOutlined, InboxOutlined, ThunderboltOutlined, 
    CalculatorOutlined, RollbackOutlined, AppstoreOutlined, TeamOutlined, BarcodeOutlined,
    CloudSyncOutlined, WifiOutlined, DisconnectOutlined, SyncOutlined,
    SettingOutlined, UserOutlined, LogoutOutlined, DownOutlined,
    CheckCircleFilled, DollarOutlined
} from '@ant-design/icons';

import syncService from './services/syncService';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/auth/Login';

// The Dedicated Mill Officer Modules + Settings
import Sales from './pages/sales/Sales';
import DispatchNotes from './pages/dispatch/DispatchNotes';
import StockInward from './pages/stock-inward/StockInward';
import QuickPOS from './pages/pos/QuickPOS';
import PriceCalculator from './pages/calculator/PriceCalculator';
import SalesReturns from './pages/returns/SalesReturns';
import Items from './pages/items/Items';
import Resources from './pages/resources/Resources';
import Settings from './pages/settings/Settings';
import BagLabels from './pages/labels/BagLabels';
import Expenses from './pages/expenses/Expenses';

import { io } from 'socket.io-client';
import { getTerminalDeviceCode, getCurrentUserName } from './utils/terminalHelper';

const Layout = ({ children }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [isOnline, setIsOnline] = useState(syncService.isOnline);
    const [latency, setLatency] = useState(syncService.latency);
    const [isSyncing, setIsSyncing] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        syncService.updatePendingCount().then(c => setPendingCount(c));
        const unsubscribe = syncService.subscribe((event, data) => {
            if (event === 'connectionStatus') {
                setIsOnline(data.online);
                setLatency(data.latency);
            }
            if (event === 'syncStart') setIsSyncing(true);
            if (event === 'syncComplete') {
                setIsSyncing(false);
                syncService.updatePendingCount().then(c => setPendingCount(c));
            }
            if (event === 'syncError') {
                setIsSyncing(false);
            }
            if (event === 'pendingCountChanged') {
                setPendingCount(typeof data === 'number' ? data : (data?.total || 0));
            }
        });

        syncService.initSocket();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [user]);

    // 4 Quick Top Navigation Tabs as requested:
    // 1. Sales, 2. Dispatch, 3. Stock In, 4. Price Cal
    const quickNavTabs = [
        { path: '/', match: ['/', '/sales'], label: 'Sales', icon: <ShoppingCartOutlined /> },
        { path: '/dispatch-notes', match: ['/dispatch-notes'], label: 'Dispatch', icon: <CarOutlined /> },
        { path: '/stock-inward', match: ['/stock-inward'], label: 'Stock In', icon: <InboxOutlined /> },
        { path: '/price-calculator', match: ['/price-calculator'], label: 'Price Cal', icon: <CalculatorOutlined /> }
    ];

    // Full List of All Modules for Profile Menu
    const allModules = [
        { key: '/', label: 'Sales & Bills', icon: <ShoppingCartOutlined /> },
        { key: '/dispatch-notes', label: 'Dispatch Notes', icon: <CarOutlined /> },
        { key: '/stock-inward', label: 'Stock Inwards', icon: <InboxOutlined /> },
        { key: '/quick-pos', label: 'Quick POS', icon: <ThunderboltOutlined /> },
        { key: '/price-calculator', label: 'Price Calculator', icon: <CalculatorOutlined /> },
        { key: '/expenses', label: 'Expenses & Salaries', icon: <DollarOutlined /> },
        { key: '/labels', label: 'Bag Labels & Barcodes', icon: <BarcodeOutlined /> },
        { key: '/sales-returns', label: 'Sales Returns', icon: <RollbackOutlined /> },
        { key: '/items', label: 'Mill Items', icon: <AppstoreOutlined /> },
        { key: '/resources', label: 'Resources (Vehicles & Places)', icon: <TeamOutlined /> },
        { type: 'divider' },
        { key: '/settings', label: 'Settings', icon: <SettingOutlined /> },
        { type: 'divider' },
        { key: 'logout', label: 'Switch User / Logout', icon: <LogoutOutlined />, danger: true }
    ];

    const handleProfileMenuClick = ({ key }) => {
        if (key === 'logout') {
            Modal.confirm({
                title: 'Logout / Switch User',
                content: 'Are you sure you want to switch user or logout?',
                okText: 'Logout',
                okType: 'danger',
                onOk: () => logout()
            });
        } else {
            navigate(key);
        }
    };

    const handleManualSync = async () => {
        setIsSyncing(true);
        await syncService.syncAll();
        setIsSyncing(false);
    };

    // User Avatar Initials
    const userInitials = (user?.NAME || user?.USERNAME || 'MO')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    return (
        <div className="min-h-screen flex flex-col bg-slate-100 font-sans">
            {/* Officer Top Header with vibrant Royal Blue gradient */}
            <header className="officer-header px-4 py-2.5 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-50 shadow-md">
                <div className="flex items-center gap-4">
                    {/* Brand Icon & Name (Light Logo Version) */}
                    <Link to="/" className="officer-badge px-3 py-1 rounded-2xl flex items-center gap-2.5 no-underline hover:opacity-95 transition-all shadow-inner bg-white/10 border border-white/20">
                        <div className="w-8 h-8 rounded-xl bg-white p-0.5 flex items-center justify-center overflow-hidden shrink-0 shadow">
                            <img src="/logo-light.png" alt="Chamika Rice Mill Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="text-sm font-black tracking-wider uppercase text-white font-sans">
                            Chamika Rice Mill
                        </div>
                    </Link>

                    {/* Quick 4 Tabs */}
                    <nav className="flex items-center gap-1.5 py-0.5">
                        {quickNavTabs.map(item => {
                            const isActive = item.match.includes(location.pathname);
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`nav-tab-item px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap text-white/90 rounded-xl transition-all ${isActive ? 'active shadow-sm' : 'hover:bg-white/15'}`}
                                >
                                    <span className="text-sm">{item.icon}</span>
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* Right: Connectivity Status, Sync Trigger, User Profile Dropdown */}
                <div className="flex items-center gap-3">
                    {/* Live Online / Offline Tag */}
                    <Tooltip title={isOnline ? `Connected to ${syncService.apiBase} (${latency || 0}ms)` : `Offline Mode Active (${syncService.apiBase} unreachable)`}>
                        <div className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${isOnline ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/30' : 'bg-rose-500/30 text-rose-100 border border-rose-400/30'}`}>
                            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                            <span>{isOnline ? `Online ${latency ? `(${latency}ms)` : ''}` : 'Offline'}</span>
                        </div>
                    </Tooltip>

                    {/* Quick Sync Button */}
                    <button
                        type="button"
                        onClick={handleManualSync}
                        disabled={isSyncing}
                        className="officer-badge hover:bg-white/30 active:scale-95 transition-all text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
                        title="Sync local records with cloud backend"
                    >
                        <SyncOutlined spin={isSyncing} className={isSyncing ? 'text-amber-300' : ''} />
                        <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
                        {pendingCount > 0 && (
                            <span className="bg-amber-400 text-slate-900 px-1.5 py-0.2 text-[10px] font-black rounded-full shadow-sm">
                                {pendingCount}
                            </span>
                        )}
                    </button>

                    {/* Profile Avatar & All-Pages Dropdown Menu */}
                    <Dropdown
                        menu={{
                            items: allModules.map(m => {
                                if (m.type === 'divider') return { type: 'divider' };
                                const isCurrent = location.pathname === m.key || (m.key === '/' && location.pathname === '/sales');
                                return {
                                    key: m.key,
                                    label: (
                                        <div className="flex items-center justify-between py-1 min-w-[190px]">
                                            <span className="font-semibold text-xs">{m.label}</span>
                                            {isCurrent && <CheckCircleFilled className="text-blue-600 text-xs ml-2" />}
                                        </div>
                                    ),
                                    icon: <span className="text-sm">{m.icon}</span>,
                                    danger: m.danger
                                };
                            }),
                            onClick: handleProfileMenuClick
                        }}
                        trigger={['click']}
                        placement="bottomRight"
                    >
                        <div className="officer-badge hover:bg-white/30 active:scale-95 transition-all text-white px-2.5 py-1 rounded-2xl flex items-center gap-2.5 cursor-pointer shadow-sm select-none">
                            <Avatar
                                size={30}
                                className="bg-white text-blue-700 font-black text-xs shadow-inner"
                            >
                                {userInitials}
                            </Avatar>
                            <div className="text-left leading-tight hidden sm:block">
                                <div className="text-xs font-bold text-white leading-tight">
                                    {user?.NAME || 'Officer'}
                                </div>
                                <div className="text-[10px] text-blue-200 uppercase font-semibold">
                                    {user?.ROLE || 'Officer'}
                                </div>
                            </div>
                            <DownOutlined className="text-[10px] text-blue-200 ml-0.5" />
                        </div>
                    </Dropdown>
                </div>
            </header>

            {/* Main Operational Body */}
            <main className="flex-1 p-4 max-w-7xl w-full mx-auto">
                {children}
            </main>
        </div>
    );
};

const AuthenticatedApp = () => {
    const { isLoggedIn } = useAuth();

    if (!isLoggedIn) {
        return <Login />;
    }

    return (
        <Router>
            <Layout>
                <Routes>
                    <Route path="/" element={<Sales />} />
                    <Route path="/sales" element={<Sales />} />
                    <Route path="/dispatch-notes" element={<DispatchNotes />} />
                    <Route path="/stock-inward" element={<StockInward />} />
                    <Route path="/quick-pos" element={<QuickPOS />} />
                    <Route path="/price-calculator" element={<PriceCalculator />} />
                    <Route path="/expenses" element={<Expenses />} />
                    <Route path="/labels" element={<BagLabels />} />
                    <Route path="/sales-returns" element={<SalesReturns />} />
                    <Route path="/items" element={<Items />} />
                    <Route path="/resources" element={<Resources />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Layout>
        </Router>
    );
};

export default function App() {
    useEffect(() => {
        syncService.startAutoSync();
        syncService.initSocket();
    }, []);

    return (
        <ConfigProvider
            theme={{
                algorithm: antdTheme.defaultAlgorithm,
                token: {
                    colorPrimary: '#2563EB', // Vibrant Royal Blue
                    borderRadius: 10,
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                }
            }}
        >
            <AntdApp>
                <AuthProvider>
                    <AuthenticatedApp />
                </AuthProvider>
            </AntdApp>
        </ConfigProvider>
    );
}
