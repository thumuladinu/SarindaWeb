import React, { useState, useRef, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import Cookies from 'js-cookie';
import {
    DashboardOutlined,
    ImportOutlined,
    ThunderboltOutlined,
    SendOutlined,
    FileTextOutlined,
    CalculatorOutlined,
    BarcodeOutlined,
    RollbackOutlined,
    DropboxOutlined,
    DatabaseOutlined,
    BankOutlined,
    UserOutlined,
    CarOutlined,
    IdcardOutlined,
    EnvironmentOutlined,
    SettingOutlined,
    MenuOutlined,
    DownOutlined,
    UpOutlined,
    DollarOutlined,
    ClockCircleOutlined
} from '@ant-design/icons';
import { Button } from 'antd';
import { getUserRoles } from '../../utils/helpers';

const NAV_CATEGORIES = [
    {
        category: 'DAILY OPERATIONS',
        items: [
            { label: 'Dashboard', path: '/dashboard', icon: <DashboardOutlined /> },
            { label: 'Stock Inward', path: '/stock-inward', icon: <ImportOutlined /> },
            { label: 'Sales & Bills', path: '/sales', icon: <FileTextOutlined /> },
            { label: 'Dispatch Notes', path: '/dispatch', icon: <SendOutlined /> },
            { label: 'Quick POS', path: '/quick-pos', icon: <ThunderboltOutlined /> },
        ]
    },
    {
        category: 'MILL CALCULATORS & ITEMS',
        items: [
            { label: 'Price Calculator', path: '/price-calculator', icon: <CalculatorOutlined /> },
            { label: 'Expenses & Salaries', path: '/expenses', icon: <DollarOutlined /> },
            { label: 'Bag Labels & Barcodes', path: '/labels', icon: <BarcodeOutlined /> },
            { label: 'Sales Returns', path: '/sales-returns', icon: <RollbackOutlined /> },
            { label: 'Mill Items', path: '/items', icon: <DropboxOutlined /> },
            { label: 'Inventory Ledger', path: '/inventory', icon: <DatabaseOutlined /> },
        ]
    },
    {
        category: 'RESOURCES & MANAGEMENT',
        items: [
            { label: 'Time Tracker', path: '/time-tracker', icon: <ClockCircleOutlined /> },
            { label: 'Cheques', path: '/cheques', icon: <BankOutlined /> },
            { label: 'Customers', path: '/customers', icon: <UserOutlined /> },
            { label: 'Vehicles', path: '/vehicles', icon: <CarOutlined /> },
            { label: 'Staff & Personnel', path: '/staff', icon: <IdcardOutlined /> },
            { label: 'Places / Sources', path: '/places', icon: <EnvironmentOutlined /> },
            { label: 'Settings', path: '/settings', icon: <SettingOutlined /> },
        ]
    }
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

    const userCookie = Cookies.get('millUser');
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
                    <div className={`w-10 h-10 rounded-xl bg-slate-900/60 flex shrink-0 items-center justify-center ring-1 ring-white/10 backdrop-blur-md shadow-inner overflow-hidden p-1 ${isExpanded ? 'block' : 'hidden xl:flex'}`}>
                        <img src="/logo-dark.png" alt="Chamika Logo" className="w-full h-full object-contain" />
                    </div>
                    <span className={`text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-sky-200 whitespace-nowrap overflow-hidden transition-all duration-300 ${isExpanded ? 'opacity-100 max-w-full' : 'opacity-0 max-w-0 xl:opacity-100 xl:max-w-full'}`}>
                        Chamika Mill
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
                        className="flex-1 px-3 overflow-y-auto space-y-4 overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] relative z-0 pb-6"
                    >
                        {NAV_CATEGORIES.map((catGroup, groupIdx) => (
                            <div key={groupIdx} className="space-y-1">
                                <div className={`text-[10px] font-bold tracking-wider text-blue-400/70 uppercase px-3 py-1.5 transition-all duration-300 ${isExpanded ? 'block' : 'hidden xl:block'}`}>
                                    {catGroup.category}
                                </div>
                                {catGroup.items.map((item) => {
                                    const isActive = location.pathname === item.path;
                                    return (
                                        <Link
                                            key={item.path}
                                            to={item.path}
                                            className={`relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl transition-all duration-300 group ${isActive ? 'bg-gradient-to-r from-blue-500/25 to-blue-600/15 text-blue-400 font-semibold shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                        >
                                            {isActive && (
                                                <div className="absolute left-0 w-1 h-5 bg-blue-500 rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.6)]" />
                                            )}
                                            <span className={`text-lg shrink-0 transition-transform duration-300 ${isActive ? 'scale-110 text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'group-hover:scale-110 group-hover:text-blue-300'}`}>
                                                {item.icon}
                                            </span>
                                            <span className={`text-sm whitespace-nowrap overflow-hidden transition-all duration-300 ${isExpanded ? 'opacity-100 max-w-full ml-0' : 'opacity-0 max-w-0 xl:opacity-100 xl:max-w-full xl:ml-0'}`}>
                                                {item.label}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        ))}

                        {/* Dev Only */}
                        {getUserRoles(userRole).includes('dev') && (
                            <Link
                                to="/dev-cache"
                                className={`relative flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-300 group mt-1
                                ${location.pathname === '/dev-cache'
                                        ? 'bg-gradient-to-r from-purple-500/20 to-purple-500/10 text-purple-400 font-semibold'
                                        : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                {location.pathname === '/dev-cache' && (
                                    <div className="absolute left-0 w-1 h-6 bg-purple-500 rounded-r-full shadow-[0_0_12px_rgba(168,85,247,0.5)]" />
                                )}
                                <span className={`text-xl shrink-0 transition-transform duration-300 ${location.pathname === '/dev-cache' ? 'scale-110' : 'group-hover:scale-110'}`}>
                                    <DatabaseOutlined />
                                </span>
                                <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${isExpanded ? 'opacity-100 max-w-full ml-0' : 'opacity-0 max-w-0 xl:opacity-100 xl:max-w-full xl:ml-0'}`}>
                                    Dev Tools
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
            </aside>
        </>
    );
}
