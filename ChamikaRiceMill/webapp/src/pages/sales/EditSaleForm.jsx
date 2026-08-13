import React, { useState, useEffect } from 'react';
import { Form, Input, Button, DatePicker, Select, InputNumber, Divider, Typography, message, Spin } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import axios from 'axios';
import moment from 'moment';
import Cookies from 'js-cookie';

const { Title, Text } = Typography;
const { Option } = Select;

export default function EditSaleForm({ billId, onSuccess, onCancel }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [items, setItems] = useState([]);
    
    // Derived state
    const [totalAmount, setTotalAmount] = useState(0);
    const [netAmount, setNetAmount] = useState(0);
    const [discount, setDiscount] = useState(0);
    const [billData, setBillData] = useState(null);

    useEffect(() => {
        fetchCustomers();
        fetchItems();
        if (billId) {
            fetchBillDetails();
        }
    }, [billId]);

    const fetchCustomers = async () => {
        try {
            const res = await axios.post('/api/MillgetAllCustomers', {}, { withCredentials: true });
            if (res.data.success) {
                setCustomers(res.data.result || []);
            }
        } catch (error) {
            console.error('Error fetching customers:', error);
        }
    };

    const fetchItems = async () => {
        try {
            const res = await axios.get('/api/mill/items', { withCredentials: true });
            if (res.data.success) {
                setItems(res.data.result || []);
            }
        } catch (error) {
            console.error('Error fetching items:', error);
        }
    };

    const fetchBillDetails = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/mill/sales/${billId}`, { withCredentials: true });
            if (res.data.success) {
                const data = res.data.result;
                setBillData(data);
                
                const printedItems = (data.ITEMS || []).filter(i => !i.IS_HANDWRITTEN);
                
                form.setFieldsValue({
                    DATE: moment(data.DATE),
                    BATCH_NO: data.BATCH_NO,
                    CUSTOMER_ID: data.CUSTOMER_ID,
                    DISCOUNT: data.DISCOUNT,
                    items: printedItems.map(item => ({
                        ITEM_ID: item.ITEM_ID,
                        BAG_WEIGHT: item.BAG_WEIGHT,
                        BAG_COUNT: item.BAG_COUNT,
                        QUANTITY: item.QUANTITY,
                        UNIT_PRICE: item.UNIT_PRICE,
                        TOTAL_PRICE: item.TOTAL_PRICE
                    }))
                });
                
                setDiscount(data.DISCOUNT || 0);
                calculateTotals();
            }
        } catch (error) {
            console.error('Failed to load bill:', error);
            message.error('Failed to load bill details');
        } finally {
            setLoading(false);
        }
    };

    const calculateTotals = () => {
        const formValues = form.getFieldsValue();
        const currentItems = formValues.items || [];
        
        let total = 0;
        currentItems.forEach(item => {
            if (item && item.TOTAL_PRICE) {
                total += parseFloat(item.TOTAL_PRICE) || 0;
            }
        });
        
        setTotalAmount(total);
        const currentDiscount = parseFloat(form.getFieldValue('DISCOUNT')) || 0;
        setNetAmount(total - currentDiscount);
    };

    const handleValuesChange = (changedValues, allValues) => {
        if (changedValues.items) {
            const newItems = [...allValues.items];
            changedValues.items.forEach((changedItem, index) => {
                if (changedItem) {
                    const item = newItems[index];
                    if (item) {
                        // Calculate Quantity if Bag details provided
                        if ('BAG_WEIGHT' in changedItem || 'BAG_COUNT' in changedItem) {
                            const weight = parseFloat(item.BAG_WEIGHT) || 0;
                            const count = parseFloat(item.BAG_COUNT) || 0;
                            item.QUANTITY = weight * count;
                            form.setFieldsValue({ items: newItems });
                        }
                        
                        // Calculate Total Price
                        if ('QUANTITY' in changedItem || 'UNIT_PRICE' in changedItem || 'BAG_WEIGHT' in changedItem || 'BAG_COUNT' in changedItem) {
                            const qty = parseFloat(item.QUANTITY) || 0;
                            const price = parseFloat(item.UNIT_PRICE) || 0;
                            item.TOTAL_PRICE = qty * price;
                            form.setFieldsValue({ items: newItems });
                        }
                    }
                }
            });
        }
        
        if ('DISCOUNT' in changedValues) {
            setDiscount(parseFloat(changedValues.DISCOUNT) || 0);
        }
        
        calculateTotals();
    };

    const handleFinish = async (values) => {
        setSubmitting(true);
        try {
            const userCookie = Cookies.get('millUser');
            let createdBy = null;
            if (userCookie) {
                createdBy = JSON.parse(userCookie).USER_ID;
            }

            const payload = {
                BILL_ID: billId,
                INVOICE_NO: billData.INVOICE_NO, // keep original
                BATCH_NO: values.BATCH_NO,
                CUSTOMER_ID: values.CUSTOMER_ID,
                TOTAL_AMOUNT: totalAmount,
                DISCOUNT: discount,
                NET_AMOUNT: netAmount,
                DATE: values.DATE.format('YYYY-MM-DD'),
                ITEMS: values.items.filter(i => i && i.ITEM_ID && i.QUANTITY && i.TOTAL_PRICE),
                CREATED_BY: createdBy
            };

            const response = await axios.post('/api/mill/sales/edit', payload, { withCredentials: true });
            
            if (response.data.success) {
                message.success('Sale updated successfully');
                if (onSuccess) onSuccess();
            } else {
                message.error(response.data.message || 'Failed to update sale');
            }
        } catch (error) {
            console.error('Error updating sale:', error);
            message.error(error.response?.data?.message || 'Failed to update sale');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center p-12"><Spin size="large" /></div>;
    }

    return (
        <Form
            form={form}
            layout="vertical"
            onFinish={handleFinish}
            onValuesChange={handleValuesChange}
            initialValues={{
                DATE: moment(),
                DISCOUNT: 0,
                items: [{}]
            }}
            className="flex flex-col h-full"
        >
            <div className="flex-1 overflow-y-auto pr-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Form.Item
                        name="DATE"
                        label="Date"
                        rules={[{ required: true }]}
                    >
                        <DatePicker className="w-full" format="YYYY-MM-DD" />
                    </Form.Item>
                    
                    <Form.Item
                        name="BATCH_NO"
                        label="Batch No"
                    >
                        <Input placeholder="Optional" />
                    </Form.Item>
                    
                    <Form.Item
                        name="CUSTOMER_ID"
                        label="Customer"
                    >
                        <Select
                            showSearch
                            allowClear
                            placeholder="Select Customer (Walk-in if empty)"
                            optionFilterProp="children"
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            options={customers.map(c => ({
                                value: c.CUSTOMER_ID,
                                label: `${c.NAME} ${c.PHONE_NUMBER ? `(${c.PHONE_NUMBER})` : ''}`
                            }))}
                        />
                    </Form.Item>
                </div>

                <Divider orientation="left">Order Items</Divider>

                <Form.List name="items">
                    {(fields, { add, remove }) => (
                        <>
                            {fields.map(({ key, name, ...restField }) => (
                                <div key={key} className="p-4 mb-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 relative">
                                    <div className="absolute top-2 right-2">
                                        <Button 
                                            type="text" 
                                            danger 
                                            icon={<DeleteOutlined />} 
                                            onClick={() => remove(name)}
                                        />
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'ITEM_ID']}
                                            label="Item"
                                            className="md:col-span-2"
                                            rules={[{ required: true, message: 'Missing item' }]}
                                        >
                                            <Select
                                                showSearch
                                                placeholder="Select Item"
                                                optionFilterProp="children"
                                                options={items.filter(i => Number(i.IS_ACTIVE) !== 0).map(i => ({
                                                    value: i.ITEM_ID,
                                                    label: `${i.NAME} (${i.SYSTEM_CODE || 'General'})`
                                                }))}
                                            />
                                        </Form.Item>

                                        <Form.Item
                                            {...restField}
                                            name={[name, 'BAG_WEIGHT']}
                                            label="Bag Weight (kg)"
                                        >
                                            <InputNumber className="w-full" min={0} step={0.1} placeholder="e.g. 5" />
                                        </Form.Item>

                                        <Form.Item
                                            {...restField}
                                            name={[name, 'BAG_COUNT']}
                                            label="Bag Count"
                                        >
                                            <InputNumber className="w-full" min={0} placeholder="e.g. 10" />
                                        </Form.Item>

                                        <Form.Item
                                            {...restField}
                                            name={[name, 'QUANTITY']}
                                            label="Total Qty (kg)"
                                            rules={[{ required: true, message: 'Required' }]}
                                        >
                                            <InputNumber className="w-full" min={0} step={0.1} />
                                        </Form.Item>

                                        <Form.Item
                                            {...restField}
                                            name={[name, 'UNIT_PRICE']}
                                            label="Unit Price (Rs)"
                                            rules={[{ required: true, message: 'Required' }]}
                                        >
                                            <InputNumber className="w-full" min={0} step={0.01} />
                                        </Form.Item>

                                        <Form.Item
                                            {...restField}
                                            name={[name, 'TOTAL_PRICE']}
                                            label="Total Price (Rs)"
                                            className="md:col-span-6"
                                        >
                                            <InputNumber className="w-full bg-gray-100 dark:bg-black/20" readOnly />
                                        </Form.Item>
                                    </div>
                                </div>
                            ))}
                            <Form.Item>
                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                    Add Another Item
                                </Button>
                            </Form.Item>
                        </>
                    )}
                </Form.List>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border border-blue-100 dark:border-blue-800 mt-6">
                    <div className="flex justify-between items-center mb-4">
                        <Text className="text-gray-600 dark:text-gray-300">Total Amount:</Text>
                        <Text strong>Rs. {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                    </div>
                    <div className="flex justify-between items-center mb-4">
                        <Text className="text-gray-600 dark:text-gray-300">Discount:</Text>
                        <Form.Item name="DISCOUNT" noStyle>
                            <InputNumber 
                                min={0} 
                                style={{ width: 120 }} 
                                onChange={val => setDiscount(val || 0)}
                            />
                        </Form.Item>
                    </div>
                    <Divider className="my-3 border-blue-200 dark:border-blue-800" />
                    <div className="flex justify-between items-center">
                        <Title level={4} className="!mb-0 text-blue-700 dark:text-blue-400">Net Amount:</Title>
                        <Title level={4} className="!mb-0 text-blue-700 dark:text-blue-400">
                            Rs. {netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </Title>
                    </div>
                </div>
            </div>

            <div className="pt-4 mt-4 border-t border-gray-200 dark:border-white/10 flex justify-end gap-3 shrink-0 bg-white dark:bg-[#141414]">
                <Button onClick={onCancel}>Cancel</Button>
                <Button type="primary" htmlType="submit" loading={submitting}>
                    Update Sale
                </Button>
            </div>
        </Form>
    );
}
