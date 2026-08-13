import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';

export default function MainLayout() {
    return (
        <div className="flex h-screen w-full bg-gray-50 dark:bg-[#0f1012] transition-colors duration-300 overflow-x-hidden">
            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 md:pl-20 xl:pl-64 relative min-h-screen transition-all duration-300 ease-in-out w-full max-w-full">
                {/* Header */}
                <Header />

                {/* Content Scrollable Area */}
                <main className="flex-1 p-2 sm:p-4 md:p-8 overflow-y-auto overflow-x-hidden pb-24 md:pb-8 w-full max-w-full">
                    <Outlet />
                </main>

                {/* Mobile Bottom Navigation */}
                <BottomNav />
            </div>
        </div>
    );
}
