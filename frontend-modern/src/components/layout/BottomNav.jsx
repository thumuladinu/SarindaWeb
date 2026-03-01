import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';
import {
    HomeFilled,
    TransactionOutlined,
    ShopOutlined,
    WalletOutlined, // New
    AppstoreOutlined,
    TeamOutlined,
    UserOutlined,
    ExperimentOutlined,
    TruckOutlined, // Changed from CarOutlined
    FileTextOutlined,
    StockOutlined, // New
    CloseOutlined,
    DashboardOutlined,
    LineChartOutlined,
    AreaChartOutlined,
    DatabaseOutlined,
    ClockCircleOutlined
} from '@ant-design/icons';
import { Drawer } from 'antd';

const BottomNav = () => {
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
                        ? '-mt-8 w-16 h-16 rounded-full bg-gradient-to-tr from-emerald-500 to-green-400 shadow-[0_8px_30px_rgba(16,185,129,0.4)] border-4 border-[#0f1012] text-white active:scale-95 group z-50'
                        : 'flex-1 h-full gap-1.5 active:scale-90 pt-2'
                    }
            `}
            >
                <span className={`transition-all duration-300 ${isMain
                    ? 'text-2xl group-hover:scale-110 drop-shadow-md'
                    : `text-2xl ${active ? 'text-white scale-110 drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]' : 'text-gray-500'}`
                    }`}>
                    {icon}
                </span>
                {!isMain && (
                    <span className={`text-[11px] font-semibold tracking-wide ${active ? 'text-white' : 'text-gray-500'}`}>
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
            className="w-full h-24 rounded-2xl bg-white/5 border border-white/5 active:bg-emerald-500/10 hover:bg-white/10 flex flex-col items-center justify-center gap-2 transition-all"
        >
            <span className="text-3xl text-emerald-400 bg-emerald-500/10 w-14 h-14 rounded-full flex items-center justify-center">
                {icon}
            </span>
            <span className="text-gray-300 text-sm font-medium">{label}</span>
        </button>
    );

    return (
        <>
            <div className="md:hidden fixed bottom-0 left-0 right-0 h-[88px] bg-[#0f1012]/95 backdrop-blur-2xl border-t border-white/5 flex items-center justify-between px-4 pb-safe z-50 rounded-t-[32px] shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.6)]">
                <NavButton path="/transactions" icon={<TransactionOutlined />} label="Trans." />
                <NavButton path="/items" icon={<ShopOutlined />} label="Items" />

                {/* Center Main Button */}
                <div className="w-20 flex justify-center relative">
                    <NavButton path="/dashboard" icon={<HomeFilled />} isMain />
                </div>

                <NavButton path="/balance" icon={<WalletOutlined />} label="Balance" />
                <NavButton
                    path="#" // Dummy path
                    icon={<AppstoreOutlined />}
                    label="More"
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
                // rootClassName="mobile-more-drawer-root"
                styles={{
                    wrapper: { boxShadow: 'none' },
                    content: { background: 'transparent', boxShadow: 'none', height: 'auto' },
                    body: { padding: 0 }
                }}
                height="auto" // Forcing height prop as fallback despite warning, or use rootStyle
                rootStyle={{ height: 'auto' }}
                className="mobile-more-drawer"
            >
                <div className="bg-[#18181b]/95 backdrop-blur-2xl rounded-t-[32px] p-6 pb-14 border-t border-white/10 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.8)] relative ring-1 ring-white/5 max-h-[85vh] overflow-y-auto">
                    {/* Pull Indicator */}
                    <div className="w-12 h-1.5 bg-zinc-700/50 rounded-full mx-auto mb-8" />

                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-xl font-bold text-white tracking-tight">More Apps</h3>
                        <button onClick={() => setMoreVisible(false)} className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                            <CloseOutlined />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <DrawerItem path="/inventory" icon={<StockOutlined />} label="Inventory" />
                        <DrawerItem path="/customers" icon={<TeamOutlined />} label="Customers" />
                        <DrawerItem path="/users" icon={<UserOutlined />} label="Users" />
                        <DrawerItem path="/weighting" icon={<ExperimentOutlined />} label="Weighting" />
                        <DrawerItem path="/trips" icon={<TruckOutlined />} label="Trips" />
                        <DrawerItem path="/stock-operations" icon={<StockOutlined />} label="Stock Ops" />
                        <DrawerItem path="/reports" icon={<FileTextOutlined />} label="Reports" />
                        <DrawerItem path="/reports-dashboard" icon={<DashboardOutlined />} label="Dashboards" />
                        <DrawerItem path="/graphs" icon={<LineChartOutlined />} label="Graphs" />
                        <DrawerItem path="/stock-events" icon={<AreaChartOutlined />} label="Stock Events" />
                        <DrawerItem path="/time-tracker" icon={<ClockCircleOutlined />} label="Time Tracker" />
                        {Cookies.get('rememberedUser') && JSON.parse(Cookies.get('rememberedUser')).ROLE?.toLowerCase() === 'dev' && (
                            <DrawerItem path="/dev-cache" icon={<DatabaseOutlined />} label="Local Cache" />
                        )}
                    </div>
                </div>
            </Drawer>
        </>
    );
}

export default BottomNav;
