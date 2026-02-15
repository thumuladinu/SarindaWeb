import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Tag, Spin, App, Tabs, Form, Drawer, Radio, Select, InputNumber, DatePicker, Popconfirm, Modal, Descriptions } from 'antd';
import { SearchOutlined, StockOutlined, HistoryOutlined, FallOutlined, RiseOutlined, DeleteOutlined, EyeOutlined, SwapOutlined, CheckOutlined, CloseOutlined, UndoOutlined, UserOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import Cookies from 'js-cookie';

import InventoryHistoryFilters from './InventoryHistoryFilters';






const { TabPane } = Tabs;

export default function Inventory() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('1');

    // Data States
    const [stockData, setStockData] = useState([]);
    const [historyData, setHistoryData] = useState([]);
    const [filteredHistory, setFilteredHistory] = useState([]);

    // Filter States - Stock
    const [searchText, setSearchText] = useState('');
    const [filteredStock, setFilteredStock] = useState([]);

    // Filter States - History (New Consolidated State)
    const [filtersCollapsed, setFiltersCollapsed] = useState(true);
    const [historyFilters, setHistoryFilters] = useState({
        search: '',
        type: 'all',
        store: 'all',
        item: 'all',
        dateRange: null
    });

    // Stock Adjustment State
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [adjustmentType, setAdjustmentType] = useState('AdjIn');
    const [form] = Form.useForm();

    // History View Modal State
    const [viewRecord, setViewRecord] = useState(null);
    const [viewModalOpen, setViewModalOpen] = useState(false);

    // Transfer Requests State
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [transfersLoading, setTransfersLoading] = useState(false);
    const [approvingId, setApprovingId] = useState(null);
    const [transferApprovalTypes, setTransferApprovalTypes] = useState({}); // Track approval type per request

    const openHistoryDetail = (record) => {
        setViewRecord(record);
        setViewModalOpen(true);
    };

    // Fetch Initial Data
    useEffect(() => {
        fetchStockStatus();
    }, []);

    // Fetch History when Date Range Changes or Tab becomes active
    useEffect(() => {
        if (activeTab === '2') {
            fetchHistory();
        }
        if (activeTab === '3') {
            fetchPendingTransfers();
        }
    }, [activeTab, historyFilters.dateRange]);

    // Apply Client-Side Filters (Search, Type, Store)
    useEffect(() => {
        applyHistoryFilters();
    }, [historyData, historyFilters.search, historyFilters.type, historyFilters.store, historyFilters.item]);

    const applyHistoryFilters = () => {
        let result = [...historyData];

        // Search filter (code, reason/comments)
        if (historyFilters.search) {
            const search = historyFilters.search.toLowerCase();
            result = result.filter(item =>
                (item.CODE && item.CODE.toLowerCase().includes(search)) ||
                (item.COMMENTS && item.COMMENTS.toLowerCase().includes(search)) ||
                (item.ITEM_NAME && item.ITEM_NAME.toLowerCase().includes(search))
            );
        }

        // Type filter
        if (historyFilters.type !== 'all') {
            result = result.filter(item => item.DISPLAY_TYPE === historyFilters.type);
        }

        // Store filter
        if (historyFilters.store !== 'all') {
            result = result.filter(item => String(item.STORE_NO) === historyFilters.store);
        }

        // Item filter (if applicable, currently 'all')
        if (historyFilters.item !== 'all') {
            result = result.filter(item => String(item.ITEM_ID) === historyFilters.item);
        }

        setFilteredHistory(result);
    };

    const fetchStockStatus = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/api/getAllItemStocksRealTime', {});
            if (response.data.success) {
                setStockData(response.data.result);
                setFilteredStock(response.data.result);
            }
        } catch (error) {
            console.error("Error fetching real-time stock:", error);
            message.error("Failed to load stock data");
        } finally {
            setLoading(false);
        }
    };

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const payload = {
                startDate: historyFilters.dateRange ? historyFilters.dateRange[0].format('YYYY-MM-DD') : null,
                endDate: historyFilters.dateRange ? historyFilters.dateRange[1].format('YYYY-MM-DD') : null
            };
            const response = await axios.post('/api/getInventoryHistory', payload);
            if (response.data.success) {
                setHistoryData(response.data.result);
                // setFilteredHistory will be handled by useEffect
            }
        } catch (error) {
            console.error("Error fetching history:", error);
        } finally {
            setLoading(false);
        }
    };

    // prevent double delete
    const [deletingId, setDeletingId] = useState(null);

    // Tab Change
    const handleTabChange = (key) => {
        setActiveTab(key);
        if (key === '1') fetchStockStatus();
        // key 2 fetch is handled by useEffect
    };

    // Search - Stock
    const handleSearch = (e) => {
        const val = e.target.value.toLowerCase();
        setSearchText(val);
        if (!val) {
            setFilteredStock(stockData);
            return;
        }
        const filtered = stockData.filter(stock =>
            (stock.CODE && stock.CODE.toLowerCase().includes(val)) ||
            (stock.NAME && stock.NAME.toLowerCase().includes(val))
        );
        setFilteredStock(filtered);
    };

    // Delete transaction
    const handleDeleteTransaction = async (id) => {
        try {
            // Find the transaction/operation record
            // Check both TRANSACTION_ID and OP_ID as id could be either
            const record = historyData.find(h => h.TRANSACTION_ID === id || h.OP_ID === id);
            if (!record) {
                console.error("Record not found for ID:", id);
                return;
            }

            // Check if it is a Stock Operation (SOURCE_TYPE = 'stock_operation')
            // Or if it's a legacy record that looks like one.
            // Our history view unifies them.

            // If it's a Stock Operation, use the dedicated endpoint which handles full rollback
            if (record.SOURCE_TYPE === 'stock_operation') {
                const response = await axios.post('/api/stock-ops/delete', {
                    OP_ID: record.OP_ID, OP_CODE: record.OP_CODE
                });

                if (response.data.success) {
                    message.success('Stock operation reversed successfully');
                    fetchHistory(); // Reload history
                    fetchStockStatus(); // Reload stock to see changes
                } else {
                    message.error('Failed to reverse operation: ' + response.data.message);
                }
            } else {
                // Regular transaction delete (Legacy fallback or manual adjustment)
                const response = await axios.post('/api/inventory/transaction/delete', {
                    TRANSACTION_ID: id
                });

                if (response.data.success) {
                    message.success('Transaction deleted');
                    fetchHistory();
                    fetchStockStatus();
                } else {
                    message.error('Failed to delete: ' + response.data.message);
                }
            }
        } catch (error) {
            console.error('Delete error:', error);
            message.error('Error deleting record');
        } finally {
            setDeletingId(null);
        }
    };

    // Adjustment Actions
    const openAdjustment = (item) => {
        setSelectedItem(item);
        setAdjustmentType('AdjIn'); // Reset
        form.setFieldsValue({ DATE: dayjs(), STORE_NO: '1', ACTION_TYPE: 'AdjIn', QUANTITY: null, REASON: '' });
        setDrawerOpen(true);
    };

    const handleAdjustmentSubmit = async (values) => {
        setSubmitting(true);
        try {
            // Get current user (from Cookies)
            const userStr = Cookies.get('rememberedUser');
            const user = userStr ? JSON.parse(userStr) : null;
            const userId = user ? (user.USER_ID || user.id) : null;

            const payload = {
                ITEM_ID: selectedItem.ITEM_ID,
                STORE_NO: values.STORE_NO,
                TYPE: values.ACTION_TYPE,
                QUANTITY: values.QUANTITY,
                REASON: values.REASON,
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                CREATED_BY: userId
            };
            console.log('[Inventory] Submitting adjustment:', payload);

            const response = await axios.post('/api/adjustInventory', payload);
            if (response.data.success) {
                message.success('Stock adjusted successfully');
                setDrawerOpen(false);
                fetchStockStatus();
            } else {
                message.error('Adjustment failed: ' + response.data.message);
            }
        } catch (error) {
            console.error("Error adjusting stock:", error);
            message.error("Internal error");
        } finally {
            setSubmitting(false);
        }
    };

    // ========================
    // TRANSFER REQUESTS
    // ========================
    const fetchPendingTransfers = async () => {
        setTransfersLoading(true);
        try {
            const response = await axios.get('/api/stock-transfers/pending');
            if (response.data.success) {
                setPendingTransfers(response.data.requests || []);
            }
        } catch (error) {
            console.error('Error fetching transfers:', error);
        } finally {
            setTransfersLoading(false);
        }
    };

    const handleApproveTransfer = async (transferId, clearanceType = 'PARTIAL') => {
        setApprovingId(transferId);
        try {
            const userStr = Cookies.get('rememberedUser');
            const user = userStr ? JSON.parse(userStr) : null;

            const response = await axios.post('/api/stock-transfers/approve', {
                transferId,
                approvedBy: user?.USER_ID || user?.id,
                approvedByName: user?.NAME || user?.name || 'Unknown',
                comments: `Approved via Web App (${clearanceType})`,
                clearanceType // Add missing parameter
            });
            if (response.data.success) {
                message.success('Transfer approved successfully');
                fetchPendingTransfers();
                fetchStockStatus(); // Refresh stock data
            } else {
                message.error('Approval failed: ' + response.data.message);
            }
        } catch (error) {
            console.error('Error approving transfer:', error);
            message.error('Approval failed');
        } finally {
            setApprovingId(null);
        }
    };

    const handleDeclineTransfer = async (transferId) => {
        const reason = window.prompt("Enter reason for declining:");
        if (reason === null) return; // Cancelled

        setApprovingId(transferId);
        try {
            const userStr = Cookies.get('rememberedUser');
            const user = userStr ? JSON.parse(userStr) : null;

            const response = await axios.post('/api/stock-transfers/decline', {
                transferId,
                approvedBy: user?.USER_ID || user?.id,
                approvedByName: user?.NAME || user?.name || 'Unknown',
                comments: reason
            });
            if (response.data.success) {
                message.success('Transfer declined');
                fetchPendingTransfers();
            } else {
                message.error('Decline failed: ' + response.data.message);
            }
        } catch (error) {
            console.error('Error declining transfer:', error);
            message.error('Decline failed');
        } finally {
            setApprovingId(null);
        }
    };

    // Current User Logic
    const currentUser = JSON.parse(Cookies.get('rememberedUser') || '{}');

    // Desktop Columns - Stock Status
    const stockColumns = [
        { title: 'Code', dataIndex: 'CODE', key: 'CODE', render: (code) => <span className="font-mono font-medium">{code}</span> },
        { title: 'Name', dataIndex: 'NAME', key: 'NAME' },
        { title: 'Store 1', dataIndex: 'STOCK_S1', key: 'STOCK_S1', align: 'center', render: (val) => <Tag color={val > 0 ? 'blue' : val < 0 ? 'red' : 'default'} className="font-bold">{Number(val).toFixed(1)} Kg</Tag> },
        { title: 'Store 2', dataIndex: 'STOCK_S2', key: 'STOCK_S2', align: 'center', render: (val) => <Tag color={val > 0 ? 'purple' : val < 0 ? 'red' : 'default'} className="font-bold">{Number(val).toFixed(1)} Kg</Tag> },
        { title: 'Total', dataIndex: 'TOTAL_STOCK', key: 'TOTAL', align: 'center', render: (val) => <span className="font-bold">{Number(val).toFixed(1)} Kg</span> },
        {
            title: 'Action',
            key: 'action',
            align: 'center',
            render: (_, record) => (
                currentUser?.ROLE !== 'MONITOR' ? (
                    <Button type="primary" size="small" ghost icon={<StockOutlined />} onClick={() => openAdjustment(record)}>Adjust</Button>
                ) : null
            )
        }
    ];

    // Desktop Columns - History
    const historyColumns = [
        { title: 'Code', dataIndex: 'CODE', key: 'CODE', width: 140, render: (code) => <span className="font-mono text-xs text-gray-500">{code}</span> },
        { title: 'Date', dataIndex: 'CREATED_DATE', key: 'DATE', width: 150, render: (date) => dayjs(date).format('DD MMM YY, hh:mm A') },
        { title: 'Type', dataIndex: 'DISPLAY_TYPE', key: 'TYPE', width: 180, render: (type) => <Tag icon={['AdjIn', 'Opening'].includes(type) ? <RiseOutlined /> : <FallOutlined />} color={['AdjIn', 'Opening'].includes(type) ? 'success' : 'error'} style={{ whiteSpace: 'nowrap' }}>{type}</Tag> },
        { title: 'Item', dataIndex: 'ITEM_NAME', key: 'ITEM', render: (text, record) => <div className="flex flex-col"><span className="font-medium">{record.ITEM_NAME}</span><span className="text-xs text-gray-400">{record.ITEM_CODE}</span></div> },
        { title: 'Store', dataIndex: 'STORE_NO', key: 'STORE', width: 70, align: 'center', render: (store) => <Tag>S{store}</Tag> },
        { title: 'Reason / Notes', dataIndex: 'COMMENTS', key: 'NOTE', ellipsis: true, className: 'text-xs text-gray-500' },
        {
            title: '', key: 'action', width: 50, render: (_, record) => (
                currentUser?.ROLE !== 'MONITOR' ? (
                    <div onClick={(e) => e.stopPropagation()}>
                        <Popconfirm
                            title="Delete this record?"
                            description="Stock will be recalculated"
                            onConfirm={() => {
                                if (deletingId) return;
                                setDeletingId(record.TRANSACTION_ID || record.OP_ID);
                                handleDeleteTransaction(record.TRANSACTION_ID || record.OP_ID);
                            }}
                            okText="Delete"
                            cancelText="Cancel"
                            okButtonProps={{ danger: true, loading: deletingId === (record.TRANSACTION_ID || record.OP_ID) }}
                        >
                            <Button type="text" danger size="small" icon={<DeleteOutlined />} loading={deletingId === (record.TRANSACTION_ID || record.OP_ID)} />
                        </Popconfirm>
                    </div>
                ) : null
            )
        }
    ];

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="hidden md:block">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <StockOutlined /> Inventory
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Real-time stock and adjustments</p>
                </div>
                {activeTab === '1' && (
                    <Input
                        placeholder="Search Item..."
                        prefix={<SearchOutlined className="text-gray-400" />}
                        value={searchText}
                        onChange={handleSearch}
                        className="w-full md:w-64"
                        allowClear
                    />
                )}
            </div>

            {/* Mobile Navigation Dropdown - Only show on mobile */}
            <div className="md:hidden mb-4">
                <Select
                    value={activeTab}
                    onChange={handleTabChange}
                    className="w-full"
                    size="large"
                    options={[
                        { value: '1', label: <span className="flex items-center gap-2"><StockOutlined /> Stock</span> },
                        { value: '2', label: <span className="flex items-center gap-2"><HistoryOutlined /> History</span> },
                        {
                            value: '3',
                            label: (
                                <span className="flex items-center justify-between w-full">
                                    <span className="flex items-center gap-2"><SwapOutlined /> Transfer Requests</span>
                                    {pendingTransfers.length > 0 && <Tag color="red" className="ml-2 m-0">{pendingTransfers.length}</Tag>}
                                </span>
                            )
                        }
                    ]}
                />
            </div>

            {/* Desktop Tabs - Hidden on mobile */}
            <div className="hidden md:block">
                <Tabs activeKey={activeTab} onChange={handleTabChange} type="line" size="small" className="mb-4">
                    <TabPane tab={<span><StockOutlined /> Stock</span>} key="1" />
                    <TabPane tab={<span><HistoryOutlined /> History</span>} key="2" />
                    <TabPane tab={<span><SwapOutlined /> Transfer Requests {pendingTransfers.length > 0 && <Tag color="red" style={{ marginLeft: 4 }}>{pendingTransfers.length}</Tag>}</span>} key="3" />
                </Tabs>
            </div>

            {/* History Filters - Only show on History tab */}
            {activeTab === '2' && (
                <InventoryHistoryFilters
                    filters={historyFilters}
                    setFilters={setHistoryFilters}
                    collapsed={filtersCollapsed}
                    setCollapsed={setFiltersCollapsed}
                    itemOptions={[...new Map(historyData.map(h => [h.ITEM_ID, { id: h.ITEM_ID, name: h.ITEM_NAME }])).values()]}
                />
            )}

            {/* Desktop Table View - Only for Stock and History tabs */}
            {(activeTab === '1' || activeTab === '2') && (
                <div className="hidden md:block glass-card rounded-2xl overflow-hidden p-1">
                    {activeTab === '1' ? (
                        <Table columns={stockColumns} dataSource={filteredStock} rowKey="ITEM_ID" loading={loading} pagination={{ pageSize: 12 }} size="middle" />
                    ) : (
                        <Table
                            columns={historyColumns}
                            dataSource={filteredHistory}
                            rowKey="TRANSACTION_ID"
                            loading={loading}
                            pagination={{ pageSize: 12 }}
                            size="middle"
                            scroll={{ x: 900 }}
                            onRow={(record) => ({
                                onClick: () => openHistoryDetail(record),
                                className: 'cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors'
                            })}
                        />
                    )}
                </div>
            )}


            {/* Mobile Card View - Stock */}
            {activeTab === '1' && (
                <div className="md:hidden flex flex-col gap-4">
                    {loading ? <div className="flex justify-center p-8"><Spin /></div> : filteredStock.map(item => (
                        <div key={item.ITEM_ID} className="glass-card p-4 rounded-xl flex flex-col gap-3 relative">
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <span className="text-xs text-gray-500 font-mono">{item.CODE}</span>
                                    <span className="text-gray-800 dark:text-white font-semibold text-lg">{item.NAME}</span>
                                </div>
                                {currentUser?.ROLE !== 'MONITOR' && (
                                    <Button type="primary" size="small" icon={<StockOutlined />} className="bg-emerald-600 border-emerald-600" onClick={() => openAdjustment(item)}>Adjust</Button>
                                )}
                            </div>

                            <div className="flex justify-between items-end border-t border-gray-200 dark:border-white/5 pt-3">
                                <div className="flex flex-col gap-1">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">Store 1</span>
                                        <span className={`text-sm font-bold ${item.STOCK_S1 > 0 ? 'text-blue-500' : item.STOCK_S1 < 0 ? 'text-red-500' : 'dark:text-gray-300'}`}>{Number(item.STOCK_S1).toFixed(1)} Kg</span>
                                    </div>
                                    <div className="flex flex-col mt-1">
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">Store 2</span>
                                        <span className={`text-sm font-bold ${item.STOCK_S2 > 0 ? 'text-purple-500' : item.STOCK_S2 < 0 ? 'text-red-500' : 'dark:text-gray-300'}`}>{Number(item.STOCK_S2).toFixed(1)} Kg</span>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-xs text-gray-500">Total Stock</span>
                                    <span className="text-xl font-bold text-emerald-500">{Number(item.TOTAL_STOCK).toFixed(1)} Kg</span>
                                </div>
                            </div>
                        </div>
                    ))}
                    {!loading && filteredStock.length === 0 && <div className="text-center py-10 text-gray-500">No items found</div>}
                </div>
            )}

            {/* Mobile Card View - History */}
            {activeTab === '2' && (
                <div className="md:hidden flex flex-col gap-4">
                    {loading ? <div className="flex justify-center p-8"><Spin /></div> : filteredHistory.map(item => (
                        <div key={item.TRANSACTION_ID} onClick={() => openHistoryDetail(item)} className="glass-card p-4 rounded-xl flex flex-col gap-3 relative cursor-pointer active:scale-95 transition-transform">
                            {/* Delete Button */}
                            {currentUser?.ROLE !== 'MONITOR' && (
                                <div onClick={(e) => e.stopPropagation()} className="absolute top-3 right-3 z-10">
                                    <Popconfirm
                                        title="Delete?"
                                        description="Stock will recalculate"
                                        onConfirm={() => {
                                            if (deletingId) return;
                                            setDeletingId(item.TRANSACTION_ID || item.OP_ID);
                                            handleDeleteTransaction(item.TRANSACTION_ID || item.OP_ID);
                                        }}
                                        okText="Yes"
                                        cancelText="No"
                                        okButtonProps={{ danger: true, loading: deletingId === (item.TRANSACTION_ID || item.OP_ID) }}
                                    >
                                        <Button type="text" danger size="small" icon={<DeleteOutlined />} loading={deletingId === (item.TRANSACTION_ID || item.OP_ID)} />
                                    </Popconfirm>
                                </div>
                            )}

                            <div className="flex justify-between items-start pr-8">
                                <div className="flex flex-col">
                                    <span className="font-mono text-[10px] text-gray-400">{item.CODE}</span>
                                    <span className="text-xs text-gray-500">{dayjs(item.CREATED_DATE).format('DD MMM YY, hh:mm A')}</span>
                                    <span className="text-gray-800 dark:text-white font-semibold">{item.ITEM_NAME || 'Unknown'}</span>
                                </div>
                                <Tag icon={['AdjIn', 'Opening'].includes(item.DISPLAY_TYPE) ? <RiseOutlined /> : <FallOutlined />} color={['AdjIn', 'Opening'].includes(item.DISPLAY_TYPE) ? 'success' : 'error'}>{item.DISPLAY_TYPE}</Tag>
                            </div>

                            <div className="flex justify-between items-center border-t border-gray-200 dark:border-white/5 pt-3">
                                <div className="flex gap-4">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">Store</span>
                                        <Tag>S{item.STORE_NO}</Tag>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider">Qty</span>
                                        <span className={`font-bold ${['AdjOut', 'StockClear'].includes(item.DISPLAY_TYPE) ? 'text-red-500' : 'text-emerald-600'}`}>
                                            {['AdjOut', 'StockClear'].includes(item.DISPLAY_TYPE) ? '-' : '+'}{Number(item.ITEM_QTY).toFixed(1)} Kg
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    {!loading && filteredHistory.length === 0 && <div className="text-center py-10 text-gray-500">No history records</div>}
                </div>
            )}

            {/* Returns Tab Content */}
            {/* Returns Tab Content */}

            {/* Transfer Requests View */}
            {activeTab === '3' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {transfersLoading ? (
                        <div className="col-span-full flex justify-center p-12"><Spin size="large" /></div>
                    ) : pendingTransfers.length === 0 ? (
                        <div className="col-span-full text-center py-12 text-gray-500 glass-card rounded-xl">
                            <CheckOutlined className="text-4xl text-emerald-500 mb-2" />
                            <p>No pending requests</p>
                        </div>
                    ) : (
                        pendingTransfers.map(req => (
                            <div key={req.id} className="glass-card p-5 rounded-xl border border-blue-100 dark:border-blue-900/30 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>

                                <div className="flex justify-between items-start mb-3 pl-2">
                                    <div>
                                        <Tag color="geekblue" className="mb-1">{req.local_id}</Tag>
                                        <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{req.main_item_name}</h3>
                                        <p className="text-xs text-gray-500">{dayjs(req.request_date).format('DD MMM YYYY, hh:mm A')}</p>
                                    </div>
                                    <div className="text-right">
                                        {(() => {
                                            if (req.has_conversion === 1) {
                                                const conversions = req.conversions ? (Array.isArray(req.conversions) ? req.conversions : JSON.parse(req.conversions)) : [];
                                                const totalConverted = conversions.reduce((acc, c) => acc + (parseFloat(c.dest_qty) || 0), 0);

                                                return (
                                                    <>
                                                        <span className="block text-2xl font-bold text-geekblue-600 dark:text-geekblue-400">
                                                            {totalConverted.toFixed(1)} <span className="text-sm font-normal">Kg</span>
                                                        </span>
                                                        <span className="text-xs text-geekblue-500 font-bold">Total Converted</span>
                                                    </>
                                                );
                                            } else {
                                                return (
                                                    <>
                                                        <span className="block text-2xl font-bold text-blue-600">
                                                            {Number(req.main_item_qty).toFixed(1)} <span className="text-sm font-normal">Kg</span>
                                                        </span>
                                                        <span className="text-xs text-gray-400">Requested</span>
                                                    </>
                                                );
                                            }
                                        })()}
                                    </div>
                                </div>

                                {req.has_conversion === 1 && (
                                    <div className="bg-amber-50 dark:bg-amber-900/10 p-2 rounded-lg mb-4 ml-2 border border-amber-100 dark:border-amber-800/20">
                                        <p className="text-xs text-amber-600 font-bold mb-1">Requested Conversions:</p>
                                        <ul className="text-sm space-y-1">
                                            {req.conversions && (Array.isArray(req.conversions) ? req.conversions : JSON.parse(req.conversions)).map((c, idx) => (
                                                <li key={idx} className="flex justify-between">
                                                    <span>{c.dest_item_name}</span>
                                                    <b>{Number(c.dest_qty).toFixed(1)} Kg</b>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2 mt-4 ml-2 border-t pt-3 border-gray-100 dark:border-white/5">
                                    {/* Decline Button */}
                                    {/* Decline Button */}
                                    <Button
                                        danger
                                        icon={<span>✕</span>}
                                        loading={approvingId === req.id}
                                        onClick={() => handleDeclineTransfer(req.id)}
                                        className="border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    >
                                        Decline
                                    </Button>

                                    {/* Partial Clear Button */}
                                    <Popconfirm
                                        title="Partial Clear"
                                        description={<span>Deduct <b>only the requested quantity</b> from Store 1 stock and add to Store 2?</span>}
                                        onConfirm={() => handleApproveTransfer(req.id, 'PARTIAL')}
                                        okText="Yes, Partial Clear" cancelText="Cancel"
                                    >
                                        <Button
                                            icon={<span>⚠️</span>}
                                            className="bg-amber-400 hover:bg-amber-500 text-black border-amber-400"
                                            loading={approvingId === req.id}
                                        >
                                            Partial & Approve
                                        </Button>
                                    </Popconfirm>

                                    {/* Full Clear Button */}
                                    <Popconfirm
                                        title="Full Clear"
                                        description={<span>Clear <b>ALL stock</b> of this item from Store 1? (Wastage will be calculated)</span>}
                                        onConfirm={() => handleApproveTransfer(req.id, 'FULL')}
                                        okText="Yes, Full Clear" cancelText="Cancel"
                                        okButtonProps={{ className: 'bg-green-600 hover:bg-green-500' }}
                                    >
                                        <Button
                                            type="primary"
                                            icon={<span>✅</span>}
                                            className="bg-green-600 hover:bg-green-500 border-green-600"
                                            loading={approvingId === req.id}
                                        >
                                            Full Clear & Approve
                                        </Button>
                                    </Popconfirm>
                                </div>

                            </div>
                        ))
                    )}
                </div>
            )}

            {/* Adjustment Drawer */}
            <Drawer
                title="Adjust Stock"
                width={adjustmentType === 'StockReturn' ? (window.innerWidth < 768 ? '100%' : 700) : 420}
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
                className="glass-drawer"
                footer={adjustmentType === 'StockReturn' ? null : undefined}
            >
                {selectedItem && (
                    <Form form={form} layout="vertical" onFinish={handleAdjustmentSubmit} initialValues={{ STORE_NO: '1', ACTION_TYPE: 'AdjIn', QUANTITY: 0, DATE: dayjs() }}>
                        <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl mb-6">
                            <h4 className="font-bold text-gray-800 dark:text-gray-200">{selectedItem.NAME}</h4>
                            <p className="text-xs text-gray-500">{selectedItem.CODE}</p>
                            <div className="flex gap-4 mt-2 text-sm">
                                <span>Store 1: <b>{Number(selectedItem.STOCK_S1 || 0).toFixed(1)} Kg</b></span>
                                <span>Store 2: <b>{Number(selectedItem.STOCK_S2 || 0).toFixed(1)} Kg</b></span>
                            </div>
                        </div>

                        <Form.Item name="DATE" label="Date" rules={[{ required: true }]}>
                            <DatePicker className="w-full" format="YYYY-MM-DD" />
                        </Form.Item>

                        <Form.Item name="STORE_NO" label="Store" rules={[{ required: true }]}>
                            <Radio.Group className="w-full grid grid-cols-2 gap-2">
                                <Radio.Button value="1" className="text-center">Store 1</Radio.Button>
                                <Radio.Button value="2" className="text-center">Store 2</Radio.Button>
                            </Radio.Group>
                        </Form.Item>

                        <Form.Item name="ACTION_TYPE" label="Adjustment Type" rules={[{ required: true }]}>
                            <Select onChange={(val) => {
                                setAdjustmentType(val);
                                if (val === 'StockClear') form.setFieldsValue({ QUANTITY: 0 });
                            }}>
                                <Select.Option value="AdjIn">➕ Stock In (Add to current)</Select.Option>
                                <Select.Option value="AdjOut">➖ Stock Out (Remove from current)</Select.Option>
                                <Select.Option value="Opening">🏁 Opening Stock (Set stock to this value)</Select.Option>
                                <Select.Option value="StockClear">🗑️ Stock Clearance (Set to 0)</Select.Option>
                            </Select>
                        </Form.Item>

                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.ACTION_TYPE !== cur.ACTION_TYPE}>
                            {({ getFieldValue }) => {
                                const actionType = getFieldValue('ACTION_TYPE');



                                if (actionType === 'StockClear') {
                                    return (
                                        <>
                                            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg mb-4 text-sm text-red-700 dark:text-red-300">
                                                ⚠️ This will <b>reset stock to 0</b> for the selected store.
                                            </div>
                                            <Form.Item
                                                name="QUANTITY"
                                                label="Good/Accounted Quantity (Optional)"
                                                help="Enter amount successfully sold/used. Remaining stock will be recorded as waste."
                                            >
                                                <InputNumber
                                                    className="w-full"
                                                    min={0}
                                                    step={0.01}
                                                    placeholder="Enter valid quantity (optional)"
                                                />
                                            </Form.Item>
                                        </>
                                    );
                                }
                                return (
                                    <Form.Item
                                        name="QUANTITY"
                                        label={actionType === 'Opening' ? 'Set Stock To (Kg)' : 'Quantity (Kg)'}
                                        rules={[{ required: true, message: 'Please enter quantity' }]}
                                    >
                                        <InputNumber
                                            className="w-full"
                                            min={0}
                                            step={0.01}
                                            placeholder={actionType === 'Opening' ? 'Enter target stock value' : 'Enter quantity'}
                                        />
                                    </Form.Item>
                                );
                            }}
                        </Form.Item>

                        {adjustmentType !== 'StockReturn' && (
                            <>
                                <Form.Item name="REASON" label="Reason">
                                    <Input.TextArea rows={3} placeholder="Reason for adjustment..." />
                                </Form.Item>

                                <Button type="primary" htmlType="submit" block loading={submitting} size="large" icon={<CheckOutlined />}>
                                    Save Adjustment
                                </Button>
                            </>
                        )}
                    </Form>
                )}
            </Drawer>

            {/* View History Detail Modal */}
            <Modal
                title={<div className="flex items-center gap-2"><EyeOutlined className="text-blue-500" /> {viewRecord?.SOURCE_TYPE === 'stock_operation' ? (viewRecord.OP_TYPE === 11 ? 'Stock Return Details' : 'Stock Operation Details') : 'Transaction Details'}</div>}
                open={viewModalOpen}
                onCancel={() => setViewModalOpen(false)}
                footer={[<Button key="close" onClick={() => setViewModalOpen(false)}>Close</Button>]}
                width={550}
            >
                {viewRecord && (
                    <div className="flex flex-col gap-4">
                        {/* Header */}
                        <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/10">
                            <div className="flex gap-2 items-center">
                                <Tag icon={['AdjIn', 'Opening'].includes(viewRecord.DISPLAY_TYPE) ? <RiseOutlined /> : <FallOutlined />} color={viewRecord.SOURCE_TYPE === 'stock_operation' ? 'purple' : (['AdjIn', 'Opening'].includes(viewRecord.DISPLAY_TYPE) ? 'success' : 'error')}>
                                    {viewRecord.DISPLAY_TYPE}
                                </Tag>
                                <Tag>Store {viewRecord.STORE_NO}</Tag>
                            </div>
                            <div className="text-gray-500 text-sm">
                                {dayjs(viewRecord.CREATED_DATE).format('DD MMM YYYY, hh:mm A')}
                            </div>
                        </div>

                        {/* Stock Operation Breakdown */}
                        {viewRecord.SOURCE_TYPE === 'stock_operation' && (viewRecord.breakdown || viewRecord.OP_TYPE === 11) && (
                            <div className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl border border-purple-100 dark:border-purple-800/30">

                                {/* Specialized Stock Return View (Op 11) */}
                                {viewRecord.OP_TYPE === 11 ? (
                                    <div>
                                        {/* Rich Header Flow */}
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex flex-col items-center">
                                                <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center border-2 border-white dark:border-gray-700 shadow-sm z-10">
                                                    <UserOutlined className="text-lg text-orange-600 dark:text-orange-400" />
                                                </div>
                                                <span className="text-xs font-bold text-gray-500 mt-1">Customer</span>
                                            </div>

                                            <div className="flex-1 h-0.5 bg-gray-300 mx-2 relative flex items-center justify-center">
                                                <div className="absolute -top-3 bg-white dark:bg-gray-800 px-2 text-xs text-gray-500 font-mono">
                                                    {Number(viewRecord.ITEM_QTY || viewRecord.breakdown?.source?.adjustmentQty || 0).toFixed(3)} Kg
                                                </div>
                                                <UndoOutlined className="text-blue-500 text-lg" />
                                            </div>

                                            <div className="flex flex-col items-center">
                                                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center border-2 border-white dark:border-gray-700 shadow-sm z-10">
                                                    <span className="text-lg font-bold text-green-600 dark:text-green-400">S{viewRecord.STORE_NO}</span>
                                                </div>
                                                <span className="text-xs font-bold text-gray-500 mt-1">Store {viewRecord.STORE_NO}</span>
                                            </div>
                                        </div>

                                        {/* Main Item Detail - Show ONLY if NO conversions (Standard Return) */}
                                        {(!viewRecord.breakdown?.destinations || viewRecord.breakdown.destinations.length === 0) && (
                                            <div className="mb-4 p-3 bg-white/60 dark:bg-black/20 rounded-lg">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{viewRecord.ITEM_NAME || 'Item'}</span>
                                                    <span className="text-green-600 font-bold">+{Number(viewRecord.ITEM_QTY || viewRecord.breakdown?.source?.adjustmentQty || 0).toFixed(3)} Kg</span>
                                                </div>
                                                <div className="mt-2 text-xs flex justify-between bg-green-50 dark:bg-green-900/20 p-2 rounded">
                                                    <span className="text-gray-500">Prev: {viewRecord.breakdown?.source?.previousStock !== undefined ? Number(viewRecord.breakdown.source.previousStock).toFixed(3) : '-'}</span>
                                                    <span className="text-gray-400">→</span>
                                                    <span className="font-bold text-gray-700 dark:text-gray-300">Curr: {viewRecord.breakdown?.source ? Number((parseFloat(viewRecord.breakdown.source.previousStock) || 0) + (parseFloat(viewRecord.breakdown.source.adjustmentQty) || 0)).toFixed(3) : '-'}</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* Reference */}
                                        {(viewRecord.breakdown?.refOpCode || viewRecord.breakdown?.refBillCode) && (
                                            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-lg">
                                                {viewRecord.breakdown?.refOpCode && (
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Original Op</span>
                                                        <span className="font-mono text-sm font-bold text-gray-700 dark:text-gray-300">{viewRecord.breakdown.refOpCode}</span>
                                                    </div>
                                                )}
                                                {viewRecord.breakdown?.refBillCode && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Original Bill</span>
                                                        <span className="font-mono text-sm font-bold text-gray-700 dark:text-gray-300">{viewRecord.breakdown.refBillCode}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Converted Items if any */}
                                        {viewRecord.breakdown?.destinations && viewRecord.breakdown.destinations.length > 0 && (
                                            <div className="mt-2">
                                                <div className="text-xs font-bold uppercase text-gray-400 mb-2 flex items-center gap-2">
                                                    <RiseOutlined className="text-green-500" /> Converted To
                                                </div>
                                                {viewRecord.breakdown.destinations.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between items-center p-2 bg-white/50 dark:bg-white/5 rounded-lg mb-1 border border-gray-100 dark:border-white/10">
                                                        <span className="font-medium text-gray-700 dark:text-gray-300">
                                                            {item.itemName}
                                                        </span>
                                                        <span className="text-green-600 font-bold">+{Number(item.quantity).toFixed(3)} Kg</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : viewRecord.breakdown && (
                                    <>
                                        {/* Specialized Transfer View (Op 5, 6) */}
                                        {[5, 6].includes(viewRecord.OP_TYPE) ? (
                                            <div>
                                                {/* Transfer Flow Header */}
                                                <div className="flex items-center justify-between mb-6">
                                                    <div className="flex flex-col items-center">
                                                        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center border-2 border-white dark:border-gray-700 shadow-sm z-10">
                                                            <span className="text-lg font-bold text-red-600 dark:text-red-400">S1</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-500 mt-1">Source</span>
                                                    </div>

                                                    <div className="flex-1 h-0.5 bg-gray-300 mx-2 relative flex items-center justify-center">
                                                        <div className="absolute -top-3 bg-white dark:bg-gray-800 px-2 text-xs text-gray-500 font-mono">
                                                            {Number(viewRecord.breakdown.totalDestQty || 0).toFixed(1)} Kg
                                                        </div>
                                                        <SwapOutlined className="text-blue-500 text-lg" />
                                                    </div>

                                                    <div className="flex flex-col items-center">
                                                        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center border-2 border-white dark:border-gray-700 shadow-sm z-10">
                                                            <span className="text-lg font-bold text-green-600 dark:text-green-400">S2</span>
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-500 mt-1">Dest</span>
                                                    </div>
                                                </div>

                                                {/* Source Detail */}
                                                <div className="mb-4 p-3 bg-white/60 dark:bg-black/20 rounded-lg">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">From Store 1: {viewRecord.breakdown.source.itemName}</span>
                                                        <span className="text-xs text-red-500 font-mono">-{Number(viewRecord.breakdown.source.adjustmentQty).toFixed(1)} Kg</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 flex justify-between">
                                                        <span>Previous Stock: {Number(viewRecord.breakdown.source.previousStock).toFixed(1)} Kg</span>
                                                        {viewRecord.OP_TYPE === 6 && (
                                                            <span>Full Clear</span>
                                                        )}
                                                    </div>
                                                    {/* Show Surplus/Wastage if Full Clear */}
                                                    {(viewRecord.breakdown.wastage > 0 || viewRecord.breakdown.surplus > 0) && (
                                                        <div className="mt-2 text-xs flex gap-2">
                                                            {viewRecord.breakdown.wastage > 0 && <Tag color="error">Wastage: {viewRecord.breakdown.wastage} Kg</Tag>}
                                                            {viewRecord.breakdown.surplus > 0 && <Tag color="warning">Surplus: {viewRecord.breakdown.surplus} Kg</Tag>}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Destinations Detail with Before/After Stock */}
                                                <div className="p-3 bg-white/60 dark:bg-black/20 rounded-lg">
                                                    <div className="text-xs text-gray-500 mb-2 uppercase">To Store 2</div>
                                                    {viewRecord.breakdown.store2Items && viewRecord.breakdown.store2Items.length > 0 ? (
                                                        viewRecord.breakdown.store2Items.map((item, idx) => (
                                                            <div key={idx} className="flex justify-between items-center mb-2 p-2 bg-green-50 dark:bg-green-900/20 rounded">
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.itemName}</span>
                                                                    <span className="text-xs text-gray-400">{item.itemCode}</span>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="text-sm font-bold text-green-600">+{Number(item.addedQty).toFixed(1)} Kg</span>
                                                                    <div className="text-xs text-gray-400">
                                                                        {Number(item.previousStock).toFixed(1)} → {Number(item.currentStock).toFixed(1)} Kg
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : viewRecord.breakdown.destinations && viewRecord.breakdown.destinations.length > 0 ? (
                                                        viewRecord.breakdown.destinations.map((dest, idx) => (
                                                            <div key={idx} className="flex justify-between items-center mb-1">
                                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{dest.itemName}</span>
                                                                <span className="text-sm font-bold text-green-600">+{Number(dest.quantity).toFixed(1)} Kg</span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        // Fallback if destinations empty (should be main item)
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{viewRecord.breakdown.source.itemName}</span>
                                                            <span className="text-sm font-bold text-green-600">+{Number(viewRecord.breakdown.totalDestQty).toFixed(1)} Kg</span>
                                                        </div>
                                                    )}
                                                </div>

                                            </div>
                                        ) : (
                                            // Standard View (Existing Logic + Updated for Main/Converted breakdown) 
                                            <>
                                                {/* Source Item - Full/Partial Clear */}
                                                {(() => {
                                                    const source = viewRecord.breakdown.source || {};
                                                    const isAdjIn = source.adjustmentType === 'AdjIn';
                                                    const prevStock = parseFloat(source.previousStock || 0);
                                                    const adjQty = parseFloat(source.adjustmentQty || 0); // Total removed
                                                    const soldQty = parseFloat(source.soldQty || 0);
                                                    const isSalesOp = viewRecord.breakdown.isSalesOperation;
                                                    const convertedQty = parseFloat(viewRecord.breakdown.totalDestQty || 0);
                                                    const wastage = parseFloat(viewRecord.breakdown.wastage || 0);

                                                    // Determine Main Qty: Use backend value or calculate
                                                    // For Op 2, 4: Main Qty = Total - Converted
                                                    let mainQty = parseFloat(source.mainQty);
                                                    if (isNaN(mainQty)) {
                                                        // Fallback if backend doesn't send mainQty yet
                                                        if (isSalesOp) mainQty = soldQty;
                                                        else mainQty = Math.abs(adjQty) - convertedQty;
                                                    }
                                                    if (mainQty < 0) mainQty = 0;

                                                    return (
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isAdjIn ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                                                                {isAdjIn ? <RiseOutlined className="text-green-500 text-lg" /> : <FallOutlined className="text-red-500 text-lg" />}
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="text-xs text-gray-500 uppercase tracking-wider">
                                                                    Source Item ({isAdjIn ? 'Stock Added' : 'Cleared'})
                                                                </div>
                                                                <div className="font-bold text-gray-800 dark:text-white">
                                                                    {source.itemName || viewRecord.ITEM_NAME}
                                                                    <span className="ml-2 text-sm text-gray-500">({source.itemCode})</span>
                                                                </div>

                                                                {/* MAIN QUANTITY DISPLAY */}
                                                                {mainQty > 0 && (
                                                                    <div className={`font-bold text-lg ${isAdjIn ? 'text-green-500' : 'text-red-500'}`}>
                                                                        {isAdjIn ? '+' : '-'}{mainQty.toFixed(1)} Kg
                                                                        <span className="text-sm font-normal text-gray-500 ml-1">
                                                                            (Main Item)
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {/* CONVERTED QUANTITY DISPLAY (If any) */}
                                                                {convertedQty > 0 && (
                                                                    <div className="font-bold text-lg text-red-500 mt-1">
                                                                        - {convertedQty.toFixed(1)} Kg
                                                                        <span className="text-sm font-normal text-gray-500 ml-1">
                                                                            (Converted)
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {/* TOTAL REMOVED DISPLAY */}
                                                                <div className="mt-1 text-sm font-bold text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-1">
                                                                    Total Removed: {adjQty.toFixed(1)} Kg
                                                                    <span className="ml-2 font-normal text-gray-500">
                                                                        (prev: {prevStock.toFixed(1)} → {(prevStock - adjQty).toFixed(1)} Kg)
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Arrow Separator */}
                                                {viewRecord.breakdown.destinations?.length > 0 && (
                                                    <div className="flex justify-center my-2">
                                                        <div className="w-0.5 h-6 bg-gray-300 dark:bg-gray-600"></div>
                                                    </div>
                                                )}

                                                {/* Destinations */}
                                                {viewRecord.breakdown.destinations?.length > 0 && (
                                                    <div className="space-y-2 mb-4">
                                                        <div className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                                            <RiseOutlined className="text-green-500" /> Converted To
                                                        </div>
                                                        {viewRecord.breakdown.destinations.map((dest, idx) => (
                                                            <div key={idx} className="flex justify-between items-center p-2 bg-white/50 dark:bg-white/5 rounded-lg">
                                                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                                                    {dest.itemName} <span className="text-xs text-gray-400">({dest.itemCode})</span>
                                                                </span>
                                                                <span className="text-green-600 font-bold">+{dest.quantity?.toFixed(1)} Kg</span>
                                                            </div>
                                                        ))}
                                                        <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-white/10">
                                                            <span className="text-sm text-gray-500">Total Output</span>
                                                            <span className="text-sm font-bold text-green-600">+{viewRecord.breakdown.totalDestQty?.toFixed(1)} Kg</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Sales Bill Section - For ops 3, 4 */}
                                        {viewRecord.breakdown.isSalesOperation && viewRecord.breakdown.billCode && (
                                            <div className="p-3 my-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-700">
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xl">💰</span>
                                                        <div>
                                                            <div className="text-xs text-gray-500 uppercase tracking-wider">Sales Bill</div>
                                                            <div className="font-bold text-orange-600">{viewRecord.breakdown.billCode}</div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-gray-500">Amount</div>
                                                        <div className="font-bold text-lg text-orange-600">
                                                            Rs {viewRecord.breakdown.billAmount?.toLocaleString() || 0}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Customer Details Section */}
                                {viewRecord.CUSTOMER_NAME && (
                                    <div className="p-3 my-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xl">👤</span>
                                            <span className="font-semibold text-blue-700 dark:text-blue-400">Customer Details</span>
                                        </div>
                                        <div className="text-sm">
                                            <div className="text-xs text-gray-500 uppercase">Customer Name</div>
                                            <div className="font-medium text-gray-800 dark:text-gray-200">{viewRecord.CUSTOMER_NAME}</div>
                                        </div>
                                    </div>
                                )}

                                {/* Lorry Details Section - For ops 3, 4, 7, 8 */}
                                {viewRecord.breakdown?.lorryName && (
                                    <div className="p-3 my-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-xl">🚛</span>
                                            <span className="font-semibold text-purple-700 dark:text-purple-400">Lorry Details</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-sm">
                                            <div>
                                                <div className="text-xs text-gray-500 uppercase">Lorry</div>
                                                <div className="font-medium">{viewRecord.breakdown.lorryName}</div>
                                            </div>
                                            {viewRecord.breakdown.driverName && (
                                                <div>
                                                    <div className="text-xs text-gray-500 uppercase">Driver</div>
                                                    <div className="font-medium">{viewRecord.breakdown.driverName}</div>
                                                </div>
                                            )}
                                            {viewRecord.breakdown.destination && (
                                                <div>
                                                    <div className="text-xs text-gray-500 uppercase">Destination</div>
                                                    <div className="font-medium">{viewRecord.breakdown.destination}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Wastage/Surplus - Show for FULL clears (ops 1, 3, 6, 8) and Op 9 full conversions */}
                                {([1, 3, 6, 8].includes(viewRecord.OP_TYPE) || (viewRecord.OP_TYPE === 9 && viewRecord.CLEARANCE_TYPE === 'FULL')) && (viewRecord.breakdown?.destinations?.length > 0 || viewRecord.breakdown?.isSalesOperation) && (() => {
                                    const source = viewRecord.breakdown.source || {};
                                    const prevStock = source.previousStock || 0;
                                    const soldQty = source.soldQty || 0;
                                    const totalOutput = viewRecord.breakdown.totalDestQty || 0;
                                    const wastage = viewRecord.breakdown.wastage || 0;
                                    const surplus = viewRecord.breakdown.surplus || 0;
                                    const isSalesOp = viewRecord.breakdown.isSalesOperation;

                                    const isWastage = wastage > 0;
                                    const isSurplus = surplus > 0;
                                    const amount = isWastage ? wastage : surplus;
                                    const baseQty = Math.abs(prevStock);
                                    const percentage = baseQty > 0 ? ((amount / baseQty) * 100).toFixed(1) : 0;

                                    // Don't show if no wastage/surplus and no conversions
                                    if (!amount && !totalOutput && !isSalesOp) return null;

                                    return (
                                        <div className={`p-3 rounded-lg ${isWastage ? 'bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800' : isSurplus ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800' : 'bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800'}`}>
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-2xl">{isWastage ? '⚠️' : isSurplus ? '✨' : '✅'}</span>
                                                    <span className="font-medium">
                                                        {isWastage ? 'Wastage (Leakage)' : isSurplus ? 'Surplus' : 'No Loss'}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`font-bold text-lg ${isWastage ? 'text-orange-600' : isSurplus ? 'text-blue-600' : 'text-green-600'}`}>
                                                        {amount.toFixed(1)} Kg
                                                    </div>
                                                    {amount > 0 && (
                                                        <div className={`text-sm ${isWastage ? 'text-orange-500' : 'text-blue-500'}`}>
                                                            ({percentage}%)
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200 dark:border-white/10">
                                                {isSalesOp
                                                    ? isSurplus
                                                        ? `(Sold ${soldQty.toFixed(1)} + Converted ${totalOutput.toFixed(1)}) - Stock ${prevStock.toFixed(1)} = Surplus ${amount.toFixed(1)} Kg`
                                                        : `Stock ${prevStock.toFixed(1)} - (Sold ${soldQty.toFixed(1)} + Converted ${totalOutput.toFixed(1)}) = Wastage ${amount.toFixed(1)} Kg`
                                                    : prevStock >= 0
                                                        ? `${prevStock.toFixed(1)} Kg cleared → ${totalOutput.toFixed(1)} Kg output = ${isWastage ? '' : '+'}${(totalOutput - prevStock).toFixed(1)} Kg`
                                                        : `${prevStock.toFixed(1)} Kg → 0 Kg (+${Math.abs(prevStock).toFixed(1)}) + ${totalOutput.toFixed(1)} Kg output = +${(Math.abs(prevStock) + totalOutput).toFixed(1)} Kg surplus`
                                                }
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Regular Transaction Details */}
                        {viewRecord.SOURCE_TYPE !== 'stock_operation' && (
                            <Descriptions bordered size="small" column={1} className="mt-2" labelStyle={{ width: '150px', fontWeight: 500 }}>
                                <Descriptions.Item label="Transaction Code">
                                    <span className="font-mono text-gray-600">{viewRecord.CODE}</span>
                                </Descriptions.Item>
                                <Descriptions.Item label="Item">
                                    <span className="font-medium">{viewRecord.ITEM_NAME}</span>
                                    <div className="text-xs text-gray-400">{viewRecord.ITEM_CODE}</div>
                                </Descriptions.Item>
                                <Descriptions.Item label="Adjustment">
                                    <span className={`font-bold text-lg ${['AdjOut', 'StockClear'].includes(viewRecord.DISPLAY_TYPE) ? 'text-red-500' : 'text-emerald-600'}`}>
                                        {['AdjOut', 'StockClear'].includes(viewRecord.DISPLAY_TYPE) ? '-' : '+'}{Number(viewRecord.ITEM_QTY).toFixed(1)} Kg
                                    </span>
                                </Descriptions.Item>
                                <Descriptions.Item label="Reason / Notes">
                                    <span className="whitespace-pre-wrap">{viewRecord.COMMENTS || '-'}</span>
                                </Descriptions.Item>
                                <Descriptions.Item label="Action By">
                                    {viewRecord.CREATED_BY_NAME || `User ${viewRecord.CREATED_BY || '-'}`}
                                </Descriptions.Item>
                            </Descriptions>
                        )}

                        {/* Stock Operation Basic Info */}
                        {viewRecord.SOURCE_TYPE === 'stock_operation' && (
                            <Descriptions bordered size="small" column={1} labelStyle={{ width: '150px', fontWeight: 500 }}>
                                <Descriptions.Item label="Operation Code">
                                    <span className="font-mono text-gray-600">{viewRecord.CODE}</span>
                                </Descriptions.Item>
                                {viewRecord.COMMENTS && (
                                    <Descriptions.Item label="Notes">
                                        <span className="whitespace-pre-wrap">{viewRecord.COMMENTS}</span>
                                    </Descriptions.Item>
                                )}
                                <Descriptions.Item label="Action By">
                                    {viewRecord.CREATED_BY_NAME || `User ${viewRecord.CREATED_BY || '-'}`}
                                </Descriptions.Item>
                            </Descriptions>
                        )}
                    </div>
                )
                }
            </Modal >
        </div >
    );
}
