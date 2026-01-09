import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Switch, Badge, App } from 'antd';
import { io } from 'socket.io-client';

// Use backend URL from environment or default
// Use backend URL from environment or default to current origin
const SOCKET_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/');

const TerminalMonitor = () => {
    const { message } = App.useApp();
    const [socket, setSocket] = useState(null);
    const [terminals, setTerminals] = useState([]);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const newSocket = io(SOCKET_URL, {
            transports: ['websocket', 'polling']
        });

        newSocket.on('connect', () => {
            setConnected(true);
            // Request initial list
            newSocket.emit('admin:get_terminals');
        });

        newSocket.on('disconnect', () => {
            setConnected(false);
        });

        newSocket.on('admin:terminals_update', (data) => {
            console.log('Terminals Updated:', data);
            setTerminals(data);
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);

    const toggleBlock = (terminalId, socketId) => {
        if (!socket) return;
        socket.emit('admin:toggle_block', socketId);
        message.info(`Toggled access for terminal ${terminalId}`);
    };

    const columns = [
        {
            title: 'Store Name',
            dataIndex: 'storeName',
            key: 'storeName',
            render: (text, record) => (
                <div>
                    <div className="font-bold">{text || `Store ${record.storeNo}`}</div>
                    <div className="text-xs text-gray-400">POS System</div>
                </div>
            )
        },
        {
            title: 'Terminal ID',
            dataIndex: 'terminalId',
            key: 'terminalId',
            render: (text) => <Tag color="blue">{text}</Tag>
        },
        {
            title: 'Cashier Now',
            dataIndex: 'cashier',
            key: 'cashier',
            render: (text) => (
                text && text !== 'Not Logged In' ? (
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="font-medium">{text}</span>
                    </div>
                ) : (
                    <Tag color="default">No Cashier</Tag>
                )
            )
        },

        {
            title: 'Connected Since',
            dataIndex: 'connectedAt',
            key: 'connectedAt',
            render: (date) => date ? new Date(date).toLocaleString([], {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            }) : '-'
        }
    ];

    return (
        <Card
            title={
                <div className="flex items-center gap-2">
                    <span>📡 Connected Terminals</span>
                    <Badge count={terminals.length} style={{ backgroundColor: '#52c41a' }} />
                </div>
            }
            className="w-full shadow-sm"
        // extra={connected ? <Tag color="success">Socket Connected</Tag> : <Tag color="error">Socket Disconnected</Tag>}
        >
            {/* Desktop Table View */}
            <div className="hidden md:block">
                <Table
                    dataSource={terminals}
                    columns={columns}
                    rowKey="id"
                    pagination={false}
                    size="small"
                    locale={{ emptyText: 'No terminals connected' }}
                />
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden flex flex-col gap-3">
                {terminals.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 text-sm">No terminals connected</div>
                ) : (
                    terminals.map(term => (
                        <div key={term.id} className="border border-gray-100 dark:border-white/10 rounded-xl p-3 bg-gray-50/50 dark:bg-white/5 flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-gray-800 dark:text-white">{term.storeName || `Store ${term.storeNo}`}</div>
                                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">{term.type || 'POS System'}</div>
                                </div>
                                <Tag color="blue" className="m-0 text-xs">{term.terminalId}</Tag>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs mt-1">
                                <div className="flex flex-col p-2 bg-white dark:bg-white/5 rounded-lg">
                                    <span className="text-gray-400 mb-1">Cashier</span>
                                    {term.cashier && term.cashier !== 'Not Logged In' ? (
                                        <div className="flex items-center gap-1.5 align-middle">
                                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse block"></span>
                                            <span className="font-medium text-gray-700 dark:text-gray-200 truncate max-w-[100px]">{term.cashier}</span>
                                        </div>
                                    ) : (
                                        <span className="text-gray-400 italic">No Cashier</span>
                                    )}
                                </div>
                                <div className="flex flex-col p-2 bg-white dark:bg-white/5 rounded-lg">
                                    <span className="text-gray-400 mb-1">Connected</span>
                                    <span className="font-mono text-gray-600 dark:text-gray-300">
                                        {term.connectedAt ? new Date(term.connectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex justify-between items-center mt-1 pt-2 border-t border-gray-200 dark:border-white/10">
                                <div className="flex items-center gap-2">
                                    {/* <span className={`text-[10px] font-bold ${term.allowed ? 'text-green-600' : 'text-red-500'}`}>
                                        {term.allowed ? 'SYNC ON' : 'BLOCKED'}
                                    </span> */}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Card>
    );
};

export default TerminalMonitor;
