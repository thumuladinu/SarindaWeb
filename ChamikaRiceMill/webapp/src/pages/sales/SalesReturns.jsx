import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Form, Modal, Tag, Select, App, Card, Row, Col, InputNumber, DatePicker, Drawer, Space, Divider, Typography, Popconfirm } from 'antd';
import { PlusOutlined, SearchOutlined, RollbackOutlined, EyeOutlined, FileTextOutlined, BarcodeOutlined, ScanOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { decodeBatchEAN13, batchToUniqueCode } from '../../utils/labelUtils';

const { Option } = Select;
const { Title, Text } = Typography;

export default function SalesReturns() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [returns, setReturns] = useState([]);
    const [filteredReturns, setFilteredReturns] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [dateRange, setDateRange] = useState(null);
    const [refundTypeFilter, setRefundTypeFilter] = useState('ALL');

    // Return Modal / Drawer state
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Edit Return Modal state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingReturn, setEditingReturn] = useState(null);
    const [editForm] = Form.useForm();
    
    // Bills selection for return
    const [billsList, setBillsList] = useState([]);
    const [selectedBill, setSelectedBill] = useState(null);
    const [billLoading, setBillLoading] = useState(false);
    const [scannedBarcode, setScannedBarcode] = useState('');

    // Items being returned
    const [returnItemsState, setReturnItemsState] = useState([]);
    const [totalRefund, setTotalRefund] = useState(0);

    // View Return Details Modal state
    const [viewModalVisible, setViewModalVisible] = useState(false);
    const [selectedReturnDetails, setSelectedReturnDetails] = useState(null);

    const [form] = Form.useForm();

    useEffect(() => {
        fetchReturns();
        fetchRecentBills();
    }, []);

    useEffect(() => {
        filterData();
    }, [searchText, dateRange, refundTypeFilter, returns]);

    // Recalculate total refund whenever returnItemsState changes
    useEffect(() => {
        const sumRefund = returnItemsState.reduce((acc, curr) => acc + curr.REFUND_LINE_TOTAL, 0);
        setTotalRefund(sumRefund);
        form.setFieldsValue({ REFUND_AMOUNT: sumRefund });
    }, [returnItemsState]);

    const fetchReturns = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/mill/returns/list', { withCredentials: true });
            if (res.data.success) {
                setReturns(res.data.result || []);
            }
        } catch (e) {
            console.error('Error loading returns:', e);
            message.error('Failed to load sales returns list');
        } finally {
            setLoading(false);
        }
    };

    const fetchRecentBills = async () => {
        try {
            const res = await axios.get('/api/mill/sales/list', { withCredentials: true });
            if (res.data.success) {
                setBillsList(res.data.result || []);
            }
        } catch (e) {
            console.error('Error fetching sales bills:', e);
        }
    };

    const filterData = () => {
        let filtered = returns;
        if (searchText) {
            const s = searchText.toLowerCase().trim();
            filtered = filtered.filter(r =>
                (r.RETURN_NO && r.RETURN_NO.toLowerCase().includes(s)) ||
                (r.INVOICE_NO && r.INVOICE_NO.toLowerCase().includes(s)) ||
                (r.BATCH_NO && r.BATCH_NO.toLowerCase().includes(s)) ||
                (r.CUSTOMER_NAME && r.CUSTOMER_NAME.toLowerCase().includes(s)) ||
                (r.REASON && r.REASON.toLowerCase().includes(s))
            );
        }
        if (refundTypeFilter && refundTypeFilter !== 'ALL') {
            filtered = filtered.filter(r => r.REFUND_METHOD === refundTypeFilter);
        }
        if (dateRange && dateRange[0] && dateRange[1]) {
            filtered = filtered.filter(r => {
                const retDate = dayjs(r.CREATED_DATE || r.DATE);
                return retDate.isAfter(dateRange[0].startOf('day')) && retDate.isBefore(dateRange[1].endOf('day'));
            });
        }
        setFilteredReturns(filtered);
    };

    const resetFilters = () => {
        setSearchText('');
        setDateRange(null);
        setRefundTypeFilter('ALL');
    };

    const handleOpenAdd = () => {
        form.resetFields();
        setSelectedBill(null);
        setReturnItemsState([]);
        setTotalRefund(0);
        setScannedBarcode('');
        form.setFieldsValue({
            DATE: dayjs(),
            REFUND_METHOD: 'cash'
        });
        setDrawerVisible(true);
    };

    const handleBarcodeLookup = (codeToSearch) => {
        const clean = (codeToSearch || scannedBarcode || '').trim();
        if (!clean) return;

        // 1. Try EAN-13 barcode decode
        const decoded = decodeBatchEAN13(clean);
        let targetBill = null;
        let targetItemCode = null;

        if (decoded && decoded.isValidGs1Lanka) {
            targetItemCode = decoded.itemCode;
            targetBill = billsList.find(b =>
                b.BATCH_NO && batchToUniqueCode(b.BATCH_NO) === decoded.batchCode
            );
        }

        // 2. Fallback: Search by Batch string or Invoice string
        if (!targetBill) {
            targetBill = billsList.find(b =>
                (b.BATCH_NO && b.BATCH_NO.toLowerCase().includes(clean.toLowerCase())) ||
                (b.INVOICE_NO && b.INVOICE_NO.toLowerCase().includes(clean.toLowerCase())) ||
                (b.BILL_ID && String(b.BILL_ID) === clean)
            );
        }

        if (targetBill) {
            let rawItems = targetBill.ITEMS || targetBill.ITEMS_JSON || targetBill.items || [];
            if (typeof rawItems === 'string') {
                try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
            }

            // If specific barcode with itemCode scanned, target ONLY that specific product!
            if (targetItemCode && Array.isArray(rawItems) && rawItems.length > 0) {
                const matchedItem = rawItems.find(i => {
                    const code = i.GS1_CODE || i.gs1Code || i.SYSTEM_CODE || '001';
                    return String(code).padStart(3, '0') === targetItemCode || String(i.ITEM_ID) === String(targetItemCode);
                }) || rawItems[0];

                if (matchedItem) {
                    setReturnItemsState(prev => {
                        const billKey = targetBill.BILL_ID || targetBill.LOCAL_ID;
                        const existingIdx = prev.findIndex(x =>
                            String(x.BILL_ID) === String(billKey) &&
                            String(x.ITEM_ID) === String(matchedItem.ITEM_ID) &&
                            Number(x.BAG_WEIGHT) === Number(matchedItem.BAG_WEIGHT || matchedItem.bagWeight)
                        );

                        if (existingIdx >= 0) {
                            const updated = [...prev];
                            const maxCount = updated[existingIdx].ORIGINAL_BAG_COUNT;
                            const newCount = Math.min(maxCount, updated[existingIdx].RETURNED_BAG_COUNT + 1);
                            updated[existingIdx].RETURNED_BAG_COUNT = newCount;
                            updated[existingIdx].REFUND_LINE_TOTAL = newCount * updated[existingIdx].UNIT_PRICE;
                            return updated;
                        } else {
                            const newItem = {
                                BILL_ID: billKey,
                                INVOICE_NO: targetBill.INVOICE_NO,
                                BATCH_NO: targetBill.BATCH_NO,
                                ITEM_ID: matchedItem.ITEM_ID,
                                ITEM_NAME: matchedItem.ITEM_NAME || matchedItem.itemName || 'Product',
                                BAG_WEIGHT: parseFloat(matchedItem.BAG_WEIGHT || matchedItem.bagWeight || 0),
                                ORIGINAL_BAG_COUNT: parseFloat(matchedItem.BAG_COUNT || matchedItem.quantity || 1),
                                UNIT_PRICE: parseFloat(matchedItem.UNIT_PRICE || matchedItem.unitPrice || 0),
                                ORIGINAL_UNIT_PRICE: parseFloat(matchedItem.UNIT_PRICE || matchedItem.unitPrice || 0),
                                RETURNED_BAG_COUNT: 1,
                                REFUND_LINE_TOTAL: parseFloat(matchedItem.UNIT_PRICE || matchedItem.unitPrice || 0),
                            };
                            return [...prev, newItem];
                        }
                    });

                    if (!selectedBill) setSelectedBill(targetBill);
                    message.success(`Scanned: ${matchedItem.ITEM_NAME || 'Product'} (+1 bag) from Bill #${targetBill.INVOICE_NO}`);
                    setScannedBarcode('');
                    return;
                }
            }

            // Fallback: If searched by Invoice/Batch manually, load all bill items
            handleBillChange(targetBill.BILL_ID || targetBill.LOCAL_ID);
            message.success(`Found Sale Bill #${targetBill.INVOICE_NO} (Batch: ${targetBill.BATCH_NO || 'N/A'})`);
            setScannedBarcode('');
        } else {
            message.warning(`No sales transaction found for barcode / batch code: "${clean}"`);
        }
    };

    const handleBillChange = async (billId) => {
        if (!billId) {
            setSelectedBill(null);
            setReturnItemsState([]);
            setTotalRefund(0);
            return;
        }

        setBillLoading(true);
        try {
            const res = await axios.get(`/api/mill/sales/${billId}`, { withCredentials: true });
            if (res.data.success && res.data.result) {
                const b = res.data.result;
                setSelectedBill(b);

                // Prepare items list with editable return unit prices and quantities
                const itemsPrepared = (b.ITEMS || []).map(item => ({
                    BILL_ID: b.BILL_ID || b.LOCAL_ID,
                    INVOICE_NO: b.INVOICE_NO,
                    BATCH_NO: b.BATCH_NO,
                    ITEM_ID: item.ITEM_ID,
                    ITEM_NAME: item.ITEM_NAME || 'Product',
                    BAG_WEIGHT: parseFloat(item.BAG_WEIGHT || 0),
                    ORIGINAL_BAG_COUNT: parseFloat(item.BAG_COUNT || item.QUANTITY || 0),
                    UNIT_PRICE: parseFloat(item.UNIT_PRICE || 0), // Editable Unit Price
                    ORIGINAL_UNIT_PRICE: parseFloat(item.UNIT_PRICE || 0),
                    RETURNED_BAG_COUNT: 0,
                    REFUND_LINE_TOTAL: 0
                }));

                setReturnItemsState(itemsPrepared);
                setTotalRefund(0);
                form.setFieldsValue({ REFUND_AMOUNT: 0 });
            }
        } catch (e) {
            console.error('Error fetching bill details:', e);
            message.error('Failed to load selected bill items');
        } finally {
            setBillLoading(false);
        }
    };

    const handleItemFieldChange = (index, field, val) => {
        const updated = [...returnItemsState];
        const numVal = Math.max(0, parseFloat(val) || 0);
        updated[index][field] = numVal;
        updated[index].REFUND_LINE_TOTAL = updated[index].RETURNED_BAG_COUNT * updated[index].UNIT_PRICE;
        setReturnItemsState(updated);
    };

    const handleRemoveReturnItem = (index) => {
        setReturnItemsState(prev => prev.filter((_, i) => i !== index));
    };

    const handleFormSubmit = async (values) => {
        const itemsToReturn = returnItemsState.filter(i => i.RETURNED_BAG_COUNT > 0);
        if (itemsToReturn.length === 0) {
            message.warning('Please specify returned quantity for at least one item');
            return;
        }

        const billToUse = selectedBill || { BILL_ID: itemsToReturn[0].BILL_ID, INVOICE_NO: itemsToReturn[0].INVOICE_NO };

        setSubmitting(true);
        try {
            const payload = {
                BILL_ID: billToUse.BILL_ID,
                INVOICE_NO: billToUse.INVOICE_NO,
                CUSTOMER_ID: billToUse.CUSTOMER_ID || null,
                REFUND_AMOUNT: values.REFUND_AMOUNT || totalRefund,
                REFUND_METHOD: values.REFUND_METHOD || 'cash',
                REASON: values.REASON || null,
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                ITEMS: itemsToReturn
            };

            const res = await axios.post('/api/mill/returns/add', payload, { withCredentials: true });
            if (res.data.success) {
                message.success(`Sales return created: ${res.data.returnNo}`);
                setDrawerVisible(false);
                fetchReturns();
            } else {
                message.error(res.data.message || 'Failed to save return');
            }
        } catch (e) {
            console.error(e);
            message.error(e.response?.data?.message || 'Error processing sales return');
        } finally {
            setSubmitting(false);
        }
    };

    const handleViewDetails = async (returnId) => {
        try {
            const res = await axios.get(`/api/mill/returns/${returnId}`, { withCredentials: true });
            if (res.data.success) {
                setSelectedReturnDetails(res.data.result);
                setViewModalVisible(true);
            }
        } catch (e) {
            console.error(e);
            message.error('Failed to load return details');
        }
    };

    const handleDeleteReturn = async (returnId) => {
        try {
            const res = await axios.delete(`/api/mill/returns/${returnId}`);
            if (res.data.success) {
                message.success('Sales return record deleted successfully');
                fetchReturns();
            } else {
                message.error(res.data.message || 'Failed to delete return');
            }
        } catch (e) {
            console.error('Error deleting sales return:', e);
            message.error('Failed to delete sales return');
        }
    };

    const openEditModal = (record) => {
        setEditingReturn(record);
        editForm.setFieldsValue({
            REFUND_AMOUNT: record.REFUND_AMOUNT,
            REFUND_METHOD: record.REFUND_METHOD || 'cash',
            REASON: record.REASON || ''
        });
        setEditModalOpen(true);
    };

    const handleSaveEdit = async (values) => {
        if (!editingReturn) return;
        try {
            const res = await axios.put(`/api/mill/returns/${editingReturn.RETURN_ID}`, values);
            if (res.data.success) {
                message.success('Sales return updated successfully');
                setEditModalOpen(false);
                fetchReturns();
            } else {
                message.error(res.data.message || 'Failed to update return');
            }
        } catch (e) {
            console.error('Error updating return:', e);
            message.error('Failed to update return');
        }
    };

    const columns = [
        {
            title: 'Return No',
            dataIndex: 'RETURN_NO',
            key: 'RETURN_NO',
            render: (text, r) => <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{text || `RET-${r.RETURN_ID}`}</span>
        },
        {
            title: 'Invoice No',
            dataIndex: 'INVOICE_NO',
            key: 'INVOICE_NO',
            render: text => <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{text}</span>
        },
        {
            title: 'Customer',
            dataIndex: 'CUSTOMER_NAME',
            key: 'CUSTOMER_NAME',
            render: text => text || <span className="text-gray-400 text-xs">Retail / Counter</span>
        },
        {
            title: 'Return Date',
            dataIndex: 'DATE',
            key: 'DATE',
            render: d => d ? dayjs(d).format('DD/MM/YYYY') : '-'
        },
        {
            title: 'Refunded Amount',
            dataIndex: 'REFUND_AMOUNT',
            key: 'REFUND_AMOUNT',
            align: 'right',
            render: amt => <span className="font-bold text-rose-600 dark:text-rose-400">Rs. {parseFloat(amt || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
        },
        {
            title: 'Refund Method',
            dataIndex: 'REFUND_METHOD',
            key: 'REFUND_METHOD',
            render: m => <Tag color={m === 'cash' ? 'green' : m === 'credit_note' ? 'purple' : 'blue'} className="uppercase font-bold">{m || 'CASH'}</Tag>
        },
        {
            title: 'Action',
            key: 'action',
            align: 'center',
            render: (_, record) => (
                <div className="flex items-center justify-center gap-1.5">
                    <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetails(record.RETURN_ID)}>
                        View
                    </Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} className="!text-amber-500">
                        Edit
                    </Button>
                    <Popconfirm title="Delete this sales return record?" onConfirm={() => handleDeleteReturn(record.RETURN_ID)} okText="Yes" cancelText="No">
                        <Button size="small" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                </div>
            )
        }
    ];

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div>
                    <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 m-0 flex items-center gap-2">
                        <RollbackOutlined className="text-rose-600 dark:text-rose-400" /> Sales Returns & Customer Refund Management
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
                        Scan sticker barcode to target specific products (+1 count) or search by invoice/batch
                    </p>
                </div>
                <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleOpenAdd} className="!bg-rose-600 hover:!bg-rose-700 font-bold border-0 shadow">
                    Create Sales Return
                </Button>
            </div>

            {/* Filter Bar */}
            <Card className="shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input
                        placeholder="Search Invoice #, Batch #, Customer, Return #…"
                        prefix={<SearchOutlined className="text-slate-400" />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                    />
                    {/* Desktop RangePicker */}
                    <div className="hidden md:block">
                        <DatePicker.RangePicker
                            format="DD/MM/YYYY"
                            value={dateRange}
                            onChange={v => setDateRange(v)}
                            className="w-full"
                        />
                    </div>
                    {/* Mobile Separate Start & End DatePickers */}
                    <div className="grid grid-cols-2 gap-2 md:hidden">
                        <DatePicker
                            placeholder="Start Date"
                            format="DD/MM/YYYY"
                            value={dateRange ? dateRange[0] : null}
                            onChange={(val) => setDateRange(val ? [val, dateRange ? dateRange[1] : null] : null)}
                            className="w-full text-xs"
                        />
                        <DatePicker
                            placeholder="End Date"
                            format="DD/MM/YYYY"
                            value={dateRange ? dateRange[1] : null}
                            onChange={(val) => setDateRange(val ? [dateRange ? dateRange[0] : null, val] : null)}
                            className="w-full text-xs"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Select value={refundTypeFilter} onChange={v => setRefundTypeFilter(v)} className="w-full">
                            <Option value="ALL">All Refund Types</Option>
                            <Option value="cash">Cash Refund</Option>
                            <Option value="credit_note">Credit Note</Option>
                            <Option value="bank_transfer">Bank Transfer</Option>
                        </Select>
                        <Button onClick={resetFilters}>Reset</Button>
                    </div>
                </div>
            </Card>

            {/* Returns Table - Desktop */}
            <div className="hidden md:block shadow-sm rounded-2xl overflow-hidden bg-zinc-900/50">
                <Table
                    columns={columns}
                    dataSource={filteredReturns}
                    rowKey="RETURN_ID"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    size="middle"
                />
            </div>

            {/* Returns Cards - Mobile */}
            <div className="md:hidden space-y-3 pb-20">
                {filteredReturns.length === 0 ? (
                    <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                        No sales return records found
                    </div>
                ) : (
                    filteredReturns.map((record) => (
                        <div 
                            key={record.RETURN_ID} 
                            onClick={() => handleViewDetails(record.RETURN_ID)}
                            className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-mono font-bold text-rose-400 text-base">{record.RETURN_NO || `RET-${record.RETURN_ID}`}</div>
                                    <div className="text-xs text-gray-400">{record.DATE ? dayjs(record.DATE).format('DD/MM/YYYY') : '-'} • {record.CUSTOMER_NAME || 'Walk-in'}</div>
                                </div>
                                <Tag color={record.REFUND_METHOD === 'cash' ? 'green' : record.REFUND_METHOD === 'credit_note' ? 'purple' : 'blue'} className="uppercase font-bold m-0">
                                    {record.REFUND_METHOD || 'CASH'}
                                </Tag>
                            </div>

                            <div className="flex justify-between items-center bg-zinc-900/60 p-2.5 rounded-xl border border-white/5 text-xs">
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Invoice Ref</span>
                                    <span className="font-mono font-semibold text-white">{record.INVOICE_NO || '—'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Batch</span>
                                    <span className="font-mono font-semibold text-white">{record.BATCH_NO || '—'}</span>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-white/5 flex-wrap gap-2">
                                <div>
                                    <span className="text-[10px] text-gray-400 block uppercase">Refunded Amount</span>
                                    <span className="text-base font-bold text-rose-400 font-mono">
                                        Rs. {parseFloat(record.REFUND_AMOUNT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1.5 ml-auto" onClick={(e) => e.stopPropagation()}>
                                    <Button 
                                        size="small" 
                                        icon={<EditOutlined />} 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openEditModal(record);
                                        }} 
                                        className="!text-amber-500 rounded-lg" 
                                    />
                                    <Popconfirm title="Delete this sales return record?" onConfirm={() => handleDeleteReturn(record.RETURN_ID)} okText="Yes" cancelText="No">
                                        <Button size="small" icon={<DeleteOutlined />} danger onClick={(e) => e.stopPropagation()} className="rounded-lg" />
                                    </Popconfirm>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Create Return Drawer */}
            <Drawer
                title={
                    <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <RollbackOutlined className="text-rose-600" /> Record Customer Return & Refund
                    </span>
                }
                width={720}
                open={drawerVisible}
                onClose={() => setDrawerVisible(false)}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleFormSubmit}>
                    {/* Barcode Scanner / Manual Lookup Input */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 mb-4">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                            <BarcodeOutlined className="text-blue-600 dark:text-blue-400 mr-1" /> Scan Sticker Barcode (Product-Level Multi-Scan)
                        </label>
                        <div className="flex gap-2">
                            <Input
                                size="large"
                                placeholder="Scan sticker barcode (479...) to target product (+1 count)"
                                value={scannedBarcode}
                                onChange={e => setScannedBarcode(e.target.value)}
                                onPressEnter={() => handleBarcodeLookup(scannedBarcode)}
                                className="font-mono"
                                prefix={<ScanOutlined className="text-slate-400" />}
                            />
                            <Button type="primary" size="large" onClick={() => handleBarcodeLookup(scannedBarcode)} className="!bg-blue-600 font-bold">
                                Scan & Add
                            </Button>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            Decodes product & batch to add/increment (+1 bag) the exact scanned item line.
                        </div>
                    </div>

                    <Form.Item label="Or Select Sales Invoice / Batch">
                        <Select
                            showSearch
                            size="large"
                            placeholder="Search bill by Invoice #, Batch #, or Customer…"
                            value={selectedBill?.BILL_ID || selectedBill?.LOCAL_ID}
                            onChange={handleBillChange}
                            optionFilterProp="label"
                            loading={billLoading}
                            className="w-full"
                        >
                            {billsList.map(b => (
                                <Option
                                    key={b.BILL_ID || b.LOCAL_ID}
                                    value={b.BILL_ID || b.LOCAL_ID}
                                    label={`${b.INVOICE_NO} ${b.BATCH_NO || ''} ${b.CUSTOMER_NAME || ''}`}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-blue-600 dark:text-blue-400">{b.INVOICE_NO}</span>
                                        {b.BATCH_NO && <Tag color="purple" className="font-mono">{b.BATCH_NO}</Tag>}
                                    </div>
                                    <div className="text-xs text-slate-400">
                                        {b.CUSTOMER_NAME || 'Walk-in Customer'} · {b.DATE ? dayjs(b.DATE).format('DD/MM/YYYY') : ''}
                                    </div>
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    {selectedBill && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 mb-4 text-xs space-y-1">
                            <div className="font-bold text-blue-900 dark:text-blue-200 flex justify-between">
                                <span>Bill #{selectedBill.INVOICE_NO}</span>
                                <span>Batch: {selectedBill.BATCH_NO || 'N/A'}</span>
                            </div>
                            <div className="text-slate-600 dark:text-slate-300">
                                Customer: <strong>{selectedBill.CUSTOMER_NAME || 'Walk-in'}</strong> · Date: {dayjs(selectedBill.DATE).format('DD/MM/YYYY')}
                            </div>
                        </div>
                    )}

                    {returnItemsState.length > 0 && (
                        <div className="mb-4">
                            <div className="font-bold text-slate-800 dark:text-slate-200 mb-2 text-xs uppercase tracking-wider flex justify-between items-center">
                                <span>Scanned / Selected Return Items ({returnItemsState.length})</span>
                                <Tag color="blue">{returnItemsState.reduce((s, i) => s + i.RETURNED_BAG_COUNT, 0)} bags total</Tag>
                            </div>
                            <div className="space-y-3">
                                {returnItemsState.map((item, idx) => (
                                    <div key={idx} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                        <div>
                                            <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                                {item.ITEM_NAME}
                                                {item.INVOICE_NO && <Tag color="geekblue" className="text-[10px] font-mono m-0">Bill #{item.INVOICE_NO}</Tag>}
                                            </div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                                Sold Qty: <strong>{item.ORIGINAL_BAG_COUNT} bags</strong> ({item.BAG_WEIGHT}kg) · Orig Price: Rs. {item.ORIGINAL_UNIT_PRICE.toFixed(2)}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between flex-wrap">
                                            <div>
                                                <div className="text-[11px] text-slate-400">Return Bags</div>
                                                <InputNumber
                                                    min={0}
                                                    max={item.ORIGINAL_BAG_COUNT}
                                                    value={item.RETURNED_BAG_COUNT}
                                                    onChange={v => handleItemFieldChange(idx, 'RETURNED_BAG_COUNT', v)}
                                                    size="small"
                                                    style={{ width: 85 }}
                                                />
                                            </div>
                                            <div>
                                                <div className="text-[11px] text-slate-400">Return Price (Rs.)</div>
                                                <InputNumber
                                                    min={0}
                                                    step={0.5}
                                                    value={item.UNIT_PRICE}
                                                    onChange={v => handleItemFieldChange(idx, 'UNIT_PRICE', v)}
                                                    size="small"
                                                    style={{ width: 105 }}
                                                />
                                            </div>
                                            <div className="text-right min-w-[90px]">
                                                <div className="text-slate-400 text-[11px]">Line Refund</div>
                                                <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                                                    Rs. {item.REFUND_LINE_TOTAL.toFixed(2)}
                                                </span>
                                            </div>
                                            <Button size="small" type="text" danger onClick={() => handleRemoveReturnItem(idx)}>✕</Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Divider />

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item label="Refund Method" name="REFUND_METHOD" rules={[{ required: true }]}>
                                <Select size="large">
                                    <Option value="cash">💵 Cash Refund</Option>
                                    <Option value="credit_note">📜 Credit Note</Option>
                                    <Option value="bank_transfer">🏦 Bank Transfer</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label="Total Refund Amount (Rs.)" name="REFUND_AMOUNT" rules={[{ required: true }]}>
                                <InputNumber
                                    size="large"
                                    min={0}
                                    step={0.5}
                                    className="w-full font-mono font-bold text-rose-600"
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item label="Return Date" name="DATE" rules={[{ required: true }]}>
                                <DatePicker format="DD/MM/YYYY" className="w-full" size="large" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label="Reason for Return" name="REASON">
                                <Input placeholder="Damaged, quality issue, etc." size="large" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <div className="flex justify-end gap-2 mt-4">
                        <Button onClick={() => setDrawerVisible(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={submitting} className="!bg-rose-600 font-bold">
                            Save Return & Refund
                        </Button>
                    </div>
                </Form>
            </Drawer>

            {/* View Details Modal */}
            <Modal
                title={`Sales Return Details — ${selectedReturnDetails?.RETURN_NO || ''}`}
                open={viewModalVisible}
                onCancel={() => setViewModalVisible(false)}
                footer={[<Button key="close" onClick={() => setViewModalVisible(false)}>Close</Button>]}
                width={600}
            >
                {selectedReturnDetails && (
                    <div className="space-y-4 text-xs">
                        <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl">
                            <div>Invoice No: <strong className="font-mono text-blue-600">{selectedReturnDetails.INVOICE_NO}</strong></div>
                            <div>Return Date: <strong>{dayjs(selectedReturnDetails.DATE).format('DD/MM/YYYY')}</strong></div>
                            <div>Customer: <strong>{selectedReturnDetails.CUSTOMER_NAME || 'Retail'}</strong></div>
                            <div>Refund Type: <Tag color="purple" className="uppercase font-bold">{selectedReturnDetails.REFUND_METHOD}</Tag></div>
                            <div>Reason: <span>{selectedReturnDetails.REASON || 'None'}</span></div>
                            <div>Total Refund: <strong className="text-rose-600 font-mono text-sm">Rs. {parseFloat(selectedReturnDetails.REFUND_AMOUNT || 0).toFixed(2)}</strong></div>
                        </div>

                        <div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 mb-2 uppercase">Returned Products</div>
                            <Table
                                dataSource={selectedReturnDetails.ITEMS || []}
                                pagination={false}
                                size="small"
                                rowKey="ITEM_ID"
                                columns={[
                                    { title: 'Item', dataIndex: 'ITEM_NAME' },
                                    { title: 'Bag Size', dataIndex: 'BAG_WEIGHT', render: w => `${w} kg` },
                                    { title: 'Qty Returned', dataIndex: 'RETURNED_BAG_COUNT', align: 'center', render: q => <Tag color="rose">{q} bags</Tag> },
                                    { title: 'Unit Price', dataIndex: 'UNIT_PRICE', align: 'right', render: p => `Rs. ${parseFloat(p || 0).toFixed(2)}` },
                                    { title: 'Subtotal', dataIndex: 'REFUND_LINE_TOTAL', align: 'right', render: t => <strong className="text-rose-600">Rs. {parseFloat(t || 0).toFixed(2)}</strong> }
                                ]}
                            />
                        </div>
                    </div>
                )}
            </Modal>

            {/* Edit Sales Return Record Modal */}
            <Modal
                title={`Edit Sales Return Record — ${editingReturn?.RETURN_NO || ''}`}
                open={editModalOpen}
                onCancel={() => setEditModalOpen(false)}
                footer={null}
                destroyOnClose
            >
                <Form form={editForm} layout="vertical" onFinish={handleSaveEdit}>
                    <Form.Item label="Refund Method" name="REFUND_METHOD" rules={[{ required: true }]}>
                        <Select size="large">
                            <Option value="cash">💵 Cash Refund</Option>
                            <Option value="credit_note">📜 Credit Note</Option>
                            <Option value="bank_transfer">🏦 Bank Transfer</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item label="Refund Amount (Rs.)" name="REFUND_AMOUNT" rules={[{ required: true }]}>
                        <InputNumber
                            size="large"
                            min={0}
                            className="w-full font-mono font-bold text-rose-600"
                        />
                    </Form.Item>
                    <Form.Item label="Reason for Return" name="REASON">
                        <Input placeholder="Damaged, quality issue, etc." size="large" />
                    </Form.Item>
                    <div className="flex justify-end gap-2 mt-4">
                        <Button onClick={() => setEditModalOpen(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" className="!bg-rose-600 font-bold">
                            Save Changes
                        </Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
