import React, { useEffect, useState } from 'react';
import { Drawer, Form, Input, Select, DatePicker, Button, InputNumber, Table, App, Spin, Divider, Checkbox, Modal, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import axios from 'axios';
import { generateReceiptHTML } from '../../utils/receiptGenerator';

const { Option } = Select;

const TransactionForm = ({ open, onClose, transactionId, onSuccess }) => {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false); // Submitting
    const [fetching, setFetching] = useState(false); // Fetching details
    const [customers, setCustomers] = useState([]);
    const [items, setItems] = useState([]);
    const [users, setUsers] = useState([]);
    const [transactionType, setTransactionType] = useState(null); // 'Selling', 'Buying', 'Expenses'
    const [transactionItems, setTransactionItems] = useState([]); // Local state for items table
    const [receiptData, setReceiptData] = useState(null);
    const [showReceipt, setShowReceipt] = useState(false);

    // Load initial data (Customers, Items, Users)
    useEffect(() => {
        if (open) {
            fetchDropdownData();
            if (transactionId) {
                fetchTransactionDetails(transactionId);
            } else {
                // Reset if adding new (future feature)
                form.resetFields();
                setTransactionType(null);
                setTransactionItems([]);
            }
        }
    }, [open, transactionId]);

    const fetchDropdownData = async () => {
        try {
            const [customersRes, itemsRes, usersRes] = await Promise.all([
                axios.post('/api/getAllCustomers'),
                axios.post('/api/getAllItems'),
                axios.post('/api/getAllUsers')
            ]);
            if (customersRes.data.success) setCustomers(customersRes.data.result);
            if (itemsRes.data.success) setItems(itemsRes.data.result);
            if (usersRes.data.users) setUsers(usersRes.data.users);
        } catch (error) {
            console.error("Error fetching dropdowns", error);
        }
    };

    const fetchTransactionDetails = async (id) => {
        setFetching(true);
        try {
            const response = await axios.post('/api/getTransactionDetails', { TRANSACTION_ID: id });
            if (response.data.success) {
                const tx = response.data.result[0]; // Assuming array
                setTransactionType(tx.TYPE);

                // Fetch Items for this transaction to populate table
                // NOTE: The endpoint getTransactionDetails in backend might only return the main row? 
                // Let's check: router.get('/api/getTransactionDetails/:id') returns { transaction, items } 
                // BUT router.post('/api/getTransactionDetails') returns ONLY the transaction row in storeTransactionRoutes.js line 1215.
                // WE NEED items. 
                // Re-reading code I saw: router.get('/api/getTransactionDetails/:id') existed at line 189.
                // Let's try GET endpoint first as it returns items.

                const detailResponse = await axios.get(`/api/getTransactionDetails/${id}`);
                if (detailResponse.data.success) {
                    const fullTx = detailResponse.data.transaction;
                    const fullItems = detailResponse.data.items || [];



                    // Parse BILL_DATA for Receipt View
                    if (fullTx.BILL_DATA) {
                        try {
                            const parsed = typeof fullTx.BILL_DATA === 'string' ? JSON.parse(fullTx.BILL_DATA) : fullTx.BILL_DATA;
                            setReceiptData(parsed);
                        } catch (e) {
                            console.error("Error parsing BILL_DATA", e);
                            setReceiptData(null);
                        }
                    } else {
                        setReceiptData(null);
                    }

                    // Populate Form
                    form.setFieldsValue({
                        TYPE: fullTx.TYPE,
                        CUSTOMER: fullTx.CUSTOMER,
                        METHOD: fullTx.METHOD,
                        DATE: dayjs(fullTx.DATE || fullTx.CREATED_DATE), // Use DATE if available, else Created
                        SUB_TOTAL: fullTx.SUB_TOTAL,
                        AMOUNT_SETTLED: fullTx.AMOUNT_SETTLED,
                        DUE_AMOUNT: fullTx.DUE_AMOUNT,
                        DUE_DATE: fullTx.DUE_DATE ? dayjs(fullTx.DUE_DATE) : null,
                        COMMENTS: fullTx.COMMENTS,
                        CREATED_BY: fullTx.CREATED_BY,
                        CHEQUE_NO: fullTx.CHEQUE_NO,
                        CHEQUE_EXPIRY: fullTx.CHEQUE_EXPIRY ? dayjs(fullTx.CHEQUE_EXPIRY) : null,
                        BANK_NAME: fullTx.BANK_NAME,
                        IS_CHEQUE_COLLECTED: fullTx.IS_CHEQUE_COLLECTED === 1,
                        BANK_TRANS_DATETIME: fullTx.BANK_TRANS_DATETIME ? dayjs(fullTx.BANK_TRANS_DATETIME) : null
                    });

                    // Populate Items Table
                    // Map backend items to frontend structure
                    const mappedItems = fullItems.map((item, index) => ({
                        key: index,
                        ITEM_ID: item.ITEM_ID,
                        // We need code/name for display, hopefully included in join
                        ITEM_CODE: item.ITEM_CODE,
                        ITEM_NAME: item.ITEM_NAME,
                        PRICE: item.PRICE,
                        QUANTITY: item.QUANTITY,
                        TOTAL: item.TOTAL
                    }));
                    setTransactionItems(mappedItems);
                }
            }
        } catch (error) {
            console.error("Error fetching details:", error);
            message.error("Failed to load details");
        } finally {
            setFetching(false);
        }
    };

    // item table logic
    const handleAddItem = () => {
        const newItem = {
            key: Date.now(),
            ITEM_ID: null,
            PRICE: 0,
            QUANTITY: 1,
            TOTAL: 0
        };
        setTransactionItems([...transactionItems, newItem]);
    };

    const handleRemoveItem = (key) => {
        const newItems = transactionItems.filter(item => item.key !== key);
        setTransactionItems(newItems);
        calculateTotals(newItems);
    };

    const handleItemChange = (key, field, value) => {
        const newItems = transactionItems.map(item => {
            if (item.key === key) {
                const updatedItem = { ...item, [field]: value };

                // Auto-fill Item Code/Name/Price when ID changes
                if (field === 'ITEM_ID') {
                    const selectedItem = items.find(i => i.ITEM_ID === value);
                    if (selectedItem) {
                        updatedItem.ITEM_CODE = selectedItem.CODE;
                        updatedItem.ITEM_NAME = selectedItem.NAME;
                        // Determine price based on Buying/Selling
                        updatedItem.PRICE = transactionType === 'Selling' ? selectedItem.SELLING_PRICE : selectedItem.BUYING_PRICE;
                    }
                }

                // Recalculate Line Total
                if (field === 'PRICE' || field === 'QUANTITY' || field === 'ITEM_ID') {
                    updatedItem.TOTAL = (Number(updatedItem.PRICE) || 0) * (Number(updatedItem.QUANTITY) || 0);
                }

                return updatedItem;
            }
            return item;
        });
        setTransactionItems(newItems);
        calculateTotals(newItems);
    };

    const calculateTotals = (currentItems) => {
        const subTotal = currentItems.reduce((sum, item) => sum + (Number(item.TOTAL) || 0), 0);
        form.setFieldsValue({ SUB_TOTAL: subTotal });
        // Auto-update Settled/Due if needed? 
        // Logic: Due = SubTotal - Settled. 
        const settled = form.getFieldValue('AMOUNT_SETTLED') || 0;
        form.setFieldsValue({ DUE_AMOUNT: subTotal - settled });
    };

    const onFieldsChange = (changed, allValues) => {
        // Recalculate Due if Settled or SubTotal changes manually
        if (changed.length > 0 && (changed[0].name[0] === 'AMOUNT_SETTLED' || changed[0].name[0] === 'SUB_TOTAL')) {
            const sub = form.getFieldValue('SUB_TOTAL') || 0;
            const set = form.getFieldValue('AMOUNT_SETTLED') || 0;
            form.setFieldsValue({ DUE_AMOUNT: sub - set });
        }
        if (changed.length > 0 && changed[0].name[0] === 'TYPE') {
            setTransactionType(changed[0].value);
        }
    };

    const onFinish = async (values) => {
        setLoading(true);
        try {
            const payload = {
                ...values,
                TRANSACTION_ID: transactionId,
                ITEMS: transactionItems,
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD HH:mm:ss') : null,
                DUE_DATE: values.DUE_DATE ? values.DUE_DATE.format('YYYY-MM-DD') : null,
                CHEQUE_EXPIRY: values.CHEQUE_EXPIRY ? values.CHEQUE_EXPIRY.format('YYYY-MM-DD') : null,
                BANK_TRANS_DATETIME: values.BANK_TRANS_DATETIME ? values.BANK_TRANS_DATETIME.format('YYYY-MM-DD HH:mm:ss') : null,
                IS_CHEQUE_COLLECTED: values.IS_CHEQUE_COLLECTED ? 1 : 0,
            };

            const response = await axios.post('/api/updateTransaction', payload);

            if (response.data.success) {
                message.success('Transaction updated successfully');
                onSuccess();
                onClose();
            } else {
                message.error('Failed to update transaction');
            }
        } catch (error) {
            console.error("Error updating transaction:", error);
            message.error("Failed to update transaction");
        } finally {
            setLoading(false);
        }
    };

    // -- Renderers --

    const itemColumns = [
        {
            title: 'Item',
            dataIndex: 'ITEM_ID',
            key: 'ITEM_ID',
            width: '30%',
            render: (text, record) => (
                <Select
                    showSearch
                    placeholder="Select Item"
                    value={text}
                    onChange={(val) => handleItemChange(record.key, 'ITEM_ID', val)}
                    className="w-full"
                    filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={items.map(i => ({ value: i.ITEM_ID, label: `${i.CODE} - ${i.NAME}` }))}
                />
            )
        },
        {
            title: 'Price',
            dataIndex: 'PRICE',
            key: 'PRICE',
            width: '20%',
            render: (text, record) => (
                <InputNumber
                    min={0}
                    value={text}
                    onChange={(val) => handleItemChange(record.key, 'PRICE', val)}
                    className="w-full"
                    prefix="Rs."
                />
            )
        },
        {
            title: 'Qty',
            dataIndex: 'QUANTITY',
            key: 'QUANTITY',
            width: '15%',
            render: (text, record) => (
                <InputNumber
                    min={0}
                    value={text}
                    onChange={(val) => handleItemChange(record.key, 'QUANTITY', val)}
                    className="w-full"
                />
            )
        },
        {
            title: 'Total',
            dataIndex: 'TOTAL',
            key: 'TOTAL',
            width: '20%',
            render: (text) => <span className="font-bold text-gray-700 dark:text-gray-300">Rs.{text}</span>
        },
        {
            title: '',
            key: 'action',
            width: '5%',
            render: (_, record) => (
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemoveItem(record.key)} />
            )
        }
    ];

    return (
        <Drawer
            title="Update Transaction"
            width={720}
            onClose={onClose}
            open={open}
            styles={{ body: { paddingBottom: 80 } }}
            className="glass-drawer"

            closeIcon={<CloseOutlined className="text-gray-500" />}
            extra={
                receiptData && (
                    <Button type="primary" onClick={() => setShowReceipt(true)} className="bg-blue-500 hover:bg-blue-600">
                        📄 View Original Bill
                    </Button>
                )
            }
        >
            <Modal
                title={
                    <div className="flex justify-between items-center pr-8">
                        <span>Original Receipt View</span>
                        <Tag color="blue">Bill #{receiptData?.billId || receiptData?.code}</Tag>
                    </div>
                }
                open={showReceipt}
                onCancel={() => setShowReceipt(false)}
                footer={[
                    <Button key="close" onClick={() => setShowReceipt(false)}>Close</Button>
                ]}
                width={400}
                className="receipt-modal"
            >
                {receiptData && (
                    <div className="h-[500px] w-full bg-gray-50 overflow-hidden border border-gray-200">
                        <iframe
                            srcDoc={generateReceiptHTML(receiptData)}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="Receipt Preview"
                        />
                    </div>
                )}
            </Modal>
            {fetching ? <div className="flex justify-center h-full items-center"><Spin size="large" /></div> : (
                <Form layout="vertical" form={form} onFinish={onFinish} onFieldsChange={onFieldsChange} hideRequiredMark>

                    {/* Header Fields - Type, Date, Customer/Method */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Form.Item name="TYPE" label="Transaction Type" rules={[{ required: true }]}>
                            <Select disabled placeholder="Select Type">
                                <Option value="Selling">Selling</Option>
                                <Option value="Buying">Buying</Option>
                                <Option value="Expenses">Expenses</Option>
                            </Select>
                        </Form.Item>

                        <Form.Item name="DATE" label="Date & Time" rules={[{ required: true }]}>
                            <DatePicker showTime className="w-full" format="YYYY-MM-DD HH:mm" />
                        </Form.Item>
                    </div>

                    {(transactionType === 'Selling' || transactionType === 'Buying') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Form.Item name="CUSTOMER" label="Customer">
                                <Select
                                    showSearch
                                    placeholder="Select Customer"
                                    optionFilterProp="children"
                                    filterOption={(input, option) => (option?.children ?? '').toLowerCase().includes(input.toLowerCase())}
                                >
                                    {customers.map(c => <Option key={c.CUSTOMER_ID} value={c.CUSTOMER_ID}>{c.NAME}</Option>)}
                                </Select>
                            </Form.Item>
                        </div>
                    )}

                    {/* Items Table - Only for Selling/Buying */}
                    {(transactionType === 'Selling' || transactionType === 'Buying') && (
                        <div className="mb-6 border border-gray-200 dark:border-white/10 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 dark:bg-zinc-900 p-3 border-b border-gray-200 dark:border-white/10 flex justify-between items-center">
                                <span className="font-semibold text-gray-700 dark:text-gray-300">Items</span>
                                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddItem}>Add Item</Button>
                            </div>

                            {/* Desktop Table View */}
                            <div className="hidden md:block">
                                <Table
                                    dataSource={transactionItems}
                                    columns={itemColumns}
                                    pagination={false}
                                    size="small"
                                    rowClassName="bg-white dark:bg-black/20"
                                />
                            </div>

                            {/* Mobile Card List View */}
                            <div className="md:hidden flex flex-col gap-2 p-2 bg-gray-50/50 dark:bg-black/20">
                                {transactionItems.map((item, index) => (
                                    <div key={item.key} className="glass-card p-3 rounded-lg flex flex-col gap-3 relative border border-gray-100 dark:border-white/5 bg-white dark:bg-zinc-900">
                                        <div className="absolute top-2 right-2">
                                            <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => handleRemoveItem(item.key)} />
                                        </div>

                                        <div className="w-full pr-8">
                                            <span className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Item</span>
                                            <Select
                                                showSearch
                                                placeholder="Select Item"
                                                value={item.ITEM_ID}
                                                onChange={(val) => handleItemChange(item.key, 'ITEM_ID', val)}
                                                className="w-full"
                                                size="large"
                                                filterOption={(input, option) =>
                                                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                                }
                                                options={items.map(i => ({ value: i.ITEM_ID, label: `${i.CODE} - ${i.NAME}` }))}
                                            />
                                        </div>

                                        <div className="flex gap-3">
                                            <div className="flex-1">
                                                <span className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Price</span>
                                                <InputNumber
                                                    min={0}
                                                    value={item.PRICE}
                                                    onChange={(val) => handleItemChange(item.key, 'PRICE', val)}
                                                    className="w-full"
                                                    prefix="Rs."
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-xs text-gray-500 uppercase tracking-wider mb-1 block">Qty</span>
                                                <InputNumber
                                                    min={0}
                                                    value={item.QUANTITY}
                                                    onChange={(val) => handleItemChange(item.key, 'QUANTITY', val)}
                                                    className="w-full"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-white/5">
                                            <span className="text-xs text-gray-400">Total</span>
                                            <span className="font-bold text-gray-700 dark:text-gray-200 text-lg">Rs.{item.TOTAL}</span>
                                        </div>
                                    </div>
                                ))}
                                {transactionItems.length === 0 && (
                                    <div className="text-center py-4 text-gray-400 text-sm">No items added</div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Financials */}
                    <Divider orientation="left" className="!border-gray-200 dark:!border-white/10 !text-gray-500 !text-xs uppercase !tracking-widest">Financials</Divider>

                    <Form.Item name="SUB_TOTAL" label="Sub Total" rules={[{ required: true }]}>
                        <InputNumber className="w-full font-bold" prefix="Rs." readOnly={transactionType !== 'Expenses'} />
                    </Form.Item>

                    {transactionType === 'Expenses' && (
                        <Form.Item name="CREATED_BY" label="Cashier">
                            <Select disabled className="w-full text-gray-800 dark:text-gray-200">
                                {users.map(u => <Option key={u.USER_ID} value={u.USER_ID}>{u.NAME}</Option>)}
                            </Select>
                        </Form.Item>
                    )}

                    {/* Payment Details for Selling & Buying */}
                    {(transactionType === 'Selling' || transactionType === 'Buying') && (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <Form.Item name="METHOD" label="Payment Method" rules={[{ required: true }]}>
                                    <Select placeholder="Select Method">
                                        <Option value="Cash">Cash</Option>
                                        <Option value="Bank">Bank Transfer</Option>
                                        <Option value="Cheque">Cheque</Option>
                                    </Select>
                                </Form.Item>

                                <Form.Item name="AMOUNT_SETTLED" label="Amount Settled">
                                    <InputNumber
                                        className="w-full"
                                        prefix="Rs."
                                        formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                        parser={value => value.replace(/\Rs.\s?|(,*)/g, '')}
                                    />
                                </Form.Item>

                                <Form.Item label="Due Amount" className="mb-0">
                                    <div className="flex gap-2">
                                        <Form.Item name="DUE_AMOUNT" noStyle>
                                            <InputNumber className="w-full text-red-500 font-semibold" prefix="Rs." readOnly />
                                        </Form.Item>
                                        <Form.Item name="DUE_DATE" noStyle>
                                            <DatePicker placeholder="Due Date" className="w-full" />
                                        </Form.Item>
                                    </div>
                                </Form.Item>
                            </div>

                            {/* Conditional Payment Fields */}
                            <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.METHOD !== currentValues.METHOD}>
                                {({ getFieldValue }) => {
                                    const method = getFieldValue('METHOD');
                                    return method === 'Cheque' ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-white/5 p-4 rounded-lg mb-4 animate-fade-in border border-gray-200 dark:border-white/10">
                                            <Form.Item name="CHEQUE_NO" label="Cheque Number" rules={[{ required: true }]}>
                                                <Input placeholder="Enter Cheque No" />
                                            </Form.Item>
                                            <Form.Item name="CHEQUE_EXPIRY" label="Cheque Expiry Date">
                                                <DatePicker className="w-full" />
                                            </Form.Item>
                                            <Form.Item name="BANK_NAME" label="Bank Name">
                                                <Input placeholder="Bank Name" />
                                            </Form.Item>
                                            <Form.Item name="IS_CHEQUE_COLLECTED" valuePropName="checked" className="pt-8 mb-0">
                                                <Checkbox>Cheque Collected</Checkbox>
                                            </Form.Item>
                                        </div>
                                    ) : method === 'Bank' ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 dark:bg-white/5 p-4 rounded-lg mb-4 animate-fade-in border border-gray-200 dark:border-white/10">
                                            <Form.Item name="BANK_NAME" label="Bank Name" rules={[{ required: true }]}>
                                                <Input placeholder="Bank Name" />
                                            </Form.Item>
                                            <Form.Item name="BANK_TRANS_DATETIME" label="Transaction Date & Time">
                                                <DatePicker showTime className="w-full" />
                                            </Form.Item>
                                        </div>
                                    ) : null;
                                }}
                            </Form.Item>
                        </>
                    )}

                    <Form.Item name="COMMENTS" label="Comments">
                        <Input.TextArea rows={3} placeholder="Add any notes here..." />
                    </Form.Item>

                    {transactionType !== 'Expenses' && (
                        <div className="hidden">
                            {/* Hidden field for cashier if needed for logic, usually autofilled on backend or session */}
                            <Form.Item name="CREATED_BY"><Input /></Form.Item>
                        </div>
                    )}

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-3 mt-8">
                        <Button onClick={onClose} size="large" className="rounded-xl">Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={loading} size="large" className="rounded-xl px-8 bg-emerald-500 hover:bg-emerald-600 border-none shadow-lg shadow-emerald-500/30">
                            Update Transaction
                        </Button>
                    </div>

                </Form>
            )}
        </Drawer>
    );
};

export default TransactionForm;
