import React, { useState, useEffect } from 'react';
import { 
    Card, Form, Input, Select, InputNumber, Button, Table, Tag, 
    Row, Col, Divider, message, Tabs, Alert, Modal, Radio 
} from 'antd';
import { 
    InboxOutlined, PlusOutlined, SyncOutlined, CheckCircleOutlined, 
    CalculatorOutlined, HistoryOutlined, EyeOutlined, EditOutlined, SwapOutlined 
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

export default function StockInward() {
    const [activeTab, setActiveTab] = useState('create');
    const [form] = Form.useForm();
    const [inwardType, setInwardType] = useState('mill_purchase');
    const [items, setItems] = useState([]);
    const [places, setPlaces] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);
    const [history, setHistory] = useState([]);
    const [editingRecord, setEditingRecord] = useState(null);
    const [viewRecord, setViewRecord] = useState(null);
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Moisture & Lorry calculations
    const [grossWeight, setGrossWeight] = useState(0);
    const [tareWeight, setTareWeight] = useState(0);
    const [moisturePercent, setMoisturePercent] = useState(0);
    const condition = Form.useWatch('condition', form);

    useEffect(() => {
        loadData();
        const unsub = syncService.subscribe((event) => {
            if (event === 'inwardUpdated' || event === 'referenceDataUpdated' || event === 'syncComplete') {
                loadData();
            }
        });
        return unsub;
    }, []);

    const fetchPendingTransfers = async () => {
        try {
            const baseUrl = syncService.apiBase;
            const res = await axios.get(`${baseUrl}/api/mill/inward/pending-transfers`, { timeout: 5000 });
            if (res.data.success) {
                setPendingTransfers(res.data.result || []);
            }
        } catch (error) {
            console.log('[Electron StockInward] Offline or pending transfers fetch skipped');
        }
    };

    const handleDeclineTransfer = (record) => {
        let reason = '';
        Modal.confirm({
            title: 'Decline Transfer Request',
            content: (
                <div className="mt-4">
                    <p>Are you sure you want to decline this transfer from Store {record.STORE_NO}?</p>
                    <Input.TextArea
                        rows={2}
                        placeholder="Optional reason for decline..."
                        onChange={(e) => { reason = e.target.value; }}
                    />
                </div>
            ),
            okText: 'Decline',
            okButtonProps: { danger: true },
            onOk: async () => {
                try {
                    const baseUrl = syncService.apiBase;
                    const res = await axios.post(`${baseUrl}/api/stock-transfers/decline`, {
                        transferId: record.STORE_TRANSFER_ID,
                        approvedByName: 'Mill Desktop App',
                        comments: reason || 'Declined from Mill Desktop App'
                    });
                    if (res.data.success) {
                        message.success('Transfer request declined successfully');
                        fetchPendingTransfers();
                    } else {
                        message.error(res.data.message || 'Failed to decline request');
                    }
                } catch (error) {
                    message.error('An error occurred while declining');
                }
            }
        });
    };

    const loadData = async () => {
        try {
            setLoading(true);
            fetchPendingTransfers();
            const [itms, plcs, vehs, inwList] = await Promise.all([
                db.items.toArray(),
                db.places.toArray(),
                db.vehicles.toArray(),
                db.stock_inwards.orderBy('DATE').reverse().toArray()
            ]);
            setItems(itms || []);
            setPlaces(plcs || []);
            setVehicles(vehs || []);
            setHistory(inwList || []);
        } catch (e) {
            console.error('Error loading inward data:', e);
        } finally {
            setLoading(false);
        }
    };

    // Calculate Net Paddy Weight after Tare & Moisture
    const rawNetWeight = Math.max(0, grossWeight - tareWeight);
    const moistureDeduction = (rawNetWeight * moisturePercent) / 100;
    const finalInwardWeight = Math.max(0, rawNetWeight - moistureDeduction);

    const handleSaveInward = async (values) => {
        try {
            setSubmitting(true);
            const qty = inwardType === 'go_and_get' ? (finalInwardWeight || values.quantity) : values.quantity;
            if (!qty || qty <= 0) {
                message.error('Please specify a valid quantity in KG!');
                return;
            }

            const itemObj = items.find(i => i.ITEM_ID === values.itemId);
            const price = values.pricePerUnit || 0;
            const totalPrice = qty * price;

            const terminalCode = getTerminalDeviceCode();
            const refNo = editingRecord?.REFERENCE_NO || `INW-${dayjs().format('YYYYMMDD')}-${terminalCode}-${Math.floor(1000 + Math.random() * 9000)}`;

            const payload = {
                REFERENCE_NO: refNo,
                DEVICE_ID: terminalCode,
                ADDED_BY: getCurrentUserName(),
                INWARD_TYPE: inwardType,
                ITEM_ID: values.itemId,
                ITEM_NAME: itemObj ? itemObj.NAME : 'Paddy Item',
                PLACE_ID: values.placeId || null,
                QUANTITY: parseFloat(Number(qty).toFixed(2)),
                SOURCE_QUANTITY: values.sourceQuantity ? parseFloat(Number(values.sourceQuantity).toFixed(2)) : parseFloat(Number(qty).toFixed(2)),
                PRICE_PER_UNIT: parseFloat(Number(price).toFixed(2)),
                TOTAL_PRICE: parseFloat(Number(totalPrice).toFixed(2)),
                NO_OF_BAGS: values.noOfBags || null,
                MOISTURE_LOSS_PERCENT: moisturePercent || 0,
                GROSS_WEIGHT: grossWeight || null,
                TARE_WEIGHT: tareWeight || null,
                SUPPLIER_NAME: values.supplierName || '',
                VEHICLE_NO: values.vehicleNo || '',
                DRIVER_NAME: values.driverName || '',
                NOTES: values.notes || '',
                DATE: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                STORE_TRANSFER_ID: values.transferId || null,
                IS_SYNCED: 0
            };

            if (editingRecord) {
                const recId = editingRecord.LOCAL_ID || editingRecord.INWARD_ID;
                await db.stock_inwards.update(recId, payload);
                message.success('Stock Inward updated successfully!');
            } else {
                await db.stock_inwards.add(payload);
                message.success('Stock Inward recorded successfully!');
            }
            form.resetFields();
            setEditingRecord(null);
            setGrossWeight(0);
            setTareWeight(0);
            setMoisturePercent(0);
            loadData();

            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Error saving inward:', e);
            message.error('Failed to record stock inward');
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            title: 'Ref / Type',
            key: 'ref',
            render: (_, r) => (
                <div>
                    <span className="font-mono font-bold text-blue-800">{r.REFERENCE_NO || `INW-${r.LOCAL_ID || r.INWARD_ID}`}</span>
                    <div className="text-[11px] text-gray-500 uppercase">{r.INWARD_TYPE?.replace(/_/g, ' ')}</div>
                    {r.IS_OFFLINE && <Tag color="volcano" className="text-[10px]">Offline Draft</Tag>}
                </div>
            )
        },
        {
            title: 'Date',
            dataIndex: 'DATE',
            key: 'DATE',
            render: val => <span className="text-xs text-gray-600">{dayjs(val).format('YYYY-MM-DD HH:mm')}</span>
        },
        {
            title: 'Item Description',
            key: 'item',
            render: (_, r) => (
                <div>
                    <strong className="text-slate-900">{r.ITEM_NAME || `Item #${r.ITEM_ID}`}</strong>
                    {r.NO_OF_BAGS && <span className="text-xs text-gray-500 block">{r.NO_OF_BAGS} Bags</span>}
                </div>
            )
        },
        {
            title: 'Quantity (KG)',
            dataIndex: 'QUANTITY',
            key: 'QUANTITY',
            align: 'right',
            render: val => <span className="font-mono font-bold text-blue-900">{Number(val || 0).toFixed(2)} KG</span>
        },
        {
            title: 'Rate / Total',
            key: 'price',
            align: 'right',
            render: (_, r) => (
                <div>
                    {r.PRICE_PER_UNIT > 0 && <div className="text-xs text-gray-500">@ Rs. {Number(r.PRICE_PER_UNIT).toFixed(2)}</div>}
                    <div className="font-mono font-bold text-slate-800">Rs. {Number(r.TOTAL_PRICE || 0).toFixed(2)}</div>
                </div>
            )
        },
        {
            title: 'Source / Supplier',
            key: 'source',
            render: (_, r) => (
                <div className="text-xs">
                    <div>{r.SUPPLIER_NAME || r.PLACE_NAME || '-'}</div>
                    {r.VEHICLE_NO && <div className="text-gray-500">{r.VEHICLE_NO}</div>}
                </div>
            )
        },
        {
            title: 'Condition',
            key: 'condition',
            render: (_, r) => {
                const isWet = r.CONDITION === 'wet' || (r.MOISTURE_LOSS_PERCENT > 0);
                const pct = r.DRY_PERCENTAGE || (r.MOISTURE_LOSS_PERCENT ? (100 - r.MOISTURE_LOSS_PERCENT) : 100);
                return isWet ? (
                    <Tag color="blue" className="font-semibold text-[11px]">💧 Wet ({pct}%)</Tag>
                ) : (
                    <Tag color="gold" className="font-semibold text-[11px]">☀️ Dry</Tag>
                );
            }
        },
        {
            title: 'Action',
            key: 'action',
            width: 90,
            render: (_, r) => (
                <div className="flex gap-1">
                    <Button size="small" icon={<EyeOutlined />} onClick={() => { setViewRecord(r); setViewModalOpen(true); }} className="!text-blue-600" />
                    <Button size="small" icon={<EditOutlined />} onClick={() => {
                        setEditingRecord(r);
                        setActiveTab('create');
                        setInwardType(r.INWARD_TYPE || 'mill_purchase');
                        const isWet = r.CONDITION === 'wet' || (r.MOISTURE_LOSS_PERCENT > 0);
                        const dryPct = r.DRY_PERCENTAGE || (r.MOISTURE_LOSS_PERCENT ? (100 - r.MOISTURE_LOSS_PERCENT) : 85);
                        form.setFieldsValue({
                            itemId: r.ITEM_ID,
                            placeId: r.PLACE_ID,
                            condition: isWet ? 'wet' : 'dry',
                            grossWeight: r.GROSS_WEIGHT || r.QUANTITY,
                            dryPercentage: dryPct,
                            quantity: r.QUANTITY,
                            noOfBags: r.NO_OF_BAGS,
                            pricePerUnit: r.PRICE_PER_UNIT,
                            supplierName: r.SUPPLIER_NAME,
                            vehicleNo: r.VEHICLE_NO,
                            notes: r.NOTES
                        });
                    }} className="!text-amber-500" />
                </div>
            )
        }
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-md">
                        <InboxOutlined />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 m-0">Stock Inward (Paddy Purchases & Transfers)</h2>
                        <p className="text-xs text-slate-500 m-0">Receive raw paddy from farmers, lorry collections, or store transfers</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button 
                        type={pendingTransfers.length > 0 ? "primary" : "default"} 
                        danger={pendingTransfers.length > 0} 
                        icon={<SwapOutlined />}
                        onClick={() => setPendingDrawerOpen(true)}
                        className="rounded-xl font-medium"
                    >
                        Pending Transfers ({pendingTransfers.length})
                    </Button>
                    <Button 
                        type={activeTab === 'create' ? 'primary' : 'default'} 
                        icon={<PlusOutlined />}
                        onClick={() => setActiveTab('create')}
                        className={activeTab === 'create' ? '!bg-blue-600' : ''}
                    >
                        New Inward Entry
                    </Button>
                    <Button 
                        type={activeTab === 'history' ? 'primary' : 'default'} 
                        icon={<HistoryOutlined />}
                        onClick={() => setActiveTab('history')}
                        className={activeTab === 'history' ? '!bg-blue-600' : ''}
                    >
                        Inward History ({history.length})
                    </Button>
                </div>
            </div>

            {/* TAB 1: CREATE INWARD */}
            {activeTab === 'create' && (
                <Form form={form} layout="vertical" onFinish={handleSaveInward}>
                    <Row gutter={16}>
                        {/* Main Input Details */}
                        <Col xs={24} lg={15}>
                            <Card className="officer-card mb-4">
                                <div className="mb-4">
                                    <label className="text-xs font-bold text-slate-600 block mb-2">Inward Intake Type:</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setInwardType('mill_purchase')}
                                            className={`p-3 rounded-xl border text-left transition-all ${inwardType === 'mill_purchase' ? 'bg-blue-50 border-blue-600 text-blue-900 font-bold' : 'border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            🌾 Mill Purchase
                                            <div className="text-[10px] font-normal text-slate-500">Direct buy at mill desk</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setInwardType('go_and_get')}
                                            className={`p-3 rounded-xl border text-left transition-all ${inwardType === 'go_and_get' ? 'bg-blue-50 border-blue-600 text-blue-900 font-bold' : 'border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            🚚 Go & Get (Lorry)
                                            <div className="text-[10px] font-normal text-slate-500">Field paddy collection</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setInwardType('store_transfer')}
                                            className={`p-3 rounded-xl border text-left transition-all ${inwardType === 'store_transfer' ? 'bg-blue-50 border-blue-600 text-blue-900 font-bold' : 'border-slate-200 hover:bg-slate-50'}`}
                                        >
                                            🏬 Store Transfer
                                            <div className="text-[10px] font-normal text-slate-500">Received from Store 1/2</div>
                                        </button>
                                    </div>
                                </div>

                                {inwardType === 'store_transfer' && pendingTransfers.length > 0 && (
                                    <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200">
                                        <Form.Item name="transferId" label="Select Pending Transfer" className="!mb-0">
                                            <Select
                                                placeholder="Choose store transfer note"
                                                className="w-full"
                                                allowClear
                                                onChange={(val) => {
                                                    const tr = pendingTransfers.find(t => t.STORE_TRANSFER_ID === val);
                                                    if (tr) {
                                                        form.setFieldsValue({
                                                            transferId: tr.STORE_TRANSFER_ID,
                                                            itemId: tr.MAPPED_MILL_ITEM_ID,
                                                            quantity: tr.STORE_QUANTITY,
                                                            grossWeight: tr.STORE_QUANTITY,
                                                            sourceQuantity: tr.STORE_QUANTITY,
                                                            storeNo: tr.STORE_NO,
                                                            storeTransferRef: tr.TRANSFER_CODE
                                                        });
                                                        message.info(`Loaded Store Transfer ${tr.TRANSFER_CODE || tr.STORE_TRANSFER_ID}`);
                                                    }
                                                }}
                                            >
                                                {pendingTransfers.map(tr => (
                                                    <Select.Option key={tr.STORE_TRANSFER_ID} value={tr.STORE_TRANSFER_ID}>
                                                        Store {tr.STORE_NO} • {tr.STORE_ITEM_NAME} • {tr.STORE_QUANTITY} KG ({dayjs(tr.DATE).format('MMM DD')})
                                                    </Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </div>
                                )}

                                 <Row gutter={12}>
                                    <Col xs={24} sm={14}>
                                        <Form.Item label="Item (Raw Paddy & Seasonal Items)" name="itemId" rules={[{ required: true, message: 'Please select paddy item' }]}>
                                            <Select placeholder="Select Raw Paddy or Seasonal Item" showSearch optionFilterProp="children">
                                                {items
                                                    .filter(i => {
                                                        const cat = (i.CATEGORY || '').toLowerCase();
                                                        const code = (i.SYSTEM_CODE || i.CODE || '').toUpperCase();
                                                        const isActive = Number(i.IS_ACTIVE) !== 0;
                                                        return isActive && (cat === 'raw_input' || cat === 'seasonal' || code.startsWith('RAW_'));
                                                    })
                                                    .map(i => (
                                                        <Select.Option key={i.ITEM_ID} value={i.ITEM_ID}>
                                                            🌾 {i.NAME} ({i.CODE || i.SYSTEM_CODE})
                                                        </Select.Option>
                                                    ))
                                                }
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={10}>
                                        <Form.Item label="Sourcing Place / District" name="placeId">
                                            <Select placeholder="Select Place" allowClear showSearch optionFilterProp="children">
                                                {places.map(p => (
                                                    <Select.Option key={p.PLACE_ID} value={p.PLACE_ID}>
                                                        {p.NAME} ({p.DISTRICT})
                                                    </Select.Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                </Row>

                                {/* Dry / Wet Dual Handler */}
                                <Row gutter={12}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item name="condition" label="Condition (තත්ත්වය)" initialValue="dry">
                                            <Radio.Group 
                                                buttonStyle="solid" 
                                                className="w-full"
                                                onChange={(e) => {
                                                    const cond = e.target.value;
                                                    const gross = form.getFieldValue('grossWeight') || form.getFieldValue('quantity') || 0;
                                                    const dryPct = form.getFieldValue('dryPercentage') || 85;
                                                    if (cond === 'dry') {
                                                        form.setFieldValue('quantity', gross);
                                                    } else {
                                                        form.setFieldValue('quantity', parseFloat((gross * (dryPct / 100)).toFixed(2)));
                                                    }
                                                }}
                                            >
                                                <Radio.Button value="dry" className="!w-1/2 text-center">☀️ Dry (වියළි)</Radio.Button>
                                                <Radio.Button value="wet" className="!w-1/2 text-center">💧 Wet (තෙත)</Radio.Button>
                                            </Radio.Group>
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12}>
                                        <Form.Item label="Gross Weight (KG)" name="grossWeight" rules={[{ required: true, message: 'Gross weight is required' }]}>
                                            <InputNumber 
                                                min={0.1} 
                                                className="w-full font-bold" 
                                                placeholder="0.00" 
                                                onChange={(val) => {
                                                    const gross = val || 0;
                                                    const cond = form.getFieldValue('condition') || 'dry';
                                                    const dryPct = form.getFieldValue('dryPercentage') || 85;
                                                    if (cond === 'dry') {
                                                        form.setFieldValue('quantity', gross);
                                                    } else {
                                                        form.setFieldValue('quantity', parseFloat((gross * (dryPct / 100)).toFixed(2)));
                                                    }
                                                }}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                {condition === 'wet' && (
                                    <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl mb-3">
                                        <label className="text-xs font-bold text-blue-900 block mb-1">💧 Wet Paddy Dry Recovery Calculation</label>
                                        <Form.Item name="dryPercentage" label="Dry Percentage (%)" initialValue={85} className="!mb-0">
                                            <InputNumber 
                                                min={1} 
                                                max={100} 
                                                step={1} 
                                                className="w-full font-bold" 
                                                addonAfter="%" 
                                                onChange={(pct) => {
                                                    const dryPct = pct || 85;
                                                    const gross = form.getFieldValue('grossWeight') || 0;
                                                    form.setFieldValue('quantity', parseFloat((gross * (dryPct / 100)).toFixed(2)));
                                                }}
                                            />
                                        </Form.Item>
                                    </div>
                                )}

                                <Row gutter={12}>
                                    <Col xs={12} sm={8}>
                                        <Form.Item label="Inventory Weight (KG)" name="quantity" rules={[{ required: true, message: 'Required' }]}>
                                            <InputNumber 
                                                min={0.1} 
                                                className="w-full font-bold text-base text-green-700" 
                                                placeholder="0.00" 
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={12} sm={8}>
                                        <Form.Item label="No of Bags" name="noOfBags">
                                            <InputNumber min={1} className="w-full" placeholder="e.g. 50" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={8}>
                                        <Form.Item label="Buying Price / KG (Rs)" name="pricePerUnit">
                                            <InputNumber min={0} step={0.5} className="w-full font-bold text-blue-900" placeholder="0.00" />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Row gutter={12}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item label="Supplier / Farmer Name" name="supplierName">
                                            <Input placeholder="Farmer / Merchant name" />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} sm={12}>
                                        <Form.Item label="Vehicle No / Lorry" name="vehicleNo">
                                            <Input placeholder="e.g. WP NA-5820" />
                                        </Form.Item>
                                    </Col>
                                </Row>

                                <Form.Item label="Notes / Moisture Observations" name="notes">
                                    <Input.TextArea rows={2} placeholder="Optional inward notes..." />
                                </Form.Item>
                            </Card>
                        </Col>

                        {/* Right: Weighing & Moisture Calculations */}
                        <Col xs={24} lg={9}>
                            {inwardType === 'go_and_get' && (
                                <Card title={<span className="font-bold text-blue-950">⚖️ Lorry Weighbridge & Moisture</span>} className="officer-card mb-4">
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600 block mb-1">Gross Lorry Weight (KG)</label>
                                            <InputNumber 
                                                min={0} 
                                                value={grossWeight} 
                                                onChange={v => setGrossWeight(v || 0)} 
                                                className="w-full font-bold text-base"
                                                placeholder="Lorry + Paddy"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600 block mb-1">Tare Lorry Weight (Empty KG)</label>
                                            <InputNumber 
                                                min={0} 
                                                value={tareWeight} 
                                                onChange={v => setTareWeight(v || 0)} 
                                                className="w-full font-bold text-base"
                                                placeholder="Empty Lorry"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-slate-600 block mb-1">Moisture Loss (%)</label>
                                            <InputNumber 
                                                min={0} 
                                                max={30} 
                                                step={0.5} 
                                                value={moisturePercent} 
                                                onChange={v => setMoisturePercent(v || 0)} 
                                                className="w-full"
                                                placeholder="e.g. 2.5%"
                                            />
                                        </div>

                                        <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs space-y-1.5 pt-2">
                                            <div className="flex justify-between">
                                                <span>Raw Net Weight:</span>
                                                <span className="font-mono font-bold">{rawNetWeight.toFixed(2)} KG</span>
                                            </div>
                                            {moisturePercent > 0 && (
                                                <div className="flex justify-between text-red-600">
                                                    <span>Moisture Loss ({moisturePercent}%):</span>
                                                    <span className="font-mono font-bold">-{moistureDeduction.toFixed(2)} KG</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between font-bold text-blue-950 text-sm border-t border-blue-200 pt-1">
                                                <span>Final Paddy Inward:</span>
                                                <span className="font-mono">{finalInwardWeight.toFixed(2)} KG</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            )}

                            <Button 
                                type="primary" 
                                htmlType="submit" 
                                loading={submitting} 
                                icon={<CheckCircleOutlined />}
                                className="w-full h-12 rounded-xl text-base font-bold !bg-blue-600 shadow-md"
                            >
                                Record Stock Inward
                            </Button>
                        </Col>
                    </Row>
                </Form>
            )}

            {/* TAB 2: INWARD HISTORY */}
            {activeTab === 'history' && (
                <Card className="officer-card">
                    <Table
                        dataSource={history}
                        columns={columns}
                        rowKey={r => r.LOCAL_ID || r.INWARD_ID}
                        loading={loading}
                        pagination={{ pageSize: 15 }}
                        size="small"
                        scroll={{ x: 'max-content' }}
                    />
                </Card>
            )}

            {/* View Modal */}
            <Modal
                title="Stock Inward Record Details"
                open={viewModalOpen}
                onCancel={() => setViewModalOpen(false)}
                footer={null}
                width={550}
            >
                {viewRecord && (
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500">Reference:</span>
                            <span className="font-mono font-bold text-blue-600">{viewRecord.REFERENCE_NO || `INW-${viewRecord.LOCAL_ID || viewRecord.INWARD_ID}`}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500">Item:</span>
                            <span className="font-bold">{viewRecord.ITEM_NAME}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500">Condition Bought:</span>
                            {viewRecord.CONDITION === 'wet' || viewRecord.MOISTURE_LOSS_PERCENT > 0 ? (
                                <Tag color="blue" className="font-bold">💧 Wet Paddy ({viewRecord.DRY_PERCENTAGE || (100 - viewRecord.MOISTURE_LOSS_PERCENT)}% Dry Recovery)</Tag>
                            ) : (
                                <Tag color="gold" className="font-bold">☀️ Dry Paddy (100%)</Tag>
                            )}
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500">Gross Input Weight:</span>
                            <span className="font-mono">{viewRecord.GROSS_WEIGHT || viewRecord.QUANTITY} KG</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500">Stored Net Inventory Weight:</span>
                            <span className="font-mono font-bold text-green-600">{viewRecord.QUANTITY} KG</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500">Source / Supplier:</span>
                            <span>{viewRecord.SUPPLIER_NAME || viewRecord.PLACE_NAME || '-'}</span>
                        </div>
                        <div className="flex justify-between border-b pb-2">
                            <span className="text-gray-500">Total Price:</span>
                            <span className="font-bold text-slate-800">Rs. {Number(viewRecord.TOTAL_PRICE || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">Date:</span>
                            <span>{dayjs(viewRecord.DATE).format('YYYY-MM-DD HH:mm')}</span>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Pending Store Transfers Modal */}
            <Modal
                title="📦 Pending Store Transfers (Store 1 & Store 2)"
                open={pendingDrawerOpen}
                onCancel={() => setPendingDrawerOpen(false)}
                footer={null}
                width={1150}
                style={{ maxWidth: '96vw' }}
            >
                <Table
                    dataSource={pendingTransfers}
                    rowKey="STORE_TRANSFER_ID"
                    pagination={false}
                    size="small"
                    columns={[
                        {
                            title: 'Date',
                            dataIndex: 'DATE',
                            width: 140,
                            render: (date) => dayjs(date).format('YYYY-MM-DD HH:mm')
                        },
                        {
                            title: 'Store',
                            dataIndex: 'STORE_NO',
                            width: 90,
                            render: (no) => <Tag color="blue">Store {no}</Tag>
                        },
                        {
                            title: 'Transfer Code',
                            dataIndex: 'TRANSFER_CODE',
                            width: 140,
                            render: (code) => <span className="font-mono text-xs font-bold text-blue-800">{code}</span>
                        },
                        {
                            title: 'Store Item',
                            dataIndex: 'STORE_ITEM_NAME',
                        },
                        {
                            title: 'Quantity (Store)',
                            dataIndex: 'STORE_QUANTITY',
                            width: 140,
                            render: (val) => <span className="font-bold">{Number(val || 0).toFixed(2)} KG</span>
                        },
                        {
                            title: 'Mapped Mill Item',
                            dataIndex: 'MAPPED_MILL_ITEM_NAME',
                            width: 170,
                            render: (name) => name ? <Tag color="green">{name}</Tag> : <Tag color="red">Unmapped</Tag>
                        },
                        {
                            title: 'Action',
                            key: 'action',
                            width: 200,
                            render: (_, record) => (
                                <div className="flex gap-2">
                                    <Button 
                                        type="primary" 
                                        size="small"
                                        disabled={!record.MAPPED_MILL_ITEM_ID}
                                        onClick={() => {
                                            setInwardType('store_transfer');
                                            setActiveTab('create');
                                            form.setFieldsValue({
                                                transferId: record.STORE_TRANSFER_ID,
                                                itemId: record.MAPPED_MILL_ITEM_ID,
                                                quantity: record.STORE_QUANTITY,
                                                grossWeight: record.STORE_QUANTITY,
                                                sourceQuantity: record.STORE_QUANTITY,
                                                storeNo: record.STORE_NO,
                                                storeTransferRef: record.TRANSFER_CODE
                                            });
                                            setPendingDrawerOpen(false);
                                            message.info(`Auto-selected Transfer ${record.TRANSFER_CODE}. All details filled!`);
                                        }}
                                        className="!bg-green-600"
                                    >
                                        Accept & Quick Fill
                                    </Button>
                                    <Button 
                                        danger 
                                        size="small"
                                        onClick={() => handleDeclineTransfer(record)}
                                    >
                                        Decline
                                    </Button>
                                </div>
                            )
                        }
                    ]}
                />
            </Modal>
        </div>
    );
}
