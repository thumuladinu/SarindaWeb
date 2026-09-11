import React, { useState, useEffect } from 'react';
import { Form, Input, Button, DatePicker, Select, InputNumber, Row, Col, Typography, message, Card, Spin } from 'antd';
import { PrinterOutlined, SaveOutlined, ReloadOutlined, FileTextOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import db, { seedDefaultOfflineData } from '../../services/db';
import syncService from '../../services/syncService';
import printService from '../../services/printService';
import { FINISHED_ITEMS } from '../../utils/constants';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

const { Title, Text } = Typography;

export default function EditSaleForm({ billRecord, billId, onSuccess, onCancel }) {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [vehiclesList, setVehiclesList] = useState([]);
    const [driversList, setDriversList] = useState([]);
    const [vehicleSearchText, setVehicleSearchText] = useState('');
    const [driverSearchText, setDriverSearchText] = useState('');
    const [baseRiceType, setBaseRiceType] = useState('රතු කැකුළු හාල්');
    const [availableBases, setAvailableBases] = useState(['රතු කැකුළු හාල්', 'සුදු කැකුළු හාල්', 'නාඩු හාල්']);
    const [kgPriceP, setKgPriceP] = useState(150);
    const [kgPriceN, setKgPriceN] = useState(140);
    const [currentBill, setCurrentBill] = useState(null);

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

    useEffect(() => {
        loadDataAndBill();
    }, [billRecord, billId]);

    const loadDataAndBill = async () => {
        setLoading(true);
        try {
            await seedDefaultOfflineData();
            const [custList, vList, sList, pastBills] = await Promise.all([
                db.customers.toArray().catch(() => []),
                db.vehicles.toArray().catch(() => []),
                db.staff.toArray().catch(() => []),
                db.sales_bills.toArray().catch(() => [])
            ]);

            // Customers
            const loadedCustomers = (custList || []).map((c, idx) => ({
                id: c.CUSTOMER_ID || c.ID || c.id || `CUST-${idx}`,
                name: (c.NAME || c.CUSTOMER_NAME || '').trim(),
                phone: c.PHONE || c.PHONE_NUMBER || c.phone || '',
                address: c.ADDRESS || c.LOCATION || c.address || ''
            })).filter(c => Boolean(c.name));
            setCustomers(loadedCustomers);

            // Vehicles
            const vehicleMap = new Map();
            (vList || []).forEach(v => {
                const num = (v.VEHICLE_NO || v.LORRY_NO || '').trim();
                if (num) {
                    vehicleMap.set(num.toUpperCase(), {
                        label: `${num}${v.DRIVER_NAME ? ` (${v.DRIVER_NAME})` : ''}`,
                        value: num,
                        driver: v.DRIVER_NAME || ''
                    });
                }
            });
            setVehiclesList(Array.from(vehicleMap.values()));

            // Drivers
            const driverMap = new Map();
            (sList || []).filter(s => (s.ROLE || '').toLowerCase() === 'driver').forEach(s => {
                if (s.NAME) driverMap.set(s.NAME.trim().toUpperCase(), { label: s.NAME.trim(), value: s.NAME.trim() });
            });
            setDriversList(Array.from(driverMap.values()));

            // Find bill
            let bill = billRecord;
            if (!bill && billId) {
                bill = await db.sales_bills.where('LOCAL_ID').equals(Number(billId)).first() ||
                       await db.sales_bills.where('BILL_ID').equals(Number(billId)).first();
            }

            if (bill) {
                setCurrentBill(bill);
                let rawItems = bill.ITEMS || bill.ITEMS_JSON || [];
                if (typeof rawItems === 'string') {
                    try { rawItems = JSON.parse(rawItems); } catch(e) { rawItems = []; }
                }
                if (!Array.isArray(rawItems)) rawItems = [];

                let detectedBase = 'රතු කැකුළු හාල්';
                const pRows = { 5: { price: 750, qty: 0 }, 10: { price: 1500, qty: 0 }, 25: { price: 3750, qty: 0 } };
                const nRows = { 5: { price: 700, qty: 0 }, 10: { price: 1400, qty: 0 }, 25: { price: 3500, qty: 0 } };
                let pRate = 150, nRate = 140;

                rawItems.forEach(i => {
                    const weight = Number(i.BAG_WEIGHT || i.bagWeight || 0);
                    const qty = Number(i.BAG_COUNT || i.bagCount || (weight > 0 && i.QUANTITY ? i.QUANTITY / weight : 0)) || 0;
                    const unitPrice = Number(i.UNIT_PRICE || i.unitPrice || 0);
                    const sysCode = i.SYSTEM_CODE || '';
                    const itemName = i.ITEM_NAME || i.NAME || '';

                    if (itemName.includes('සුදු')) detectedBase = 'සුදු කැකුළු හාල්';
                    else if (itemName.includes('නාඩු')) detectedBase = 'නාඩු හාල්';

                    const isP = sysCode.endsWith('_P') || itemName.includes('Polished') || (weight > 0 && unitPrice / weight >= 145);
                    if (weight && [5, 10, 25].includes(weight)) {
                        if (isP) {
                            pRows[weight] = { price: unitPrice || pRows[weight].price, qty: qty };
                            if (weight > 0 && unitPrice) pRate = unitPrice / weight;
                        } else {
                            nRows[weight] = { price: unitPrice || nRows[weight].price, qty: qty };
                            if (weight > 0 && unitPrice) nRate = unitPrice / weight;
                        }
                    }
                });

                setBaseRiceType(detectedBase);
                setKgPriceP(pRate);
                setKgPriceN(nRate);
                setRowsP(pRows);
                setRowsN(nRows);

                form.setFieldsValue({
                    INVOICE_NO: bill.INVOICE_NO,
                    BATCH_NO: bill.BATCH_NO,
                    DATE: bill.DATE ? dayjs(bill.DATE) : dayjs(),
                    CUSTOMER_ID: bill.CUSTOMER_ID || (bill.CUSTOMER_NAME && bill.CUSTOMER_NAME !== 'Walk-in Customer' ? bill.CUSTOMER_NAME : null),
                    VEHICLE_NO: bill.VEHICLE_NO || bill.LORRY_NO || '',
                    DRIVER_NAME: bill.DRIVER_NAME || ''
                });
            }
        } catch (e) {
            console.error('Error loading bill for edit:', e);
            message.error('Failed to load bill details');
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
            total += (Number(rowsP[w].price || 0) * Number(rowsP[w].qty || 0));
            total += (Number(rowsN[w].price || 0) * Number(rowsN[w].qty || 0));
        });
        return parseFloat(total.toFixed(2));
    };

    const handleVehicleSelect = (val) => {
        if (!val) return;
        const found = vehiclesList.find(v => v.value === val);
        if (found && found.driver && !form.getFieldValue('DRIVER_NAME')) {
            form.setFieldsValue({ DRIVER_NAME: found.driver });
        }
    };

    const handleFinish = async (values, shouldPrint = false) => {
        if (!currentBill) return;
        setSubmitting(true);
        try {
            const itemsList = [];
            const addRowToItems = (type, weight, rowData) => {
                if (rowData.qty >= 0) {
                    const sysDef = FINISHED_ITEMS.find(i => i.BASE === baseRiceType && i.VARIATION === type);
                    itemsList.push({
                        ITEM_ID: sysDef?.SYSTEM_CODE || `${baseRiceType}_${type}`,
                        SYSTEM_CODE: sysDef?.SYSTEM_CODE,
                        ITEM_NAME: `${baseRiceType} (${type === 'P' ? 'Polished' : 'Niudu'}) - ${weight}kg`,
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

            const total = calculateTotal();
            
            // Find selected customer object by id or name
            const selectedCustVal = values.CUSTOMER_ID;
            const customerObj = customers.find(c => 
                String(c.id) === String(selectedCustVal) || 
                String(c.name).toLowerCase() === String(selectedCustVal).toLowerCase()
            );

            let finalCustId = null;
            let finalCustName = 'Walk-in Customer';
            let finalCustPhone = null;
            let finalCustAddr = null;

            if (customerObj) {
                finalCustId = (customerObj.id && !isNaN(Number(customerObj.id))) ? Number(customerObj.id) : null;
                finalCustName = customerObj.name;
                finalCustPhone = customerObj.phone || null;
                finalCustAddr = customerObj.address || null;
            } else if (selectedCustVal) {
                finalCustName = String(selectedCustVal);
            }

            const updatedPayload = {
                ...currentBill,
                CUSTOMER_ID: finalCustId,
                CUSTOMER_NAME: finalCustName,
                CUSTOMER_PHONE: finalCustPhone,
                CUSTOMER_ADDRESS: finalCustAddr,
                VEHICLE_NO: values.VEHICLE_NO || '',
                LORRY_NO: values.VEHICLE_NO || '',
                DRIVER_NAME: Array.isArray(values.DRIVER_NAME) ? values.DRIVER_NAME.join(', ') : (values.DRIVER_NAME || ''),
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                TOTAL_AMOUNT: total,
                PRINTED_SUB_TOTAL: total,
                NET_AMOUNT: total,
                FINAL_AMOUNT: total,
                ITEMS_JSON: itemsList,
                ITEMS: itemsList,
                IS_SYNCED: 0,
                IS_EDIT_PENDING: true
            };

            let localId = currentBill.LOCAL_ID;
            if (!localId && currentBill.BILL_ID) {
                const existing = await db.sales_bills.where('BILL_ID').equals(currentBill.BILL_ID).first();
                if (existing) localId = existing.LOCAL_ID;
            }

            if (localId) {
                await db.sales_bills.update(localId, updatedPayload);
            }

            if (syncService.isOnline) {
                await syncService.pushPendingSales();
            }

            message.success(`Bill #${currentBill.INVOICE_NO} updated successfully!`);

            if (shouldPrint) {
                const isAuto = printService.isAutoPrintEnabled();
                await printService.printBill(updatedPayload, { forceSilent: isAuto });
            }

            if (onSuccess) onSuccess(updatedPayload);
        } catch (e) {
            console.error('Error updating bill:', e);
            message.error('Failed to update bill');
        } finally {
            setSubmitting(false);
        }
    };

    const customerOptions = (customers || []).map(c => ({
        label: `${c.name}${c.phone ? ` (${c.phone})` : ''}`,
        value: c.id
    }));

    const vehicleOptions = (vehiclesList || []).map(v => ({
        label: v.label,
        value: v.value
    }));

    const driverOptions = (driversList || []).map(d => ({
        label: d.label,
        value: d.value
    }));

    if (loading) {
        return <div className="flex justify-center p-12"><Spin size="large" /></div>;
    }

    return (
        <Card className="officer-card shadow-sm border border-slate-200">
            <Form 
                form={form} 
                layout="vertical" 
                onFinish={(vals) => handleFinish(vals, false)}
            >
                <div className="space-y-4">
                    {/* Header Banner */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center">
                        <div>
                            <Text className="font-bold text-amber-900 text-sm">✏️ Edit Sales Bill: {currentBill?.INVOICE_NO}</Text>
                            <div className="text-xs text-amber-700">Modify customer, date, vehicle, or bag quantities & prices</div>
                        </div>
                        <Text className="font-mono font-bold text-amber-800 text-lg">Rs. {calculateTotal().toFixed(2)}</Text>
                    </div>

                    {/* Metadata Row */}
                    <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-3">
                        <Row gutter={[16, 16]} align="bottom">
                            <Col xs={24} md={6}>
                                <Form.Item label={<span className="font-bold text-slate-700">Invoice No</span>} className="!mb-0">
                                    <Input value={currentBill?.INVOICE_NO} disabled className="font-mono font-bold bg-slate-100 text-slate-700" size="large" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={6}>
                                <Form.Item label={<span className="font-bold text-slate-700">Batch Number</span>} className="!mb-0">
                                    <Input value={currentBill?.BATCH_NO} disabled className="font-mono font-bold bg-slate-100 text-slate-700" size="large" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={6}>
                                <Form.Item label={<span className="font-bold text-slate-700">Customer</span>} name="CUSTOMER_ID" className="!mb-0">
                                    <Select 
                                        placeholder="Select Customer" 
                                        showSearch 
                                        allowClear 
                                        size="large"
                                        options={customerOptions}
                                        filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={6}>
                                <Form.Item label={<span className="font-bold text-slate-700">Date</span>} name="DATE" rules={[{ required: true }]} className="!mb-0">
                                    <DatePicker className="w-full" size="large" format="YYYY-MM-DD" />
                                </Form.Item>
                            </Col>
                        </Row>

                        <Row gutter={[16, 16]} align="bottom">
                            <Col xs={24} md={12}>
                                <Form.Item label={<span className="font-bold text-slate-700">Vehicle / Lorry No</span>} name="VEHICLE_NO" className="!mb-0">
                                    <Select
                                        size="large"
                                        allowClear
                                        showSearch
                                        placeholder="Select Vehicle Number"
                                        onChange={handleVehicleSelect}
                                        options={vehicleOptions}
                                    />
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <Form.Item label={<span className="font-bold text-slate-700">Driver Name</span>} name="DRIVER_NAME" className="!mb-0">
                                    <Select
                                        size="large"
                                        allowClear
                                        showSearch
                                        placeholder="Select Driver Name"
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
                                <Form.Item label={<span className="font-bold text-slate-700">Rice Variety</span>} className="!mb-0">
                                    <Select value={baseRiceType} onChange={setBaseRiceType} size="large">
                                        {availableBases.map(base => (
                                            <Select.Option key={base} value={base}>{base}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col xs={24} md={12}>
                                <div className="text-slate-500 italic text-sm pt-5">
                                    Selecting a variety updates the P (Polished) and N (Niudu) matrix below.
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
                                onClick={onCancel}
                                className="font-bold !border-blue-700 !text-blue-200 hover:!text-white"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="primary" 
                                htmlType="submit" 
                                size="large" 
                                loading={submitting}
                                icon={<SaveOutlined />}
                                className="!bg-blue-600 font-bold px-6 shadow-md"
                            >
                                Save Changes
                            </Button>
                            <Button 
                                type="primary" 
                                size="large" 
                                loading={submitting}
                                icon={<PrinterOutlined />}
                                onClick={() => form.validateFields().then(vals => handleFinish(vals, true))}
                                className="!bg-emerald-600 font-bold px-8 shadow-md"
                            >
                                Save & Re-print
                            </Button>
                        </div>
                    </div>
                </div>
            </Form>
        </Card>
    );
}
