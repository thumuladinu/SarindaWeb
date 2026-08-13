import React, { useState, useEffect } from 'react';
import {
    Table, Button, Input, Form, Modal, Tag, Select, Card, Row, Col,
    InputNumber, DatePicker, Tabs, Space, Divider, Typography, message, App, Popconfirm
} from 'antd';
import {
    PlusOutlined, SearchOutlined, RollbackOutlined, EyeOutlined,
    FileTextOutlined, BarcodeOutlined, ScanOutlined,
    HistoryOutlined, CheckCircleOutlined, EditOutlined, DeleteOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { decodeBatchEAN13, batchToUniqueCode } from '../../utils/labelUtils';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

const { Option } = Select;

export default function SalesReturns() {
    const antdApp = App.useApp ? App.useApp() : null;
    const msg = antdApp?.message || message;

    const [activeTab, setActiveTab] = useState('create');
    const [loading, setLoading] = useState(false);
    const [returns, setReturns] = useState([]);
    const [filteredReturns, setFilteredReturns] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [dateRange, setDateRange] = useState(null);
    const [refundTypeFilter, setRefundTypeFilter] = useState('ALL');

    // Return Form state
    const [submitting, setSubmitting] = useState(false);

    // Edit Return Modal state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingReturn, setEditingReturn] = useState(null);
    const [editForm] = Form.useForm();

    // Bills selection for return
    const [billsList, setBillsList] = useState([]);
    const [selectedBill, setSelectedBill] = useState(null);
    const [scannedBarcode, setScannedBarcode] = useState('');

    // Items being returned
    const [returnItemsState, setReturnItemsState] = useState([]);
    const [totalRefund, setTotalRefund] = useState(0);

    // View Return Details Modal state
    const [viewModalVisible, setViewModalVisible] = useState(false);
    const [selectedReturnDetails, setSelectedReturnDetails] = useState(null);

    const [form] = Form.useForm();

    useEffect(() => {
        loadData();
        form.setFieldsValue({
            DATE: dayjs(),
            REFUND_METHOD: 'cash'
        });

        const unsub = syncService.subscribe((event) => {
            if (event === 'returnsUpdated' || event === 'referenceDataUpdated' || event === 'syncComplete') {
                loadData();
            }
        });
        return unsub;
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

    // ─── Global Keyboard & Clipboard Paste Listener ──────────────
    useEffect(() => {
        // 1. Hardware Barcode Scanner Listener
        let buffer = '';
        let lastKeyTime = Date.now();

        const handleKeyDown = (e) => {
            const activeEl = document.activeElement;
            const tag = activeEl?.tagName?.toLowerCase();
            const isTextInput = tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable;

            if (isTextInput && activeEl?.id !== 'barcodeLookupInput') {
                return;
            }

            const currentTime = Date.now();
            if (currentTime - lastKeyTime > 120) {
                buffer = '';
            }
            lastKeyTime = currentTime;

            if (e.key === 'Enter') {
                if (buffer.length >= 6) {
                    handleBarcodeLookup(buffer);
                }
                buffer = '';
            } else if (e.key.length === 1) {
                buffer += e.key;
            }
        };

        // 2. Global Clipboard Paste Listener (Cmd+V / Ctrl+V anywhere on screen)
        const handleGlobalPaste = (e) => {
            const activeEl = document.activeElement;
            const tag = activeEl?.tagName?.toLowerCase();
            const inputId = activeEl?.id;

            if (tag === 'textarea' || (tag === 'input' && inputId !== 'barcodeLookupInput' && activeEl?.value?.length > 0)) {
                return;
            }

            const pastedText = e.clipboardData?.getData('text');
            if (pastedText && pastedText.trim().length >= 3) {
                e.preventDefault();
                const clean = pastedText.trim();
                setScannedBarcode(clean);
                handleBarcodeLookup(clean);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('paste', handleGlobalPaste);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('paste', handleGlobalPaste);
        };
    }, [billsList, scannedBarcode]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [retList, billList] = await Promise.all([
                db.sales_returns.orderBy('DATE').reverse().toArray().catch(() => []),
                db.sales_bills.orderBy('CREATED_DATE').reverse().toArray().catch(() => []),
            ]);
            setReturns(retList || []);
            setBillsList(billList || []);
        } catch (e) {
            console.error('Error loading returns data:', e);
        } finally {
            setLoading(false);
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
            filtered = filtered.filter(r => (r.REFUND_METHOD || r.REFUND_TYPE || '').toLowerCase() === refundTypeFilter.toLowerCase());
        }
        if (dateRange && dateRange[0] && dateRange[1]) {
            filtered = filtered.filter(r => {
                const retDate = dayjs(r.DATE || r.CREATED_DATE);
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
                (b.LOCAL_ID && String(b.LOCAL_ID) === clean) ||
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
                        const billKey = targetBill.LOCAL_ID || targetBill.BILL_ID;
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
            handleBillChange(targetBill.LOCAL_ID || targetBill.BILL_ID);
            message.success(`Found Sale Bill #${targetBill.INVOICE_NO} (Batch: ${targetBill.BATCH_NO || 'N/A'})`);
            setScannedBarcode('');
        } else {
            message.warning(`No sales transaction found for barcode / batch code: "${clean}"`);
        }
    };

    const handleBillChange = (billId) => {
        if (!billId) {
            setSelectedBill(null);
            setReturnItemsState([]);
            setTotalRefund(0);
            return;
        }

        const b = billsList.find(x => String(x.LOCAL_ID) === String(billId) || String(x.BILL_ID) === String(billId));
        if (!b) {
            message.warning('Bill not found');
            return;
        }

        setSelectedBill(b);

        // Prepare items list with editable return unit prices and quantities
        let rawItems = b.ITEMS || b.ITEMS_JSON || [];
        if (typeof rawItems === 'string') {
            try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
        }

        const itemsPrepared = (Array.isArray(rawItems) ? rawItems : []).map(item => ({
            BILL_ID: b.LOCAL_ID || b.BILL_ID,
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

        const billToUse = selectedBill || { LOCAL_ID: itemsToReturn[0].BILL_ID, INVOICE_NO: itemsToReturn[0].INVOICE_NO };

        setSubmitting(true);
        try {
            const terminalCode = getTerminalDeviceCode();
            const returnNo = `RET-${dayjs().format('YYYYMMDD')}-${terminalCode}-${Date.now().toString().slice(-4)}`;
            const payload = {
                RETURN_NO: returnNo,
                DEVICE_ID: terminalCode,
                ADDED_BY: getCurrentUserName(),
                BILL_ID: billToUse.BILL_ID || billToUse.LOCAL_ID,
                INVOICE_NO: billToUse.INVOICE_NO,
                BATCH_NO: billToUse.BATCH_NO || null,
                CUSTOMER_ID: billToUse.CUSTOMER_ID || null,
                CUSTOMER_NAME: billToUse.CUSTOMER_NAME || 'Walk-in Customer',
                REFUND_AMOUNT: values.REFUND_AMOUNT || totalRefund,
                REFUND_METHOD: values.REFUND_METHOD || 'cash',
                REASON: values.REASON || null,
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss'),
                ITEMS: itemsToReturn,
                IS_SYNCED: 0
            };

            await db.sales_returns.add(payload);
            message.success(`Sales return recorded: ${returnNo}`);
            
            // Reset form for next return entry
            form.resetFields();
            setSelectedBill(null);
            setReturnItemsState([]);
            setTotalRefund(0);
            setScannedBarcode('');
            form.setFieldsValue({
                DATE: dayjs(),
                REFUND_METHOD: 'cash'
            });

            loadData();

            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Error saving sales return:', e);
            message.error('Error processing sales return');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteReturn = async (record) => {
        try {
            // 1. Always delete from local Dexie database first (Offline-First)
            const targetLocalId = record.LOCAL_ID || record.id;
            if (targetLocalId) {
                await db.sales_returns.delete(targetLocalId);
            } else if (record.RETURN_ID) {
                await db.sales_returns.where('RETURN_ID').equals(record.RETURN_ID).delete();
            }

            // 2. If online and has remote RETURN_ID, send delete to backend API
            if (record.RETURN_ID && syncService.isOnline) {
                try {
                    const baseUrl = syncService.apiBase || 'http://localhost:3001';
                    await axios.delete(`${baseUrl}/api/mill/returns/${record.RETURN_ID}`, { timeout: 5000 });
                } catch (err) {
                    console.warn('[OfflineFirst] Backend delete warning (handled locally):', err);
                }
            }

            msg.success('Sales return record deleted successfully');
            loadData();
            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Error deleting sales return:', e);
            msg.error('Failed to delete sales return record');
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
            // 1. Always update local Dexie database first (Offline-First)
            const targetLocalId = editingReturn.LOCAL_ID || editingReturn.id;
            if (targetLocalId) {
                await db.sales_returns.update(targetLocalId, {
                    ...values,
                    IS_SYNCED: 0
                });
            } else if (editingReturn.RETURN_ID) {
                const existing = await db.sales_returns.where('RETURN_ID').equals(editingReturn.RETURN_ID).first();
                if (existing) {
                    await db.sales_returns.update(existing.LOCAL_ID, {
                        ...values,
                        IS_SYNCED: 0
                    });
                }
            }

            // 2. If online and has remote RETURN_ID, send update to backend API
            if (editingReturn.RETURN_ID && syncService.isOnline) {
                try {
                    const baseUrl = syncService.apiBase || 'http://localhost:3001';
                    await axios.put(`${baseUrl}/api/mill/returns/${editingReturn.RETURN_ID}`, values, { timeout: 5000 });
                } catch (err) {
                    console.warn('[OfflineFirst] Backend edit sync warning (handled locally):', err);
                }
            }

            msg.success('Sales return updated successfully');
            setEditModalOpen(false);
            loadData();
            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Error updating return:', e);
            msg.error('Failed to update sales return');
        }
    };

    const handleViewDetails = (rec) => {
        setSelectedReturnDetails(rec);
        setViewModalVisible(true);
    };

    const columns = [
        {
            title: 'Return No',
            dataIndex: 'RETURN_NO',
            key: 'RETURN_NO',
            render: (text, r) => (
                <div>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{text || `RET-${r.id}`}</span>
                    {!r.IS_SYNCED && <Tag color="volcano" className="ml-1 text-[10px]">Offline</Tag>}
                </div>
            )
        },
        {
            title: 'Invoice / Batch',
            dataIndex: 'INVOICE_NO',
            key: 'INVOICE_NO',
            render: (text, r) => (
                <div>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{text}</span>
                    {r.BATCH_NO && <div className="text-[11px] font-mono text-purple-600 dark:text-purple-400">{r.BATCH_NO}</div>}
                </div>
            )
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
                    <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetails(record)}>
                        View
                    </Button>
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} className="!text-amber-500">
                        Edit
                    </Button>
                    <Popconfirm title="Delete this sales return record?" onConfirm={() => handleDeleteReturn(record)} okText="Yes" cancelText="No">
                        <Button size="small" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                </div>
            )
        }
    ];

    const tabItems = [
        {
            key: 'create',
            label: (
                <span className="font-bold text-base flex items-center gap-2">
                    <RollbackOutlined className="text-rose-600" /> Record Sales Return
                </span>
            ),
            children: (
                <Card className="shadow-sm border border-slate-200 dark:border-slate-800">
                    <Form form={form} layout="vertical" onFinish={handleFormSubmit}>
                        {/* Barcode Scanner / Manual Lookup Input */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 mb-6">
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                                    <BarcodeOutlined className="text-blue-600 dark:text-blue-400 mr-1.5 text-base" /> Scan Sticker Barcode (Product-Level Multi-Scan)
                                </label>
                                <Tag color="green" className="font-bold text-[10.5px]">Auto-Scanner & Paste Listener Active</Tag>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    id="barcodeLookupInput"
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
                                Scanners automatically trigger lookup. Press <code className="font-bold font-mono">Cmd+V</code> / <code className="font-bold font-mono">Ctrl+V</code> anywhere on screen to paste barcode!
                            </div>
                        </div>

                        <Form.Item label="Or Select Sales Invoice / Batch">
                            <Select
                                showSearch
                                size="large"
                                placeholder="Search bill by Invoice #, Batch #, or Customer…"
                                value={selectedBill?.LOCAL_ID || selectedBill?.BILL_ID}
                                onChange={handleBillChange}
                                optionFilterProp="label"
                                className="w-full"
                            >
                                {billsList.map(b => (
                                    <Option
                                        key={b.LOCAL_ID || b.BILL_ID}
                                        value={b.LOCAL_ID || b.BILL_ID}
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
                            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 mb-6 text-xs space-y-1">
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
                            <div className="mb-6">
                                <div className="font-bold text-slate-800 dark:text-slate-200 mb-3 text-xs uppercase tracking-wider flex justify-between items-center">
                                    <span>Scanned / Selected Return Items ({returnItemsState.length})</span>
                                    <Tag color="blue">{returnItemsState.reduce((s, i) => s + i.RETURNED_BAG_COUNT, 0)} bags total</Tag>
                                </div>
                                <div className="space-y-3">
                                    {returnItemsState.map((item, idx) => (
                                        <div key={idx} className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                            <div>
                                                <div className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
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
                                                        size="middle"
                                                        style={{ width: 90 }}
                                                    />
                                                </div>
                                                <div>
                                                    <div className="text-[11px] text-slate-400">Return Price (Rs.)</div>
                                                    <InputNumber
                                                        min={0}
                                                        step={0.5}
                                                        value={item.UNIT_PRICE}
                                                        onChange={v => handleItemFieldChange(idx, 'UNIT_PRICE', v)}
                                                        size="middle"
                                                        style={{ width: 115 }}
                                                    />
                                                </div>
                                                <div className="text-right min-w-[100px]">
                                                    <div className="text-slate-400 text-[11px]">Line Refund</div>
                                                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-base">
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
                                        className="w-full font-mono font-bold text-rose-600 text-lg"
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

                        <div className="flex justify-end gap-3 mt-6">
                            <Button
                                type="primary"
                                htmlType="submit"
                                size="large"
                                loading={submitting}
                                icon={<CheckCircleOutlined />}
                                className="!bg-rose-600 hover:!bg-rose-700 font-bold h-12 text-base px-8 shadow-md"
                            >
                                Save Sales Return & Issue Refund
                            </Button>
                        </div>
                    </Form>
                </Card>
            )
        },
        {
            key: 'history',
            label: (
                <span className="font-bold text-base flex items-center gap-2">
                    <HistoryOutlined className="text-blue-600" /> Return History ({returns.length})
                </span>
            ),
            children: (
                <div className="space-y-4">
                    <Card className="shadow-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Input
                                placeholder="Search Invoice #, Batch #, Customer, Return #…"
                                prefix={<SearchOutlined className="text-slate-400" />}
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                                allowClear
                            />
                            <DatePicker.RangePicker
                                format="DD/MM/YYYY"
                                value={dateRange}
                                onChange={v => setDateRange(v)}
                                className="w-full"
                            />
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

                    <Card className="shadow-sm">
                        <Table
                            columns={columns}
                            dataSource={filteredReturns}
                            rowKey="id"
                            loading={loading}
                            pagination={{ pageSize: 10 }}
                            size="middle"
                        />
                    </Card>
                </div>
            )
        }
    ];

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-4">
            {/* Main Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div>
                    <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 m-0 flex items-center gap-2">
                        <RollbackOutlined className="text-rose-600 dark:text-rose-400" /> Sales Returns & Customer Refund Management
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
                        Scan bag sticker to target specific product (+1 count) or paste anywhere on screen to record customer returns
                    </p>
                </div>
            </div>

            {/* Main Page Tabs */}
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                size="large"
                className="bg-transparent"
            />

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
                            <div>Refund Type: <Tag color="purple" className="uppercase font-bold">{selectedReturnDetails.REFUND_METHOD || selectedReturnDetails.REFUND_TYPE}</Tag></div>
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
