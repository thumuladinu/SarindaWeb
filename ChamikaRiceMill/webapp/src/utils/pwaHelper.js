// PWA & Web Push Notification Helper

export const registerServiceWorker = () => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', async () => {
            try {
                const reg = await navigator.serviceWorker.register('/sw.js');
                console.log('[PWA] ServiceWorker registered successfully:', reg.scope);
                
                // Request Notification Permission automatically when PWA registers
                requestNotificationPermission();
            } catch (err) {
                console.error('[PWA] ServiceWorker registration failed:', err);
            }
        });
    }
};

export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        console.warn('[PWA] Push Notifications not supported in this browser.');
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('[PWA] Notification permission granted.');
            return true;
        }
    }
    return false;
};

export const sendPwaNotification = (title, body, options = {}) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        return;
    }

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title: title || 'Chamika Rice Mill',
            body: body || '',
            icon: options.icon || '/pwa-192x192.png',
            url: options.url || '/'
        });
    } else {
        // Fallback Native Notification
        new Notification(title || 'Chamika Rice Mill', {
            body: body || '',
            icon: options.icon || '/pwa-192x192.png',
            badge: '/favicon.png'
        });
    }
};
