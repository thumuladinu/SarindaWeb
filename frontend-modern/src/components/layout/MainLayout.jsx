import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import axios from 'axios';

const PUBLIC_VAPID_KEY = 'BFJGcJs3zH5JigFKbeWomDRIyERD4ea7RcDIdb-kNEg7djAEsBbg1mLa168kY4DsZFfdoqPHyncEiM62KRWWt9A';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export default function MainLayout() {
    useEffect(() => {
        // Register Push Notifications
        const subscribeToPush = async () => {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                try {
                    // Make sure our custom SW or Vite PWA SW is registered.
                    // Vite's auto-update usually hooks on window load. We'll wait until ready.
                    const registration = await navigator.serviceWorker.ready;

                    const subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
                    });

                    await axios.post('/api/push/subscribe', subscription);
                    console.log('Subscribed to push notifications');
                } catch (error) {
                    console.error('Error subscribing to push:', error);
                }
            }
        };

        if (Notification.permission === 'granted') {
            subscribeToPush();
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    subscribeToPush();
                }
            });
        }
    }, []);

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
