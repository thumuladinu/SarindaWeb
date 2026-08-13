import React, { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import Cookies from 'js-cookie';
import {
    HomeFilled,
    DashboardOutlined,
    FileTextOutlined,
    ThunderboltOutlined,
    ImportOutlined,
    AppstoreOutlined,
    CalculatorOutlined,
    RollbackOutlined,
    DropboxOutlined,
    DatabaseOutlined,
    BankOutlined,
    UserOutlined,
    CarOutlined,
    IdcardOutlined,
    EnvironmentOutlined,
    SettingOutlined,
    SendOutlined,
    DollarOutlined,
    BarcodeOutlined,
    CloseOutlined,
    ClockCircleOutlined
} from '@ant-design/icons';
import { Drawer } from 'antd';

const MENU_CATEGORIES = [
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

export default function BottomNav() {
    const location = useLocation();
    const navigate = useNavigate();
    const [moreVisible, setMoreVisible] = useState(false);

    const isActive = (path) => location.pathname === path;

    const NavButton = ({ path, icon, label, isMain = false, onClick }) => {
        const active = isActive(path);
        return (
            <button
                onClick={onClick || (() => navigate(path))}
                className={`
                    relative flex flex-col items-center justify-center transition-all duration-300
                    ${isMain
                        ? '-mt-8 w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 to-sky-400 shadow-[0_8px_30px_rgba(59,130,246,0.65)] border-4 border-[#0f1012] text-white active:scale-95 group z-50 shrink-0'
                        : 'flex-1 h-full gap-1 active:scale-90 pt-1.5'
                    }
                `}
            >
                <span className={`transition-all duration-300 flex items-center justify-center ${isMain
                    ? 'text-[32px] group-hover:scale-110 drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] text-white'
                    : `text-xl ${active ? 'text-blue-400 scale-110 drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'text-gray-400'}`
                }`}>
                    {icon}
                </span>
                {!isMain && (
                    <span className={`text-[10px] font-medium tracking-wide ${active ? 'text-blue-400 font-bold' : 'text-gray-400'}`}>
                        {label}
                    </span>
                )}
            </button>
        );
    };

    const DrawerItem = ({ path, icon, label }) => (
        <button
            onClick={() => {
                navigate(path);
                setMoreVisible(false);
            }}
            className={`w-full h-20 rounded-2xl border transition-all flex flex-col items-center justify-center gap-1.5 ${
                isActive(path)
                    ? 'bg-blue-500/20 border-blue-500/40 text-blue-400 font-bold'
                    : 'bg-zinc-900/70 border-white/5 text-gray-300 hover:bg-zinc-800 active:scale-95'
            }`}
        >
            <span className="text-2xl text-blue-400 bg-blue-500/10 w-11 h-11 rounded-full flex items-center justify-center">
                {icon}
            </span>
            <span className="text-gray-200 text-xs font-medium">{label}</span>
        </button>
    );

    return (
        <>
            {/* Bottom Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 h-[80px] bg-[#0f1012]/95 backdrop-blur-2xl border-t border-white/10 flex items-center justify-between px-3 z-50 rounded-t-[28px] shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.7)]">
                <NavButton path="/sales" icon={<FileTextOutlined />} label="Sales" />
                <NavButton path="/stock-inward" icon={<ImportOutlined />} label="Inward" />

                {/* Center Floating Home Button */}
                <div className="w-16 flex justify-center relative">
                    <NavButton path="/dashboard" icon={<HomeFilled />} isMain />
                </div>

                <NavButton path="/dispatch" icon={<SendOutlined />} label="Dispatch" />
                <NavButton
                    path="#"
                    icon={<AppstoreOutlined />}
                    label="Menu"
                    onClick={() => setMoreVisible(true)}
                />
            </div>

            {/* More Menu Drawer */}
            <Drawer
                placement="bottom"
                onClose={() => setMoreVisible(false)}
                open={moreVisible}
                key="bottom-drawer"
                closeIcon={null}
                styles={{
                    wrapper: { boxShadow: 'none' },
                    section: { background: 'transparent', boxShadow: 'none', height: 'auto' },
                    body: { padding: 0 }
                }}
                height="auto"
                rootStyle={{ height: 'auto' }}
                className="mobile-more-drawer"
            >
                <div className="bg-[#18181b]/95 backdrop-blur-2xl rounded-t-[32px] p-5 pb-10 border-t border-white/10 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.8)] relative ring-1 ring-white/5 max-h-[85vh] overflow-y-auto">
                    {/* Pull Bar */}
                    <div className="w-12 h-1.5 bg-zinc-700/50 rounded-full mx-auto mb-6" />

                    <div className="flex justify-between items-center mb-6 px-1">
                        <div className="flex items-center gap-2 text-white font-bold text-lg">
                            <span>🌾</span> Chamika Rice Mill Apps
                        </div>
                        <button
                            onClick={() => setMoreVisible(false)}
                            className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                        >
                            <CloseOutlined />
                        </button>
                    </div>

                    <div className="space-y-5">
                        {MENU_CATEGORIES.map((cat, idx) => (
                            <div key={idx} className="space-y-2">
                                <div className="text-[11px] font-bold tracking-wider text-blue-400/80 uppercase px-1">
                                    {cat.category}
                                </div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    {cat.items.map((item) => (
                                        <DrawerItem key={item.path} path={item.path} icon={item.icon} label={item.label} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </Drawer>
        </>
    );
}
