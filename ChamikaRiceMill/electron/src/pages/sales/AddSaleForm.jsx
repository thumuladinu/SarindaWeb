import React, { useState, useEffect } from 'react';
import { Form, Input, Button, DatePicker, Select, Divider, InputNumber, Row, Col, Typography, message, Modal, Card, Space } from 'antd';
import { PrinterOutlined, SaveOutlined, ReloadOutlined, PlusOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import db, { seedDefaultOfflineData } from '../../services/db';
import syncService from '../../services/syncService';
import { FINISHED_ITEMS } from '../../utils/constants';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

const { Title, Text } = Typography;

export default function AddSaleForm({ onBillCreated, onPrintBill }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [vehiclesList, setVehiclesList] = useState([]);
    const [driversList, setDriversList] = useState([]);
    const [vehicleSearchText, setVehicleSearchText] = useState('');
    const [driverSearchText, setDriverSearchText] = useState('');
    const [baseRiceType, setBaseRiceType] = useState('රතු කැකුළු හාල්'); // Default base rice
    const [availableBases, setAvailableBases] = useState(['රතු කැකුළු හාල්', 'සුදු කැකුළු හාල්']);
    const [systemItems, setSystemItems] = useState({ P: null, N: null });
    const [kgPriceP, setKgPriceP] = useState(150);
    const [kgPriceN, setKgPriceN] = useState(140);

    // Track row data for dynamic totals
    const [rowsP, setRowsP] = useState({
        5: { price: 750, qty: 0 },
        10: { price: 1500, qty: 0 },
        25: { price: 3750, qty: 0 }
    });

    const [rowsN, setRowsN] = useState({
        5: { price: 700, qty: 0 },
        10: { price: 1400, qty: 0 },
        25: { price: 3500, qty: 0 }
    });

    const generateNewBatchNo = () => {
        const todayStr = dayjs().format('YYYYMMDD');
        const randomCode = Math.floor(100 + Math.random() * 900);
        return `B-${todayStr}-${randomCode}`;
    };

    const loadData = async () => {
        console.log('[AddSaleForm] Initializing loadData() for offline database...');
        try {
            await seedDefaultOfflineData();

            const [custList, vList, sList, pastBills, pastDispatches, pastInwards] = await Promise.all([
                db.customers.toArray().catch(() => []),
                db.vehicles.toArray().catch(() => []),
                db.staff.toArray().catch(() => []),
                db.sales_bills.toArray().catch(() => []),
                db.dispatch_notes.toArray().catch(() => []),
                db.stock_inwards.toArray().catch(() => [])
            ]);

            // 1. CUSTOMERS - Include all registered database customer records
            const loadedCustomers = (custList || []).map((c, idx) => {
                const name = (c.NAME || c.CUSTOMER_NAME || '').trim();
                const id = c.CUSTOMER_ID || c.ID || c.id || `CUST-${idx}`;
                return {
                    id: id,
                    name: name,
                    phone: c.PHONE || c.PHONE_NUMBER || c.phone || '',
                    address: c.ADDRESS || c.LOCATION || c.address || c.location || ''
                };
            }).filter(c => Boolean(c.name));

            // If db.customers has no items, fallback to past bills history
            if (loadedCustomers.length === 0) {
                const pastCustMap = new Map();
                (pastBills || []).forEach(b => {
                    if (b.CUSTOMER_NAME && b.CUSTOMER_NAME !== 'Walk-in Customer') {
                        const name = b.CUSTOMER_NAME.trim();
                        if (!pastCustMap.has(name)) {
                            pastCustMap.set(name, {
                                id: b.CUSTOMER_ID || name,
                                name: name,
                                phone: b.CUSTOMER_PHONE || '',
                                address: b.CUSTOMER_ADDRESS || ''
                            });
                        }
                    }
                });
                loadedCustomers.push(...Array.from(pastCustMap.values()));
            }

            setCustomers(loadedCustomers);
            console.log('[AddSaleForm] Loaded Customers count:', loadedCustomers.length, loadedCustomers);

            // 2. VEHICLES - Deduplicated by Vehicle Number
            const vehicleMap = new Map();
            (vList || []).forEach(v => {
                const num = (v.VEHICLE_NO || v.LORRY_NO || v.NUMBER || '').trim();
                if (num) {
                    const key = num.toUpperCase();
                    if (!vehicleMap.has(key)) {
                        vehicleMap.set(key, {
                            label: `${num}${v.DRIVER_NAME ? ` (${v.DRIVER_NAME})` : ''}`,
                            value: num,
                            driver: v.DRIVER_NAME || ''
                        });
                    }
                }
            });
            // Only fallback to past records if no registered vehicles exist in db.vehicles
            if (vehicleMap.size === 0) {
                const addVehicleNum = (num, driver = '') => {
                    if (num && typeof num === 'string') {
                        const clean = num.trim();
                        const key = clean.toUpperCase();
                        if (clean && !vehicleMap.has(key)) {
                            vehicleMap.set(key, { label: clean, value: clean, driver: driver || '' });
                        }
                    }
                };
                (pastBills || []).forEach(b => addVehicleNum(b.VEHICLE_NO || b.LORRY_NO, b.DRIVER_NAME));
                (pastDispatches || []).forEach(d => addVehicleNum(d.LORRY_NO || d.VEHICLE_NO, d.DRIVER_NAME));
                (pastInwards || []).forEach(i => addVehicleNum(i.VEHICLE_NO));
            }
            const loadedVehicles = Array.from(vehicleMap.values());
            setVehiclesList(loadedVehicles);
            console.log('[AddSaleForm] Loaded Vehicles count:', loadedVehicles.length, loadedVehicles);

            // 3. DRIVERS - ONLY staff with DRIVER role + assigned vehicle drivers (No Admins/Cashiers)
            const driverMap = new Map();
            (sList || []).forEach(s => {
                const role = (s.ROLE || '').trim().toUpperCase();
                const name = (s.NAME || '').trim();
                if (name && (role === 'DRIVER' || role.includes('DRIVER'))) {
                    const key = name.toLowerCase();
                    if (!driverMap.has(key)) {
                        driverMap.set(key, name);
                    }
                }
            });

            // Also include drivers explicitly assigned to registered vehicles
            (vList || []).forEach(v => {
                if (v.DRIVER_NAME) {
                    const name = v.DRIVER_NAME.trim();
                    const key = name.toLowerCase();
                    if (!driverMap.has(key)) {
                        driverMap.set(key, name);
                    }
                }
            });

            // If no drivers found from staff/vehicles, fallback to past records
            if (driverMap.size === 0) {
                (pastBills || []).forEach(b => {
                    if (b.DRIVER_NAME) {
                        const name = b.DRIVER_NAME.trim();
                        const key = name.toLowerCase();
                        if (!driverMap.has(key)) driverMap.set(key, name);
                    }
                });
                (pastDispatches || []).forEach(d => {
                    if (d.DRIVER_NAME) {
                        const name = d.DRIVER_NAME.trim();
                        const key = name.toLowerCase();
                        if (!driverMap.has(key)) driverMap.set(key, name);
                    }
                });
            }

            const loadedDrivers = Array.from(driverMap.values()).map(name => ({ label: name, value: name }));
            setDriversList(loadedDrivers);
            console.log('[AddSaleForm] Loaded Drivers count:', loadedDrivers.length, loadedDrivers);

            // Always ensure BATCH_NO is populated if empty
            if (!form.getFieldValue('BATCH_NO')) {
                form.setFieldValue('BATCH_NO', generateNewBatchNo());
            }
            if (!form.getFieldValue('DATE')) {
                form.setFieldValue('DATE', dayjs());
            }
        } catch (e) {
            console.error('Error loading initial items for sale form:', e);
        }
    };

    const handleVehicleSelect = (val) => {
        if (!val) return;
        const found = vehiclesList.find(v => v.value === val);
        if (found && found.driver && !form.getFieldValue('DRIVER_NAME')) {
            form.setFieldsValue({ DRIVER_NAME: found.driver });
        }
    };

    const fetchSystemItems = async () => {
        const pDef = FINISHED_ITEMS.find(i => i.BASE === baseRiceType && i.VARIATION === 'P');
        const nDef = FINISHED_ITEMS.find(i => i.BASE === baseRiceType && i.VARIATION === 'N');
        
        try {
            await seedDefaultOfflineData();
            const dbItems = await db.items.toArray() || [];

            // Extract active bases based on IS_ACTIVE status from local DB
            const activeSystemCodes = dbItems.filter(i => Number(i.IS_ACTIVE) === 1).map(i => i.SYSTEM_CODE);
            const activeBases = Array.from(new Set(
                FINISHED_ITEMS
                    .filter(i => activeSystemCodes.includes(i.SYSTEM_CODE))
                    .map(i => i.BASE)
            )).filter(Boolean);

            const basesToUse = activeBases.length > 0 ? activeBases : ['රතු කැකුළු හාල්', 'සුදු කැකුළු හාල්', 'නාඩු හාල්'];
            setAvailableBases(basesToUse);
            if (!basesToUse.includes(baseRiceType)) {
                setBaseRiceType(basesToUse[0]);
            }

            const pItem = dbItems.find(i => i.SYSTEM_CODE === pDef?.SYSTEM_CODE) || pDef;
            const nItem = dbItems.find(i => i.SYSTEM_CODE === nDef?.SYSTEM_CODE) || nDef;
            
            setSystemItems({ P: pItem, N: nItem });

            // Default rate fallback (Rs 150/140 or 160/150 for Nadu) if missing or 0
            const defaultRateP = baseRiceType.includes('නාඩු') ? 160 : 150;
            const defaultRateN = baseRiceType.includes('නාඩු') ? 150 : 140;

            const pPrice = parseFloat(pItem?.SELLING_PRICE) > 0 ? parseFloat(pItem.SELLING_PRICE) : defaultRateP;
            const nPrice = parseFloat(nItem?.SELLING_PRICE) > 0 ? parseFloat(nItem.SELLING_PRICE) : defaultRateN;

            setKgPriceP(pPrice);
            setKgPriceN(nPrice);

            setRowsP(prev => ({
                5: { price: pPrice * 5, qty: prev[5]?.qty || 0 },
                10: { price: pPrice * 10, qty: prev[10]?.qty || 0 },
                25: { price: pPrice * 25, qty: prev[25]?.qty || 0 }
            }));

            setRowsN(prev => ({
                5: { price: nPrice * 5, qty: prev[5]?.qty || 0 },
                10: { price: nPrice * 10, qty: prev[10]?.qty || 0 },
                25: { price: nPrice * 25, qty: prev[25]?.qty || 0 }
            }));
        } catch (e) {
            console.error('Failed to fetch system items for electron AddSaleForm:', e);
            const defaultRateP = baseRiceType.includes('නාඩු') ? 160 : 150;
            const defaultRateN = baseRiceType.includes('නාඩු') ? 150 : 140;
            setKgPriceP(defaultRateP);
            setKgPriceN(defaultRateN);
            setRowsP(prev => ({ 5: { price: defaultRateP * 5, qty: prev[5]?.qty || 0 }, 10: { price: defaultRateP * 10, qty: prev[10]?.qty || 0 }, 25: { price: defaultRateP * 25, qty: prev[25]?.qty || 0 } }));
            setRowsN(prev => ({ 5: { price: defaultRateN * 5, qty: prev[5]?.qty || 0 }, 10: { price: defaultRateN * 10, qty: prev[10]?.qty || 0 }, 25: { price: defaultRateN * 25, qty: prev[25]?.qty || 0 } }));
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        fetchSystemItems();
    }, [baseRiceType]);

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

    const handleRowChange = (type, weight, field, value) => {
        const val = value || 0;
        if (type === 'P') {
            setRowsP(prev => ({ ...prev, [weight]: { ...prev[weight], [field]: val } }));
        } else {
            setRowsN(prev => ({ ...prev, [weight]: { ...prev[weight], [field]: val } }));
        }
    };

    const resetFormQuantities = () => {
        setRowsP(prev => ({
            5: { ...prev[5], qty: 0 },
            10: { ...prev[10], qty: 0 },
            25: { ...prev[25], qty: 0 }
        }));
        setRowsN(prev => ({
            5: { ...prev[5], qty: 0 },
            10: { ...prev[10], qty: 0 },
            25: { ...prev[25], qty: 0 }
        }));
        fetchSystemItems(); // Reset pricing rows
        form.setFieldsValue({
            BATCH_NO: generateNewBatchNo(),
            DATE: dayjs(),
            CUSTOMER_ID: undefined
        });
    };

    const calculateTotal = () => {
        let total = 0;
        [5, 10, 25].forEach(w => {
            total += (Number(rowsP[w].price || 0) * Number(rowsP[w].qty || 0));
            total += (Number(rowsN[w].price || 0) * Number(rowsN[w].qty || 0));
        });
        return parseFloat(total.toFixed(2));
    };

    const handleFinish = async (values, shouldPrint = false) => {
        setLoading(true);
        try {
            const items = [];

            const addRowToItems = (type, weight, rowData) => {
                if (rowData.qty > 0) {
                    const itemDb = type === 'P' ? systemItems.P : systemItems.N;
                    if (!itemDb) {
                        message.warning(`System item for ${type} not found!`);
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
                        TOTAL_PRICE: parseFloat((rowData.price * rowData.qty).toFixed(2))
                    });
                }
            };

            [5, 10, 25].forEach(w => {
                addRowToItems('P', w, rowsP[w]);
                addRowToItems('N', w, rowsN[w]);
            });

            const total = calculateTotal();
            const customerObj = customers.find(c => String(c.id) === String(values.CUSTOMER_ID) || String(c.name) === String(values.CUSTOMER_ID));
            const now = dayjs();
            const chosenDate = values.DATE ? dayjs(values.DATE) : now;
            const fullDate = chosenDate.hour(now.hour()).minute(now.minute()).second(now.second());
            const dateStr = fullDate.toISOString();
            const terminalCode = getTerminalDeviceCode();
            const userName = getCurrentUserName();

            // Generate sequential 4-digit unique invoice number
            const generateSequentialInvoiceNo = async () => {
                const todayStr = dayjs().format('YYYYMMDD');
                const prefix = `MIV-${todayStr}-${terminalCode}-`;
                const allBills = await db.sales_bills.toArray();
                let maxSeq = 0;
                allBills.forEach(b => {
                    if (b.INVOICE_NO && b.INVOICE_NO.startsWith(prefix)) {
                        const parts = b.INVOICE_NO.split('-');
                        const last = parseInt(parts[parts.length - 1], 10);
                        if (!isNaN(last) && last > maxSeq) {
                            maxSeq = last;
                        }
                    }
                });
                const nextSeq = maxSeq + 1;
                return `${prefix}${String(nextSeq).padStart(4, '0')}`;
            };

            const tempInvoiceNo = await generateSequentialInvoiceNo();

            const billPayload = {
                INVOICE_NO: tempInvoiceNo,
                BATCH_NO: values.BATCH_NO || generateNewBatchNo(),
                VEHICLE_NO: values.VEHICLE_NO || '',
                LORRY_NO: values.VEHICLE_NO || '',
                DRIVER_NAME: values.DRIVER_NAME || '',
                CUSTOMER_ID: values.CUSTOMER_ID || null,
                CUSTOMER_NAME: customerObj ? customerObj.name : (values.CUSTOMER_NAME || 'Walk-in Customer'),
                CUSTOMER_PHONE: customerObj ? customerObj.phone : null,
                CUSTOMER_ADDRESS: customerObj ? customerObj.address : null,
                DATE: dateStr,
                CREATED_DATE: now.format('YYYY-MM-DD HH:mm:ss'),
                TOTAL_AMOUNT: total,
                PRINTED_SUB_TOTAL: total,
                NET_AMOUNT: total,
                FINAL_AMOUNT: total,
                DISCOUNT: 0,
                IS_SETTLED: 0,
                PAYMENT_METHOD: 'cash',
                DEVICE_ID: terminalCode,
                ADDED_BY: userName,
                CREATED_BY_NAME: userName,
                ITEMS_JSON: items,
                IS_SYNCED: 0
            };

            const localId = await db.sales_bills.add(billPayload);
            message.success(`Printed Bill #${tempInvoiceNo} created successfully!`);

            const createdBill = { ...billPayload, LOCAL_ID: localId, ITEMS: items };

            if (shouldPrint && onPrintBill) {
                onPrintBill(createdBill);
            }

            if (onBillCreated) onBillCreated(createdBill);

            // Reset form ready for next entry
            resetFormQuantities();

            // Background sync
            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Error saving bill:', e);
            message.error('Failed to create bill');
        } finally {
            setLoading(false);
        }
    };

    const customerOptions = customers.map(c => {
        const info = [c.phone, c.address].filter(Boolean).join(' - ');
        return {
            label: `${c.name}${info ? ` (${info})` : ''}`,
            value: String(c.id || c.name)
        };
    });

    const vehicleOptions = [
        ...vehiclesList,
        ...(vehicleSearchText && !vehiclesList.some(v => v.value.toLowerCase() === vehicleSearchText.trim().toLowerCase())
            ? [{ label: `+ Add "${vehicleSearchText.trim()}"`, value: vehicleSearchText.trim() }]
            : [])
    ];

    const driverOptions = [
        ...driversList,
        ...(driverSearchText && !driversList.some(d => d.value.toLowerCase() === driverSearchText.trim().toLowerCase())
            ? [{ label: `+ Add "${driverSearchText.trim()}"`, value: driverSearchText.trim() }]
            : [])
    ];

    return (
        <Card className="officer-card shadow-sm border border-slate-200">
            <Form 
                form={form} 
                layout="vertical" 
                initialValues={{
                    BATCH_NO: generateNewBatchNo(),
                    DATE: dayjs()
                }}
                onFinish={(vals) => handleFinish(vals, false)}
            >
                <div className="space-y-4">
                    {/* Top Metadata Row */}
                    <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-3">
                        <Row gutter={[16, 16]} align="bottom">
                            <Col xs={24} md={10}>
                                <Form.Item 
                                    label={<span className="font-bold text-slate-700">Customer (Optional)</span>} 
                                    name="CUSTOMER_ID"
                                    className="!mb-0"
                                >
                                    <Select 
                                        placeholder="Select or Search Customer" 
                                        showSearch 
                                        allowClear
                                        size="large"
                                        filterOption={(input, option) =>
                                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                        }
                                        options={customerOptions}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={12} md={7}>
                                <Form.Item 
                                    label={<span className="font-bold text-slate-700">Date</span>} 
                                    name="DATE" 
                                    rules={[{ required: true }]}
                                    className="!mb-0"
                                >
                                    <DatePicker className="w-full" size="large" format="YYYY-MM-DD" />
                                </Form.Item>
                            </Col>
                            <Col xs={12} md={7}>
                                <Form.Item 
                                    label={<span className="font-bold text-slate-700">Batch Number</span>} 
                                    name="BATCH_NO" 
                                    rules={[{ required: true, message: 'Please enter BATCH_NO' }]}
                                    className="!mb-0"
                                >
                                    <Input placeholder="B-YYYYMMDD-XXX" size="large" className="font-mono font-bold" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={[16, 16]} align="bottom">
                            <Col xs={24} md={12}>
                                <Form.Item 
                                    label={<span className="font-bold text-slate-700">Vehicle / Lorry No (Optional)</span>} 
                                    name="VEHICLE_NO"
                                    className="!mb-0"
                                >
                                    <Select
                                        size="large"
                                        allowClear
                                        showSearch
                                        placeholder="Select or Type Vehicle Number"
                                        onSearch={text => setVehicleSearchText(text)}
                                        onChange={handleVehicleSelect}
                                        filterOption={(input, option) =>
                                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                        }
                                        options={vehicleOptions}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item 
                                    label={<span className="font-bold text-slate-700">Driver Name (Optional)</span>} 
                                    name="DRIVER_NAME"
                                    className="!mb-0"
                                >
                                    <Select
                                        size="large"
                                        allowClear
                                        showSearch
                                        placeholder="Select or Type Driver Name"
                                        onSearch={text => setDriverSearchText(text)}
                                        filterOption={(input, option) =>
                                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                        }
                                        options={driverOptions}
                                    />
                                </Form.Item>
                            </Col>
                        </Row>
                    </div>

                    {/* Rice Variety Selection */}
                    <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                        <Row gutter={16} align="middle">
                            <Col xs={24} md={12}>
                                <Form.Item 
                                    label={<span className="font-bold text-slate-700">Rice Variety</span>} 
                                    className="!mb-0"
                                >
                                     <Select 
                                        value={baseRiceType} 
                                        onChange={(val) => setBaseRiceType(val)}
                                        size="large"
                                    >
                                        {availableBases.map(base => (
                                            <Select.Option key={base} value={base}>{base}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <div className="text-slate-500 italic text-sm pt-5">
                                    Selecting a variety updates the P (Polished) and N (Niudu) sections below.
                                </div>
                            </Col>
                        </Row>
                    </div>

                    {/* Matrix Section */}
                    <div>
                        <div className="font-black text-slate-800 text-xs uppercase tracking-wide flex items-center gap-2 mb-3 mt-4">
                            <FileTextOutlined className="text-blue-600 text-base" />
                            <span>Printed Order Details Matrix</span>
                        </div>

                        <Row gutter={[16, 16]}>
                            {/* P Card */}
                            <Col xs={24} lg={12}>
                                <div className="bg-white rounded-xl border border-blue-200 overflow-hidden shadow-xs h-full">
                                    <div className="bg-blue-600 px-4 py-2.5 font-bold text-white text-xs flex justify-between items-center flex-wrap gap-2">
                                        <span>P (Polished) - {baseRiceType}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-blue-100 font-semibold text-[11px]">1 KG Rate (Rs):</span>
                                            <InputNumber
                                                size="small"
                                                min={0}
                                                step={0.5}
                                                value={kgPriceP}
                                                onChange={v => handleKgPriceChange('P', v)}
                                                className="w-24 font-bold font-mono text-blue-900"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <div className="grid grid-cols-12 gap-2 text-xs font-bold text-slate-500 pb-2 border-b border-slate-100">
                                            <div className="col-span-3">Bag Size</div>
                                            <div className="col-span-3 text-center">Price / Bag (Rs)</div>
                                            <div className="col-span-3 text-center">Qty (Bags)</div>
                                            <div className="col-span-3 text-right">Total (Rs)</div>
                                        </div>
                                        {[5, 10, 25].map(w => (
                                            <div key={`p-${w}`} className="grid grid-cols-12 gap-2 items-center py-2.5 border-b border-slate-100 last:border-0 hover:bg-blue-50/30 transition-colors">
                                                <div className="col-span-3 font-bold text-slate-800 text-sm">{w} kg</div>
                                                <div className="col-span-3">
                                                    <InputNumber
                                                        className="w-full"
                                                        value={rowsP[w].price}
                                                        onChange={v => handleRowChange('P', w, 'price', v)}
                                                        step={0.1}
                                                    />
                                                </div>
                                                <div className="col-span-3">
                                                    <InputNumber
                                                        className="w-full font-bold text-blue-900"
                                                        min={0}
                                                        value={rowsP[w].qty}
                                                        onChange={v => handleRowChange('P', w, 'qty', v)}
                                                    />
                                                </div>
                                                <div className="col-span-3 text-right font-mono font-bold text-slate-900">
                                                    Rs. {(rowsP[w].price * rowsP[w].qty).toFixed(2)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Col>

                            {/* N Card */}
                            <Col xs={24} lg={12}>
                                <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden shadow-xs h-full">
                                    <div className="bg-emerald-600 px-4 py-2.5 font-bold text-white text-xs flex justify-between items-center flex-wrap gap-2">
                                        <span>N (Niudu) - {baseRiceType}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-emerald-100 font-semibold text-[11px]">1 KG Rate (Rs):</span>
                                            <InputNumber
                                                size="small"
                                                min={0}
                                                step={0.5}
                                                value={kgPriceN}
                                                onChange={v => handleKgPriceChange('N', v)}
                                                className="w-24 font-bold font-mono text-emerald-900"
                                            />
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <div className="grid grid-cols-12 gap-2 text-xs font-bold text-slate-500 pb-2 border-b border-slate-100">
                                            <div className="col-span-3">Bag Size</div>
                                            <div className="col-span-3 text-center">Price / Bag (Rs)</div>
                                            <div className="col-span-3 text-center">Qty (Bags)</div>
                                            <div className="col-span-3 text-right">Total (Rs)</div>
                                        </div>
                                        {[5, 10, 25].map(w => (
                                            <div key={`n-${w}`} className="grid grid-cols-12 gap-2 items-center py-2.5 border-b border-slate-100 last:border-0 hover:bg-emerald-50/30 transition-colors">
                                                <div className="col-span-3 font-bold text-slate-800 text-sm">{w} kg</div>
                                                <div className="col-span-3">
                                                    <InputNumber
                                                        className="w-full"
                                                        value={rowsN[w].price}
                                                        onChange={v => handleRowChange('N', w, 'price', v)}
                                                        step={0.1}
                                                    />
                                                </div>
                                                <div className="col-span-3">
                                                    <InputNumber
                                                        className="w-full font-bold text-blue-900"
                                                        min={0}
                                                        value={rowsN[w].qty}
                                                        onChange={v => handleRowChange('N', w, 'qty', v)}
                                                    />
                                                </div>
                                                <div className="col-span-3 text-right font-mono font-bold text-slate-900">
                                                    Rs. {(rowsN[w].price * rowsN[w].qty).toFixed(2)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </Col>
                        </Row>
                    </div>

                    {/* Sub Total & Actions Bar */}
                    <div className="bg-blue-950 text-white p-4 rounded-xl shadow-md flex flex-wrap justify-between items-center gap-4">
                        <div>
                            <span className="text-xs font-bold tracking-wider uppercase text-blue-300 block">Printed Sub Total</span>
                            <span className="text-3xl font-black font-mono">
                                Rs. {calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button 
                                size="large" 
                                icon={<ReloadOutlined />} 
                                onClick={resetFormQuantities}
                                className="font-bold !border-blue-700 !text-blue-200 hover:!text-white"
                            >
                                Reset
                            </Button>
                            <Button 
                                type="primary" 
                                htmlType="submit" 
                                size="large" 
                                loading={loading}
                                icon={<SaveOutlined />}
                                className="!bg-blue-600 font-bold px-6 shadow-md"
                            >
                                Save Bill
                            </Button>
                            <Button 
                                type="primary" 
                                size="large" 
                                loading={loading}
                                icon={<PrinterOutlined />}
                                onClick={() => form.validateFields().then(vals => handleFinish(vals, true))}
                                className="!bg-emerald-600 font-bold px-8 shadow-md"
                            >
                                Save & Print Immediately
                            </Button>
                        </div>
                    </div>
                </div>
            </Form>
        </Card>
    );
}
