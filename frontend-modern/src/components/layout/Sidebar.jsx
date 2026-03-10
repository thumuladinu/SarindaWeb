import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'react-router-dom';
import Cookies from 'js-cookie';
import {
    AppstoreOutlined,
    TransactionOutlined,
    WalletOutlined, // New
    ShopOutlined,
    TeamOutlined,
    UserOutlined,
    ExperimentOutlined,
    TruckOutlined, // Changed from CarOutlined
    FileTextOutlined,
    StockOutlined, // New
    DashboardOutlined,
    LineChartOutlined,
    AreaChartOutlined,
    DatabaseOutlined,
    ClockCircleOutlined,
    MenuOutlined,
    DownOutlined,
    UpOutlined
} from '@ant-design/icons';
import { Tooltip, Button } from 'antd';
import logo from "../../assets/images/logo.png";

const NAV_ITEMS = [
    { label: 'Dashboard', path: '/dashboard', icon: <AppstoreOutlined /> },
    { label: 'Store Manager', path: '/', icon: <ShopOutlined /> }, // New Store Manager link pointing to dashboard
    { label: 'Transactions', path: '/transactions', icon: <TransactionOutlined /> },
    { label: 'Balance', path: '/balance', icon: <WalletOutlined /> },
    { label: 'Items', path: '/items', icon: <ShopOutlined /> },
    { label: 'Inventory', path: '/inventory', icon: <StockOutlined /> }, // New
    { label: 'Customers', path: '/customers', icon: <TeamOutlined /> },
    // { label: 'Users', path: '/users', icon: <UserOutlined /> },
    { label: 'Weighting', path: '/weighting', icon: <ExperimentOutlined /> },
    { label: 'Trips', path: '/trips', icon: <TruckOutlined /> }, // Changed from CarOutlined
    { key: '/stock-operations', label: 'Stock Ops', path: '/stock-operations', icon: <StockOutlined /> }, // New
    { label: 'Reports', path: '/reports', icon: <FileTextOutlined /> },
    { label: 'Dashboards', path: '/reports-dashboard', icon: <DashboardOutlined /> },
    { label: 'Graphs', path: '/graphs', icon: <LineChartOutlined /> }, // New
    { label: 'Stock Events', path: '/stock-events', icon: <AreaChartOutlined /> },
    { label: 'Time Tracker', path: '/time-tracker', icon: <ClockCircleOutlined /> },
];

