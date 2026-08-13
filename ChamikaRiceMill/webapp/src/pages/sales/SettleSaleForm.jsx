import React, { useState, useEffect } from 'react';
import { Form, Input, Button, DatePicker, Select, Divider, InputNumber, Row, Col, Typography, message, Space } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

export default function SettleSaleForm({ bill, onSuccess, onCancel }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState(bill?.PAYMENT_METHOD || 'cash');
    const [systemItems, setSystemItems] = useState({ P: null, N: null });
    const [existingCheques, setExistingCheques] = useState([]);

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

    useEffect(() => {
        fetchSystemItems();
        fetchExistingCheques();
    }, []);

    const fetchExistingCheques = async () => {
        try {
            const res = await axios.get(`/api/mill/sales/${bill.BILL_ID}`, { withCredentials: true });
            if (res.data.success && res.data.result.CHEQUES && res.data.result.CHEQUES.length > 0) {
                setExistingCheques(res.data.result.CHEQUES);
                // If the bill hasn't been explicitly settled as cash, default to cheque since they added one
                if (!bill.IS_SETTLED || bill.PAYMENT_METHOD === 'cash') {
                    setPaymentMethod('cheque');
                    form.setFieldsValue({ PAYMENT_METHOD: 'cheque' });
                }
            }
        } catch (e) {
            console.error('Failed to fetch existing cheques', e);
        }
    };

    const fetchSystemItems = async () => {
        try {
            const res = await axios.post('/api/MillgetAllItems', {}, { withCredentials: true });
            if (res.data.success) {
                const pItem = res.data.result.find(i => i.SYSTEM_CODE === 'OUT_SAMBA');
                const nItem = res.data.result.find(i => i.SYSTEM_CODE === 'OUT_NADU');
                setSystemItems({ P: pItem, N: nItem });

                const pPricePerKg = parseFloat(pItem?.SELLING_PRICE || 0);
                const nPricePerKg = parseFloat(nItem?.SELLING_PRICE || 0);

                if (pPricePerKg > 0) {
                    setRowsP({
                        5: { price: parseFloat((pPricePerKg * 5).toFixed(2)), qty: 0 },
                        10: { price: parseFloat((pPricePerKg * 10).toFixed(2)), qty: 0 },
                        25: { price: parseFloat((pPricePerKg * 25).toFixed(2)), qty: 0 }
                    });
                }

                if (nPricePerKg > 0) {
                    setRowsN({
                        5: { price: parseFloat((nPricePerKg * 5).toFixed(2)), qty: 0 },
                        10: { price: parseFloat((nPricePerKg * 10).toFixed(2)), qty: 0 },
                        25: { price: parseFloat((nPricePerKg * 25).toFixed(2)), qty: 0 }
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch items', e);
        }
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
            total += (rowsP[w].price * rowsP[w].qty);
            total += (rowsN[w].price * rowsN[w].qty);
        });
        return total;
    };

    // Whenever handwritten rows change, update the form field automatically
    useEffect(() => {
        const hwTotal = calculateHandwrittenTotal();
        form.setFieldsValue({ HANDWRITTEN_SUB_TOTAL: hwTotal });
        const printed = parseFloat(bill.PRINTED_SUB_TOTAL || 0);
        const discount = parseFloat(form.getFieldValue('DISCOUNT') || 0);
        form.setFieldsValue({ FINAL_AMOUNT: printed + hwTotal - discount });
    }, [rowsP, rowsN, bill, form]);

    const handleValuesChange = (changedValues, allValues) => {
        if (changedValues.PAYMENT_METHOD) {
            setPaymentMethod(changedValues.PAYMENT_METHOD);
        }

        if (changedValues.HANDWRITTEN_SUB_TOTAL !== undefined || changedValues.DISCOUNT !== undefined) {
            const printed = parseFloat(bill.PRINTED_SUB_TOTAL || 0);
            const handwritten = parseFloat(allValues.HANDWRITTEN_SUB_TOTAL || 0);
            const discount = parseFloat(allValues.DISCOUNT || 0);
            form.setFieldsValue({
                FINAL_AMOUNT: printed + handwritten - discount
            });
        }
    };

    const handleFinish = async (values) => {
        setLoading(true);
        try {
            const cheques = values.CHEQUES?.map(chq => ({
                ...chq,
                DUE_DATE: chq.DUE_DATE ? chq.DUE_DATE.format('YYYY-MM-DD') : null
            })) || [];

            const items = [];
            const addRowToItems = (type, weight, rowData) => {
                if (rowData.qty > 0) {
                    const itemDb = type === 'P' ? systemItems.P : systemItems.N;
                    if (itemDb) {
                        items.push({
                            ITEM_ID: itemDb.ITEM_ID,
                            BAG_WEIGHT: weight,
                            BAG_COUNT: rowData.qty,
                            QUANTITY: weight * rowData.qty,
                            UNIT_PRICE: rowData.price,
                            TOTAL_PRICE: rowData.price * rowData.qty
                        });
                    }
                }
            };
            [5, 10, 25].forEach(w => {
                addRowToItems('P', w, rowsP[w]);
                addRowToItems('N', w, rowsN[w]);
            });

            const payload = {
                BILL_ID: bill.BILL_ID,
                HANDWRITTEN_SUB_TOTAL: values.HANDWRITTEN_SUB_TOTAL || 0,
                DISCOUNT: values.DISCOUNT || 0,
                FINAL_AMOUNT: values.FINAL_AMOUNT || 0,
                PAYMENT_METHOD: values.PAYMENT_METHOD,
                CHEQUES: cheques,
                REMARK: values.REMARK,
                ITEMS: items
            };

            const response = await axios.post('/api/mill/sales/settle', payload, { withCredentials: true });
            
            if (response.data.success) {
                message.success('Bill Settled Successfully!');
                onSuccess();
            } else {
                message.error(response.data.message || 'Failed to settle bill');
            }
        } catch (error) {
            console.error('Error settling sale:', error);
            message.error('Failed to settle bill');
        } finally {
            setLoading(false);
        }
    };

    const renderRows = (type, title) => (
        <div className="mb-6 p-4 bg-gray-50 border rounded-lg dark:bg-[#18181b] dark:border-white/10">
            <Title level={5} className="!mb-4 dark:text-gray-200">{title}</Title>
            <Row gutter={[16, 16]} className="mb-2 font-semibold dark:text-gray-300">
                <Col span={4}>Bag Size</Col>
                <Col span={8}>Price of One Bag (Rs)</Col>
                <Col span={6}>Qty (Bags)</Col>
                <Col span={6} className="text-right">Total (Rs)</Col>
            </Row>
            {[5, 10, 25].map(weight => {
                const row = type === 'P' ? rowsP[weight] : rowsN[weight];
                return (
                    <Row gutter={[16, 16]} className="mb-2 items-center" key={`${type}-${weight}`}>
                        <Col span={4}><Text strong>{weight}kg</Text></Col>
                        <Col span={8}>
                            <InputNumber 
                                className="w-full" min={0} placeholder="Price"
                                value={row.price} onChange={(val) => handleRowChange(type, weight, 'price', val)}
                            />
                        </Col>
                        <Col span={6}>
                            <InputNumber 
                                className="w-full" min={0} placeholder="Qty"
                                value={row.qty} onChange={(val) => handleRowChange(type, weight, 'qty', val)}
                            />
                        </Col>
                        <Col span={6} className="text-right">
                            <Text>{(row.price * row.qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                        </Col>
                    </Row>
                );
            })}
        </div>
    );

    const initialValues = {
        HANDWRITTEN_SUB_TOTAL: parseFloat(bill.HANDWRITTEN_SUB_TOTAL || 0),
        DISCOUNT: parseFloat(bill.DISCOUNT || 0),
        FINAL_AMOUNT: parseFloat(bill.FINAL_AMOUNT || bill.PRINTED_SUB_TOTAL || 0),
        PAYMENT_METHOD: bill.PAYMENT_METHOD === 'cheque' ? 'cheque' : 'cash',
        CHEQUES: []
    };

    return (
        <Form 
            form={form} 
            layout="vertical" 
            onFinish={handleFinish} 
            initialValues={initialValues}
            onValuesChange={handleValuesChange}
        >
            <div className="bg-gray-50 p-4 rounded-lg mb-6 border dark:bg-[#18181b] dark:border-white/10">
                <Row justify="space-between">
                    <Col><Text type="secondary">Invoice No:</Text> <Text strong className="dark:text-gray-200">{bill.INVOICE_NO}</Text></Col>
                    <Col><Text type="secondary">Printed Sub Total:</Text> <Text strong className="text-blue-600 dark:text-blue-400">Rs. {parseFloat(bill.PRINTED_SUB_TOTAL || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text></Col>
                </Row>
            </div>

            <Divider>Handwritten Extra Items (Optional)</Divider>
            {renderRows('P', 'P - Samba Rice')}
            {renderRows('N', 'N - Nadu Rice')}

            <Divider>Totals</Divider>
            <Row gutter={16}>
                <Col span={12}>
                    <Form.Item name="HANDWRITTEN_SUB_TOTAL" label="Handwritten Sub Total (Rs)">
                        <InputNumber className="w-full" min={0} readOnly />
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item name="DISCOUNT" label="Discount (Rs)">
                        <InputNumber className="w-full" min={0} />
                    </Form.Item>
                </Col>
            </Row>

            <Form.Item name="FINAL_AMOUNT" label="Final Amount (Rs)" rules={[{ required: true, message: 'Final amount is required' }]}>
                <InputNumber className="w-full" min={0} size="large" style={{ fontWeight: 'bold' }} readOnly />
            </Form.Item>

            <Divider>Payment Details</Divider>

            <Form.Item name="PAYMENT_METHOD" label="Payment Method">
                <Select>
                    <Select.Option value="cash">Cash</Select.Option>
                    <Select.Option value="cheque">Cheque</Select.Option>
                </Select>
            </Form.Item>

            {paymentMethod === 'cash' && (
                <Form.Item name="REMARK" label="Remark (Optional)">
                    <Input.TextArea placeholder="Enter any remarks for cash payment" rows={2} />
                </Form.Item>
            )}

            {paymentMethod === 'cheque' && (
                <div className="bg-gray-50 p-4 rounded-lg border mt-4 mb-4 dark:bg-[#18181b] dark:border-white/10">
                    <Title level={5} className="!mb-4 dark:text-gray-200">Cheque Details</Title>
                    
                    {existingCheques.length > 0 && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md dark:bg-blue-900/20 dark:border-blue-800">
                            <Text type="secondary" className="mb-2 block">Existing cheques for this bill:</Text>
                            <ul className="list-disc pl-5">
                                {existingCheques.map(c => (
                                    <li key={c.CHEQUE_ID}>
                                        <Text strong>{c.CHEQUE_NUMBER}</Text> - Rs. {parseFloat(c.AMOUNT).toLocaleString()} (Due: {new Date(c.DUE_DATE).toLocaleDateString()})
                                    </li>
                                ))}
                            </ul>
                            <Text type="secondary" className="text-xs italic mt-2 block">* Existing cheques will be kept. Add new ones below if needed.</Text>
                        </div>
                    )}

                    <Form.List name="CHEQUES">
                        {(fields, { add, remove }) => (
                            <>
                                {fields.map(({ key, name, ...restField }) => (
                                    <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline" className="w-full flex-wrap sm:flex-nowrap">
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'CHEQUE_NUMBER']}
                                            rules={[{ required: true, message: 'Missing Cheque No' }]}
                                        >
                                            <Input placeholder="Cheque Number" />
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'BANK']}
                                        >
                                            <Input placeholder="Bank Name" />
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'DUE_DATE']}
                                            rules={[{ required: true, message: 'Missing Date' }]}
                                        >
                                            <DatePicker placeholder="Due Date" />
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'AMOUNT']}
                                            rules={[{ required: true, message: 'Missing Amount' }]}
                                        >
                                            <InputNumber placeholder="Amount" min={1} />
                                        </Form.Item>
                                        <MinusCircleOutlined onClick={() => remove(name)} className="text-red-500" />
                                    </Space>
                                ))}
                                <Form.Item>
                                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                        Add Cheque
                                    </Button>
                                </Form.Item>
                            </>
                        )}
                    </Form.List>
                </div>
            )}

            <div className="flex justify-end gap-3 mt-8">
                <Button onClick={onCancel}>Cancel</Button>
                <Button type="primary" htmlType="submit" loading={loading}>
                    Settle Bill
                </Button>
            </div>
        </Form>
    );
}
