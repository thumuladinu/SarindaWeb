import React, { useState, useEffect } from 'react';
import { Form, Input, Button, DatePicker, Select, Divider, InputNumber, Row, Col, Typography, message, Modal } from 'antd';
import axios from 'axios';
import Cookies from 'js-cookie';
import dayjs from 'dayjs';
import { FINISHED_ITEMS } from '../../utils/constants';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

const { Title, Text } = Typography;

export default function AddSaleForm({ onSuccess, onCancel }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [baseRiceType, setBaseRiceType] = useState('රතු කැකුළු හාල්'); // Default base rice
    const [availableBases, setAvailableBases] = useState(['රතු කැකුළු හාල්', 'සුදු කැකුළු හාල්']);
    const [systemItems, setSystemItems] = useState({ P: null, N: null });
    const [kgPriceP, setKgPriceP] = useState(0);
    const [kgPriceN, setKgPriceN] = useState(0);
    
    // Track row data for dynamic totals
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
        fetchCustomers();
        fetchSystemItems();
    }, []);

    const fetchCustomers = async () => {
        try {
            const res = await axios.post('/api/MillgetAllCustomers', {}, { withCredentials: true });
            if (res.data.success) {
                setCustomers(res.data.result);
            }
        } catch (e) {
            console.error('No customers found or route missing', e);
        }
    };

    const fetchSystemItems = async () => {
        // Find the hardcoded definitions for P and N variations
        const pDef = FINISHED_ITEMS.find(i => i.BASE === baseRiceType && i.VARIATION === 'P');
        const nDef = FINISHED_ITEMS.find(i => i.BASE === baseRiceType && i.VARIATION === 'N');
        
        try {
            const res = await axios.post('/api/MillgetAllItems', {}, { withCredentials: true });
            let dbItems = [];
            if (res.data.success) {
                dbItems = res.data.result || [];
            }

            // Extract active bases based on IS_ACTIVE status from DB
            const activeSystemCodes = dbItems.filter(i => Number(i.IS_ACTIVE) === 1).map(i => i.SYSTEM_CODE);
            const activeBases = Array.from(new Set(
                FINISHED_ITEMS
                    .filter(i => activeSystemCodes.includes(i.SYSTEM_CODE))
                    .map(i => i.BASE)
            )).filter(Boolean);

            if (activeBases.length > 0) {
                setAvailableBases(activeBases);
                if (!activeBases.includes(baseRiceType)) {
                    setBaseRiceType(activeBases[0]);
                }
            }

            // Find matching items from DB to get the integer ITEM_ID and SELLING_PRICE
            const pItem = dbItems.find(i => i.SYSTEM_CODE === pDef?.SYSTEM_CODE) || pDef;
            const nItem = dbItems.find(i => i.SYSTEM_CODE === nDef?.SYSTEM_CODE) || nDef;
            
            setSystemItems({ P: pItem, N: nItem });

            // Auto-populate prices from DB
            const pPrice = parseFloat(pItem.SELLING_PRICE || 0);
            const nPrice = parseFloat(nItem.SELLING_PRICE || 0);

            setKgPriceP(pPrice);
            setKgPriceN(nPrice);

            setRowsP({
                5: { price: pPrice * 5, qty: 0 },
                10: { price: pPrice * 10, qty: 0 },
                25: { price: pPrice * 25, qty: 0 }
            });

            setRowsN({
                5: { price: nPrice * 5, qty: 0 },
                10: { price: nPrice * 10, qty: 0 },
                25: { price: nPrice * 25, qty: 0 }
            });
        } catch (e) {
            console.error('Failed to fetch items for Add Sale Form:', e);
            setSystemItems({ P: pDef, N: nDef });
        }
    };

    useEffect(() => {
        fetchSystemItems();
    }, [baseRiceType]);

    const handleRowChange = (type, weight, field, value) => {
        const val = value || 0;
        if (type === 'P') {
            setRowsP(prev => ({ ...prev, [weight]: { ...prev[weight], [field]: val } }));
        } else {
            setRowsN(prev => ({ ...prev, [weight]: { ...prev[weight], [field]: val } }));
        }
    };

    const calculateTotal = () => {
        let total = 0;
        [5, 10, 25].forEach(w => {
            total += (rowsP[w].price * rowsP[w].qty);
            total += (rowsN[w].price * rowsN[w].qty);
        });
        return total;
    };

    const handleFinish = async (values) => {
        setLoading(true);
        try {
            const items = [];
            
            const addRowToItems = (type, weight, rowData) => {
                if (rowData.qty > 0) {
                    const itemDb = type === 'P' ? systemItems.P : systemItems.N;
                    if (!itemDb) {
                        message.warning(`System item for ${type} not found! Skipping.`);
                        return;
                    }
                    const rawId = itemDb.ITEM_ID;
                    const parsedId = parseInt(rawId, 10);
                    
                    if (isNaN(parsedId)) {
                        console.error('Invalid ITEM_ID for item:', itemDb);
                        message.error(`Item '${itemDb.NAME}' not found in database catalog. Please refresh.`);
                        return;
                    }

                    items.push({
                        SYSTEM_CODE: itemDb.SYSTEM_CODE,
                        ITEM_ID: parsedId,
                        ITEM_NAME: itemDb.NAME,
                        BAG_WEIGHT: weight,
                        BAG_COUNT: rowData.qty,
                        QUANTITY: weight * rowData.qty,
                        UNIT_PRICE: rowData.price,
                        TOTAL_PRICE: rowData.price * rowData.qty
                    });
                }
            };

            [5, 10, 25].forEach(w => {
                addRowToItems('P', w, rowsP[w]);
                addRowToItems('N', w, rowsN[w]);
            });

            if (items.length === 0) {
                message.error('Please add at least one bag quantity to the bill.');
                setLoading(false);
                return;
            }

            const payload = {
                CUSTOMER_ID: values.CUSTOMER_ID,
                BATCH_NO: values.BATCH_NO,
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                TOTAL_AMOUNT: calculateTotal(),
                PRINTED_SUB_TOTAL: calculateTotal(),
                NET_AMOUNT: calculateTotal(), // No discount at this stage yet
                PAYMENT_METHOD: 'cash',
                CREATED_BY: currentUser.ID || 1,
                CREATED_BY_NAME: getCurrentUserName(),
                DEVICE_ID: getTerminalDeviceCode(),
                ITEMS: items
            };

            const response = await axios.post('/api/mill/sales/add', payload, { withCredentials: true });
            
            if (response.data.success) {
                form.resetFields();
                fetchSystemItems(); // Reset rows based on DB prices
                
                Modal.confirm({
                    title: 'Printed Bill Generated!',
                    content: 'Do you want to print this bill now?',
                    okText: 'Yes, Print',
                    cancelText: 'No',
                    onOk() {
                        window.open(`/print-bill/${response.data.billId}`, '_blank', 'width=850,height=900,toolbar=0,menubar=0');
                        onSuccess();
                    },
                    onCancel() {
                        onSuccess();
                    }
                });
            } else {
                message.error(response.data.message || 'Failed to create bill');
            }
        } catch (error) {
            console.error('Error adding sale:', error);
            message.error('Failed to create bill');
        } finally {
            setLoading(false);
        }
    };

    const handleKgPriceChange = (type, newKgRate) => {
        const kgRate = newKgRate || 0;
        if (type === 'P') {
            setKgPriceP(kgRate);
            setRowsP(prev => ({
                5: { ...prev[5], price: kgRate * 5 },
                10: { ...prev[10], price: kgRate * 10 },
                25: { ...prev[25], price: kgRate * 25 }
            }));
        } else {
            setKgPriceN(kgRate);
            setRowsN(prev => ({
                5: { ...prev[5], price: kgRate * 5 },
                10: { ...prev[10], price: kgRate * 10 },
                25: { ...prev[25], price: kgRate * 25 }
            }));
        }
    };

    const renderRows = (type, title) => {
        const currentKgPrice = type === 'P' ? kgPriceP : kgPriceN;
        return (
            <div className="mb-6 p-4 bg-gray-50 border rounded-lg dark:bg-[#18181b] dark:border-white/10">
                <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
                    <Title level={5} className="!mb-0 dark:text-gray-200">{title}</Title>
                    <div className="flex items-center gap-2">
                        <Text className="text-xs text-gray-600 dark:text-gray-400 font-semibold">1 KG Price (Rs):</Text>
                        <InputNumber
                            size="small"
                            min={0}
                            step={0.5}
                            value={currentKgPrice}
                            onChange={(val) => handleKgPriceChange(type, val)}
                            className="w-28 font-bold font-mono text-blue-600"
                        />
                    </div>
                </div>
                <Row gutter={[16, 16]} className="mb-2 font-semibold dark:text-gray-300 text-xs">
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
                                    className="w-full" 
                                    min={0} 
                                    placeholder="Price"
                                    value={row.price}
                                    onChange={(val) => handleRowChange(type, weight, 'price', val)}
                                />
                            </Col>
                            <Col span={6}>
                                <InputNumber 
                                    className="w-full" 
                                    min={0} 
                                    placeholder="Qty"
                                    value={row.qty}
                                    onChange={(val) => handleRowChange(type, weight, 'qty', val)}
                                />
                            </Col>
                            <Col span={6} className="text-right font-mono font-semibold text-emerald-600">
                                <Text>{(row.price * row.qty).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                            </Col>
                        </Row>
                    );
                })}
            </div>
        );
    };

    return (
        <Form form={form} layout="vertical" onFinish={handleFinish} initialValues={{ 
            DATE: dayjs(),
            BATCH_NO: `B-${dayjs().format('YYYYMMDD')}-${Math.floor(100 + Math.random() * 900)}`
        }}>
            <Row gutter={16}>
                <Col span={8}>
                    <Form.Item name="CUSTOMER_ID" label="Customer (Optional)">
                        <Select
                            showSearch
                            allowClear
                            placeholder="Select a customer"
                            filterOption={(input, option) =>
                                (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        >
                            {customers.map(c => (
                                <Select.Option key={c.CUSTOMER_ID} value={c.CUSTOMER_ID}>
                                    {c.NAME} - {c.ADDRESS}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Col>
                <Col span={8}>
                    <Form.Item name="DATE" label="Date" rules={[{ required: true, message: 'Date is required' }]}>
                        <DatePicker className="w-full" />
                    </Form.Item>
                </Col>
                <Col span={8}>
                    <Form.Item name="BATCH_NO" label="Batch Number">
                        <Input placeholder="Auto-generated or custom" />
                    </Form.Item>
                </Col>
            </Row>

            <Row gutter={16}>
                <Col span={8}>
                    <Form.Item label="Rice Variety">
                        <Select 
                            value={baseRiceType} 
                            onChange={(val) => setBaseRiceType(val)}
                        >
                            {availableBases.map(base => (
                                <Select.Option key={base} value={base}>{base}</Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Col>
                <Col span={16}>
                    <div className="pt-8 text-gray-500 italic">
                        Selecting a variety updates the P (Polished) and N (Niudu) sections below.
                    </div>
                </Col>
            </Row>

            <Divider>Printed Order Details</Divider>

            {renderRows('P', `P (Polished) - ${baseRiceType}`)}
            {renderRows('N', `N (Niudu) - ${baseRiceType}`)}

            <div className="flex justify-between items-center bg-blue-50 p-4 rounded-lg mt-4 border border-blue-100 dark:bg-blue-900/20 dark:border-blue-500/30">
                <Text strong className="text-lg dark:text-gray-200">Printed Sub Total:</Text>
                <Text strong className="text-xl text-blue-600 dark:text-blue-400">
                    Rs. {calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
            </div>

            <div className="flex justify-end gap-3 mt-8">
                <Button onClick={onCancel}>Cancel</Button>
                <Button type="primary" htmlType="submit" loading={loading} className="!bg-gradient-to-r !from-blue-500 !to-blue-600">
                    Generate Printed Bill
                </Button>
            </div>
        </Form>
    );
}
