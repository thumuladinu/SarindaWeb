import React, { useState, useEffect } from 'react';
import { 
    Card, Button, InputNumber, Tag, Row, Col, Divider, message, 
    Modal, Select, Input, Table, Typography, Space, DatePicker 
} from 'antd';
import { 
    ThunderboltOutlined, DeleteOutlined, PrinterOutlined, PlusOutlined, 
    MinusOutlined, ClearOutlined, DollarCircleOutlined, CheckCircleOutlined, 
    UserOutlined, ShoppingCartOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import printService from '../../services/printService';
import PrintableBill from '../sales/PrintableBill';
import { ALL_HARDCODED_ITEMS, ITEM_CATEGORIES } from '../../utils/constants';

const { Title, Text } = Typography;
const { Option } = Select;

const sortSalesItems = (itemList) => {
    return [...itemList].sort((a, b) => {
        // Output/Finished items first, then By-Products, then Seasonal
        const priorityOrder = {
            [ITEM_CATEGORIES.OUTPUT]: 1,
            [ITEM_CATEGORIES.BY_PRODUCT]: 2,
            [ITEM_CATEGORIES.SEASONAL]: 3,
            [ITEM_CATEGORIES.RAW_INPUT]: 10
        };
        const pA = priorityOrder[a.CATEGORY] || 5;
        const pB = priorityOrder[b.CATEGORY] || 5;
        return pA - pB;
    });
};

export default function QuickPOS() {
    const [itemsList, setItemsList] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [cart, setCart] = useState([]);

    // Draft Item selection
    const [selectedItemId, setSelectedItemId] = useState(null);
    const [bagWeight, setBagWeight] = useState(25);
    const [bagCount, setBagCount] = useState(1);
    const [unitPrice, setUnitPrice] = useState(0);

    // Customer & Payment
    const [selectedCustomerId, setSelectedCustomerId] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [discount, setDiscount] = useState(0);
    const [chequeNo, setChequeNo] = useState('');
    const [chequeBank, setChequeBank] = useState('');
    const [chequeDueDate, setChequeDueDate] = useState(null);

    // Printable Bill
    const [printedBill, setPrintedBill] = useState(null);
    const [printModal, setPrintModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [dbItems, custs] = await Promise.all([
                db.items.toArray(),
                db.customers.toArray()
            ]);
            
            const activeItems = (dbItems || []).filter(i => Number(i.IS_ACTIVE) !== 0);
            const sorted = sortSalesItems(activeItems);
            setItemsList(sorted);
            setCustomers(custs || []);

            if (sorted.length > 0) {
                handleItemSelect(sorted[0].ITEM_ID, sorted);
            }
        } catch (e) {
            console.error('Error loading POS items:', e);
        }
    };

    const handleItemSelect = (itemId, list = itemsList) => {
        setSelectedItemId(itemId);
        const item = list.find(i => i.ITEM_ID === itemId);
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
            message.warning('Quantity must be greater than 0');
            return;
        }

        const item = itemsList.find(i => i.ITEM_ID === selectedItemId);
        if (!item) return;

        const totalRowPrice = parseFloat((unitPrice * bagCount).toFixed(2));
        const totalWeightKg = (bagWeight || 1) * bagCount;

        const newItem = {
            key: `${item.ITEM_ID}-${bagWeight}-${Date.now()}`,
            ITEM_ID: item.ITEM_ID,
            ITEM_NAME: item.NAME,
            CODE: item.CODE,
            SYSTEM_CODE: item.SYSTEM_CODE,
            BAG_WEIGHT: bagWeight,
            BAG_COUNT: bagCount,
            QUANTITY: totalWeightKg,
            UNIT_PRICE: unitPrice,
            TOTAL_PRICE: totalRowPrice
        };

        setCart([...cart, newItem]);
        setBagCount(1);
    };

    const handleRemoveFromCart = (key) => {
        setCart(cart.filter(item => item.key !== key));
    };

    const clearCart = () => {
        setCart([]);
        setDiscount(0);
        setSelectedCustomerId(null);
    };

    const calculateSubTotal = () => {
        return cart.reduce((sum, item) => sum + (parseFloat(item.TOTAL_PRICE) || 0), 0);
    };

    const subTotal = calculateSubTotal();
    const finalAmount = Math.max(0, subTotal - (parseFloat(discount) || 0));

    const handleCheckout = async () => {
        if (cart.length === 0) {
            message.warning('Cart is empty. Please add items.');
            return;
        }

        setSubmitting(true);
        try {
            const invoiceNo = `POS-${dayjs().format('YYYYMMDD')}-${Math.floor(1000 + Math.random() * 9000)}`;
            const custObj = customers.find(c => c.CUSTOMER_ID === selectedCustomerId);
            const dateStr = dayjs().format('YYYY-MM-DD');

            const cheques = paymentMethod === 'cheque' && chequeNo ? [{
                CHEQUE_NUMBER: chequeNo,
                BANK: chequeBank,
                DUE_DATE: chequeDueDate ? chequeDueDate.format('YYYY-MM-DD') : dateStr,
                AMOUNT: finalAmount
            }] : [];

            const billPayload = {
                INVOICE_NO: invoiceNo,
                BATCH_NO: null,
                CUSTOMER_ID: selectedCustomerId || null,
                CUSTOMER_NAME: custObj ? custObj.NAME : 'Direct POS Customer',
                CUSTOMER_PHONE: custObj ? (custObj.PHONE || custObj.PHONE_NUMBER) : null,
                DATE: dateStr,
                CREATED_DATE: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                TOTAL_AMOUNT: subTotal,
                PRINTED_SUB_TOTAL: subTotal,
                HANDWRITTEN_SUB_TOTAL: 0,
                DISCOUNT: parseFloat(discount) || 0,
                NET_AMOUNT: finalAmount,
                FINAL_AMOUNT: finalAmount,
                PAID_AMOUNT: finalAmount,
                IS_SETTLED: 1,
                PAYMENT_METHOD: paymentMethod,
                REMARK: 'Direct Quick POS Sale',
                ITEMS_JSON: cart,
                CHEQUES_JSON: cheques,
                IS_SYNCED: 0
            };

            const localId = await db.sales_bills.add(billPayload);
            const finalBill = { ...billPayload, LOCAL_ID: localId, ITEMS: cart, CHEQUES: cheques };

            if (printService.isAutoPrintEnabled()) {
                printService.printBill(finalBill);
                message.success(`Sale completed! Auto-printed bill #${billPayload.INVOICE_NO} to ${printService.getBillPrinter() || 'Default A5 Bill Printer'}`);
            } else {
                message.success('Direct Sale Completed Successfully!');
                setPrintedBill(finalBill);
                setPrintModal(true);
            }

            clearCart();

            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Error completing POS sale:', e);
            message.error('Failed to complete sale');
        } finally {
            setSubmitting(false);
        }
    };

    const cartColumns = [
        {
            title: 'Item',
            dataIndex: 'ITEM_NAME',
            render: (text, r) => (
                <div>
                    <span className="font-bold text-slate-800">{text}</span>
                    <span className="text-xs text-slate-400 block">{r.BAG_WEIGHT} kg bag</span>
                </div>
            )
        },
        {
            title: 'Qty',
            dataIndex: 'BAG_COUNT',
            align: 'center',
            render: val => <span className="font-bold text-blue-900">{val}</span>
        },
        {
            title: 'Price / Bag',
            dataIndex: 'UNIT_PRICE',
            align: 'right',
            render: val => `Rs. ${Number(val).toFixed(2)}`
        },
        {
            title: 'Total',
            dataIndex: 'TOTAL_PRICE',
            align: 'right',
            render: val => <strong className="font-mono text-slate-900">Rs. {Number(val).toFixed(2)}</strong>
        },
        {
            title: '',
            key: 'action',
            width: 40,
            align: 'center',
            render: (_, r) => (
                <Button 
                    type="text" 
                    danger 
                    size="small" 
                    icon={<DeleteOutlined />} 
                    onClick={() => handleRemoveFromCart(r.key)} 
                />
            )
        }
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xl shadow-md">
                        <ThunderboltOutlined />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 m-0">Quick POS Counter Sale</h2>
                        <p className="text-xs text-slate-500 m-0">Instant retail billing for rice, paddy, broken rice, and by-products</p>
                    </div>
                </div>
            </div>

            <Row gutter={[16, 16]}>
                {/* Left: Product Selector */}
                <Col xs={24} lg={13}>
                    <Card className="officer-card h-full">
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-600 uppercase block mb-1">1. Select Product</label>
                                <Select
                                    showSearch
                                    size="large"
                                    className="w-full font-bold"
                                    placeholder="Search Product..."
                                    value={selectedItemId}
                                    onChange={handleItemSelect}
                                    optionFilterProp="children"
                                >
                                    {itemsList.map(item => (
                                        <Option key={item.ITEM_ID} value={item.ITEM_ID}>
                                            {item.NAME} ({item.CODE || item.SYSTEM_CODE}) — Rs. {Number(item.SELLING_PRICE || 0).toFixed(2)}/kg
                                        </Option>
                                    ))}
                                </Select>
                            </div>

                            {/* Quick Product Badges */}
                            <div className="flex flex-wrap gap-1.5">
                                {itemsList.slice(0, 8).map(item => (
                                    <button
                                        key={item.ITEM_ID}
                                        type="button"
                                        onClick={() => handleItemSelect(item.ITEM_ID)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                            selectedItemId === item.ITEM_ID 
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-blue-50'
                                        }`}
                                    >
                                        {item.NAME}
                                    </button>
                                ))}
                            </div>

                            <Divider className="my-2" />

                            <Row gutter={12}>
                                <Col span={8}>
                                    <label className="text-xs font-bold text-slate-600 block mb-1">Bag Weight (KG)</label>
                                    <InputNumber
                                        size="large"
                                        className="w-full"
                                        min={1}
                                        value={bagWeight}
                                        onChange={handleBagWeightChange}
                                    />
                                    <div className="flex gap-1 mt-1.5">
                                        {[5, 10, 25, 50].map(w => (
                                            <button
                                                key={w}
                                                type="button"
                                                onClick={() => handleBagWeightChange(w)}
                                                className={`flex-1 py-0.5 text-[11px] font-bold rounded border ${
                                                    bagWeight === w ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-600 border-slate-200'
                                                }`}
                                            >
                                                {w}k
                                            </button>
                                        ))}
                                    </div>
                                </Col>
                                <Col span={8}>
                                    <label className="text-xs font-bold text-slate-600 block mb-1">Unit Price / Bag (Rs)</label>
                                    <InputNumber
                                        size="large"
                                        className="w-full font-mono font-bold"
                                        value={unitPrice}
                                        onChange={val => setUnitPrice(val || 0)}
                                    />
                                </Col>
                                <Col span={8}>
                                    <label className="text-xs font-bold text-slate-600 block mb-1">Qty (Bags)</label>
                                    <InputNumber
                                        size="large"
                                        className="w-full font-bold text-blue-900"
                                        min={1}
                                        value={bagCount}
                                        onChange={val => setBagCount(val || 1)}
                                    />
                                </Col>
                            </Row>

                            <div className="pt-2">
                                <Button
                                    type="primary"
                                    size="large"
                                    block
                                    icon={<ShoppingCartOutlined />}
                                    onClick={handleAddToCart}
                                    className="!bg-blue-600 font-bold h-12 text-base shadow-md"
                                >
                                    Add Item to Bill (Rs. {(unitPrice * bagCount).toFixed(2)})
                                </Button>
                            </div>
                        </div>
                    </Card>
                </Col>

                {/* Right: Cart & Settlement */}
                <Col xs={24} lg={11}>
                    <Card className="officer-card h-full flex flex-col justify-between">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                                <span className="font-bold text-slate-800 text-sm">🛒 Current Cart ({cart.length} items)</span>
                                {cart.length > 0 && (
                                    <Button type="link" danger size="small" icon={<ClearOutlined />} onClick={clearCart}>
                                        Clear Cart
                                    </Button>
                                )}
                            </div>

                            {/* Desktop View - Table */}
                            <div className="hidden md:block">
                                <Table
                                    dataSource={cart}
                                    columns={cartColumns}
                                    pagination={false}
                                    size="small"
                                    locale={{ emptyText: 'Cart is empty (0 items). Add products from left.' }}
                                    scroll={{ y: 200 }}
                                />
                            </div>

                            {/* Mobile View - Cards */}
                            <div className="md:hidden space-y-2.5">
                                {cart.length === 0 ? (
                                    <div className="p-5 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200 text-slate-400 text-xs">
                                        <ShoppingCartOutlined className="text-xl mb-1 block text-slate-300 mx-auto" />
                                        Cart is empty (0 items). Add products above to build bill.
                                    </div>
                                ) : (
                                    cart.map((item) => (
                                        <div key={item.key} className="p-3 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm">{item.ITEM_NAME}</div>
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
                                                    onClick={() => handleRemoveFromCart(item.key)} 
                                                />
                                            </div>
                                            <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-xs">
                                                <span className="text-slate-600 font-semibold">
                                                    Qty: <strong className="text-blue-700 font-bold text-sm ml-1">{item.BAG_COUNT} bags</strong>
                                                    <span className="text-[10px] text-slate-400 ml-1">({(Number(item.BAG_COUNT || 0) * Number(item.BAG_WEIGHT || 0))} kg)</span>
                                                </span>
                                                <span className="font-mono font-black text-slate-900 text-base">
                                                    Rs. {Number(item.TOTAL_PRICE || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Customer Select */}
                            <div className="pt-2">
                                <label className="text-xs font-bold text-slate-600 block mb-1">Customer (Optional)</label>
                                <Select
                                    allowClear
                                    showSearch
                                    className="w-full"
                                    placeholder="Walk-in Customer"
                                    value={selectedCustomerId}
                                    onChange={setSelectedCustomerId}
                                    optionFilterProp="children"
                                >
                                    {customers.map(c => (
                                        <Option key={c.CUSTOMER_ID} value={c.CUSTOMER_ID}>
                                            {c.NAME} {c.PHONE ? `(${c.PHONE})` : ''}
                                        </Option>
                                    ))}
                                </Select>
                            </div>

                            {/* Payment Options */}
                            <Row gutter={8}>
                                <Col span={12}>
                                    <label className="text-xs font-bold text-slate-600 block mb-1">Payment Method</label>
                                    <Select className="w-full" value={paymentMethod} onChange={setPaymentMethod}>
                                        <Option value="cash">Cash</Option>
                                        <Option value="cheque">Cheque</Option>
                                        <Option value="credit">Credit / Account</Option>
                                    </Select>
                                </Col>
                                <Col span={12}>
                                    <label className="text-xs font-bold text-slate-600 block mb-1">Discount (Rs)</label>
                                    <InputNumber
                                        className="w-full"
                                        min={0}
                                        value={discount}
                                        onChange={val => setDiscount(val || 0)}
                                    />
                                </Col>
                            </Row>

                            {paymentMethod === 'cheque' && (
                                <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 space-y-2">
                                    <Row gutter={8}>
                                        <Col span={12}>
                                            <Input size="small" placeholder="Cheque No" value={chequeNo} onChange={e => setChequeNo(e.target.value)} />
                                        </Col>
                                        <Col span={12}>
                                            <Input size="small" placeholder="Bank" value={chequeBank} onChange={e => setChequeBank(e.target.value)} />
                                        </Col>
                                    </Row>
                                    <DatePicker size="small" className="w-full" placeholder="Cheque Due Date" value={chequeDueDate} onChange={setChequeDueDate} />
                                </div>
                            )}

                            {/* Total Bill Box */}
                            <div className="bg-blue-950 text-white p-4 rounded-xl">
                                <div className="flex justify-between text-xs text-blue-200 pb-1">
                                    <span>Subtotal: Rs. {subTotal.toFixed(2)}</span>
                                    <span>Discount: Rs. {Number(discount).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-blue-800">
                                    <span className="font-bold text-sm text-white uppercase">Net Payable</span>
                                    <span className="text-2xl font-black font-mono">
                                        Rs. {finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            <Button
                                type="primary"
                                size="large"
                                block
                                icon={<CheckCircleOutlined />}
                                loading={submitting}
                                onClick={handleCheckout}
                                disabled={cart.length === 0}
                                className="!bg-emerald-600 font-bold h-12 text-base shadow-md"
                            >
                                Complete Sale & Print Bill
                            </Button>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* Print Modal */}
            <PrintableBill
                visible={printModal}
                onClose={() => setPrintModal(false)}
                bill={printedBill}
            />
        </div>
    );
}
