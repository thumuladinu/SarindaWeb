import React, { useState, useEffect } from 'react';
import { 
    Card, Table, Tag, Button, Input, Modal, Space, Badge, Alert, 
    message, Tooltip, Select, Form, Popconfirm, Spin 
} from 'antd';
import { 
    DatabaseOutlined, DesktopOutlined, SyncOutlined, 
    BugOutlined, DownloadOutlined, ReloadOutlined,
    SearchOutlined, EditOutlined, DeleteOutlined,
    EyeOutlined, UserOutlined, ThunderboltOutlined, FolderOutlined,
    HddOutlined, CodeOutlined, ClearOutlined, CheckSquareOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

export default function DevTools() {
    const [terminals, setTerminals] = useState([]);
    const [targetTerminalId, setTargetTerminalId] = useState('V9XHG');
    const [loadingTerminals, setLoadingTerminals] = useState(false);

    // Storage Tree State (IndexedDB Stores + LocalStorage Keys)
    const [idbSummary, setIdbSummary] = useState(null);
    const [selectedCategory, setSelectedCategory] = useState('INDEXED_DB'); // 'INDEXED_DB' or 'LOCAL_STORAGE'
    const [selectedStore, setSelectedStore] = useState('sales_bills');
    const [treeLoading, setTreeLoading] = useState(false);

    // Store Records & Row Selection State (Unlimited Records, Newest First)
    const [records, setRecords] = useState([]);
    const [recordsPk, setRecordsPk] = useState('LOCAL_ID');
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [batchDeleting, setBatchDeleting] = useState(false);

    // Record Edit Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingRecord, setEditingRecord] = useState(null);
    const [editForm] = Form.useForm();
    const [editSubmitting, setEditSubmitting] = useState(false);

    // JSON View Modal State
    const [jsonModalVisible, setJsonModalVisible] = useState(false);
    const [selectedRecordJson, setSelectedRecordJson] = useState(null);

    useEffect(() => {
        fetchTerminals();
    }, []);

    useEffect(() => {
        if (targetTerminalId) {
            fetchStorageTree();
        }
    }, [targetTerminalId]);

    useEffect(() => {
        if (targetTerminalId && selectedStore) {
            setSelectedRowKeys([]);
            fetchStoreRecords();
        }
    }, [targetTerminalId, selectedCategory, selectedStore]);

    const fetchTerminals = async () => {
        setLoadingTerminals(true);
        try {
            const res = await axios.get('/api/dev/terminals', { withCredentials: true });
            if (res.data?.success) {
                const list = res.data.result || [];
                setTerminals(list);
                if (list.length > 0 && !targetTerminalId) {
                    setTargetTerminalId(list[0].terminalCode);
                }
            }
        } catch (err) {
            console.error('Error fetching dev terminals:', err);
            message.error('Failed to load online terminals');
        } finally {
            setLoadingTerminals(false);
        }
    };

    const fetchStorageTree = async () => {
        if (!targetTerminalId) return;
        setTreeLoading(true);
        try {
            const res = await axios.post('/api/dev/terminal-idb', {
                targetTerminalId,
                action: 'SUMMARY'
            }, { withCredentials: true });

            if (res.data?.success && res.data?.result) {
                setIdbSummary(res.data.result);
                const stores = res.data.result.idbStores || [];
                if (stores.length > 0 && !selectedStore) {
                    setSelectedStore(stores[0].name);
                }
            } else {
                setIdbSummary(null);
                message.warning(res.data?.message || `Terminal '${targetTerminalId}' is offline or timed out`);
            }
        } catch (e) {
            setIdbSummary(null);
        } finally {
            setTreeLoading(false);
        }
    };

    const fetchStoreRecords = async () => {
        if (!targetTerminalId || !selectedStore) return;
        setRecordsLoading(true);
        try {
            const isLocalStorage = selectedCategory === 'LOCAL_STORAGE';
            // limit: 0 indicates UNLIMITED records
            const res = await axios.post('/api/dev/terminal-idb', {
                targetTerminalId,
                action: 'GET_RECORDS',
                store: selectedStore,
                isLocalStorage,
                limit: 0
            }, { withCredentials: true });

            if (res.data?.success && Array.isArray(res.data?.result)) {
                setRecords(res.data.result);
                setRecordsPk(res.data.pk || (isLocalStorage ? 'KEY' : 'LOCAL_ID'));
            } else {
                setRecords([]);
                message.warning(res.data?.message || 'Failed to fetch records');
            }
        } catch (err) {
            setRecords([]);
            console.error(err);
            message.error('Terminal storage query timed out');
        } finally {
            setRecordsLoading(false);
        }
    };

    const handleForceSync = async () => {
        if (!targetTerminalId) return;
        try {
            const res = await axios.post('/api/dev/terminal-idb', {
                targetTerminalId,
                action: 'FORCE_SYNC'
            }, { withCredentials: true });

            if (res.data?.success) {
                message.success(`Force sync executed on terminal '${targetTerminalId}'!`);
                fetchStorageTree();
                fetchStoreRecords();
            } else {
                message.error(res.data?.message || 'Sync failed');
            }
        } catch (e) {
            message.error('Force sync request timed out');
        }
    };

    const handleOpenEdit = (record) => {
        setEditingRecord(record);
        editForm.setFieldsValue(record);
        setEditModalVisible(true);
    };

    const handleSaveEdit = async (values) => {
        if (!editingRecord) return;
        setEditSubmitting(true);
        try {
            const isLocalStorage = selectedCategory === 'LOCAL_STORAGE';
            const key = isLocalStorage ? editingRecord.KEY : (editingRecord[recordsPk] || editingRecord.LOCAL_ID || editingRecord.id);

            const res = await axios.post('/api/dev/terminal-idb', {
                targetTerminalId,
                action: 'UPDATE',
                store: selectedStore,
                isLocalStorage,
                key,
                updates: values
            }, { withCredentials: true });

            if (res.data?.success) {
                message.success(`Updated '${selectedStore}' record #${key} on terminal ${targetTerminalId}`);
                setEditModalVisible(false);
                fetchStoreRecords();
                fetchStorageTree();
            } else {
                message.error(res.data?.message || 'Update failed');
            }
        } catch (err) {
            console.error(err);
            message.error('Update request failed');
        } finally {
            setEditSubmitting(false);
        }
    };

    const handleDeleteSingleRecord = async (record) => {
        const isLocalStorage = selectedCategory === 'LOCAL_STORAGE';
        const key = isLocalStorage ? record.KEY : (record[recordsPk] || record.LOCAL_ID || record.id);
        try {
            const res = await axios.post('/api/dev/terminal-idb', {
                targetTerminalId,
                action: 'DELETE',
                store: selectedStore,
                isLocalStorage,
                key
            }, { withCredentials: true });

            if (res.data?.success) {
                message.success(`Deleted '${key}' from terminal ${targetTerminalId}`);
                setSelectedRowKeys(prev => prev.filter(k => k !== key));
                fetchStoreRecords();
                fetchStorageTree();
            } else {
                message.error(res.data?.message || 'Delete failed');
            }
        } catch (e) {
            message.error('Delete request failed');
        }
    };

    // BATCH / BULK DELETE SELECTED RECORDS
    const handleBatchDelete = async () => {
        if (selectedRowKeys.length === 0) return;
        setBatchDeleting(true);
        try {
            const isLocalStorage = selectedCategory === 'LOCAL_STORAGE';
            const res = await axios.post('/api/dev/terminal-idb', {
                targetTerminalId,
                action: 'DELETE',
                store: selectedStore,
                isLocalStorage,
                keys: selectedRowKeys
            }, { withCredentials: true });

            if (res.data?.success) {
                message.success(`Successfully bulk deleted ${selectedRowKeys.length} records from terminal '${targetTerminalId}'!`);
                setSelectedRowKeys([]);
                fetchStoreRecords();
                fetchStorageTree();
            } else {
                message.error(res.data?.message || 'Batch delete failed');
            }
        } catch (e) {
            message.error('Batch delete request timed out');
        } finally {
            setBatchDeleting(false);
        }
    };

    // CLEAR ENTIRE STORE
    const handleClearEntireStore = async () => {
        try {
            const isLocalStorage = selectedCategory === 'LOCAL_STORAGE';
            const res = await axios.post('/api/dev/terminal-idb', {
                targetTerminalId,
                action: 'CLEAR_STORE',
                store: selectedStore,
                isLocalStorage
            }, { withCredentials: true });

            if (res.data?.success) {
                message.success(`Cleared entire '${selectedStore}' store on terminal ${targetTerminalId}!`);
                setSelectedRowKeys([]);
                fetchStoreRecords();
                fetchStorageTree();
            } else {
                message.error(res.data?.message || 'Clear store failed');
            }
        } catch (e) {
            message.error('Clear store request timed out');
        }
    };

    const handleViewJson = (record) => {
        setSelectedRecordJson(record);
        setJsonModalVisible(true);
    };

    const currentTerminalInfo = terminals.find(t => t.terminalCode === targetTerminalId);

    // Filtered Records based on search & Sorted Newest First (Created Date / PK Descending)
    const filteredRecords = records
        .filter(r => {
            if (!searchText.trim()) return true;
            const str = JSON.stringify(r).toLowerCase();
            return str.includes(searchText.toLowerCase());
        })
        .sort((a, b) => {
            const valA = a.CREATED_DATE || a.CREATED_AT || a.DATE || a.CREATED_TIME || a[recordsPk] || a.LOCAL_ID || a.ID || 0;
            const valB = b.CREATED_DATE || b.CREATED_AT || b.DATE || b.CREATED_TIME || b[recordsPk] || b.LOCAL_ID || b.ID || 0;

            if (typeof valA === 'string' && typeof valB === 'string') {
                return valB.localeCompare(valA);
            }
            return (Number(valB) || 0) - (Number(valA) || 0);
        });

    // Dynamic Columns for Table View
    const getColumns = () => {
        if (!records || records.length === 0) return [];
        const isLocalStorage = selectedCategory === 'LOCAL_STORAGE';

        if (isLocalStorage) {
            return [
                {
                    title: 'Storage Key',
                    dataIndex: 'KEY',
                    key: 'KEY',
                    render: val => <span className="font-mono font-bold text-blue-400">{val}</span>
                },
                {
                    title: 'Stored Value',
                    dataIndex: 'VALUE',
                    key: 'VALUE',
                    render: val => <span className="font-mono text-xs text-slate-300 break-all">{String(val || '-')}</span>
                },
                {
                    title: 'Actions',
                    key: 'actions',
                    width: 140,
                    render: (_, r) => (
                        <Space>
                            <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => handleOpenEdit(r)} />
                            <Popconfirm title="Delete Key?" description="Delete key from terminal LocalStorage?" onConfirm={() => handleDeleteSingleRecord(r)}>
                                <Button size="small" danger icon={<DeleteOutlined />} />
                            </Popconfirm>
                        </Space>
                    )
                }
            ];
        }

        const keys = Object.keys(records[0]).slice(0, 7);
        const cols = keys.map(k => ({
            title: k,
            dataIndex: k,
            key: k,
            render: val => {
                if (k === 'IS_SYNCED' || k === 'isSynced') {
                    return Number(val) === 1 ? <Tag color="success">Synced (1)</Tag> : <Tag color="warning">Pending (0)</Tag>;
                }
                if (typeof val === 'object' && val !== null) {
                    return <span className="font-mono text-xs text-blue-400">{JSON.stringify(val).slice(0, 30)}...</span>;
                }
                return <span className="font-mono text-xs">{String(val ?? '-')}</span>;
            }
        }));

        cols.push({
            title: 'Live Actions',
            key: 'actions',
            fixed: 'right',
            width: 140,
            render: (_, r) => (
                <Space size="small">
                    <Tooltip title="View Full JSON">
                        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewJson(r)} />
                    </Tooltip>
                    <Tooltip title="Edit Terminal Record Live">
                        <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => handleOpenEdit(r)} />
                    </Tooltip>
                    <Popconfirm title="Delete Record?" description="Permanently delete from terminal's IndexedDB?" onConfirm={() => handleDeleteSingleRecord(r)}>
                        <Tooltip title="Delete Terminal Record">
                            <Button size="small" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        });

        return cols;
    };

    return (
        <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto text-slate-100">
            {/* Top Chrome DevTools Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center text-xl">
                        <BugOutlined />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-white m-0">Terminal Storage Inspector & Live Manager</h1>
                            {currentTerminalInfo?.isActive ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse mr-1.5" /> Online Connected
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-700 text-slate-400 border border-slate-600">
                                    Offline
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 m-0">
                            Real-time database connection to terminal IndexedDB & LocalStorage (Sorted Newest Created Date First)
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div>
                        <span className="text-xs text-slate-400 block mb-0.5 font-semibold">Select Online POS Terminal:</span>
                        <Select
                            value={targetTerminalId}
                            onChange={setTargetTerminalId}
                            className="w-64"
                            options={terminals.map(t => ({
                                value: t.terminalCode,
                                label: `Terminal: ${t.terminalCode} (${t.storeName})`
                            }))}
                        />
                    </div>

                    <Button 
                        type="primary" 
                        danger 
                        icon={<ThunderboltOutlined />}
                        onClick={handleForceSync}
                        className="rounded-xl h-10 font-bold"
                    >
                        Trigger Sync
                    </Button>
                    <Button 
                        icon={<ReloadOutlined />} 
                        loading={treeLoading} 
                        onClick={() => { fetchStorageTree(); fetchStoreRecords(); }}
                        className="rounded-xl h-10"
                    >
                        Refresh Storage
                    </Button>
                </div>
            </div>

            {/* Split Storage Inspector Layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Left Panel: Chrome DevTools Style Tree Explorer */}
                <div className="md:col-span-4 lg:col-span-3 bg-slate-900 rounded-2xl border border-slate-800 p-4 space-y-4 shadow-xl">
                    <div className="font-bold text-sm text-slate-300 flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="flex items-center gap-2"><HddOutlined className="text-blue-400" /> Terminal Storage</span>
                        <Tag color="purple" className="m-0 font-bold">{targetTerminalId}</Tag>
                    </div>

                    {/* IndexedDB Section */}
                    <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <FolderOutlined className="text-amber-400" /> IndexedDB (ChamikaRiceMillDB)
                        </div>

                        {treeLoading ? (
                            <div className="py-4 text-center"><Spin size="small" /></div>
                        ) : idbSummary?.idbStores ? (
                            <div className="space-y-1">
                                {idbSummary.idbStores.map(st => {
                                    const isSelected = selectedCategory === 'INDEXED_DB' && selectedStore === st.name;
                                    return (
                                        <button
                                            key={st.name}
                                            onClick={() => {
                                                setSelectedCategory('INDEXED_DB');
                                                setSelectedStore(st.name);
                                            }}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono transition-all text-left ${
                                                isSelected 
                                                    ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/30' 
                                                    : 'text-slate-300 hover:bg-slate-800'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2 truncate">
                                                <DatabaseOutlined className={isSelected ? 'text-white' : 'text-slate-500'} />
                                                <span className="truncate">{st.name}</span>
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                isSelected ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'
                                            }`}>
                                                {st.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-xs text-slate-500 py-2">No active IndexedDB connection</div>
                        )}
                    </div>

                    {/* LocalStorage Section */}
                    <div className="pt-2 border-t border-slate-800">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <FolderOutlined className="text-emerald-400" /> Local Storage Keys
                        </div>

                        <button
                            onClick={() => {
                                setSelectedCategory('LOCAL_STORAGE');
                                setSelectedStore('local_storage');
                            }}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono transition-all text-left ${
                                selectedCategory === 'LOCAL_STORAGE'
                                    ? 'bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/30' 
                                    : 'text-slate-300 hover:bg-slate-800'
                            }`}
                        >
                            <span className="flex items-center gap-2 truncate">
                                <CodeOutlined className={selectedCategory === 'LOCAL_STORAGE' ? 'text-white' : 'text-slate-500'} />
                                <span>LocalStorage</span>
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                {idbSummary?.localStorageKeys?.length || 0}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Right Panel: Chrome DevTools Style Data Table View */}
                <div className="md:col-span-8 lg:col-span-9 bg-slate-900 rounded-2xl border border-slate-800 p-4 md:p-6 space-y-4 shadow-xl">
                    {/* Header Bar for Selected Store & Batch Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                            <Tag color={selectedCategory === 'LOCAL_STORAGE' ? 'emerald' : 'blue'} className="text-sm font-mono px-3 py-1 font-bold rounded-lg m-0">
                                {selectedCategory === 'LOCAL_STORAGE' ? 'LocalStorage' : `IndexedDB: ${selectedStore}`}
                            </Tag>
                            <span className="text-xs text-slate-400 font-mono">
                                ({filteredRecords.length} total records • Newest First)
                            </span>
                        </div>

                        <div className="flex items-center gap-3">
                            <Input
                                placeholder="Search live records..."
                                prefix={<SearchOutlined className="text-slate-500" />}
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                className="w-60 bg-slate-800 border-slate-700 text-white rounded-xl"
                            />
                            
                            <Popconfirm
                                title={`Clear Store '${selectedStore}'?`}
                                description={`Permanently wipe all records in store '${selectedStore}' on terminal '${targetTerminalId}'?`}
                                onConfirm={handleClearEntireStore}
                                okText="Wipe Store"
                                cancelText="Cancel"
                                okButtonProps={{ danger: true }}
                            >
                                <Button danger icon={<ClearOutlined />} className="rounded-xl">
                                    Clear Store
                                </Button>
                            </Popconfirm>

                            <Button icon={<ReloadOutlined />} loading={recordsLoading} onClick={fetchStoreRecords} className="rounded-xl">
                                Refresh
                            </Button>
                        </div>
                    </div>

                    {/* Batch Actions Notification Banner */}
                    {selectedRowKeys.length > 0 && (
                        <div className="flex items-center justify-between p-3.5 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-200">
                            <div className="flex items-center gap-2 font-bold">
                                <CheckSquareOutlined className="text-red-400 text-base" />
                                <span>{selectedRowKeys.length} records selected for deletion</span>
                            </div>
                            <Space>
                                <Button size="small" onClick={() => setSelectedRowKeys([])} className="rounded-lg">
                                    Clear Selection
                                </Button>
                                <Popconfirm
                                    title={`Delete ${selectedRowKeys.length} Selected Records?`}
                                    description={`Permanently remove ${selectedRowKeys.length} items from terminal '${targetTerminalId}' IndexedDB?`}
                                    onConfirm={handleBatchDelete}
                                    okText={`Delete ${selectedRowKeys.length} Records`}
                                    cancelText="Cancel"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button size="small" type="primary" danger icon={<DeleteOutlined />} loading={batchDeleting} className="rounded-lg font-bold">
                                        Delete Selected ({selectedRowKeys.length})
                                    </Button>
                                </Popconfirm>
                            </Space>
                        </div>
                    )}

                    {/* Data Table with Checkbox Row Selection & Full Pagination Options */}
                    <Table
                        rowSelection={{
                            selectedRowKeys,
                            onChange: (keys) => setSelectedRowKeys(keys)
                        }}
                        columns={getColumns()}
                        dataSource={filteredRecords}
                        rowKey={r => r.LOCAL_ID || r.KEY || r.ITEM_ID || r.CUSTOMER_ID || r.VEHICLE_ID || r.STAFF_ID || r.ID || r.id || Math.random()}
                        loading={recordsLoading}
                        pagination={{
                            pageSize: 25,
                            showSizeChanger: true,
                            pageSizeOptions: ['10', '25', '50', '100', '250', '500', '1000']
                        }}
                        scroll={{ x: 'max-content' }}
                        size="small"
                        className="rounded-xl overflow-hidden border border-slate-800 font-mono text-xs"
                    />
                </div>
            </div>

            {/* Edit Record Modal */}
            <Modal
                title={`Edit Live Record on Terminal ${targetTerminalId}`}
                open={editModalVisible}
                onCancel={() => setEditModalVisible(false)}
                onOk={() => editForm.submit()}
                confirmLoading={editSubmitting}
                okText="Save to Terminal Storage"
                width={650}
            >
                <Alert
                    message={`Live Terminal Remote Fixer (${targetTerminalId})`}
                    description={`Edits will update '${selectedStore}' directly inside POS terminal '${targetTerminalId}' over socket bridge.`}
                    type="warning"
                    showIcon
                    className="mb-4"
                />
                <Form form={editForm} onFinish={handleSaveEdit} layout="vertical" className="max-h-96 overflow-y-auto pr-2">
                    {editingRecord && Object.keys(editingRecord).map(key => (
                        <Form.Item key={key} name={key} label={<span className="font-mono text-xs text-gray-500">{key}</span>}>
                            <Input disabled={key === 'KEY' || key === 'LOCAL_ID' || key === recordsPk} className="font-mono text-xs" />
                        </Form.Item>
                    ))}
                </Form>
            </Modal>

            {/* JSON View Modal */}
            <Modal
                title="Raw Storage Data (JSON)"
                open={jsonModalVisible}
                onCancel={() => setJsonModalVisible(false)}
                footer={[
                    <Button key="close" type="primary" onClick={() => setJsonModalVisible(false)} className="rounded-lg">
                        Close
                    </Button>
                ]}
                width={700}
            >
                <pre className="bg-slate-950 text-emerald-400 p-4 rounded-xl text-xs font-mono overflow-auto max-h-96 shadow-inner">
                    {JSON.stringify(selectedRecordJson, null, 2)}
                </pre>
            </Modal>
        </div>
    );
}