export default function Sidebar() {
    const location = useLocation();
    const [isExpanded, setIsExpanded] = useState(false);
    const navRef = useRef(null);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const [canScrollDown, setCanScrollDown] = useState(false);

    const checkScroll = () => {
        if (navRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = navRef.current;
            setCanScrollUp(scrollTop > 0);
            setCanScrollDown(Math.ceil(scrollTop + clientHeight) < scrollHeight);
        }
    };

    useEffect(() => {
        checkScroll();
        window.addEventListener('resize', checkScroll);
        return () => window.removeEventListener('resize', checkScroll);
    }, []);

    // Get user role for conditional rendering
    const userCookie = Cookies.get('rememberedUser');
    const userRole = userCookie ? JSON.parse(userCookie).ROLE?.toLowerCase() : '';

    return (
        <>
            {/* Transparent overlay for mid-size screens when expanded */}
            {isExpanded && (
                <div
                    className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm xl:hidden"
                    onClick={() => setIsExpanded(false)}
                />
            )}

            <aside
                className={`hidden md:flex flex-col h-screen fixed left-0 top-0 z-50 glass-sidebar border-r border-white/10 transition-all duration-300 ease-in-out
                ${isExpanded ? 'w-64' : 'w-20 xl:w-64'}`}
            >
                {/* Logo & Toggle Area */}
                <div className={`h-20 flex items-center gap-3 mb-2 transition-all duration-300 ${isExpanded ? 'px-4' : 'px-0 justify-center xl:px-4 xl:justify-start'}`}>
                    <Button
                        type="text"
                        icon={<MenuOutlined className="text-white text-lg" />}
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="xl:hidden hover:bg-white/10 shrink-0 w-10 h-10 flex items-center justify-center p-0 rounded-xl"
                    />
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 flex shrink-0 items-center justify-center ring-1 ring-white/10 backdrop-blur-md shadow-inner ${isExpanded ? 'block' : 'hidden xl:flex'}`}>
                        <img src={logo} alt="Logo" className="w-6 h-6 object-contain" onError={(e) => e.target.style.display = 'none'} />
                    </div>
                    <span className={`text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-200 whitespace-nowrap overflow-hidden transition-all duration-300 ${isExpanded ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0 xl:opacity-100 xl:max-w-full'}`}>
                        Ishanka Stores
                    </span>
                </div>

                {/* Navigation Items */}
                <div className="relative flex-1 flex flex-col overflow-hidden">
                    {canScrollUp && (
                        <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-gray-900/50 to-transparent z-10 flex items-start justify-center pt-1 pointer-events-none">
                            <UpOutlined className="text-gray-400 text-xs animate-bounce" />
                        </div>
                    )}

                    <nav
                        ref={navRef}
                        onScroll={checkScroll}
                        className="flex-1 px-4 overflow-y-auto space-y-1 overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] relative z-0"
                    >
                        {NAV_ITEMS.map((item) => {
                            const isActive = location.pathname === item.path;
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`relative flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group ${isActive ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 text-emerald-400 font-semibold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                >
                                    {isActive && (
                                        <div className="absolute left-0 w-1 h-6 bg-emerald-500 rounded-r-full shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
                                    )}
                                    <span className={`text-xl shrink-0 transition-transform duration-300 ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'group-hover:scale-110'}`}>
                                        {item.icon}
                                    </span>
                                    <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isExpanded ? 'opacity-100 max-w-full ml-0' : 'opacity-0 max-w-0 xl:opacity-100 xl:max-w-full xl:ml-0'}`}>
                                        {item.label}
                                    </span>
                                </Link>
                            );
                        })}

                        {/* Dev Only: Local Cache Inspector */}
                        {userRole === 'dev' && (
                            <Link
                                to="/dev-cache"
                                className={`
                            relative flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group mt-1
                            ${location.pathname === '/dev-cache'
                                        ? 'bg-gradient-to-r from-purple-500/20 to-purple-500/10 text-purple-400 font-semibold'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                    }
                        `}
                            >
                                {location.pathname === '/dev-cache' && (
                                    <div className="absolute left-0 w-1 h-6 bg-purple-500 rounded-r-full shadow-[0_0_12px_rgba(168,85,247,0.5)]" />
                                )}
                                <span className={`text-xl shrink-0 transition-transform duration-300 ${location.pathname === '/dev-cache' ? 'scale-110' : 'group-hover:scale-110'}`}>
                                    <DatabaseOutlined />
                                </span>
                                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isExpanded ? 'opacity-100 max-w-full ml-0' : 'opacity-0 max-w-0 xl:opacity-100 xl:max-w-full xl:ml-0'}`}>
                                    Local Cache
                                </span>
                            </Link>
                        )}
                    </nav>

                    {canScrollDown && (
                        <div className="absolute bottom-0 left-0 w-full h-8 bg-gradient-to-t from-[#0f1012] to-transparent z-10 flex items-end justify-center pb-1 pointer-events-none">
                            <DownOutlined className="text-gray-400 text-xs animate-bounce" />
                        </div>
                    )}
                </div>

                {/* User Profile Mini - Optional Footer */}
                {/* <div className="p-4 mt-auto">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3 hover:bg-white/10 transition-colors cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-blue-500 shadow-lg" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">Admin User</p>
                        <p className="text-xs text-gray-500 truncate">admin@pos.com</p>
                    </div>
                </div>
            </div> */}
            </aside>
        </>
    );
}
