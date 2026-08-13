import React, { useState, useEffect } from 'react';
import { Form, Input, Button, DatePicker, Select, Divider, InputNumber, Row, Col, Typography, message, Space } from 'antd';
import { PlusOutlined, MinusCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';

const { Title, Text } = Typography;

export default function SettleSaleForm({ bill, onSuccess, onCancel }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState(bill?.PAYMENT_METHOD || 'cash');
    const [systemItems, setSystemItems] = useState({ P: null, N: null });

    const [rowsP, setRowsP] = useState({
        5: { price: 0, qty: 0 },
        10: { price: 0, qty: 0 },
        25: { price: 0, qty: 0 }
    });

    const [rowsN, setRowsN] = useState({
        5: { price: 0, qty: 0 },
        10: { price: 0, qty: 0 },
        25: { price: 0, qty: 0 }
    });

    const printedSubTotal = Number(bill?.PRINTED_SUB_TOTAL || bill?.TOTAL_AMOUNT || 0);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const itemList = await db.items.toArray();
        const pItem = (itemList || []).find(i => i.SYSTEM_CODE === 'OUT_SAMBA' || i.NAME?.toLowerCase().includes('samba') || i.CODE === 'P');
        const nItem = (itemList || []).find(i => i.SYSTEM_CODE === 'OUT_NADU' || i.NAME?.toLowerCase().includes('nadu') || i.CODE === 'N');

        setSystemItems({ 
            P: pItem || { ITEM_ID: 1, NAME: 'Samba Rice', CODE: 'P', SELLING_PRICE: 191.58 }, 
            N: nItem || { ITEM_ID: 2, NAME: 'Nadu Rice', CODE: 'N', SELLING_PRICE: 179.56 } 
        });

        const pPricePerKg = parseFloat(pItem?.SELLING_PRICE || 191.58);
        const nPricePerKg = parseFloat(nItem?.SELLING_PRICE || 179.56);

        setRowsP({
            5: { price: parseFloat((pPricePerKg * 5).toFixed(2)), qty: 0 },
            10: { price: parseFloat((pPricePerKg * 10).toFixed(2)), qty: 0 },
            25: { price: parseFloat((pPricePerKg * 25).toFixed(2)), qty: 0 }
        });

        setRowsN({
            5: { price: parseFloat((nPricePerKg * 5).toFixed(2)), qty: 0 },
            10: { price: parseFloat((nPricePerKg * 10).toFixed(2)), qty: 0 },
            25: { price: parseFloat((nPricePerKg * 25).toFixed(2)), qty: 0 }
        });

        form.setFieldsValue({
            DISCOUNT: bill?.DISCOUNT || 0,
            PAYMENT_METHOD: bill?.PAYMENT_METHOD || 'cash',
            PAID_AMOUNT: bill?.NET_AMOUNT || printedSubTotal
        });
    };

    const handleRowChange = (type, weight, field, value) => {
        const val = value || 0;
        if (type === 'P') {
            setRowsP(prev => ({ ...prev, [weight]: { ...prev[weight], [field]: val } }));
        } else {
            setRowsN(prev => ({ ...prev, [weight]: { ...prev[weight], [field]: val } }));
        }
    };

    const calculateHandwrittenTotal = () => {
        let total = 0;
        [5, 10, 25].forEach(w => {
            total += (Number(rowsP[w].price || 0) * Number(rowsP[w].qty || 0));
            total += (Number(rowsN[w].price || 0) * Number(rowsN[w].qty || 0));
        });
        return parseFloat(total.toFixed(2));
    };

    const hwTotal = calculateHandwrittenTotal();
    const grossTotal = printedSubTotal + hwTotal;
    const discount = Form.useWatch('DISCOUNT', form) || 0;
    const netTotal = Math.max(0, grossTotal - discount);

    const handleFinish = async (values) => {
        setLoading(true);
        try {
            const hwItems = [];
            const addHwItem = (type, weight, rowData) => {
                if (rowData.qty > 0) {
                    const itemDb = type === 'P' ? systemItems.P : systemItems.N;
                    hwItems.push({
                        ITEM_ID: itemDb.ITEM_ID,
                        ITEM_NAME: itemDb.NAME,
                        SYSTEM_CODE: type === 'P' ? 'OUT_SAMBA' : 'OUT_NADU',
                        CODE: itemDb.CODE || type,
                        BAG_WEIGHT: weight,
                        BAG_COUNT: rowData.qty,
                        QUANTITY: weight * rowData.qty,
                        UNIT_PRICE: rowData.price,
                        TOTAL_PRICE: parseFloat((rowData.price * rowData.qty).toFixed(2)),
                        IS_HANDWRITTEN: 1
                    });
                }
            };

            [5, 10, 25].forEach(w => {
                addHwItem('P', w, rowsP[w]);
                addHwItem('N', w, rowsN[w]);
            });

            const cheques = (values.CHEQUES || []).map(c => ({
                CHEQUE_NUMBER: c.CHEQUE_NUMBER,
                BANK: c.BANK,
                DUE_DATE: c.DUE_DATE ? c.DUE_DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                AMOUNT: c.AMOUNT || 0
            }));

            const updatedBill = {
                ...bill,
                HANDWRITTEN_SUB_TOTAL: hwTotal,
                DISCOUNT: values.DISCOUNT || 0,
                FINAL_AMOUNT: netTotal,
                NET_AMOUNT: netTotal,
                PAID_AMOUNT: values.PAID_AMOUNT || netTotal,
                PAYMENT_METHOD: values.PAYMENT_METHOD || 'cash',
                IS_SETTLED: 1,
                IS_SETTLED_UPDATE: true,
                HANDWRITTEN_ITEMS: hwItems,
                CHEQUES: cheques,
                IS_SYNCED: 0
            };

            await db.sales_bills.update(bill.LOCAL_ID, updatedBill);
            message.success(`Bill #${bill.INVOICE_NO} settled successfully!`);

            if (onSuccess) onSuccess();

            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Error settling bill:', e);
            message.error('Failed to settle bill');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Form form={form} layout="vertical" onFinish={handleFinish}>
            <div className="space-y-4">
                {/* Summary Box */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex justify-between items-center text-xs">
                    <div>
                        <span className="text-gray-500">Bill No:</span> <strong className="font-mono text-blue-900">{bill?.INVOICE_NO}</strong>
                    </div>
                    <div>
                        <span className="text-gray-500">Customer:</span> <strong>{bill?.CUSTOMER_NAME || 'Walk-in Customer'}</strong>
                    </div>
                    <div>
                        <span className="text-gray-500">Printed Total:</span> <strong className="font-mono">Rs. {printedSubTotal.toFixed(2)}</strong>
                    </div>
                </div>

                {/* Handwritten Extra Orders */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                    <div className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                        📝 Handwritten Extra Orders (Delivered by Driver)
                    </div>

                    {/* Samba HW */}
                    <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                        <div className="font-bold text-blue-900 text-xs mb-2">P (Samba Rice) Extras</div>
                        <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-500 pb-1 border-b border-slate-100">
                            <div className="col-span-3">Bag Size</div>
                            <div className="col-span-3">Price / Bag</div>
                            <div className="col-span-3">Qty (Bags)</div>
                            <div className="col-span-3 text-right">Total</div>
                        </div>
                        {[5, 10, 25].map(w => (
                            <div key={`hw-p-${w}`} className="grid grid-cols-12 gap-2 items-center py-1 border-b border-slate-100 last:border-0">
                                <div className="col-span-3 font-medium text-xs">{w} kg</div>
                                <div className="col-span-3">
                                    <InputNumber
                                        size="small"
                                        className="w-full"
                                        value={rowsP[w].price}
                                        onChange={v => handleRowChange('P', w, 'price', v)}
                                    />
                                </div>
                                <div className="col-span-3">
                                    <InputNumber
                                        size="small"
                                        className="w-full font-bold"
                                        min={0}
                                        value={rowsP[w].qty}
                                        onChange={v => handleRowChange('P', w, 'qty', v)}
                                    />
                                </div>
                                <div className="col-span-3 text-right font-mono text-xs font-bold text-slate-800">
                                    Rs. {(rowsP[w].price * rowsP[w].qty).toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Nadu HW */}
                    <div className="bg-white rounded-lg border border-slate-200 p-2.5">
                        <div className="font-bold text-emerald-900 text-xs mb-2">N (Nadu Rice) Extras</div>
                        <div className="grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-500 pb-1 border-b border-slate-100">
                            <div className="col-span-3">Bag Size</div>
                            <div className="col-span-3">Price / Bag</div>
                            <div className="col-span-3">Qty (Bags)</div>
                            <div className="col-span-3 text-right">Total</div>
                        </div>
                        {[5, 10, 25].map(w => (
                            <div key={`hw-n-${w}`} className="grid grid-cols-12 gap-2 items-center py-1 border-b border-slate-100 last:border-0">
                                <div className="col-span-3 font-medium text-xs">{w} kg</div>
                                <div className="col-span-3">
                                    <InputNumber
                                        size="small"
                                        className="w-full"
                                        value={rowsN[w].price}
                                        onChange={v => handleRowChange('N', w, 'price', v)}
                                    />
                                </div>
                                <div className="col-span-3">
                                    <InputNumber
                                        size="small"
                                        className="w-full font-bold"
                                        min={0}
                                        value={rowsN[w].qty}
                                        onChange={v => handleRowChange('N', w, 'qty', v)}
                                    />
                                </div>
                                <div className="col-span-3 text-right font-mono text-xs font-bold text-slate-800">
                                    Rs. {(rowsN[w].price * rowsN[w].qty).toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Settlement Financials */}
                <Row gutter={16}>
                    <Col xs={12}>
                        <Form.Item label="Discount (Rs)" name="DISCOUNT">
                            <InputNumber min={0} className="w-full" />
                        </Form.Item>
                    </Col>
                    <Col xs={12}>
                        <Form.Item label="Payment Method" name="PAYMENT_METHOD">
                            <Select onChange={val => setPaymentMethod(val)}>
                                <Select.Option value="cash">Cash</Select.Option>
                                <Select.Option value="cheque">Cheque</Select.Option>
                                <Select.Option value="credit">Credit / Account</Select.Option>
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>

                {/* Cheques Dynamic Form */}
                {paymentMethod === 'cheque' && (
                    <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200">
                        <div className="text-xs font-bold text-amber-900 mb-2">Cheque Details</div>
                        <Form.List name="CHEQUES" initialValue={[{}]}>
                            {(fields, { add, remove }) => (
                                <div className="space-y-2">
                                    {fields.map(field => (
                                        <Row key={field.key} gutter={8} align="middle">
                                            <Col span={7}>
                                                <Form.Item {...field} name={[field.name, 'CHEQUE_NUMBER']} rules={[{ required: true, message: 'Req' }]}>
                                                    <Input size="small" placeholder="Cheque No" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={6}>
                                                <Form.Item {...field} name={[field.name, 'BANK']}>
                                                    <Input size="small" placeholder="Bank" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={5}>
                                                <Form.Item {...field} name={[field.name, 'DUE_DATE']} rules={[{ required: true, message: 'Req' }]}>
                                                    <DatePicker size="small" className="w-full" placeholder="Due Date" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={5}>
                                                <Form.Item {...field} name={[field.name, 'AMOUNT']} rules={[{ required: true, message: 'Req' }]}>
                                                    <InputNumber size="small" className="w-full" placeholder="Amount" />
                                                </Form.Item>
                                            </Col>
                                            <Col span={1}>
                                                {fields.length > 1 && <MinusCircleOutlined onClick={() => remove(field.name)} />}
                                            </Col>
                                        </Row>
                                    ))}
                                    <Button type="dashed" size="small" onClick={() => add()} block icon={<PlusOutlined />}>
                                        Add Another Cheque
                                    </Button>
                                </div>
                            )}
                        </Form.List>
                    </div>
                )}

                {/* Final Net Total */}
                <div className="bg-blue-950 text-white p-4 rounded-xl flex justify-between items-center">
                    <div>
                        <div className="text-xs text-blue-200 uppercase font-semibold">Gross: Rs. {grossTotal.toFixed(2)} | Discount: Rs. {Number(discount).toFixed(2)}</div>
                        <div className="text-sm font-bold text-white">Final Net Settled Amount:</div>
                    </div>
                    <div className="text-2xl font-black font-mono">
                        Rs. {netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button onClick={onCancel}>Cancel</Button>
                    <Button 
                        type="primary" 
                        htmlType="submit" 
                        loading={loading}
                        icon={<CheckCircleOutlined />}
                        className="!bg-emerald-600 font-bold px-6 shadow-md"
                    >
                        Confirm & Settle Sale
                    </Button>
                </div>
            </div>
        </Form>
    );
}
