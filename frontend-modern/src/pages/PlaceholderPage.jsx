import React from 'react';
import { useLocation } from 'react-router-dom';

const PlaceholderPage = () => {
    const location = useLocation();
    const title = location.pathname.substring(1).replace('-', ' ').toUpperCase();

    return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8">
            <div className="w-24 h-24 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <span className="text-4xl">🚧</span>
            </div>
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-500 to-teal-500 mb-2">
                {title}
            </h2>
            <p className="text-gray-500 max-w-md">
                This feature is currently under construction. Check back soon!
            </p>
        </div>
    );
};

export default PlaceholderPage;
