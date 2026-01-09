import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SearchOutlined, SunOutlined, MoonOutlined, LogoutOutlined } from '@ant-design/icons';
import { Dropdown, Button, message } from 'antd';
import { useTheme } from '../ui/ThemeProvider';
import Cookies from 'js-cookie';

import InstallPWA from '../InstallPWA';

export default function Header() {
    const { theme, toggleTheme } = useTheme();
    const location = useLocation();
    const navigate = useNavigate();
    const pageTitle = location.pathname.split('/')[1]?.replace('-', ' ') || 'Dashboard';

    // Get user data from cookie (set during login)
    const getUserData = () => {
        try {
            const cookieData = Cookies.get('rememberedUser');
            if (cookieData) {
                return JSON.parse(cookieData);
            }
        } catch (e) {
            console.error('Error parsing user cookie:', e);
        }
        return {};
    };

    const userData = getUserData();
    const userName = userData.NAME || 'User';
    const userRole = userData.ROLE || 'Staff';
    const userPhoto = userData.PHOTO || null;
    const userInitial = userName.charAt(0).toUpperCase();

    // Handle logout
    const handleLogout = () => {
        Cookies.remove('rememberedUser');
        message.success('Logged out successfully');
        window.location.href = '/login';
    };

    // Handle search click
    const handleSearchClick = () => {
        navigate('/search');
    };

    // Profile dropdown - just show name and logout
    const profileMenuItems = [
        {
            key: 'user-info',
            label: (
                <div className="flex items-center gap-3 py-2 px-1">
                    {userPhoto ? (
                        <img src={userPhoto} alt="Profile" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold">
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
            label: (
                <Button
                    type="primary"
                    danger
                    icon={<LogoutOutlined />}
                    block
                    className="!bg-red-500 hover:!bg-red-600 !border-none"
                >
                    Logout
                </Button>
            ),
            onClick: handleLogout,
        },
    ];

    return (
        <header className="sticky top-0 z-40 w-full h-16 md:h-20 bg-gray-50/80 dark:bg-[#0f1012]/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-white/5 flex items-center justify-between px-4 md:px-8 transition-all pt-safe-top">
            {/* Title Area */}
            <div className="flex-1">
                <h1 className="text-lg md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400 capitalize">
                    {pageTitle}
                </h1>
                <p className="hidden md:block text-xs text-gray-400">
                    Manage your store efficiently
                </p>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2 md:gap-4">
                {/* PWA Install Button */}
                <div className="md:hidden">
                    <InstallPWA />
                </div>

                {/* Search Button */}
                <button
                    onClick={handleSearchClick}
                    className="w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors active:scale-95"
                >
                    <SearchOutlined className="text-lg" />
                </button>

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className="w-10 h-10 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-all active:scale-95"
                >
                    {theme === 'dark' ? (
                        <SunOutlined className="text-lg text-yellow-500" />
                    ) : (
                        <MoonOutlined className="text-lg text-indigo-500" />
                    )}
                </button>

                {/* User Profile with Dropdown */}
                <div className="pl-2 md:pl-3 border-l border-gray-200 dark:border-white/10 flex items-center gap-3">
                    {/* User name (desktop only) */}
                    <div className="text-right hidden md:block">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{userName}</p>
                        <p className="text-xs text-gray-500">{userRole}</p>
                    </div>

                    {/* Profile Avatar with Dropdown */}
                    <Dropdown
                        menu={{ items: profileMenuItems }}
                        trigger={['click']}
                        placement="bottomRight"
                        classNames={{ root: 'profile-dropdown' }}
                    >
                        <div className="relative cursor-pointer ring-2 ring-transparent hover:ring-emerald-500/50 active:ring-emerald-500 rounded-full transition-all">
                            {userPhoto ? (
                                <img
                                    src={userPhoto}
                                    alt="Profile"
                                    className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover shadow-lg"
                                />
                            ) : (
                                <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/20">
                                    {userInitial}
                                </div>
                            )}
                            {/* Online status indicator */}
                            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-[#0f1012] rounded-full" />
                        </div>
                    </Dropdown>
                </div>
            </div>
        </header>
    );
}
