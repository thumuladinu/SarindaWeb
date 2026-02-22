import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Card, Table, Tag, Button, App, Badge, Empty, Space, Tooltip, Input, List, Typography, Divider, Modal, Form, Switch } from 'antd';
import { io } from 'socket.io-client';
import {
    ReloadOutlined,
    DeleteOutlined,
    MonitorOutlined,
    DatabaseOutlined,
    SearchOutlined,
    ExclamationCircleOutlined,
    EditOutlined,
    SaveOutlined,
    FileTextOutlined,
    PlusOutlined,
    TableOutlined
} from '@ant-design/icons';

const { Text } = Typography;
const { TextArea } = Input;

const SOCKET_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/');

const DevCache = () => {
    const { message, modal } = App.useApp();
    const [socket, setSocket] = useState(null);
    const [terminals, setTerminals] = useState([]);
    const [selectedTerminal, setSelectedTerminal] = useState(null);
    const selectedTerminalRef = useRef(null);

    const [storageData, setStorageData] = useState({});
    const [activeKey, setActiveKey] = useState('cached_products');

    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [editValue, setEditValue] = useState('');
    const [isEditingRaw, setIsEditingRaw] = useState(false);
    const [viewMode, setViewMode] = useState('auto'); // 'auto', 'table', 'raw'

    const [recordModalVisible, setRecordModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [recordForm] = Form.useForm();

    const loadingTimeoutRef = useRef(null);

    useEffect(() => {
        selectedTerminalRef.current = selectedTerminal;
    }, [selectedTerminal]);

    useEffect(() => {
        const newSocket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 5
        });

        newSocket.on('connect', () => {
            newSocket.emit('admin:get_terminals');
        });

        newSocket.on('admin:terminals_update', (data) => {
            setTerminals(data);
            const current = selectedTerminalRef.current;
            if (current) {
                const updated = data.find(t => t.terminalId === current.terminalId);
                if (updated) setSelectedTerminal(updated);
            }
        });

        newSocket.on('admin:terminal_cache_result', (data) => {
            const currentSelected = selectedTerminalRef.current;
            if (currentSelected && data.terminalId === currentSelected.terminalId) {
                if (data.storage) {
                    setStorageData(data.storage);

                    // Priority for specialized table view
                    const productKey = data.storage['cached_products'] ? 'cached_products' :
                        data.storage['weighingProducts'] ? 'weighingProducts' :
                            null;

                    if (productKey && activeKey === 'cached_products' && productKey === 'weighingProducts') {
                        setActiveKey('weighingProducts');
                    }
                }
                setLoading(false);
                if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
            }
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
            if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (activeKey && storageData[activeKey]) {
            setEditValue(storageData[activeKey]);
        } else {
            setEditValue('');
        }
        setIsEditingRaw(false);
    }, [activeKey, storageData]);

    // Parse JSON safely
    const parsedData = useMemo(() => {
        if (!editValue) return null;
        try {
            const parsed = JSON.parse(editValue);
            return parsed;
        } catch (e) {
            return null;
        }
    }, [editValue]);

    const isArrayData = Array.isArray(parsedData);
    const isObjectData = parsedData && typeof parsedData === 'object' && !isArrayData;

    const requestCache = (terminal) => {
        if (!socket) {
            message.error('Socket not connected');
            return;
        }
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setLoading(true);
        setSelectedTerminal(terminal);
        socket.emit('admin:request_terminal_cache', terminal.id);
        message.info(`Requesting storage from ${terminal.terminalId}...`);

        loadingTimeoutRef.current = setTimeout(() => {
            setLoading(prev => {
                if (prev) {
                    message.warning('Terminal response timed out');
                    return false;
                }
                return prev;
            });
        }, 10000);
    };

    const updateStorageKey = (action, key, value = null) => {
        if (!socket || !selectedTerminal) return;

        const performAction = () => {
            socket.emit('admin:update_terminal_storage', {
                targetSocketId: selectedTerminal.id,
                key,
                value,
                action
            });
            message.success(`${action === 'remove' ? 'Deletion' : 'Update'} request sent for ${key}`);
            setIsEditingRaw(false);
            setRecordModalVisible(false);
        };

        if (action === 'remove' && !value) {
            modal.confirm({
                title: `Delete Storage Key: ${key}?`,
                content: 'This will remove the entry from the terminal\'s localStorage.',
                okType: 'danger',
                onOk: performAction
            });
        } else {
            performAction();
        }
    };

    // Generic JSON Table Manipulation Logic
    const handleAddRecord = () => {
        setEditingRecord(null);
        recordForm.resetFields();
        setRecordModalVisible(true);
    };

    const handleEditRecord = (record, index) => {
        setEditingRecord({ ...record, _index: index });
        recordForm.setFieldsValue(record);
        setRecordModalVisible(true);
    };

    const handleDeleteRecord = (record, index) => {
        modal.confirm({
            title: 'Delete record?',
            content: 'Are you sure you want to remove this row from the JSON array?',
            okType: 'danger',
            onOk: () => {
                const newData = [...parsedData];
                newData.splice(index, 1);
                updateStorageKey('set', activeKey, JSON.stringify(newData));
            }
        });
    };

    const onRecordFormFinish = (values) => {
        const newData = [...(parsedData || [])];
        if (editingRecord && editingRecord._index !== undefined) {
            // Update
            const index = editingRecord._index;
            delete editingRecord._index;
            newData[index] = { ...editingRecord, ...values };
        } else {
            // Add
            newData.push(values);
        }
        updateStorageKey('set', activeKey, JSON.stringify(newData));
    };

    // Dynamic Columns for JSON Array
    const dynamicColumns = useMemo(() => {
        if (!isArrayData || parsedData.length === 0) return [];

        // Extract all unique keys from all objects to handle heterogeneous arrays
        const allKeysSet = new Set();
        parsedData.forEach(item => {
            if (item && typeof item === 'object') {
                Object.keys(item).forEach(k => allKeysSet.add(k));
            }
        });

        const columns = Array.from(allKeysSet).map(key => ({
            title: key,
            dataIndex: key,
            key: key,
            ellipsis: true,
            render: (val) => {
                if (typeof val === 'object') return JSON.stringify(val);
                if (typeof val === 'boolean') return val ? 'Yes' : 'No';
                return String(val ?? '');
            }
        }));

        // Add Actions Column
        columns.push({
            title: 'Action',
            key: 'record_actions',
            fixed: 'right',
            width: 100,
            render: (_, record, index) => (
                <Space>
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleEditRecord(record, index)}
                    />
                    <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDeleteRecord(record, index)}
                    />
                </Space>
            )
        });

        return columns;
    }, [isArrayData, parsedData]);

    const keys = Object.keys(storageData).sort();

    // Determine current display mode
    const actualViewMode = viewMode === 'auto'
        ? (isArrayData ? 'table' : 'raw')
        : viewMode;

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8 max-w-[1600px] mx-auto">
            <header className="mb-8 hidden md:block">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-1 flex items-center gap-3">
                    <DatabaseOutlined />
                    Remote Storage Inspector
                </h1>
                <p className="text-gray-500 dark:text-gray-400">Manage localStorage of connected terminals directly</p>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* Left: Terminals List */}
                <div className="xl:col-span-1">
                    <Card
                        title={<div className="flex items-center gap-2"><MonitorOutlined /> Terminals</div>}
                        className="glass-card shadow-sm"
                        bodyStyle={{ padding: '12px' }}
                    >
                        {terminals.length === 0 ? (
                            <Empty description="No terminals" />
                        ) : (
                            <div className="space-y-2">
                                {terminals.map(term => (
                                    <div
                                        key={term.id}
                                        onClick={() => requestCache(term)}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${selectedTerminal?.id === term.id
                                            ? 'bg-emerald-500/10 border-emerald-500/50 shadow-inner'
                                            : 'bg-white/50 dark:bg-white/5 border-white/10 hover:border-emerald-500/30'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="truncate pr-4">
                                                <div className="font-bold text-sm truncate">{term.storeName}</div>
                                                <div className="text-[10px] text-gray-400">{term.terminalId}</div>
                                            </div>
                                            <Badge status="processing" color="emerald" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    {selectedTerminal && (
                        <Card
                            title={<div className="flex items-center gap-2 mt-4"><DatabaseOutlined /> Storage Keys</div>}
                            className="glass-card shadow-sm mt-4"
                            bodyStyle={{ padding: '0px' }}
                        >
                            <List
                                size="small"
                                dataSource={keys}
                                renderItem={key => (
                                    <List.Item
                                        onClick={() => setActiveKey(key)}
                                        className={`cursor-pointer transition-all px-4 hover:bg-gray-50 dark:hover:bg-white/5 ${activeKey === key ? 'bg-emerald-50 dark:bg-emerald-500/10 border-r-4 border-emerald-500' : ''}`}
                                    >
                                        <div className="flex items-center gap-2 w-full overflow-hidden">
                                            <FileTextOutlined className={activeKey === key ? 'text-emerald-500' : 'text-gray-400'} />
                                            <span className={`truncate text-xs ${activeKey === key ? 'font-bold text-emerald-600 dark:text-emerald-400' : ''}`}>
                                                {key}
                                            </span>
                                        </div>
                                    </List.Item>
                                )}
                            />
                        </Card>
                    )}
                </div>

                {/* Right: Data Content */}
                <div className="xl:col-span-3">
                    <Card
                        title={
                            <div className="flex justify-between items-center w-full">
                                <div className="flex items-center gap-2">
                                    <DatabaseOutlined />
                                    <span>{activeKey} {selectedTerminal && `(${selectedTerminal.terminalId})`}</span>
                                </div>
                                <Space>
                                    {selectedTerminal && isArrayData && (
                                        <Space size="small" className="mr-4">
                                            <Button
                                                size="small"
                                                type={viewMode === 'table' ? 'primary' : 'default'}
                                                icon={<TableOutlined />}
                                                onClick={() => setViewMode('table')}
                                            >Table</Button>
                                            <Button
                                                size="small"
                                                type={viewMode === 'raw' ? 'primary' : 'default'}
                                                icon={<FileTextOutlined />}
                                                onClick={() => setViewMode('raw')}
                                            >Raw</Button>
                                            <Button
                                                size="small"
                                                type={viewMode === 'auto' ? 'primary' : 'default'}
                                                onClick={() => setViewMode('auto')}
                                            >Auto</Button>
                                        </Space>
                                    )}
                                    {selectedTerminal && (
                                        <Button icon={<ReloadOutlined spin={loading} />} size="small" onClick={() => requestCache(selectedTerminal)}>
                                            Sync
                                        </Button>
                                    )}
                                </Space>
                            </div>
                        }
                        className="glass-card shadow-sm"
                    >
                        {!selectedTerminal ? (
                            <div className="py-20 text-center">
                                <MonitorOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
                                <p className="text-gray-500">Select a terminal to inspect storage</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {actualViewMode === 'table' ? (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <Space>
                                                <Input
                                                    placeholder="Search records..."
                                                    prefix={<SearchOutlined className="text-gray-400" />}
                                                    className="h-10 rounded-xl"
                                                    value={searchText}
                                                    onChange={e => setSearchText(e.target.value)}
                                                    allowClear
                                                />
                                            </Space>
                                            <Space>
                                                <Button
                                                    type="primary"
                                                    icon={<PlusOutlined />}
                                                    onClick={handleAddRecord}
                                                    className="rounded-xl"
                                                >Add Record</Button>
                                            </Space>
                                        </div>

                                        <Table
                                            columns={dynamicColumns}
                                            dataSource={parsedData.filter(item => {
                                                if (!searchText) return true;
                                                return JSON.stringify(item).toLowerCase().includes(searchText.toLowerCase());
                                            })}
                                            size="small"
                                            rowKey={(_, index) => index}
                                            scroll={{ x: 'max-content', y: 'calc(100vh - 450px)' }}
                                            loading={loading}
                                            pagination={{ pageSize: 20, size: 'small' }}
                                        />
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex justify-end gap-2">
                                            {!isEditingRaw ? (
                                                <Button icon={<EditOutlined />} onClick={() => setIsEditingRaw(true)}>Edit Raw</Button>
                                            ) : (
                                                <>
                                                    <Button danger onClick={() => setIsEditingRaw(false)}>Cancel</Button>
                                                    <Button type="primary" icon={<SaveOutlined />} onClick={() => updateStorageKey('set', activeKey, editValue)}>Save Changes</Button>
                                                </>
                                            )}
                                            <Button danger ghost icon={<DeleteOutlined />} onClick={() => updateStorageKey('remove', activeKey)}>Delete Key</Button>
                                        </div>

                                        <TextArea
                                            rows={20}
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            readOnly={!isEditingRaw}
                                            className="font-mono text-sm bg-gray-50 dark:bg-black/20 rounded-xl"
                                            style={{ color: isEditingRaw ? undefined : '#666' }}
                                        />

                                        {!isEditingRaw && isObjectData && (
                                            <div className="bg-blue-50 dark:bg-blue-500/10 p-4 rounded-xl border border-blue-200 dark:border-blue-500/30">
                                                <Text type="secondary" className="text-xs">
                                                    Note: This is a JSON object. You can edit the raw source above.
                                                </Text>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            {/* Record Editor Modal */}
            <Modal
                title={editingRecord ? 'Edit Record' : 'Add New Record'}
                open={recordModalVisible}
                onCancel={() => setRecordModalVisible(false)}
                onOk={() => recordForm.submit()}
                destroyOnClose
                width={800}
            >
                <div className="max-h-[60vh] overflow-y-auto pr-2">
                    <Form
                        form={recordForm}
                        layout="vertical"
                        onFinish={onRecordFormFinish}
                    >
                        {/* Identify fields from existing data or generic list */}
                        {dynamicColumns
                            .filter(col => col.key !== 'record_actions')
                            .map(col => (
                                <Form.Item
                                    key={col.key}
                                    name={col.key}
                                    label={col.title}
                                >
                                    {/* Try to guess input type based on existing values */}
                                    <Input placeholder={`Enter ${col.title}`} />
                                </Form.Item>
                            ))
                        }

                        {dynamicColumns.length <= 1 && (
                            <div className="text-center py-4 bg-gray-50 rounded-xl">
                                <Text type="secondary">The JSON array is empty. No fields detected.</Text>
                            </div>
                        )}
                    </Form>
                </div>
            </Modal>
        </div>
    );
};

export default DevCache;
