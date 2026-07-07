// ============================================================
// StoresContext — global stores list, names, colors.
// Mount once at app root. Every page reads via useStores().
// ============================================================
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

// 6 preset color options shown in admin UI.
// Index is not tied to storeNo — admin picks freely.
export const STORE_COLOR_OPTIONS = [
    { key: 'blue',    label: 'Blue',    hex: '#3b82f6', tagColor: 'blue',    antTag: 'blue'    },
    { key: 'violet',  label: 'Violet',  hex: '#8b5cf6', tagColor: 'purple',  antTag: 'purple'  },
    { key: 'emerald', label: 'Emerald', hex: '#10b981', tagColor: 'green',   antTag: 'success' },
    { key: 'amber',   label: 'Amber',   hex: '#f59e0b', tagColor: 'gold',    antTag: 'gold'    },
    { key: 'rose',    label: 'Rose',    hex: '#f43f5e', tagColor: 'red',     antTag: 'red'     },
    { key: 'cyan',    label: 'Cyan',    hex: '#06b6d4', tagColor: 'cyan',    antTag: 'cyan'    },
];

const COLOR_MAP = {};
STORE_COLOR_OPTIONS.forEach(c => { COLOR_MAP[c.key] = c; });

const FALLBACK_COLOR = STORE_COLOR_OPTIONS[0];
const CACHE_KEY = 'cached_stores';

const StoresContext = createContext(null);

export const StoresProvider = ({ children }) => {
    const [stores, setStores] = useState(() => {
        try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
    });
    const [loading, setLoading] = useState(false);

    const fetchStores = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/stores?includeInactive=1');
            if (res.data.success) {
                setStores(res.data.stores);
                localStorage.setItem(CACHE_KEY, JSON.stringify(res.data.stores));
            }
        } catch (_) { /* network down — use cache */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchStores(); }, [fetchStores]);

    // Listen for store changes via socket — use the backend API URL, not the Vite
    // dev-server origin (which would be port 5175 in dev and cause a WS error).
    useEffect(() => {
        const socketUrl = import.meta.env.VITE_API_URL ||
            (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/');
        const socket = io(socketUrl, { transports: ['websocket', 'polling'] });
        socket.on('stores:updated', fetchStores);
        return () => socket.disconnect();
    }, [fetchStores]);

    const byNo = (storeNo) => stores.find(s => String(s.STORE_NO) === String(storeNo));
    const getName = (storeNo) => byNo(storeNo)?.NAME || `Store ${storeNo}`;
    const getColorKey = (storeNo) => byNo(storeNo)?.COLOR || 'blue';
    const getColor = (storeNo) => COLOR_MAP[getColorKey(storeNo)] || FALLBACK_COLOR;
    const getHex = (storeNo) => getColor(storeNo).hex;
    const getAntTag = (storeNo) => getColor(storeNo).antTag;
    const activeStores = stores.filter(s => s.IS_ACTIVE);
    const posStores = activeStores.filter(s => !s.IS_WEIGHING_STATION);

    return (
        <StoresContext.Provider value={{
            stores,
            activeStores,
            posStores,
            loading,
            refresh: fetchStores,
            byNo,
            getName,
            getColorKey,
            getColor,
            getHex,
            getAntTag,
            STORE_COLOR_OPTIONS,
            COLOR_MAP,
        }}>
            {children}
        </StoresContext.Provider>
    );
};

export const useStores = () => {
    const ctx = useContext(StoresContext);
    if (!ctx) throw new Error('useStores must be used within StoresProvider');
    return ctx;
};
