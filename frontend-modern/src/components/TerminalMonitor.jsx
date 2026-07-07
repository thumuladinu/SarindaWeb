import React, { useEffect, useState } from 'react';
import { Badge, App } from 'antd';
import { io } from 'socket.io-client';
import { useStores } from '../contexts/StoresContext';

const SOCKET_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/');

const WEIGHING_HEX = '#10b981';

const fmtDate = (date) =>
    date
        ? new Date(date).toLocaleString([], {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
          })
        : '—';

const TerminalMonitor = () => {
    const { message } = App.useApp();
    const { stores, getName, getHex } = useStores();
    const [terminals, setTerminals] = useState([]);

    useEffect(() => {
        const newSocket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
        newSocket.on('connect', () => newSocket.emit('admin:get_terminals'));
        newSocket.on('admin:terminals_update', (data) => setTerminals(data));
        return () => newSocket.disconnect();
    }, []);

    // Group terminals by storeNo, preserving store order from context
    const storeGroups = (() => {
        const map = {};
        terminals.forEach(t => {
            const key = String(t.storeNo ?? 1);
            if (!map[key]) map[key] = [];
            map[key].push(t);
        });

        // Emit in the same order as the stores list, then any storeNo not in stores list
        const ordered = [];
        const seen = new Set();
        stores.forEach(s => {
            const key = String(s.STORE_NO);
            if (map[key]) { ordered.push({ storeNo: s.STORE_NO, store: s, terminals: map[key] }); seen.add(key); }
        });
        Object.keys(map).forEach(key => {
            if (!seen.has(key)) ordered.push({ storeNo: Number(key), store: null, terminals: map[key] });
        });
        return ordered;
    })();

    const typeIcon = (type) => type === 'Weighing' ? '⚖️' : '🏪';
    const typeLabel = (type) => type === 'Weighing' ? 'Weighing Station' : 'POS';

    return (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <span className="text-base">📡</span>
                    <span className="font-semibold text-gray-800 dark:text-white text-sm">Connected Terminals</span>
                    <Badge count={terminals.length} style={{ backgroundColor: '#22c55e' }} />
                </div>
            </div>

            {terminals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-sm gap-2">
                    <span className="text-3xl">📡</span>
                    No terminals connected
                </div>
            ) : (
                <div>
                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-white/5">
                                    <th className="text-left px-5 py-2 font-semibold w-48">Type</th>
                                    <th className="text-left px-4 py-2 font-semibold">Terminal ID</th>
                                    <th className="text-left px-4 py-2 font-semibold">Cashier</th>
                                    <th className="text-left px-4 py-2 font-semibold">Connected Since</th>
                                </tr>
                            </thead>
                            <tbody>
                                {storeGroups.map(({ storeNo, store, terminals: terms }) => {
                                    const hex = store?.IS_WEIGHING_STATION ? WEIGHING_HEX : getHex(storeNo);
                                    const displayName = store ? getName(storeNo) : `Store ${storeNo}`;
                                    return (
                                        <React.Fragment key={storeNo}>
                                            {/* Store header row */}
                                            <tr>
                                                <td colSpan={4} className="px-5 pt-4 pb-1">
                                                    <div className="flex items-center gap-2">
                                                        <span
                                                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                            style={{ background: hex }}
                                                        />
                                                        <span className="font-bold text-gray-800 dark:text-white text-sm">
                                                            {displayName}
                                                        </span>
                                                        {store?.IS_WEIGHING_STATION ? (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: hex + '25', color: hex }}>⚖️ Weighing Station</span>
                                                        ) : (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: hex + '25', color: hex }}>🏪 POS</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {/* Terminal rows */}
                                            {terms.map((t, i) => (
                                                <tr
                                                    key={t.terminalId || i}
                                                    className="border-b border-white/5 hover:bg-white/3 transition-colors"
                                                    style={{ borderLeft: `3px solid ${hex}30` }}
                                                >
                                                    <td className="px-5 py-2.5">
                                                        <span className="text-xs text-gray-500">
                                                            {typeIcon(t.type)} {typeLabel(t.type)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <span
                                                            className="font-mono text-xs px-2 py-0.5 rounded-md font-semibold"
                                                            style={{ background: hex + '20', color: hex }}
                                                        >
                                                            {t.terminalId}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {t.cashier && t.cashier !== 'Not Logged In' ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                                <span className="text-sm text-gray-700 dark:text-gray-200 font-medium">{t.cashier}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-gray-400 italic">No cashier</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">
                                                        {fmtDate(t.connectedAt)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile card list */}
                    <div className="md:hidden flex flex-col gap-4 p-4">
                        {storeGroups.map(({ storeNo, store, terminals: terms }) => {
                            const hex = store?.IS_WEIGHING_STATION ? WEIGHING_HEX : getHex(storeNo);
                            const displayName = store ? getName(storeNo) : `Store ${storeNo}`;
                            return (
                                <div key={storeNo} className="rounded-xl overflow-hidden border" style={{ borderColor: hex + '40' }}>
                                    {/* Store header */}
                                    <div
                                        className="flex items-center gap-2 px-4 py-2.5"
                                        style={{ background: hex + '18' }}
                                    >
                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: hex }} />
                                        <span className="font-bold text-sm" style={{ color: hex }}>{displayName}</span>
                                        <span className="ml-auto text-[10px] font-semibold" style={{ color: hex }}>
                                            {store?.IS_WEIGHING_STATION ? '⚖️ Weighing' : '🏪 POS'}
                                        </span>
                                    </div>
                                    {/* Terminal cards */}
                                    <div className="flex flex-col divide-y divide-white/5">
                                        {terms.map((t, i) => (
                                            <div key={t.terminalId || i} className="flex flex-col gap-2 px-4 py-3 bg-white/2 dark:bg-black/10">
                                                <div className="flex items-center justify-between">
                                                    <span
                                                        className="font-mono text-xs px-2 py-0.5 rounded-md font-bold"
                                                        style={{ background: hex + '20', color: hex }}
                                                    >
                                                        {t.terminalId}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400">
                                                        {typeIcon(t.type)} {typeLabel(t.type)}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-gray-400 text-[10px] uppercase tracking-wide">Cashier</span>
                                                        {t.cashier && t.cashier !== 'Not Logged In' ? (
                                                            <div className="flex items-center gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                                <span className="font-medium text-gray-700 dark:text-gray-200 truncate">{t.cashier}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 italic">No cashier</span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-gray-400 text-[10px] uppercase tracking-wide">Since</span>
                                                        <span className="font-mono text-gray-600 dark:text-gray-300 text-[11px]">
                                                            {fmtDate(t.connectedAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TerminalMonitor;
