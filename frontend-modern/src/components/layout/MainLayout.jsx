import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';

export default function MainLayout() {
    return (
        <div className="flex h-screen w-full bg-gray-50 dark:bg-[#0f1012] transition-colors duration-300">
            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col md:ml-64 relative min-h-screen">
                {/* Header */}
                <Header />

                {/* Content Scrollable Area */}
                <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-24 md:pb-8">
                    <Outlet />
                </main>

                {/* Mobile Bottom Navigation */}
                <BottomNav />
            </div>
        </div>
    );
}
