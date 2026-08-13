import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Select, InputNumber, Card, Row, Col, Table, Typography, Space, Tag, DatePicker, App } from 'antd';
import { ShoppingCartOutlined, PlusOutlined, DeleteOutlined, PrinterOutlined, UserOutlined, CheckCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { FINISHED_ITEMS } from '../../utils/constants';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

const { Title, Text } = Typography;
const { Option } = Select;

// Priority sorter for Sales & POS: Processed Rice & By-Products first
const sortSalesItems = (itemList) => {
    return [...itemList].sort((a, b) => {
        const priorityOrder = {
            'OUT_SAMBA': 1,
            'OUT_NADU': 2,
            'OUT_HAL': 3,
            'OUT_KUDU': 4,
            'OUT_HUNSAL': 5,
            'RAW_WEE_AMU': 10,
            'RAW_WEE_DRY': 11
        };
        const pA = priorityOrder[a.SYSTEM_CODE] || 6;
        const pB = priorityOrder[b.SYSTEM_CODE] || 6;
        return pA - pB;
    });
};

export default function DirectSale() {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [itemsList, setItemsList] = useState([]);
    const [customers, setCustomers] = useState([]);
    
    // Cart Items State
    const [cart, setCart] = useState([]);

    // Selected item draft state
    const [selectedItemId, setSelectedItemId] = useState(null);
    const [bagWeight, setBagWeight] = useState(50);
    const [bagCount, setBagCount] = useState(1);
    const [unitPrice, setUnitPrice] = useState(0);

    // Payment state
    const [paymentMethod, setPaymentMethod] = useState('cash');

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [itemsRes, custRes] = await Promise.all([
                axios.post('/api/MillgetAllItems', {}, { withCredentials: true }),
                axios.post('/api/MillgetAllCustomers', {}, { withCredentials: true })
            ]);

            if (itemsRes.data.success) {
                // Filter items that are active and sellable
                const activeItems = (itemsRes.data.result || []).filter(i => Number(i.IS_ACTIVE) !== 0);
                setItemsList(activeItems);
            }
            if (custRes.data.success) {
                setCustomers(custRes.data.result || []);
            }
        } catch (e) {
            console.error('Error fetching initial data:', e);
            message.error('Failed to load products');
        } finally {
            setLoading(false);
        }
    };

    const handleItemSelect = (itemId) => {
        setSelectedItemId(itemId);
        const item = itemsList.find(i => i.ITEM_ID === itemId);
        if (item) {
            const perKgPrice = parseFloat(item.SELLING_PRICE || 0);
            const weight = bagWeight || 1;
            setUnitPrice(parseFloat((perKgPrice * weight).toFixed(2)));
        }
    };

    const handleBagWeightChange = (newWeight) => {
        setBagWeight(newWeight);
        const item = itemsList.find(i => i.ITEM_ID === selectedItemId);
        if (item && newWeight) {
            const perKgPrice = parseFloat(item.SELLING_PRICE || 0);
            setUnitPrice(parseFloat((perKgPrice * newWeight).toFixed(2)));
        }
    };

    const handleAddToCart = () => {
        if (!selectedItemId) {
            message.warning('Please select an item first');
            return;
        }
        if (bagCount <= 0) {
            message.warning('Bag count must be greater than 0');
            return;
        }

        const item = itemsList.find(i => i.ITEM_ID === selectedItemId);
        if (!item) return;

        const totalQty = bagWeight ? bagCount * bagWeight : bagCount;
        const totalPrice = bagCount * unitPrice;

        const cartItem = {
            key: `${selectedItemId}_${bagWeight}_${Date.now()}`,
            ITEM_ID: item.ITEM_ID,
            ITEM_NAME: item.NAME,
            CODE: item.CODE || item.SYSTEM_CODE || '-',
            BAG_WEIGHT: bagWeight,
            BAG_COUNT: bagCount,
            QUANTITY: totalQty,
            UNIT_PRICE: unitPrice,
            TOTAL_PRICE: totalPrice
        };

        setCart(prev => [...prev, cartItem]);
        
        // Reset item picker
        setSelectedItemId(null);
        setBagCount(1);
        setUnitPrice(0);
        message.success(`Added ${item.NAME} to cart`);
    };

    const handleRemoveFromCart = (key) => {
        setCart(prev => prev.filter(i => i.key !== key));
    };

    // Calculate totals
    const grandTotal = cart.reduce((sum, item) => sum + (item.TOTAL_PRICE || 0), 0);

    const handleFinish = async (values) => {
        if (cart.length === 0) {
            message.warning('Cart is empty. Please add items to sell.');
            return;
        }

        setSubmitting(true);
        try {
            const formattedItems = cart.map(i => ({
                ITEM_ID: i.ITEM_ID,
                BAG_WEIGHT: i.BAG_WEIGHT || null,
                BAG_COUNT: i.BAG_COUNT || null,
                QUANTITY: i.QUANTITY,
                UNIT_PRICE: i.UNIT_PRICE,
                TOTAL_PRICE: i.TOTAL_PRICE
            }));

            const netTotal = grandTotal - (values.DISCOUNT || 0);

            const payload = {
                CUSTOMER_ID: values.CUSTOMER_ID || null,
                TOTAL_AMOUNT: grandTotal,
                DISCOUNT: values.DISCOUNT || 0,
                NET_AMOUNT: netTotal,
                PRINTED_SUB_TOTAL: grandTotal,
                HANDWRITTEN_SUB_TOTAL: 0,
                FINAL_AMOUNT: netTotal,
                IS_SETTLED: 1, // Quick sales are settled immediately
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                PAYMENT_METHOD: values.PAYMENT_METHOD || 'cash',
                REMARK: values.REMARK || 'Quick POS Direct Sale',
                DEVICE_ID: getTerminalDeviceCode(),
                CREATED_BY_NAME: getCurrentUserName(),
                ITEMS: formattedItems
            };

            const res = await axios.post('/api/mill/sales/add', payload, { withCredentials: true });
            if (res.data.success) {
                const billId = res.data.billId || res.data.result?.insertId;
                message.success('Quick POS Sale completed!');

                // If cheque payment method, insert cheque for notifications and cheque list
                if (values.PAYMENT_METHOD === 'cheque' && values.CHEQUE_NUMBER) {
                    await axios.post('/api/mill/cheques/add', {
                        BILL_ID: billId,
                        CHEQUE_NUMBER: values.CHEQUE_NUMBER,
                        BANK: values.BANK || null,
                        DUE_DATE: values.DUE_DATE ? values.DUE_DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                        AMOUNT: values.CHEQUE_AMOUNT || netTotal,
                        STATUS: 'PENDING'
                    }, { withCredentials: true });
                }

                // Open Auto-Print Bill
                if (billId) {
                    window.open(`/print-bill/${billId}`, '_blank', 'width=850,height=900,toolbar=0,menubar=0');
                }

                // Reset Cart & Form
                setCart([]);
                form.resetFields();
                form.setFieldsValue({ DATE: dayjs(), PAYMENT_METHOD: 'cash' });
            } else {
                message.error(res.data.message || 'Failed to create sale');
            }
        } catch (e) {
            console.error('Quick sale submit error:', e);
            message.error('An error occurred while completing the sale');
        } finally {
            setSubmitting(false);
        }
    };

    const cartColumns = [
        {
            title: 'Product',
            dataIndex: 'ITEM_NAME',
            key: 'ITEM_NAME',
            render: (text, record) => (
                <div>
                    <span className="font-semibold">{text}</span>
                    <div className="text-xs text-gray-400">Code: {record.CODE}</div>
                </div>
            )
        },
        {
            title: 'Bag Size',
            dataIndex: 'BAG_WEIGHT',
            key: 'BAG_WEIGHT',
            align: 'center',
            render: val => val ? `${val} kg` : '-'
        },
        {
            title: 'Bags',
            dataIndex: 'BAG_COUNT',
            key: 'BAG_COUNT',
            align: 'center',
            render: val => <Tag color="blue">{val} bags</Tag>
        },
        {
            title: 'Unit Price',
            dataIndex: 'UNIT_PRICE',
            key: 'UNIT_PRICE',
            align: 'right',
            render: val => `Rs. ${parseFloat(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
        },
        {
            title: 'Total',
            dataIndex: 'TOTAL_PRICE',
            key: 'TOTAL_PRICE',
            align: 'right',
            render: val => <span className="font-bold text-emerald-600 dark:text-emerald-400">Rs. {parseFloat(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        },
        {
            title: '',
            key: 'action',
            width: 50,
            render: (_, record) => (
                <Button 
                    type="text" 
                    danger 
                    icon={<DeleteOutlined />} 
                    onClick={() => handleRemoveFromCart(record.key)} 
                />
            )
        }
    ];

    const selectedItemObj = itemsList.find(i => i.ITEM_ID === selectedItemId);

    return (
        <div className="space-y-6">

            <Row gutter={[16, 16]}>
                {/* Left Side: Product Picker & Cart */}
                <Col xs={24} lg={15}>
                    {/* Add Product Card */}
                    <Card title="1. Select Item & Add to Bill" className="shadow-sm mb-4">
                        <Row gutter={[12, 12]} align="bottom">
                            <Col xs={24} sm={10}>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Select Product</label>
                                <Select
                                    showSearch
                                    placeholder="Search Product / By-Product..."
                                    className="w-full"
                                    value={selectedItemId}
                                    onChange={handleItemSelect}
                                    optionFilterProp="children"
                                    loading={loading}
                                >
                                    {sortSalesItems(itemsList).map(item => (
                                        <Option key={item.ITEM_ID} value={item.ITEM_ID}>
                                            <span className="font-bold">🍚 {item.NAME}</span> ({item.CODE || item.CATEGORY}) - Rs.{item.SELLING_PRICE}
                                        </Option>
                                    ))}
                                </Select>
                            </Col>
                            <Col xs={12} sm={4}>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Bag Wt (kg)</label>
                                <InputNumber
                                    min={1}
                                    className="w-full"
                                    value={bagWeight}
                                    onChange={handleBagWeightChange}
                                />
                            </Col>
                            <Col xs={12} sm={4}>
                                <label className="block text-xs font-medium text-gray-500 mb-1">No of Bags</label>
                                <InputNumber
                                    min={1}
                                    className="w-full"
                                    value={bagCount}
                                    onChange={setBagCount}
                                />
                            </Col>
                            <Col xs={12} sm={4}>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Price / Bag</label>
                                <InputNumber
                                    min={0}
                                    className="w-full"
                                    value={unitPrice}
                                    onChange={setUnitPrice}
                                />
                            </Col>
                            <Col xs={12} sm={2}>
                                <Button 
                                    type="primary" 
                                    icon={<PlusOutlined />} 
                                    onClick={handleAddToCart}
                                    className="w-full !bg-emerald-600 hover:!bg-emerald-700 !border-none"
                                >
                                    Add
                                </Button>
                            </Col>
                        </Row>

                        {selectedItemObj && (
                            <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-950/40 rounded border border-blue-100 dark:border-blue-900 text-xs flex justify-between">
                                <span>Selected: <strong>{selectedItemObj.NAME}</strong> ({selectedItemObj.CATEGORY})</span>
                                <span>Calculated Weight: <strong>{bagCount * bagWeight} kg</strong></span>
                            </div>
                        )}
                    </Card>

                    {/* Cart Items Table */}
                    <Card title={`Bill Items (${cart.length})`} className="shadow-sm">
                        {/* Desktop View - Table */}
                        <div className="hidden md:block">
                            <Table
                                columns={cartColumns}
                                dataSource={cart}
                                pagination={false}
                                size="small"
                                locale={{ emptyText: 'No items in bill cart yet (0 items). Pick products above to add.' }}
                            />
                        </div>

                        {/* Mobile View - Cards */}
                        <div className="md:hidden space-y-2.5">
                            {cart.length === 0 ? (
                                <div className="p-5 text-center rounded-xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
                                    No items in bill cart yet (0 items). Pick products above to add.
                                </div>
                            ) : (
                                cart.map((item, index) => (
                                    <div key={item.key || index} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <div className="font-bold text-slate-900 dark:text-slate-100 text-sm">{item.ITEM_NAME}</div>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <Tag color="blue" className="font-bold m-0 text-[10px]">{item.BAG_WEIGHT} kg bag</Tag>
                                                    <span className="text-xs text-slate-500 font-mono">Rs. {Number(item.UNIT_PRICE || 0).toFixed(2)} / bag</span>
                                                </div>
                                            </div>
                                            <Button 
                                                type="text" 
                                                danger 
                                                size="small" 
                                                icon={<DeleteOutlined />} 
                                                onClick={() => removeFromCart(index)} 
                                            />
                                        </div>
                                        <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                                            <span className="text-slate-600 dark:text-slate-400 font-semibold">
                                                Qty: <strong className="text-blue-600 dark:text-blue-400 font-bold text-sm ml-1">{item.BAG_COUNT} bags</strong>
                                                <span className="text-[10px] text-slate-400 ml-1">({(Number(item.BAG_COUNT || 0) * Number(item.BAG_WEIGHT || 0))} kg)</span>
                                            </span>
                                            <span className="font-mono font-black text-slate-900 dark:text-slate-100 text-base">
                                                Rs. {Number(item.TOTAL_PRICE || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </Card>
                </Col>

                {/* Right Side: Bill Summary & Checkout */}
                <Col xs={24} lg={9}>
                    <Card title="2. Customer & Payment Details" className="shadow-sm">
                        <Form 
                            form={form} 
                            layout="vertical" 
                            onFinish={handleFinish} 
                            initialValues={{ DATE: dayjs(), PAYMENT_METHOD: 'cash' }}
                        >
                            <Form.Item name="CUSTOMER_ID" label="Customer (Optional)">
                                <Select 
                                    showSearch 
                                    placeholder="Select Customer or Walk-in" 
                                    allowClear
                                    optionFilterProp="children"
                                >
                                    {customers.map(c => (
                                        <Option key={c.CUSTOMER_ID} value={c.CUSTOMER_ID}>
                                            {c.NAME} {c.PHONE_NUMBER ? `(${c.PHONE_NUMBER})` : ''}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>

                            <Form.Item name="DATE" label="Bill Date" rules={[{ required: true }]}>
                                <DatePicker className="w-full" format="YYYY-MM-DD" />
                            </Form.Item>

                            <Form.Item name="PAYMENT_METHOD" label="Payment Method" rules={[{ required: true }]}>
                                <Select onChange={setPaymentMethod}>
                                    <Option value="cash">Cash</Option>
                                    <Option value="cheque">Cheque</Option>
                                    <Option value="credit">Credit / Due</Option>
                                </Select>
                            </Form.Item>

                            {/* Cheque Fields if Cheque Payment */}
                            {paymentMethod === 'cheque' && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded border border-amber-200 dark:border-amber-900 mb-4 space-y-2">
                                    <div className="text-xs font-bold text-amber-800 dark:text-amber-300">Cheque Info</div>
                                    <Form.Item name="CHEQUE_NUMBER" label="Cheque No" margin="none" rules={[{ required: true }]}>
                                        <Input size="small" placeholder="Cheque Number" />
                                    </Form.Item>
                                    <Form.Item name="BANK" label="Bank Name" margin="none">
                                        <Input size="small" placeholder="Bank Name" />
                                    </Form.Item>
                                    <Form.Item name="DUE_DATE" label="Cheque Due Date" margin="none" rules={[{ required: true }]}>
                                        <DatePicker size="small" className="w-full" format="YYYY-MM-DD" />
                                    </Form.Item>
                                </div>
                            )}

                            <Form.Item name="REMARK" label="Remark / Note">
                                <Input placeholder="Optional remark" />
                            </Form.Item>

                            <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg border dark:border-gray-700 my-4 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Sub Total:</span>
                                    <span className="font-semibold">Rs. {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm border-t border-gray-200 dark:border-gray-700 pt-2">
                                    <span className="font-bold text-base text-gray-800 dark:text-white">Net Total:</span>
                                    <span className="font-extrabold text-xl text-emerald-600 dark:text-emerald-400">
                                        Rs. {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            <Button
                                type="primary"
                                size="large"
                                htmlType="submit"
                                icon={<PrinterOutlined />}
                                loading={submitting}
                                disabled={cart.length === 0}
                                className="w-full h-12 text-base font-bold !bg-emerald-600 hover:!bg-emerald-700 !border-none shadow-lg"
                            >
                                Submit & Print Bill
                            </Button>
                        </Form>
                    </Card>
                </Col>
            </Row>
        </div>
    );
}
