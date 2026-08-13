import React, { useState, useEffect } from 'react';
import { Form, Input, Button, DatePicker, Select, InputNumber, Typography, message, Spin, Space } from 'antd';
import { MinusCircleOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

export default function SettleDispatchForm({ dispatchId, onSuccess, onCancel, readOnly = false }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [dispatchNote, setDispatchNote] = useState(null);
    const [systemItems, setSystemItems] = useState({ P: null, N: null });
    const [totals, setTotals] = useState({}); // tracking final amounts for printed bills
    const [extraRows, setExtraRows] = useState([]); // dynamic extra bills rows

    useEffect(() => {
        fetchData();
    }, [dispatchId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Fetch all items — we need IDs for both P and N variations
            const itemsRes = await axios.post('/api/MillgetAllItems', {}, { withCredentials: true });
            let allDbItems = [];
            if (itemsRes.data.success) {
                allDbItems = itemsRes.data.result || [];
            }

            // Collect all P-variant and N-variant ITEM_IDs
            // System codes follow pattern: OUT_RATHU_KAKULU_P, OUT_SUDU_KAKULU_P, OUT_NADU_P etc.
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

            // Keep for backward compat (pItem/nItem used for fallback price from selling price)
            const pItem = allDbItems.find(i => String(i.SYSTEM_CODE || '').endsWith('_P')) || null;
            const nItem = allDbItems.find(i => String(i.SYSTEM_CODE || '').endsWith('_N')) || null;
            setSystemItems({ P: pItem, N: nItem });

            // Fetch Dispatch Note
            const res = await axios.get(`/api/mill/dispatch/${dispatchId}`, { withCredentials: true });
            if (res.data.success) {
                const note = res.data.result;
                setDispatchNote(note);
                
                const initialBills = {};
                const initTotals = {};

                (note.BILLS || []).forEach(b => {
                    const bItems = b.ITEMS || [];

                    // Match items by P/N ITEM_ID sets, or SYSTEM_CODE suffix, or ITEM_CODE/CODE
                    const isP = (i) => (
                        pItemIds.has(String(i.ITEM_ID)) ||
                        String(i.SYSTEM_CODE || '').endsWith('_P') ||
                        i.ITEM_CODE === 'P' ||
                        i.CODE === 'P' ||
                        String(i.ITEM_NAME || i.NAME || '').includes('(P)')
                    );
                    const isN = (i) => (
                        nItemIds.has(String(i.ITEM_ID)) ||
                        String(i.SYSTEM_CODE || '').endsWith('_N') ||
                        i.ITEM_CODE === 'N' ||
                        i.CODE === 'N' ||
                        String(i.ITEM_NAME || i.NAME || '').includes('(N)')
                    );

                    const pItems = bItems.filter(isP);
                    const nItems = bItems.filter(isN);

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

                    initialBills[b.BILL_ID] = {
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
                    
                    // Calculate total from matched items; fallback to bill stored total
                    let calcInitTotal = 0;
                    [...pItems, ...nItems].forEach(it => {
                        const bCount = getBagQty(it, Number(it.BAG_WEIGHT) || 1) || 0;
                        const uPrice = getPrice(it) || 0;
                        calcInitTotal += bCount * uPrice;
                    });

                    initTotals[b.BILL_ID] = calcInitTotal > 0
                        ? calcInitTotal
                        : parseFloat(b.PRINTED_SUB_TOTAL || b.TOTAL_AMOUNT || 0);
                });
                
                form.setFieldsValue({ bills: initialBills });
                setTotals(initTotals);
            }
        } catch (e) {
            console.error('Failed to fetch data', e);
            message.error('Failed to load dispatch details');
        } finally {
            setLoading(false);
        }
    };

    const handleValuesChange = (changedValues, allValues) => {
        if (changedValues.bills) {
            Object.keys(changedValues.bills).forEach(billId => {
                if (changedValues.bills[billId]?.items) {
                    const billData = allValues.bills[billId];
                    const items = billData?.items || {};
                    
                    let calcTotal = 0;
                    ['P', 'N'].forEach(type => {
                        [5, 10, 25].forEach(w => {
                            const qty = items[`${type}${w}_qty`] || 0;
                            const price = items[`${type}${w}_price`] || 0;
                            calcTotal += (qty * price);
                        });
                    });

                    setTotals(prev => ({ ...prev, [billId]: calcTotal }));
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
                const qty = items[`${type}${w}_qty`] || 0;
                const price = items[`${type}${w}_price`] || 0;
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

            // 1. Existing Printed Bills
            if (values.bills) {
                for (const [billId, data] of Object.entries(values.bills)) {
                    if (!data) continue;
                    const itemsToInsert = [];
                    const addRowToItems = (type, weight, qty, price) => {
                        const parsedQty = parseFloat(qty || 0);
                        const parsedPrice = parseFloat(price || 0);
                        if (parsedQty > 0) {
                            const itemDb = type === 'P' ? systemItems.P : systemItems.N;
                            if (itemDb) {
                                itemsToInsert.push({
                                    ITEM_ID: itemDb.ITEM_ID,
                                    BAG_WEIGHT: weight,
                                    BAG_COUNT: parsedQty,
                                    QUANTITY: parsedQty,
                                    UNIT_PRICE: parsedPrice,
                                    TOTAL_PRICE: parsedQty * parsedPrice
                                });
                            }
                        }
                    };

                    const it = data.items || {};
                    addRowToItems('P', 5, it.P5_qty, it.P5_price);
                    addRowToItems('P', 10, it.P10_qty, it.P10_price);
                    addRowToItems('P', 25, it.P25_qty, it.P25_price);
                    addRowToItems('N', 5, it.N5_qty, it.N5_price);
                    addRowToItems('N', 10, it.N10_qty, it.N10_price);
                    addRowToItems('N', 25, it.N25_qty, it.N25_price);

                    formattedBills.push({
                        BILL_ID: billId,
                        FINAL_AMOUNT: totals[billId] || 0,
                        PAYMENT_METHOD: data.PAYMENT_METHOD,
                        REMARK: data.REMARK,
                        CHEQUES: formatCheques(data.CHEQUES),
                        ITEMS: itemsToInsert
                    });
                }
            }

            // 2. Extra Handwritten Bills
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
                            if (itemDb) {
                                itemsToInsert.push({
                                    ITEM_ID: itemDb.ITEM_ID,
                                    BAG_WEIGHT: weight,
                                    BAG_COUNT: parsedQty,
                                    QUANTITY: parsedQty,
                                    UNIT_PRICE: parsedPrice,
                                    TOTAL_PRICE: parsedQty * parsedPrice
                                });
                            }
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

            const payload = {
                DISPATCH_ID: dispatchId,
                BILLS: formattedBills,
                EXTRA_BILLS: formattedExtraBills
            };

            const res = await axios.post('/api/mill/dispatch/settle', payload, { withCredentials: true });
            if (res.data.success) {
                message.success('Dispatch Note settled successfully');
                onSuccess();
            } else {
                message.error(res.data.message || 'Failed to settle');
            }
        } catch (e) {
            console.error('Submit error:', e);
            message.error('Failed to submit settlement');
        } finally {
            setSubmitting(false);
        }
    };

    const isSettled = dispatchNote?.STATUS === 'SETTLED' || readOnly;

    if (loading) return <Spin size="large" className="block text-center mt-10" />;
    if (!dispatchNote) return <p>Dispatch Note not found.</p>;

    // Dark-mode compatible CSS classes
    const thClass = "border border-gray-300 dark:border-gray-600 p-1.5 text-center bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-gray-100 font-bold text-xs leading-tight";
    const tdClass = "border border-gray-300 dark:border-gray-600 p-0 text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100";
    const inputStyle = { width: '100%', minWidth: '45px', padding: '0 4px', fontSize: '12px', textAlign: 'center' };

    return (
        <Form form={form} layout="vertical" onFinish={handleFinish} onValuesChange={handleValuesChange}>
            <div className="mb-4">
                <Title level={4} className="!mb-0 dark:text-white">Settle Dispatch Note: {dispatchNote.DISPATCH_NO}</Title>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 dark:border-gray-600 mb-6 min-w-[950px]">
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
                    <thead>
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
                        {(dispatchNote.BILLS || []).map(bill => {
                            const bid = bill.BILL_ID;
                            return (
                                <React.Fragment key={bid}>
                                    {/* P Row */}
                                    <tr>
                                        <td rowSpan={2} className={`${tdClass} px-2 font-bold text-center bg-gray-50 dark:bg-slate-900 border-r`}>
                                            {bill.INVOICE_NO}
                                            <div className="text-[10px] font-normal text-gray-500">{bill.CUSTOMER_NAME || 'Walk-in'}</div>
                                        </td>
                                        <td className={`${tdClass} text-center font-bold bg-gray-100 dark:bg-slate-700`}>P</td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'P5_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'P5_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'P10_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'P10_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'P25_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'P25_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        
                                        {/* RowSpan 2 cells */}
                                        <td rowSpan={2} className={`${tdClass} text-center font-bold bg-gray-50 dark:bg-slate-900 text-[14px]`}>
                                            {(totals[bid] || 0).toLocaleString()}
                                        </td>
                                        <td rowSpan={2} className={`${tdClass} align-top p-1 bg-white dark:bg-slate-800`}>
                                            <Form.Item name={['bills', bid, 'PAYMENT_METHOD']} noStyle>
                                                <Select size="small" style={{ width: '100%' }}>
                                                    <Option value="cash">Cash</Option>
                                                    <Option value="cheque">Cheque</Option>
                                                </Select>
                                            </Form.Item>
                                            <Form.Item name={['bills', bid, 'REMARK']} noStyle>
                                                <Input size="small" placeholder="Remark" className="mt-1" />
                                            </Form.Item>
                                        </td>
                                        <td rowSpan={2} className={`${tdClass} align-top p-1 bg-white dark:bg-slate-800`}>
                                            <Form.Item dependencies={[['bills', bid, 'PAYMENT_METHOD']]} noStyle>
                                                {() => {
                                                    const pMethod = form.getFieldValue(['bills', bid, 'PAYMENT_METHOD']);
                                                    if (pMethod !== 'cheque') {
                                                        return <div className="text-gray-400 dark:text-gray-500 italic text-[11px] text-center pt-2">N/A (Cash)</div>;
                                                    }
                                                    return (
                                                        <Form.List name={['bills', bid, 'CHEQUES']}>
                                                            {(fields, { add, remove }) => (
                                                                <div className="flex flex-col gap-1">
                                                                    {fields.map(({ key, name, ...restField }) => (
                                                                        <div key={key} className="flex gap-1 items-start bg-gray-50 dark:bg-slate-700 p-1 rounded border dark:border-slate-600">
                                                                            <div className="flex-1 flex flex-col gap-1">
                                                                                <div className="flex gap-1">
                                                                                    <Form.Item {...restField} name={[name, 'CHEQUE_NUMBER']} noStyle rules={[{ required: true }]}>
                                                                                        <Input size="small" placeholder="Chq No" />
                                                                                    </Form.Item>
                                                                                    <Form.Item {...restField} name={[name, 'AMOUNT']} noStyle rules={[{ required: true }]}>
                                                                                        <InputNumber size="small" placeholder="Amount" controls={false} style={{ width: '100%' }} />
                                                                                    </Form.Item>
                                                                                </div>
                                                                                <div className="flex gap-1">
                                                                                    <Form.Item {...restField} name={[name, 'BANK']} noStyle>
                                                                                        <Input size="small" placeholder="Bank" />
                                                                                    </Form.Item>
                                                                                    <Form.Item {...restField} name={[name, 'DUE_DATE']} noStyle rules={[{ required: true }]}>
                                                                                        <DatePicker size="small" style={{ width: '100%' }} format="YYYY-MM-DD" />
                                                                                    </Form.Item>
                                                                                </div>
                                                                            </div>
                                                                            <MinusCircleOutlined onClick={() => remove(name)} className="text-red-500 mt-1 cursor-pointer" />
                                                                        </div>
                                                                    ))}
                                                                    <Button type="dashed" size="small" onClick={() => add()} icon={<PlusOutlined />} className="text-xs">
                                                                        Add Cheque
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </Form.List>
                                                    );
                                                }}
                                            </Form.Item>
                                        </td>
                                    </tr>

                                    {/* N Row */}
                                    <tr>
                                        <td className={`${tdClass} text-center font-bold bg-gray-100 dark:bg-slate-700`}>N</td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'N5_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'N5_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'N10_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'N10_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'N25_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['bills', bid, 'items', 'N25_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
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
                                                <Button 
                                                    type="text" 
                                                    danger 
                                                    size="small" 
                                                    icon={<DeleteOutlined />} 
                                                    onClick={() => removeExtraRow(id)} 
                                                />
                                            </div>
                                            <div className="text-[10px] font-normal text-gray-500 dark:text-gray-400">(Auto Invoice)</div>
                                        </td>
                                        <td className={`${tdClass} text-center font-bold bg-amber-100 dark:bg-amber-900/50`}>P</td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'P5_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'P5_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'P10_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'P10_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'P25_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'P25_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        
                                        {/* RowSpan 2 cells */}
                                        <td rowSpan={2} className={`${tdClass} text-center font-bold bg-amber-50 dark:bg-amber-950/30 text-[14px]`}>
                                            {extraTotal.toLocaleString()}
                                        </td>
                                        <td rowSpan={2} className={`${tdClass} align-top p-1 bg-white dark:bg-slate-800`}>
                                            <Form.Item name={['extras', id, 'PAYMENT_METHOD']} noStyle>
                                                <Select size="small" style={{ width: '100%' }}>
                                                    <Option value="cash">Cash</Option>
                                                    <Option value="cheque">Cheque</Option>
                                                </Select>
                                            </Form.Item>
                                            <Form.Item name={['extras', id, 'REMARK']} noStyle>
                                                <Input size="small" placeholder="Remark" className="mt-1" />
                                            </Form.Item>
                                        </td>
                                        <td rowSpan={2} className={`${tdClass} align-top p-1 bg-white dark:bg-slate-800`}>
                                            <Form.Item dependencies={[['extras', id, 'PAYMENT_METHOD']]} noStyle>
                                                {() => {
                                                    const pMethod = form.getFieldValue(['extras', id, 'PAYMENT_METHOD']);
                                                    if (pMethod !== 'cheque') {
                                                        return <div className="text-gray-400 dark:text-gray-500 italic text-[11px] text-center pt-2">N/A (Cash)</div>;
                                                    }
                                                    return (
                                                        <Form.List name={['extras', id, 'CHEQUES']}>
                                                            {(fields, { add, remove }) => (
                                                                <div className="flex flex-col gap-1">
                                                                    {fields.map(({ key, name, ...restField }) => (
                                                                        <div key={key} className="flex gap-1 items-start bg-gray-50 dark:bg-slate-700 p-1 rounded border dark:border-slate-600">
                                                                            <div className="flex-1 flex flex-col gap-1">
                                                                                <div className="flex gap-1">
                                                                                    <Form.Item {...restField} name={[name, 'CHEQUE_NUMBER']} noStyle rules={[{ required: true }]}>
                                                                                        <Input size="small" placeholder="Chq No" />
                                                                                    </Form.Item>
                                                                                    <Form.Item {...restField} name={[name, 'AMOUNT']} noStyle rules={[{ required: true }]}>
                                                                                        <InputNumber size="small" placeholder="Amount" controls={false} style={{ width: '100%' }} />
                                                                                    </Form.Item>
                                                                                </div>
                                                                                <div className="flex gap-1">
                                                                                    <Form.Item {...restField} name={[name, 'BANK']} noStyle>
                                                                                        <Input size="small" placeholder="Bank" />
                                                                                    </Form.Item>
                                                                                    <Form.Item {...restField} name={[name, 'DUE_DATE']} noStyle rules={[{ required: true }]}>
                                                                                        <DatePicker size="small" style={{ width: '100%' }} format="YYYY-MM-DD" />
                                                                                    </Form.Item>
                                                                                </div>
                                                                            </div>
                                                                            <MinusCircleOutlined onClick={() => remove(name)} className="text-red-500 mt-1 cursor-pointer" />
                                                                        </div>
                                                                    ))}
                                                                    <Button type="dashed" size="small" onClick={() => add()} icon={<PlusOutlined />} className="text-xs">
                                                                        Add Cheque
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </Form.List>
                                                    );
                                                }}
                                            </Form.Item>
                                        </td>
                                    </tr>

                                    {/* N Row */}
                                    <tr>
                                        <td className={`${tdClass} text-center font-bold bg-amber-100 dark:bg-amber-900/50`}>N</td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'N5_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'N5_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'N10_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'N10_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'N25_price']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                        <td className={tdClass}>
                                            <Form.Item name={['extras', id, 'items', 'N25_qty']} noStyle><InputNumber controls={false} style={inputStyle} /></Form.Item>
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {isSettled ? (
                <div className="flex justify-end items-center mt-4 border-t dark:border-gray-700 pt-4">
                    <Button type="primary" onClick={onCancel}>Close</Button>
                </div>
            ) : (
                <div className="flex justify-between items-center mt-4 border-t dark:border-gray-700 pt-4">
                    <Button type="dashed" icon={<PlusOutlined />} onClick={addExtraRow} className="dark:text-white dark:border-gray-600">
                        Add Extra Handwritten Invoice
                    </Button>
                    <Space>
                        <Button onClick={onCancel} disabled={submitting}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={submitting}>Settle Dispatch Note</Button>
                    </Space>
                </div>
            )}
        </Form>
    );
}
