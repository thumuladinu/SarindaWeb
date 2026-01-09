import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Tag, Spin, App, Tabs, Form, Drawer, Radio, Select, InputNumber, DatePicker, Popconfirm } from 'antd';
import { SearchOutlined, StockOutlined, HistoryOutlined, FallOutlined, RiseOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

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
    const [form] = Form.useForm();

    // Fetch Initial Data
    useEffect(() => {
        fetchStockStatus();
    }, []);

    // Fetch History when Date Range Changes or Tab becomes active
    useEffect(() => {
        if (activeTab === '2') {
            fetchHistory();
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
    const handleDeleteTransaction = async (transactionId) => {
        try {
            const response = await axios.post('/api/deleteInventoryTransaction', { TRANSACTION_ID: transactionId });
            if (response.data.success) {
                message.success('Transaction deleted');
                fetchHistory();
            } else {
                message.error('Failed to delete: ' + response.data.message);
            }
        } catch (error) {
            console.error("Error deleting transaction:", error);
            message.error("Delete failed");
        }
    };

    // Adjustment Actions
    const openAdjustment = (item) => {
        setSelectedItem(item);
        form.resetFields();
        setDrawerOpen(true);
    };

    const handleAdjustmentSubmit = async (values) => {
        setSubmitting(true);
        try {
            const payload = {
                ITEM_ID: selectedItem.ITEM_ID,
                STORE_NO: values.STORE_NO,
                TYPE: values.ACTION_TYPE,
                QUANTITY: values.ACTION_TYPE === 'StockClear' ? 0 : values.QUANTITY,
                REASON: values.REASON,
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
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

    // Desktop Columns - Stock Status
    const stockColumns = [
        { title: 'Code', dataIndex: 'CODE', key: 'CODE', render: (code) => <span className="font-mono font-medium">{code}</span> },
        { title: 'Name', dataIndex: 'NAME', key: 'NAME' },
        { title: 'Store 1', dataIndex: 'STOCK_S1', key: 'STOCK_S1', align: 'center', render: (val) => <Tag color={val > 0 ? 'blue' : val < 0 ? 'red' : 'default'} className="font-bold">{Number(val).toFixed(1)} Kg</Tag> },
        { title: 'Store 2', dataIndex: 'STOCK_S2', key: 'STOCK_S2', align: 'center', render: (val) => <Tag color={val > 0 ? 'purple' : val < 0 ? 'red' : 'default'} className="font-bold">{Number(val).toFixed(1)} Kg</Tag> },
        { title: 'Total', dataIndex: 'TOTAL_STOCK', key: 'TOTAL', align: 'center', render: (val) => <span className="font-bold">{Number(val).toFixed(1)} Kg</span> },
        { title: 'Action', key: 'action', align: 'center', render: (_, record) => <Button type="primary" size="small" ghost icon={<StockOutlined />} onClick={() => openAdjustment(record)}>Adjust</Button> }
    ];

    // Desktop Columns - History
    const historyColumns = [
        { title: 'Code', dataIndex: 'CODE', key: 'CODE', width: 120, render: (code) => <span className="font-mono text-xs text-gray-500">{code}</span> },
        { title: 'Date', dataIndex: 'CREATED_DATE', key: 'DATE', width: 150, render: (date) => dayjs(date).format('DD MMM YY, hh:mm A') },
        { title: 'Type', dataIndex: 'DISPLAY_TYPE', key: 'TYPE', width: 100, render: (type) => <Tag icon={['AdjIn', 'Opening'].includes(type) ? <RiseOutlined /> : <FallOutlined />} color={['AdjIn', 'Opening'].includes(type) ? 'success' : 'error'}>{type}</Tag> },
        { title: 'Item', dataIndex: 'ITEM_NAME', key: 'ITEM', render: (text, record) => <div className="flex flex-col"><span className="font-medium">{record.ITEM_NAME}</span><span className="text-xs text-gray-400">{record.ITEM_CODE}</span></div> },
        { title: 'Qty', dataIndex: 'ITEM_QTY', key: 'QTY', width: 80, align: 'right', render: (qty, record) => { const isNeg = ['AdjOut', 'StockClear'].includes(record.DISPLAY_TYPE); return <span className={isNeg ? 'text-red-500 font-bold' : 'text-emerald-600 font-bold'}>{isNeg ? '-' : '+'}{Number(qty).toFixed(1)} Kg</span>; } },
        { title: 'Store', dataIndex: 'STORE_NO', key: 'STORE', width: 80, align: 'center', render: (store) => <Tag>S{store}</Tag> },
        { title: 'Reason', dataIndex: 'COMMENTS', key: 'NOTE', ellipsis: true, className: 'text-xs text-gray-500' },
        {
            title: '', key: 'action', width: 50, render: (_, record) => (
                <Popconfirm title="Delete this record?" description="Stock will be recalculated" onConfirm={() => handleDeleteTransaction(record.TRANSACTION_ID)} okText="Delete" cancelText="Cancel" okButtonProps={{ danger: true }}>
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
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

            {/* Tabs (Shared for Desktop and Mobile) */}
            <Tabs activeKey={activeTab} onChange={handleTabChange} type="line" size="small" className="mb-4">
                <TabPane tab={<span><StockOutlined /> Stock</span>} key="1" />
                <TabPane tab={<span><HistoryOutlined /> History</span>} key="2" />
            </Tabs>

            {/* History Filters - Only show on History tab */}
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

            {/* Desktop Table View */}
            <div className="hidden md:block glass-card rounded-2xl overflow-hidden p-1">
                {activeTab === '1' ? (
                    <Table columns={stockColumns} dataSource={filteredStock} rowKey="ITEM_ID" loading={loading} pagination={{ pageSize: 12 }} size="middle" />
                ) : (
                    <Table columns={historyColumns} dataSource={filteredHistory} rowKey="TRANSACTION_ID" loading={loading} pagination={{ pageSize: 12 }} size="middle" scroll={{ x: 900 }} />
                )}
            </div>

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
                                <Button type="primary" size="small" icon={<StockOutlined />} className="bg-emerald-600 border-emerald-600" onClick={() => openAdjustment(item)}>Adjust</Button>
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
                        <div key={item.TRANSACTION_ID} className="glass-card p-4 rounded-xl flex flex-col gap-3 relative">
                            {/* Delete Button */}
                            <Popconfirm title="Delete?" description="Stock will recalculate" onConfirm={() => handleDeleteTransaction(item.TRANSACTION_ID)} okText="Yes" cancelText="No" okButtonProps={{ danger: true }}>
                                <Button type="text" danger size="small" icon={<DeleteOutlined />} className="absolute top-3 right-3" />
                            </Popconfirm>

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

            {/* Adjustment Drawer */}
            <Drawer title="Adjust Stock" width={420} onClose={() => setDrawerOpen(false)} open={drawerOpen} className="glass-drawer">
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
                            <Select onChange={(val) => { if (val === 'StockClear') form.setFieldsValue({ QUANTITY: 0 }); }}>
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
                                        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg mb-4 text-sm text-red-700 dark:text-red-300">
                                            ⚠️ This will <b>reset stock to 0</b> for the selected store. No quantity needed.
                                        </div>
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

                        <Form.Item name="REASON" label="Reason">
                            <Input.TextArea rows={3} placeholder="Why is this adjustment being made?" />
                        </Form.Item>

                        <Button type="primary" htmlType="submit" loading={submitting} block size="large" className="mt-4 bg-emerald-600">
                            Confirm Adjustment
                        </Button>
                    </Form>
                )}
            </Drawer>
        </div>
    );
}
