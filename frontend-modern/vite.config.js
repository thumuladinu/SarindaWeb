import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import crypto from 'crypto'

// Polyfill for Node 16 compatibility with Vite 5
if (!globalThis.crypto) {
    globalThis.crypto = crypto;
}
if (!globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues = (arr) => crypto.randomFillSync(arr);
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
            devOptions: {
                enabled: true
            },
            workbox: {
                maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // Increase limit to 10MB
            },
            manifest: {
                name: 'Ishanka Stores Management System',
                short_name: 'Ishanka Store',
                description: 'Ishanka Stores Management System PWA',
                theme_color: '#ffffff',
                display: 'standalone',
                icons: [
                    {
                        src: 'pwa-icon.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-icon.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            }
        })
    ],
    esbuild: {
        drop: ['console', 'debugger'],
    },
    server: {
        port: 5175,
        host: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                secure: false,
            }
        }
    }
})
