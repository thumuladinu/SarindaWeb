import React, { useState, useEffect, Component } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
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
        { key: '/resources', label: 'Customers, Staff & Resources', icon: <TeamOutlined /> },
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
                            <img 
                                src="./logo-light.png" 
                                alt="Chamika Rice Mill Logo" 
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                    if (e.target.src.startsWith('http') || e.target.src.includes('./')) {
                                        e.target.src = '/logo-light.png';
                                    } else {
                                        e.target.style.display = 'none';
                                    }
                                }}
                            />
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
                    <Tooltip title={isOnline ? `Connected to ${syncService.apiBase}` : `Offline Mode Active (${syncService.apiBase} unreachable)`}>
                        <Tag 
                            color={isOnline ? 'success' : 'warning'} 
                            className="px-2.5 py-1 text-xs font-bold rounded-xl border-0 flex items-center gap-1.5 shadow-sm"
                        >
                            {isOnline ? <WifiOutlined /> : <DisconnectOutlined />}
                            <span>{isOnline ? 'Online' : 'Offline'}</span>
                        </Tag>
                    </Tooltip>

                    {/* Quick Sync Button */}
                    <button
                        type="button"
                        onClick={handleManualSync}
                        disabled={isSyncing}
                        className="officer-badge hover:bg-white/30 active:scale-95 transition-all text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm"
                        title="Sync local records with cloud backend"
                    >
                        <SyncOutlined className={isSyncing ? 'text-amber-300' : ''} />
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

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('[ErrorBoundary] Caught exception:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 max-w-xl mx-auto my-12 bg-rose-50 border border-rose-200 rounded-3xl text-center space-y-4 shadow-xl">
                    <h2 className="text-xl font-bold text-rose-800">⚠️ Application View Error</h2>
                    <p className="text-sm text-rose-600 font-mono bg-white p-3 rounded-xl border border-rose-100 text-left overflow-auto max-h-40">
                        {this.state.error?.toString() || 'Unknown rendering error'}
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all cursor-pointer"
                    >
                        🔄 Refresh View
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function App() {
    const [updateInfo, setUpdateInfo] = useState(null);

    useEffect(() => {
        syncService.startAutoSync();
        syncService.initSocket();

        // 1. Preferred contextBridge API (window.electron)
        if (window.electron) {
            try {
                console.log('[App] Initializing auto-updates via window.electron bridge...');
                if (window.electron.initAutoUpdates) {
                    window.electron.initAutoUpdates().catch(() => {});
                }
                if (window.electron.onUpdateDownloaded) {
                    window.electron.onUpdateDownloaded((event, info) => {
                        console.log('[App] Update downloaded signal received:', info);
                        setUpdateInfo(info || {});
                    });
                }
            } catch (e) {
                console.error('[App] Error in window.electron bridge:', e);
            }
        } 
        // 2. Fallback for nodeIntegration environments (window.require)
        else if (typeof window !== 'undefined' && window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.invoke('init-auto-updates').catch(() => {});

                ipcRenderer.on('update_downloaded', (event, info) => {
                    setUpdateInfo(info || {});
                });
            } catch (e) {
                console.log('[App] Not running in Electron environment');
            }
        }
    }, []);

    const handleRestartAndInstall = () => {
        if (window.electron?.restartApp) {
            window.electron.restartApp();
        } else if (typeof window !== 'undefined' && window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.send('restart_app');
            } catch (e) {}
        }
    };

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
                <ErrorBoundary>
                    <AuthProvider>
                        <AuthenticatedApp />
                    </AuthProvider>
                </ErrorBoundary>
                
                {/* Auto Update Available Modal */}
                <Modal
                    title={<span className="text-blue-600 font-bold text-lg">🚀 New Version Ready to Install</span>}
                    open={!!updateInfo}
                    onOk={handleRestartAndInstall}
                    onCancel={() => setUpdateInfo(null)}
                    okText="Restart & Update Now"
                    cancelText="Later"
                    okButtonProps={{ className: '!bg-blue-600 hover:!bg-blue-700 font-bold rounded-xl h-10' }}
                    cancelButtonProps={{ className: 'rounded-xl h-10' }}
                    className="rounded-2xl"
                >
                    <div className="py-2 space-y-2">
                        <p className="text-gray-700 dark:text-gray-200">
                            A new update <strong>({updateInfo?.version || 'Latest'})</strong> has been silently downloaded.
                        </p>
                        <p className="text-xs text-gray-500">
                            Click <strong>"Restart & Update Now"</strong> to install the latest version without losing any offline data or settings.
                        </p>
                    </div>
                </Modal>
            </AntdApp>
        </ConfigProvider>
    );
}
