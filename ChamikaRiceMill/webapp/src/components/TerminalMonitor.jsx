import React, { useEffect, useState } from 'react';
import { Badge, App, Table, Tag } from 'antd';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/');

const fmtDate = (date) =>
    date
        ? new Date(date).toLocaleString([], {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
          })
        : '—';

const TerminalMonitor = () => {
    const { message } = App.useApp();
    const [terminals, setTerminals] = useState([]);

    useEffect(() => {
        const newSocket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
        const requestTerminals = () => newSocket.emit('admin:get_terminals');

        newSocket.on('connect', requestTerminals);
        newSocket.on('reconnect', requestTerminals);
        newSocket.on('admin:terminals_update', (data) => {
            const millTerminals = (data || []).filter(t => 
                String(t.storeNo) === '999' || 
                t.storeName?.toLowerCase().includes('mill') || 
                t.type?.toLowerCase().includes('mill') ||
                t.terminalId?.toLowerCase().includes('mill')
            );
            setTerminals(millTerminals);
        });
        return () => newSocket.disconnect();
    }, []);

    const columns = [
        {
            title: 'Station / Store Name',
            dataIndex: 'storeName',
            key: 'storeName',
            render: (text, record) => (
                <div>
                    <div className="font-bold text-gray-800 dark:text-white">{text || `Mill Terminal ${record.storeNo}`}</div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">🌾 {record.type || 'Mill System'}</div>
                </div>
            )
        },
        {
            title: 'Terminal ID',
            dataIndex: 'terminalId',
            key: 'terminalId',
            render: text => <Tag color="blue" className="font-mono font-bold m-0 border-blue-200">{text}</Tag>
        },
        {
            title: 'Cashier / Operator',
            dataIndex: 'cashier',
            key: 'cashier',
            render: cashier => cashier && cashier !== 'Not Logged In' ? (
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse block shadow-sm shadow-blue-500/50" />
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{cashier}</span>
                </div>
            ) : (
                <Tag color="default">No Active Operator</Tag>
            )
        },
        {
            title: 'Connected Since',
            dataIndex: 'connectedAt',
            key: 'connectedAt',
            render: date => <span className="font-mono text-xs text-gray-500">{fmtDate(date)}</span>
        }
    ];

    return (
        <div className="glass-card rounded-2xl overflow-hidden border border-blue-100 dark:border-blue-900/30 shadow-sm p-4 bg-gradient-to-r from-blue-50/40 via-white to-white dark:from-zinc-900 dark:to-zinc-900">
            <div className="flex items-center justify-between mb-3 border-b border-blue-100 dark:border-gray-800 pb-3">
                <div className="flex items-center gap-2">
                    <span className="text-xl">📡</span>
                    <span className="font-bold text-blue-950 dark:text-white text-base">Connected Terminals</span>
                    <Badge count={terminals.length} style={{ backgroundColor: '#2563eb' }} />
                </div>
            </div>

            {/* Mobile Card Layout (< 768px) */}
            <div className="block md:hidden space-y-3">
                {terminals.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-500 dark:text-gray-400 bg-zinc-900/40 rounded-xl border border-white/5">
                        No mill terminals connected currently
                    </div>
                ) : (
                    terminals.map((t, idx) => (
                        <div key={t.id || idx} className="p-3.5 rounded-2xl bg-zinc-900/80 border border-white/10 shadow-sm space-y-2.5">
                            <div className="flex items-start justify-between gap-2 border-b border-white/5 pb-2">
                                <div>
                                    <div className="font-bold text-white text-sm flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                        <span>{t.storeName || `Mill Terminal ${t.storeNo}`}</span>
                                    </div>
                                    <div className="text-xs text-blue-400 font-medium mt-0.5">🌾 {t.type || 'Mill Electron App'}</div>
                                </div>
                                <Tag color="blue" className="font-mono font-bold text-xs m-0 border-blue-500/30 shrink-0 px-2 py-0.5">{t.terminalId}</Tag>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-950/60 p-2.5 rounded-xl border border-white/5">
                                <div>
                                    <span className="text-gray-400 block text-[10px] uppercase font-semibold tracking-wider">Active Operator</span>
                                    {t.cashier && t.cashier !== 'Not Logged In' ? (
                                        <span className="font-semibold text-emerald-400 truncate block mt-0.5">
                                            {t.cashier}
                                        </span>
                                    ) : (
                                        <span className="text-gray-400 italic block mt-0.5">No Active Operator</span>
                                    )}
                                </div>
                                <div className="text-right">
                                    <span className="text-gray-400 block text-[10px] uppercase font-semibold tracking-wider">Connected Time</span>
                                    <span className="font-mono text-[11px] text-gray-300 block mt-0.5">{fmtDate(t.connectedAt)}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Desktop Table View (>= 768px) */}
            <div className="hidden md:block overflow-x-auto">
                <Table
                    dataSource={terminals}
                    columns={columns}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    scroll={{ x: 'max-content' }}
                    locale={{ emptyText: 'No mill terminals connected currently' }}
                />
            </div>
        </div>
    );
};

export default TerminalMonitor;
