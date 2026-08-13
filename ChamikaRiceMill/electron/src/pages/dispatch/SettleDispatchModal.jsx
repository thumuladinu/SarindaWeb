import React, { useState, useEffect } from 'react';
import { 
    Modal, Form, Input, Button, DatePicker, Select, 
    InputNumber, Typography, message, Spin, Space, Tag 
} from 'antd';
import { 
    MinusCircleOutlined, PlusOutlined, DeleteOutlined, 
    CheckCircleOutlined, LockOutlined 
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';

const { Title } = Typography;
const { Option } = Select;

export default function SettleDispatchModal({ open, noteRecord, onClose, onSuccess, readOnly = false }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [dispatchNote, setDispatchNote] = useState(null);
    const [billsList, setBillsList] = useState([]);
    const [systemItems, setSystemItems] = useState({ P: null, N: null });
    const [totals, setTotals] = useState({}); // tracking final amounts for printed bills
    const [extraRows, setExtraRows] = useState([]); // dynamic extra bills rows

    useEffect(() => {
        if (open && noteRecord) {
            fetchData();
        }
    }, [open, noteRecord]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch all items — we need IDs for all _P and _N variations
            let allDbItems = [];

            try {
                allDbItems = await db.items.toArray();
            } catch (e) {
                console.warn('Could not load items from Dexie:', e);
            }

            if (syncService.isOnline) {
                try {
                    const itemsRes = await axios.post(`${syncService.apiBase}/api/MillgetAllItems`, {}, { timeout: 4000 });
                    if (itemsRes.data?.success && Array.isArray(itemsRes.data.result)) {
                        allDbItems = itemsRes.data.result;
                    }
                } catch (apiErr) {
                    console.warn('Could not fetch items from backend:', apiErr.message);
                }
            }

            // Build sets of ITEM_IDs for P and N variants
            // System codes: OUT_RATHU_KAKULU_P, OUT_SUDU_KAKULU_N, OUT_NADU_P etc.
            const pItemIds = new Set(
                allDbItems
                    .filter(i => String(i.SYSTEM_CODE || '').endsWith('_P') || i.VARIATION === 'P')
                    .map(i => String(i.ITEM_ID))
            );
            const nItemIds = new Set(
                allDbItems
                    .filter(i => String(i.SYSTEM_CODE || '').endsWith('_N') || i.VARIATION === 'N')
                    .map(i => String(i.ITEM_ID))
            );

            const pItem = allDbItems.find(i => String(i.SYSTEM_CODE || '').endsWith('_P')) || null;
            const nItem = allDbItems.find(i => String(i.SYSTEM_CODE || '').endsWith('_N')) || null;
            setSystemItems({ P: pItem, N: nItem });

            // Store pItemIds and nItemIds for use in the forEach below
            // We use a closure trick: re-define isP/isN inside the forEach with access to these sets
            const _pItemIds = pItemIds;
            const _nItemIds = nItemIds;


            // 2. Fetch Dispatch Note & Bills
            let noteData = noteRecord;
            let loadedBills = [];

            // Try fetching full details from backend if online
            if (syncService.isOnline && noteRecord.DISPATCH_ID) {
                try {
                    const res = await axios.get(`${syncService.apiBase}/api/mill/dispatch/${noteRecord.DISPATCH_ID}`, { timeout: 5000 });
                    if (res.data?.success && res.data.result) {
                        noteData = res.data.result;
                        loadedBills = res.data.result.BILLS || [];
                    }
                } catch (apiErr) {
                    console.warn('Could not fetch dispatch details from backend, falling back to local DB:', apiErr.message);
                }
            }

            // If bills not loaded from backend, load from Dexie IndexedDB
            if (loadedBills.length === 0) {
                const billIds = noteRecord.BILL_IDS_JSON || [];
                let localBills = [];
                if (billIds.length > 0) {
                    localBills = await db.sales_bills.where('LOCAL_ID').anyOf(billIds).toArray();
                    if (localBills.length === 0) {
                        localBills = await db.sales_bills.where('BILL_ID').anyOf(billIds).toArray();
                    }
                }

                if (localBills.length === 0) {
                    localBills = await db.sales_bills.toArray();
                }

                // Attach customer name if missing
                const customers = await db.customers.toArray();
                const custMap = {};
                customers.forEach(c => { custMap[c.CUSTOMER_ID] = c.NAME; });

                loadedBills = localBills.map(b => ({
                    ...b,
                    CUSTOMER_NAME: b.CUSTOMER_NAME || custMap[b.CUSTOMER_ID] || 'Walk-in',
                    ITEMS: b.ITEMS_JSON || b.ITEMS || [],
                    CHEQUES: b.CHEQUES || []
                }));
            }

            setDispatchNote(noteData);
            setBillsList(loadedBills);

            // 3. Pre-fill Form State and Compute Totals
            const initialBills = {};
            const initTotals = {};

            loadedBills.forEach(b => {
                const bKey = b.BILL_ID || b.LOCAL_ID;
                const bItems = b.ITEMS || b.ITEMS_JSON || [];
                // Robust matching: by ITEM_ID in set, SYSTEM_CODE suffix, or item name (P)/(N)
                const isP = (i) => (
                    _pItemIds.has(String(i.ITEM_ID)) ||
                    String(i.SYSTEM_CODE || '').endsWith('_P') ||
                    i.ITEM_CODE === 'P' ||
                    i.CODE === 'P' ||
                    String(i.ITEM_NAME || i.NAME || '').includes('(P)')
                );
                const isN = (i) => (
                    _nItemIds.has(String(i.ITEM_ID)) ||
                    String(i.SYSTEM_CODE || '').endsWith('_N') ||
                    i.ITEM_CODE === 'N' ||
                    i.CODE === 'N' ||
                    String(i.ITEM_NAME || i.NAME || '').includes('(N)')
                );

                const pItems = Array.isArray(bItems) ? bItems.filter(isP) : [];
                const nItems = Array.isArray(bItems) ? bItems.filter(isN) : [];

                const getP = (w) => pItems.find(i => Number(i.BAG_WEIGHT) === w);
                const getN = (w) => nItems.find(i => Number(i.BAG_WEIGHT) === w);

                const getBagQty = (item, weight) => {
                    if (!item) return null;
                    if (item.BAG_COUNT !== null && item.BAG_COUNT !== undefined && Number(item.BAG_COUNT) > 0) {
                        return parseFloat(item.BAG_COUNT);
                    }
                    const qty = parseFloat(item.QUANTITY || 0);
                    return qty > 0 ? qty / weight : null;
                };

                const getPrice = (item) => {
                    if (!item) return null;
                    const p = parseFloat(item.UNIT_PRICE || 0);
                    return p > 0 ? p : null;
                };

                const hasCheques = (b.CHEQUES && b.CHEQUES.length > 0) || b.PAYMENT_METHOD === 'cheque';

                initialBills[bKey] = {
                    PAYMENT_METHOD: hasCheques ? 'cheque' : (b.PAYMENT_METHOD || 'cash'),
                    REMARK: b.REMARK || '',
                    CHEQUES: (b.CHEQUES || []).map(c => ({
                        CHEQUE_ID: c.CHEQUE_ID,
                        CHEQUE_NUMBER: c.CHEQUE_NUMBER,
                        BANK: c.BANK,
                        DUE_DATE: c.DUE_DATE ? dayjs(c.DUE_DATE) : null,
                        AMOUNT: parseFloat(c.AMOUNT || 0)
                    })),
                    items: {
                        P5_qty:    getBagQty(getP(5), 5)    ?? 0,
                        P5_price:  getPrice(getP(5))        ?? 0,
                        P10_qty:   getBagQty(getP(10), 10)  ?? 0,
                        P10_price: getPrice(getP(10))       ?? 0,
                        P25_qty:   getBagQty(getP(25), 25)  ?? 0,
                        P25_price: getPrice(getP(25))       ?? 0,
                        N5_qty:    getBagQty(getN(5), 5)    ?? 0,
                        N5_price:  getPrice(getN(5))        ?? 0,
                        N10_qty:   getBagQty(getN(10), 10)  ?? 0,
                        N10_price: getPrice(getN(10))       ?? 0,
                        N25_qty:   getBagQty(getN(25), 25)  ?? 0,
                        N25_price: getPrice(getN(25))       ?? 0,
                    }
                };

                // Calculate initial total from extracted items; fallback to bill stored total
                let calcInitTotal = 0;
                [...pItems, ...nItems].forEach(it => {
                    const bCount = getBagQty(it, Number(it.BAG_WEIGHT) || 1) || 0;
                    const uPrice = getPrice(it) || 0;
                    calcInitTotal += bCount * uPrice;
                });

                initTotals[bKey] = calcInitTotal > 0
                    ? calcInitTotal
                    : parseFloat(b.FINAL_AMOUNT || b.PRINTED_SUB_TOTAL || b.TOTAL_AMOUNT || 0);
            });

            form.setFieldsValue({ bills: initialBills });
            setTotals(initTotals);
        } catch (e) {
            console.error('Failed to fetch data:', e);
            message.error('Failed to load dispatch details');
        } finally {
            setLoading(false);
        }
    };

    const handleValuesChange = (changedValues, allValues) => {
        if (changedValues.bills) {
            Object.keys(changedValues.bills).forEach(billKey => {
                if (changedValues.bills[billKey]?.items) {
                    const billData = allValues.bills[billKey];
                    const items = billData?.items || {};
                    
                    let calcTotal = 0;
                    ['P', 'N'].forEach(type => {
                        [5, 10, 25].forEach(w => {
                            const qty = parseFloat(items[`${type}${w}_qty`] || 0);
                            const price = parseFloat(items[`${type}${w}_price`] || 0);
                            calcTotal += (qty * price);
                        });
                    });

                    setTotals(prev => ({ ...prev, [billKey]: calcTotal }));
                }
            });
        }
    };

    const addExtraRow = () => {
        const id = `extra_${Date.now()}`;
        setExtraRows(prev => [...prev, id]);
        form.setFieldValue(['extras', id], {
            PAYMENT_METHOD: 'cash',
            REMARK: '',
            CHEQUES: [],
            items: {
                P5_qty: 0, P5_price: 0,
                P10_qty: 0, P10_price: 0,
                P25_qty: 0, P25_price: 0,
                N5_qty: 0, N5_price: 0,
                N10_qty: 0, N10_price: 0,
                N25_qty: 0, N25_price: 0,
            }
        });
    };

    const removeExtraRow = (id) => {
        setExtraRows(prev => prev.filter(r => r !== id));
        const currentExtras = form.getFieldValue('extras') || {};
        delete currentExtras[id];
        form.setFieldsValue({ extras: currentExtras });
    };

    const calcExtraTotal = (extraId) => {
        const extraData = form.getFieldValue(['extras', extraId]);
        if (!extraData || !extraData.items) return 0;
        const items = extraData.items;
        let total = 0;
        ['P', 'N'].forEach(type => {
            [5, 10, 25].forEach(w => {
                const qty = parseFloat(items[`${type}${w}_qty`] || 0);
                const price = parseFloat(items[`${type}${w}_price`] || 0);
                total += (qty * price);
            });
        });
        return total;
    };

    const handleFinish = async (values) => {
        setSubmitting(true);
        try {
            const formatCheques = (chqs) => (chqs || []).map(c => ({
                ...c,
                DUE_DATE: c.DUE_DATE ? (typeof c.DUE_DATE.format === 'function' ? c.DUE_DATE.format('YYYY-MM-DD') : String(c.DUE_DATE).slice(0, 10)) : null
            }));

            const formattedBills = [];

            // 1. Process Existing Printed Bills
            if (values.bills) {
                for (const [billKey, data] of Object.entries(values.bills)) {
                    if (!data) continue;
                    const itemsToInsert = [];
                    const addRowToItems = (type, weight, qty, price) => {
                        const parsedQty = parseFloat(qty || 0);
                        const parsedPrice = parseFloat(price || 0);
                        if (parsedQty > 0) {
                            const itemDb = type === 'P' ? systemItems.P : systemItems.N;
                            itemsToInsert.push({
                                ITEM_ID: itemDb?.ITEM_ID || (type === 'P' ? 1 : 2),
                                SYSTEM_CODE: type === 'P' ? 'OUT_SAMBA' : 'OUT_NADU',
                                BAG_WEIGHT: weight,
                                BAG_COUNT: parsedQty,
                                QUANTITY: parsedQty * weight,
                                UNIT_PRICE: parsedPrice,
                                TOTAL_PRICE: parsedQty * parsedPrice
                            });
                        }
                    };

                    const it = data.items || {};
                    addRowToItems('P', 5, it.P5_qty, it.P5_price);
                    addRowToItems('P', 10, it.P10_qty, it.P10_price);
                    addRowToItems('P', 25, it.P25_qty, it.P25_price);
                    addRowToItems('N', 5, it.N5_qty, it.N5_price);
                    addRowToItems('N', 10, it.N10_qty, it.N10_price);
                    addRowToItems('N', 25, it.N25_qty, it.N25_price);

                    const targetBill = billsList.find(b => 
                        String(b.LOCAL_ID) === String(billKey) || String(b.BILL_ID) === String(billKey)
                    );

                    const finalAmount = totals[billKey] || targetBill?.FINAL_AMOUNT || 0;

                    // Update bill in Dexie IndexedDB
                    if (targetBill?.LOCAL_ID) {
                        await db.sales_bills.update(targetBill.LOCAL_ID, {
                            FINAL_AMOUNT: finalAmount,
                            PAYMENT_METHOD: data.PAYMENT_METHOD || 'cash',
                            REMARK: data.REMARK || '',
                            CHEQUES: formatCheques(data.CHEQUES),
                            ITEMS_JSON: itemsToInsert,
                            IS_SETTLED: 1,
                            IS_SYNCED: 0
                        });
                    }

                    formattedBills.push({
                        BILL_ID: targetBill?.BILL_ID || billKey,
                        FINAL_AMOUNT: finalAmount,
                        PAYMENT_METHOD: data.PAYMENT_METHOD,
                        REMARK: data.REMARK,
                        CHEQUES: formatCheques(data.CHEQUES),
                        ITEMS: itemsToInsert
                    });
                }
            }

            // 2. Process Extra Handwritten Bills
            const formattedExtraBills = [];
            if (values.extras) {
                for (const [id, data] of Object.entries(values.extras)) {
                    if (!data) continue;
                    const itemsToInsert = [];
                    const addRowToItems = (type, weight, qty, price) => {
                        const parsedQty = parseFloat(qty || 0);
                        const parsedPrice = parseFloat(price || 0);
                        if (parsedQty > 0) {
                            const itemDb = type === 'P' ? systemItems.P : systemItems.N;
                            itemsToInsert.push({
                                ITEM_ID: itemDb?.ITEM_ID || (type === 'P' ? 1 : 2),
                                SYSTEM_CODE: type === 'P' ? 'OUT_SAMBA' : 'OUT_NADU',
                                BAG_WEIGHT: weight,
                                BAG_COUNT: parsedQty,
                                QUANTITY: parsedQty * weight,
                                UNIT_PRICE: parsedPrice,
                                TOTAL_PRICE: parsedQty * parsedPrice
                            });
                        }
                    };

                    const it = data.items || {};
                    addRowToItems('P', 5, it.P5_qty, it.P5_price);
                    addRowToItems('P', 10, it.P10_qty, it.P10_price);
                    addRowToItems('P', 25, it.P25_qty, it.P25_price);
                    addRowToItems('N', 5, it.N5_qty, it.N5_price);
                    addRowToItems('N', 10, it.N10_qty, it.N10_price);
                    addRowToItems('N', 25, it.N25_qty, it.N25_price);

                    if (itemsToInsert.length > 0) {
                        formattedExtraBills.push({
                            FINAL_AMOUNT: calcExtraTotal(id),
                            PAYMENT_METHOD: data.PAYMENT_METHOD || 'cash',
                            REMARK: data.REMARK || '',
                            CHEQUES: formatCheques(data.CHEQUES),
                            ITEMS: itemsToInsert
                        });
                    }
                }
            }

            // 3. Mark Dispatch Note as SETTLED in Dexie IndexedDB
            const noteLocalId = noteRecord.LOCAL_ID;
            if (noteLocalId) {
                await db.dispatch_notes.update(noteLocalId, {
                    STATUS: 'SETTLED',
                    SETTLED_BILLS_JSON: formattedBills,
                    EXTRA_BILLS_JSON: formattedExtraBills,
                    IS_SYNCED: 0
                });
            }

            // 4. Push to Backend if online
            if (syncService.isOnline) {
                try {
                    const baseUrl = syncService.apiBase;
                    const res = await axios.post(`${baseUrl}/api/mill/dispatch/settle`, {
                        DISPATCH_ID: noteRecord.DISPATCH_ID || noteRecord.LOCAL_ID,
                        BILLS: formattedBills,
                        EXTRA_BILLS: formattedExtraBills
                    }, { timeout: 10000 });

                    if (res.data?.success && noteLocalId) {
                        await db.dispatch_notes.update(noteLocalId, { IS_SYNCED: 1 });
                    }
                } catch (apiErr) {
                    console.warn('Backend settlement push will retry on next sync:', apiErr.message);
                }
            }

            message.success('Dispatch Note settled successfully');
            if (onSuccess) onSuccess();
            if (onClose) onClose();
        } catch (e) {
            console.error('Submit error:', e);
            message.error('Failed to submit settlement');
        } finally {
            setSubmitting(false);
        }
    };

    const isSettled = noteRecord?.STATUS === 'SETTLED' || dispatchNote?.STATUS === 'SETTLED' || readOnly;

    // Dark-mode compatible CSS classes matching WebApp
    const thClass = "border border-gray-300 dark:border-gray-600 p-1.5 text-center bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-gray-100 font-bold text-xs leading-tight";
    const tdClass = "border border-gray-300 dark:border-gray-600 p-0 text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100";
    const inputStyle = { width: '100%', minWidth: '45px', padding: '0 4px', fontSize: '12px', textAlign: 'center' };

    return (
        <Modal
            title={null}
            open={open}
            onCancel={onClose}
            width={1180}
            footer={null}
            destroyOnClose
            style={{ top: 20 }}
            bodyStyle={{ padding: '20px 24px' }}
        >
            {loading ? (
                <div className="text-center py-16">
                    <Spin size="large" />
                    <div className="mt-3 text-slate-500 text-xs">Loading dispatch settlement details...</div>
                </div>
            ) : (
                <Form form={form} layout="vertical" onFinish={handleFinish} onValuesChange={handleValuesChange}>
                    {/* Header */}
                    <div className="flex justify-between items-center mb-4 pb-2 border-b dark:border-gray-700">
                        <div className="flex items-center gap-2">
                            <Title level={4} className="!mb-0 dark:text-white font-bold text-slate-800">
                                Settle Dispatch Note: {dispatchNote?.DISPATCH_NO || noteRecord?.DISPATCH_NO}
                            </Title>
                            {isSettled && <Tag color="success" icon={<LockOutlined />}>SETTLED (LOCKED)</Tag>}
                        </div>
                        <div className="text-xs text-slate-500">
                            🚚 {dispatchNote?.DRIVER_NAME || noteRecord?.DRIVER_NAME || 'Main Driver'} ({dispatchNote?.LORRY_NO || noteRecord?.LORRY_NO || noteRecord?.VEHICLE_NO || 'Vehicle'})
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
                        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-4 min-w-[950px]">
                            <colgroup>
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '4%' }} />
                                <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                                <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                                <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                                <col style={{ width: '9%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '25%' }} />
                            </colgroup>
                            <thead className="sticky top-0 z-10 shadow-xs">
                                <tr>
                                    <th className={thClass} rowSpan={2}>Invoice No</th>
                                    <th className={thClass} rowSpan={2}>Type</th>
                                    <th className={thClass} colSpan={2}>5 kg</th>
                                    <th className={thClass} colSpan={2}>10 kg</th>
                                    <th className={thClass} colSpan={2}>25 kg</th>
                                    <th className={thClass} rowSpan={2}>Final Total (Rs)</th>
                                    <th className={thClass} rowSpan={2}>Payment & Remark</th>
                                    <th className={thClass} rowSpan={2}>Cheque Details</th>
                                </tr>
                                <tr>
                                    <th className={`${thClass} bg-gray-100 dark:bg-slate-800 text-[10px]`}>Price</th>
                                    <th className={`${thClass} bg-gray-100 dark:bg-slate-800 text-[10px]`}>Bags</th>
                                    <th className={`${thClass} bg-gray-100 dark:bg-slate-800 text-[10px]`}>Price</th>
                                    <th className={`${thClass} bg-gray-100 dark:bg-slate-800 text-[10px]`}>Bags</th>
                                    <th className={`${thClass} bg-gray-100 dark:bg-slate-800 text-[10px]`}>Price</th>
                                    <th className={`${thClass} bg-gray-100 dark:bg-slate-800 text-[10px]`}>Bags</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Printed Bills */}
                                {billsList.map(bill => {
                                    const bid = bill.BILL_ID || bill.LOCAL_ID;
                                    return (
                                        <React.Fragment key={bid}>
                                            {/* P (Samba) Row */}
                                            <tr>
                                                <td rowSpan={2} className={`${tdClass} px-2 font-bold text-center bg-gray-50 dark:bg-slate-900 border-r`}>
                                                    {bill.INVOICE_NO || `BILL-${bid}`}
                                                    <div className="text-[10px] font-normal text-gray-500 dark:text-gray-400">
                                                        {bill.CUSTOMER_NAME || 'Walk-in'}
                                                    </div>
                                                </td>
                                                <td className={`${tdClass} text-center font-bold bg-gray-100 dark:bg-slate-700`}>P</td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'P5_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'P5_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'P10_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'P10_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'P25_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'P25_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                
                                                {/* RowSpan 2: Final Total Cell */}
                                                <td rowSpan={2} className={`${tdClass} text-center font-bold bg-gray-50 dark:bg-slate-900 text-[14px]`}>
                                                    {(totals[bid] || 0).toLocaleString()}
                                                </td>

                                                {/* RowSpan 2: Payment & Remark Cell */}
                                                <td rowSpan={2} className={`${tdClass} align-top p-1 bg-white dark:bg-slate-800`}>
                                                    <Form.Item name={['bills', bid, 'PAYMENT_METHOD']} noStyle>
                                                        <Select disabled={isSettled} size="small" style={{ width: '100%' }}>
                                                            <Option value="cash">Cash</Option>
                                                            <Option value="cheque">Cheque</Option>
                                                        </Select>
                                                    </Form.Item>
                                                    <Form.Item name={['bills', bid, 'REMARK']} noStyle>
                                                        <Input disabled={isSettled} size="small" placeholder="Remark" className="mt-1" />
                                                    </Form.Item>
                                                </td>

                                                {/* RowSpan 2: Cheque Details Cell */}
                                                <td rowSpan={2} className={`${tdClass} align-top p-1 bg-white dark:bg-slate-800`}>
                                                    <Form.Item dependencies={[['bills', bid, 'PAYMENT_METHOD']]} noStyle>
                                                        {() => {
                                                            const pMethod = form.getFieldValue(['bills', bid, 'PAYMENT_METHOD']);
                                                            if (pMethod !== 'cheque') {
                                                                return (
                                                                    <div className="text-gray-400 dark:text-gray-500 italic text-[11px] text-center pt-2">
                                                                        N/A (Cash)
                                                                    </div>
                                                                );
                                                            }
                                                            return (
                                                                <Form.List name={['bills', bid, 'CHEQUES']}>
                                                                    {(fields, { add, remove }) => (
                                                                        <div className="flex flex-col gap-1">
                                                                            {fields.map(({ key, name, ...restField }) => (
                                                                                <div key={key} className="flex gap-1 items-start bg-gray-50 dark:bg-slate-700 p-1 rounded border dark:border-slate-600">
                                                                                    <div className="flex-1 flex flex-col gap-1">
                                                                                        <div className="flex gap-1">
                                                                                            <Form.Item {...restField} name={[name, 'CHEQUE_NUMBER']} noStyle rules={[{ required: true, message: 'Required' }]}>
                                                                                                <Input disabled={isSettled} size="small" placeholder="Chq No" />
                                                                                            </Form.Item>
                                                                                            <Form.Item {...restField} name={[name, 'AMOUNT']} noStyle rules={[{ required: true, message: 'Required' }]}>
                                                                                                <InputNumber disabled={isSettled} size="small" placeholder="Amount" controls={false} style={{ width: '100%' }} />
                                                                                            </Form.Item>
                                                                                        </div>
                                                                                        <div className="flex gap-1">
                                                                                            <Form.Item {...restField} name={[name, 'BANK']} noStyle>
                                                                                                <Input disabled={isSettled} size="small" placeholder="Bank" />
                                                                                            </Form.Item>
                                                                                            <Form.Item {...restField} name={[name, 'DUE_DATE']} noStyle rules={[{ required: true, message: 'Required' }]}>
                                                                                                <DatePicker disabled={isSettled} size="small" style={{ width: '100%' }} format="YYYY-MM-DD" />
                                                                                            </Form.Item>
                                                                                        </div>
                                                                                    </div>
                                                                                    {!isSettled && (
                                                                                        <MinusCircleOutlined onClick={() => remove(name)} className="text-red-500 mt-1 cursor-pointer" />
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                            {!isSettled && (
                                                                                <Button type="dashed" size="small" onClick={() => add()} icon={<PlusOutlined />} className="text-xs">
                                                                                    Add Cheque
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </Form.List>
                                                            );
                                                        }}
                                                    </Form.Item>
                                                </td>
                                            </tr>

                                            {/* N (Nadu) Row */}
                                            <tr>
                                                <td className={`${tdClass} text-center font-bold bg-gray-100 dark:bg-slate-700`}>N</td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'N5_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'N5_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'N10_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'N10_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'N25_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['bills', bid, 'items', 'N25_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}

                                {/* Extra Handwritten Bills */}
                                {extraRows.map((id, index) => {
                                    const extraTotal = calcExtraTotal(id);
                                    return (
                                        <React.Fragment key={id}>
                                            <tr>
                                                <td rowSpan={2} className={`${tdClass} px-2 font-bold text-center bg-amber-50 dark:bg-amber-950/30 border-r`}>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-amber-700 dark:text-amber-400 text-xs">Extra #{index + 1}</span>
                                                        {!isSettled && (
                                                            <Button 
                                                                type="text" 
                                                                danger 
                                                                size="small" 
                                                                icon={<DeleteOutlined />} 
                                                                onClick={() => removeExtraRow(id)} 
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] font-normal text-gray-500 dark:text-gray-400">(Auto Invoice)</div>
                                                </td>
                                                <td className={`${tdClass} text-center font-bold bg-amber-100 dark:bg-amber-900/50`}>P</td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'P5_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'P5_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'P10_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'P10_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'P25_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'P25_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                
                                                {/* RowSpan 2: Extra Final Total */}
                                                <td rowSpan={2} className={`${tdClass} text-center font-bold bg-amber-50 dark:bg-amber-950/30 text-[14px]`}>
                                                    {extraTotal.toLocaleString()}
                                                </td>

                                                {/* RowSpan 2: Extra Payment & Remark */}
                                                <td rowSpan={2} className={`${tdClass} align-top p-1 bg-white dark:bg-slate-800`}>
                                                    <Form.Item name={['extras', id, 'PAYMENT_METHOD']} noStyle>
                                                        <Select disabled={isSettled} size="small" style={{ width: '100%' }}>
                                                            <Option value="cash">Cash</Option>
                                                            <Option value="cheque">Cheque</Option>
                                                        </Select>
                                                    </Form.Item>
                                                    <Form.Item name={['extras', id, 'REMARK']} noStyle>
                                                        <Input disabled={isSettled} size="small" placeholder="Remark" className="mt-1" />
                                                    </Form.Item>
                                                </td>

                                                {/* RowSpan 2: Extra Cheque Details */}
                                                <td rowSpan={2} className={`${tdClass} align-top p-1 bg-white dark:bg-slate-800`}>
                                                    <Form.Item dependencies={[['extras', id, 'PAYMENT_METHOD']]} noStyle>
                                                        {() => {
                                                            const pMethod = form.getFieldValue(['extras', id, 'PAYMENT_METHOD']);
                                                            if (pMethod !== 'cheque') {
                                                                return (
                                                                    <div className="text-gray-400 dark:text-gray-500 italic text-[11px] text-center pt-2">
                                                                        N/A (Cash)
                                                                    </div>
                                                                );
                                                            }
                                                            return (
                                                                <Form.List name={['extras', id, 'CHEQUES']}>
                                                                    {(fields, { add, remove }) => (
                                                                        <div className="flex flex-col gap-1">
                                                                            {fields.map(({ key, name, ...restField }) => (
                                                                                <div key={key} className="flex gap-1 items-start bg-gray-50 dark:bg-slate-700 p-1 rounded border dark:border-slate-600">
                                                                                    <div className="flex-1 flex flex-col gap-1">
                                                                                        <div className="flex gap-1">
                                                                                            <Form.Item {...restField} name={[name, 'CHEQUE_NUMBER']} noStyle rules={[{ required: true, message: 'Required' }]}>
                                                                                                <Input disabled={isSettled} size="small" placeholder="Chq No" />
                                                                                            </Form.Item>
                                                                                            <Form.Item {...restField} name={[name, 'AMOUNT']} noStyle rules={[{ required: true, message: 'Required' }]}>
                                                                                                <InputNumber disabled={isSettled} size="small" placeholder="Amount" controls={false} style={{ width: '100%' }} />
                                                                                            </Form.Item>
                                                                                        </div>
                                                                                        <div className="flex gap-1">
                                                                                            <Form.Item {...restField} name={[name, 'BANK']} noStyle>
                                                                                                <Input disabled={isSettled} size="small" placeholder="Bank" />
                                                                                            </Form.Item>
                                                                                            <Form.Item {...restField} name={[name, 'DUE_DATE']} noStyle rules={[{ required: true, message: 'Required' }]}>
                                                                                                <DatePicker disabled={isSettled} size="small" style={{ width: '100%' }} format="YYYY-MM-DD" />
                                                                                            </Form.Item>
                                                                                        </div>
                                                                                    </div>
                                                                                    {!isSettled && (
                                                                                        <MinusCircleOutlined onClick={() => remove(name)} className="text-red-500 mt-1 cursor-pointer" />
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                            {!isSettled && (
                                                                                <Button type="dashed" size="small" onClick={() => add()} icon={<PlusOutlined />} className="text-xs">
                                                                                    Add Cheque
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </Form.List>
                                                            );
                                                        }}
                                                    </Form.Item>
                                                </td>
                                            </tr>

                                            {/* N (Nadu) Row */}
                                            <tr>
                                                <td className={`${tdClass} text-center font-bold bg-amber-100 dark:bg-amber-900/50`}>N</td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'N5_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'N5_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'N10_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'N10_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'N25_price']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                                <td className={tdClass}>
                                                    <Form.Item name={['extras', id, 'items', 'N25_qty']} noStyle>
                                                        <InputNumber disabled={isSettled} controls={false} style={inputStyle} />
                                                    </Form.Item>
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Bottom Actions */}
                    {isSettled ? (
                        <div className="flex justify-end items-center mt-4 border-t dark:border-gray-700 pt-4">
                            <Button type="primary" onClick={onClose} className="rounded-lg">
                                Close
                            </Button>
                        </div>
                    ) : (
                        <div className="flex justify-between items-center mt-4 border-t dark:border-gray-700 pt-4">
                            <Button 
                                type="dashed" 
                                icon={<PlusOutlined />} 
                                onClick={addExtraRow} 
                                className="dark:text-white dark:border-gray-600 rounded-lg"
                            >
                                Add Extra Handwritten Invoice
                            </Button>
                            <Space>
                                <Button onClick={onClose} disabled={submitting} className="rounded-lg">
                                    Cancel
                                </Button>
                                <Button 
                                    type="primary" 
                                    htmlType="submit" 
                                    loading={submitting}
                                    icon={<CheckCircleOutlined />}
                                    className="bg-blue-600 hover:bg-blue-700 font-bold rounded-lg px-5"
                                >
                                    Settle Dispatch Note
                                </Button>
                            </Space>
                        </div>
                    )}
                </Form>
            )}
        </Modal>
    );
}
