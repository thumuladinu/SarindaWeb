import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, App, Badge, Empty, Space, Tooltip, Input } from 'antd';
import { io } from 'socket.io-client';
import {
    ReloadOutlined,
    DeleteOutlined,
    MonitorOutlined,
    DatabaseOutlined,
    SearchOutlined,
    ExclamationCircleOutlined
} from '@ant-design/icons';
import Cookies from 'js-cookie';

const SOCKET_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/');

const DevCache = () => {
    const { message, modal } = App.useApp();
    const [socket, setSocket] = useState(null);
    const [terminals, setTerminals] = useState([]);
    const [selectedTerminal, setSelectedTerminal] = useState(null);
    const selectedTerminalRef = React.useRef(null);
    const [cacheData, setCacheData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const loadingTimeoutRef = React.useRef(null);

    // Update Ref whenever state changes
    useEffect(() => {
        selectedTerminalRef.current = selectedTerminal;
    }, [selectedTerminal]);

    useEffect(() => {
        const newSocket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5
        });

        newSocket.on('connect', () => {
            console.log('[DevCache] Socket connected');
            newSocket.emit('admin:get_terminals');
        });

        newSocket.on('admin:terminals_update', (data) => {
            setTerminals(data);

            // If we have a selected terminal, update our state object with latest from list
            // (mainly to keep the socket 'id' fresh if it reconnected)
            const current = selectedTerminalRef.current;
            if (current) {
                const updated = data.find(t => t.terminalId === current.terminalId);
                if (updated) {
                    setSelectedTerminal(updated);
                }
            }
        });

        newSocket.on('admin:terminal_cache_result', (data) => {
            const currentSelected = selectedTerminalRef.current;

            // Match by terminalId (Machine ID) for stability across reconnections
            if (currentSelected && data.terminalId === currentSelected.terminalId) {
                console.log('[DevCache] Received cache data for selected terminal');
                try {
                    const parsed = data.cache ? JSON.parse(data.cache) : [];
                    setCacheData(Array.isArray(parsed) ? parsed : []);
                } catch (e) {
                    message.error('Failed to parse cache data');
                    setCacheData([]);
                }
                setLoading(false);
                if (loadingTimeoutRef.current) {
                    clearTimeout(loadingTimeoutRef.current);
                }
            }
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
            if (loadingTimeoutRef.current) {
                clearTimeout(loadingTimeoutRef.current);
            }
        };
    }, []); // Run once

    const requestCache = (terminal) => {
        if (!socket) {
            message.error('Socket not connected');
            return;
        }

        // Reset loading if already active
        if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
        }

        setLoading(true);
        setSelectedTerminal(terminal);
        socket.emit('admin:request_terminal_cache', terminal.id);
        message.info(`Requesting cache from ${terminal.terminalId}...`);

        // Safety timeout (10 seconds)
        loadingTimeoutRef.current = setTimeout(() => {
            setLoading((prev) => {
                if (prev) {
                    message.warning('Terminal response timed out');
                    return false;
                }
                return prev;
            });
        }, 10000);
    };

    const deleteItem = (item) => {
        if (!socket || !selectedTerminal) return;

        modal.confirm({
            title: 'Delete from Local Cache?',
            icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
            content: `Are you sure you want to delete item ${item.code || item.CODE} from terminal ${selectedTerminal.terminalId}? This will remove it from the POS local storage and IndexedDB.`,
            okText: 'Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: () => {
                socket.emit('admin:delete_terminal_cache_item', {
                    targetSocketId: selectedTerminal.id,
                    itemCode: item.code || item.CODE
                });
                message.success(`Deletion request sent for ${item.code || item.CODE}`);
            }
        });
    };

    const filteredData = cacheData.filter(item => {
        const name = (item.name || item.NAME || '').toLowerCase();
        const code = (item.code || item.CODE || '').toLowerCase();
        const search = searchText.toLowerCase();
        return name.includes(search) || code.includes(search);
    });

    const columns = [
        {
            title: 'Code',
            dataIndex: 'code',
            key: 'code',
            render: (text, record) => <Tag color="blue">{text || record.CODE}</Tag>,
            width: 100
        },
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (text, record) => <b>{text || record.NAME}</b>,
            ellipsis: true
        },
        {
            title: 'Buying',
            dataIndex: 'price',
            key: 'price',
            render: (text, record) => (text || record.BUYING_PRICE || 0).toFixed(2),
            width: 100
        },
        {
            title: 'Selling',
            dataIndex: 'sellingPrice',
            key: 'sellingPrice',
            render: (text, record) => (text || record.SELLING_PRICE || 0).toFixed(2),
            width: 100
        },
        {
            title: 'Status',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (active, record) => {
                const status = active !== undefined ? active : (record.IS_ACTIVE === 1 || record.IS_ACTIVE === true);
                return status ? <Tag color="success">Active</Tag> : <Tag color="error">Deleted</Tag>
            },
            width: 100
        },
        {
            title: 'Action',
            key: 'action',
            render: (_, record) => (
                <Tooltip title="Delete from Local Device">
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => deleteItem(record)}
                    />
                </Tooltip>
            ),
            width: 80
        }
    ];

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8 max-w-[1600px] mx-auto">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-1">
                    <DatabaseOutlined className="mr-3" />
                    Local Cache Inspector
                </h1>
                <p className="text-gray-500 dark:text-gray-400">Real-time remote inspection of terminal local storage (Dev Only)</p>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Left: Terminals List */}
                <div className="xl:col-span-1">
                    <Card
                        title={<div className="flex items-center gap-2"><MonitorOutlined /> Connected Terminals</div>}
                        className="glass-card shadow-sm"
                    >
                        {terminals.length === 0 ? (
                            <Empty description="No terminals connected" />
                        ) : (
                            <div className="space-y-3">
                                {terminals.map(term => (
                                    <div
                                        key={term.id}
                                        onClick={() => requestCache(term)}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 ${selectedTerminal?.id === term.id
                                            ? 'bg-emerald-500/10 border-emerald-500/50 shadow-inner'
                                            : 'bg-white/50 dark:bg-white/5 border-white/10 hover:border-emerald-500/30'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-gray-800 dark:text-white">{term.storeName}</div>
                                                <div className="text-xs text-gray-400">{term.terminalId}</div>
                                            </div>
                                            <Badge status="processing" color="emerald" />
                                        </div>
                                        <div className="mt-2 flex items-center gap-2 text-xs">
                                            <Tag color="cyan" size="small">{term.type}</Tag>
                                            <span className="text-gray-400">{term.cashier}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Right: Cache Content */}
                <div className="xl:col-span-2">
                    <Card
                        title={
                            <div className="flex justify-between items-center w-full">
                                <div className="flex items-center gap-2">
                                    <DatabaseOutlined />
                                    <span>Cache Data {selectedTerminal && `- ${selectedTerminal.terminalId}`}</span>
                                </div>
                                {selectedTerminal && (
                                    <Button
                                        icon={<ReloadOutlined spin={loading} />}
                                        size="small"
                                        onClick={() => requestCache(selectedTerminal)}
                                    >
                                        Update
                                    </Button>
                                )}
                            </div>
                        }
                        className="glass-card shadow-sm"
                    >
                        {!selectedTerminal ? (
                            <div className="py-20 text-center">
                                <MonitorOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                                <p className="text-gray-500">Select a terminal on the left to inspect its local cache</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center bg-white/30 dark:bg-white/5 p-4 rounded-xl border border-white/10">
                                    <Space direction="vertical" size={0}>
                                        <span className="text-gray-400 text-xs uppercase tracking-wider">Storage Key</span>
                                        <span className="font-mono text-sm text-emerald-500">cached_products</span>
                                    </Space>
                                    <Space direction="vertical" size={0} align="end">
                                        <span className="text-gray-400 text-xs uppercase tracking-wider">Total Items</span>
                                        <span className="font-bold text-lg">{cacheData.length}</span>
                                    </Space>
                                </div>

                                <Input
                                    placeholder="Search local cache by name or code..."
                                    prefix={<SearchOutlined className="text-gray-400" />}
                                    className="h-10 rounded-xl"
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                    allowClear
                                />

                                <Table
                                    columns={columns}
                                    dataSource={filteredData}
                                    size="small"
                                    rowKey={record => record.code || record.CODE || Math.random()}
                                    scroll={{ y: 'calc(100vh - 500px)' }}
                                    loading={loading}
                                    pagination={{
                                        pageSize: 50,
                                        showSizeChanger: true,
                                        size: 'small'
                                    }}
                                />
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default DevCache;
