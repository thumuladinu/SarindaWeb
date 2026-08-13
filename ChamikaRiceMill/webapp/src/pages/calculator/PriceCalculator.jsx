import React, { useState, useEffect, useMemo } from 'react';
import {
    Card, Row, Col, InputNumber, Typography, Button, Table, Tag, Divider,
    Space, Tooltip, App, Modal, Select, Form, Badge
} from 'antd';
import {
    CalculatorOutlined, PrinterOutlined, ReloadOutlined, SaveOutlined,
    InfoCircleOutlined, CheckCircleOutlined, SwapOutlined, ArrowRightOutlined
} from '@ant-design/icons';
import axios from 'axios';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

const LOCAL_STORAGE_KEY = 'chamika_price_calculator_unified_v2';

const defaultConfigState = {
    weePrice: 130,          // Rs per 1kg Paddy
    halYield: 65,           // Hal Yield %
    hunsalYield: 4,         // Hunsal Yield %
    kuduYield: 2,           // Kudu Yield %
    hunsalPrice: 100,       // Rs per 1kg Hunsal
    kuduPrice: 80,          // Rs per 1kg Kudu
    bagCost: 1.00,          // Rs per kg
    electricityCost: 1.00,  // Rs per kg
    laborCost: 1.10,        // Rs per kg
    otherCost: 0,           // Rs per kg
    distanceKm: 100,        // km
    fuelCostPerKm: 0.05,    // Rs per kg per km
};

export default function PriceCalculator() {
    const { message } = App.useApp();
    const [calc, setCalc] = useState(() => {
        try {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
            return saved ? JSON.parse(saved) : defaultConfigState;
        } catch {
            return defaultConfigState;
        }
    });

    const [itemsList, setItemsList] = useState([]);
    const [saveModalVisible, setSaveModalVisible] = useState(false);
    const [saveSubmitting, setSaveSubmitting] = useState(false);

    // Save Prices state
    const [selectedRiceItemId, setSelectedRiceItemId] = useState(null);
    const [draftRicePrice, setDraftRicePrice] = useState(0);
    const [draftHunsalPrice, setDraftHunsalPrice] = useState(100);
    const [draftKuduPrice, setDraftKuduPrice] = useState(80);

    useEffect(() => {
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(calc));
        } catch (e) {
            console.error('Failed to persist calculator state:', e);
        }
    }, [calc]);

    // Fetch finished items catalog for saving prices
    useEffect(() => {
        (async () => {
            try {
                const res = await axios.post('/api/MillgetAllItems').catch(() => axios.get('/api/mill/items'));
                const list = res.data?.result || res.data?.data || (Array.isArray(res.data) ? res.data : []);
                setItemsList(list || []);

                // Pre-select first output rice product
                const outputs = (list || []).filter(item => {
                    const cat = String(item.CATEGORY || item.category || '').toLowerCase();
                    const hasVars = Array.isArray(item.VARIATIONS) && item.VARIATIONS.length > 0;
                    return cat === 'output' || cat === 'finished' || cat === 'rice' || hasVars;
                });

                if (outputs.length > 0) {
                    setSelectedRiceItemId(outputs[0].ITEM_ID || outputs[0].id);
                } else if (list.length > 0) {
                    setSelectedRiceItemId(list[0].ITEM_ID || list[0].id);
                }
            } catch (e) {
                console.error('Error loading items for calculator:', e);
            }
        })();
    }, []);

    const updateCalc = (field, val) => {
        setCalc(prev => ({
            ...prev,
            [field]: val === null || val === undefined ? 0 : val
        }));
    };

    const handleReset = () => {
        setCalc(defaultConfigState);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        message.success('Calculator values reset to defaults!');
    };

    // ─── MATH CALCULATION ENGINE ─────────────────────────────────
    const mathResults = useMemo(() => {
        const weePrice = parseFloat(calc.weePrice || 0);
        const halYield = parseFloat(calc.halYield || 65) / 100;
        const hunsalYield = parseFloat(calc.hunsalYield || 4) / 100;
        const kuduYield = parseFloat(calc.kuduYield || 2) / 100;

        const hunsalPrice = parseFloat(calc.hunsalPrice || 0);
        const kuduPrice = parseFloat(calc.kuduPrice || 0);

        // 1. Amount of Paddy needed for 1kg of Rice
        const weeNeededFor1KgHal = halYield > 0 ? (1 / halYield) : 0;
        const grossWeeCost = weeNeededFor1KgHal * weePrice;

        // 2. By-Products Produced for 1kg of Rice
        const hunsalQty = weeNeededFor1KgHal * hunsalYield;
        const kuduQty = weeNeededFor1KgHal * kuduYield;

        const hunsalIncome = hunsalQty * hunsalPrice;
        const kuduIncome = kuduQty * kuduPrice;
        const totalByProductIncome = hunsalIncome + kuduIncome;

        // 3. Raw Rice Cost (Gross Paddy minus By-Products)
        const rawHalCostPerKg = Math.max(0, grossWeeCost - totalByProductIncome);

        // 4. Extra Expenses
        const bagCost = parseFloat(calc.bagCost || 0);
        const electricityCost = parseFloat(calc.electricityCost || 0);
        const laborCost = parseFloat(calc.laborCost || 0);
        const otherCost = parseFloat(calc.otherCost || 0);
        const totalExpensesPerKg = bagCost + electricityCost + laborCost + otherCost;

        // 5. Ex-Mill Cost per 1kg
        const exMillCostPerKg = rawHalCostPerKg + totalExpensesPerKg;

        // 6. Transport & Delivered Cost
        const distanceKm = parseFloat(calc.distanceKm || 0);
        const fuelRate = parseFloat(calc.fuelCostPerKm || 0);
        const transportCostPerKg = distanceKm * fuelRate;
        const finalCostPerKg = exMillCostPerKg + transportCostPerKg;

        // ─── Side-by-Side Specific Varieties Math ────────────────
        // Samba: Paddy Rs. 130, Yield 65%
        const sambaWeeNeeded = 1 / 0.65; // ~1.538kg
        const sambaGross = sambaWeeNeeded * (weePrice > 0 ? weePrice : 130);
        const sambaRaw = Math.max(0, sambaGross - (sambaWeeNeeded * 0.04 * hunsalPrice + sambaWeeNeeded * 0.02 * kuduPrice));
        const sambaExMill = sambaRaw + totalExpensesPerKg;
        const sambaFinal = sambaExMill + transportCostPerKg;

        // Nadu: Paddy Rs. 120, Yield 66%
        const naduWeeNeeded = 1 / 0.66; // ~1.515kg
        const naduGross = naduWeeNeeded * 120;
        const naduRaw = Math.max(0, naduGross - (naduWeeNeeded * 0.04 * 95 + naduWeeNeeded * 0.02 * 75));
        const naduExMill = naduRaw + totalExpensesPerKg;
        const naduFinal = naduExMill + transportCostPerKg;

        return {
            weeNeededFor1KgHal,
            grossWeeCost,
            hunsalQty,
            kuduQty,
            hunsalIncome,
            kuduIncome,
            totalByProductIncome,
            rawHalCostPerKg,
            totalExpensesPerKg,
            exMillCostPerKg,
            transportCostPerKg,
            finalCostPerKg,

            // Bag sizes
            cost5kg: finalCostPerKg * 5,
            cost10kg: finalCostPerKg * 10,
            cost25kg: finalCostPerKg * 25,
            cost50kg: finalCostPerKg * 50,

            // Variety Comparison
            sambaExMill,
            sambaFinal,
            naduExMill,
            naduFinal,
        };
    }, [calc]);

    const fmt = val => (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const outputRiceItems = useMemo(() => {
        if (!itemsList || itemsList.length === 0) return [];
        return itemsList.filter(item => {
            const cat = String(item.CATEGORY || item.category || '').toLowerCase();
            const hasVars = Array.isArray(item.VARIATIONS) && item.VARIATIONS.length > 0;
            return cat === 'output' || cat === 'finished' || cat === 'rice' || hasVars;
        });
    }, [itemsList]);

    const handleOpenSaveModal = () => {
        setDraftRicePrice(parseFloat(mathResults.exMillCostPerKg.toFixed(2)));
        setDraftHunsalPrice(parseFloat(calc.hunsalPrice || 100));
        setDraftKuduPrice(parseFloat(calc.kuduPrice || 80));
        setSaveModalVisible(true);
    };

    const handleConfirmSavePrices = async () => {
        if (!selectedRiceItemId) {
            message.warning('Please select a finished rice product to update');
            return;
        }

        setSaveSubmitting(true);
        try {
            const payload = {
                prices: {
                    [selectedRiceItemId]: draftRicePrice,
                    OUT_HUNSAL: draftHunsalPrice,
                    OUT_KUDU: draftKuduPrice
                }
            };

            const res = await axios.post('/api/mill/items/update-prices', payload, { withCredentials: true });
            if (res.data.success) {
                message.success('Catalog selling prices updated successfully!');
                setSaveModalVisible(false);
            } else {
                message.error(res.data.message || 'Failed to update catalog prices');
            }
        } catch (e) {
            console.error('Error updating catalog prices:', e);
            message.error('Failed to update catalog prices');
        } finally {
            setSaveSubmitting(false);
        }
    };

    const comparisonColumns = [
        { title: 'Variety / Metric', dataIndex: 'metric', key: 'metric', render: m => <strong>{m}</strong> },
        { title: 'Live Formula Output', dataIndex: 'current', key: 'current', align: 'right', render: v => <span className="font-bold text-blue-600 dark:text-blue-400">Rs. {fmt(v)}</span> },
        { title: '🌾 Samba Standard', dataIndex: 'samba', key: 'samba', align: 'right', render: v => <span className="font-mono text-slate-700 dark:text-slate-300">Rs. {fmt(v)}</span> },
        { title: '🌾 Nadu Standard', dataIndex: 'nadu', key: 'nadu', align: 'right', render: v => <span className="font-mono text-slate-700 dark:text-slate-300">Rs. {fmt(v)}</span> },
    ];

    const comparisonData = [
        { key: '1', metric: '1kg Ex-Mill Price', current: mathResults.exMillCostPerKg, samba: mathResults.sambaExMill, nadu: mathResults.naduExMill },
        { key: '2', metric: '1kg Delivered Price', current: mathResults.finalCostPerKg, samba: mathResults.sambaFinal, nadu: mathResults.naduFinal },
        { key: '3', metric: '5kg Pack Price', current: mathResults.cost5kg, samba: mathResults.sambaFinal * 5, nadu: mathResults.naduFinal * 5 },
        { key: '4', metric: '10kg Pack Price', current: mathResults.cost10kg, samba: mathResults.sambaFinal * 10, nadu: mathResults.naduFinal * 10 },
        { key: '5', metric: '25kg Bag Price', current: mathResults.cost25kg, samba: mathResults.sambaFinal * 25, nadu: mathResults.naduFinal * 25 },
        { key: '6', metric: '50kg Bag Price', current: mathResults.cost50kg, samba: mathResults.sambaFinal * 50, nadu: mathResults.naduFinal * 50 },
    ];

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm print:hidden">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center text-2xl shadow-md">
                        <CalculatorOutlined />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 m-0">Rice Milling Cost & Price Calculator</h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400 m-0">Live real-time milling math, byproduct offsets, and side-by-side variety pricing</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button icon={<ReloadOutlined />} onClick={handleReset}>Reset Defaults</Button>
                    <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print Calculation</Button>
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleOpenSaveModal} className="!bg-emerald-600 font-bold shadow-md">
                        Save Catalog Prices
                    </Button>
                </div>
            </div>

            {/* Quick Live Highlight Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
                <Card className="shadow-sm border-l-4 border-l-blue-600">
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Calculated Rice Ex-Mill Price</div>
                    <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">Rs. {fmt(mathResults.exMillCostPerKg)} <span className="text-xs font-normal text-slate-400">/ kg</span></div>
                    <div className="text-[11px] text-slate-500 mt-1">Gross Paddy: Rs. {fmt(mathResults.grossWeeCost)} - Offset: Rs. {fmt(mathResults.totalByProductIncome)}</div>
                </Card>
                <Card className="shadow-sm border-l-4 border-l-purple-600">
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">🌾 Samba Reference Price</div>
                    <div className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1">Rs. {fmt(mathResults.sambaFinal)} <span className="text-xs font-normal text-slate-400">/ kg</span></div>
                    <div className="text-[11px] text-slate-500 mt-1">25kg Bag: <strong>Rs. {fmt(mathResults.sambaFinal * 25)}</strong></div>
                </Card>
                <Card className="shadow-sm border-l-4 border-l-emerald-600">
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">🌾 Nadu Reference Price</div>
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">Rs. {fmt(mathResults.naduFinal)} <span className="text-xs font-normal text-slate-400">/ kg</span></div>
                    <div className="text-[11px] text-slate-500 mt-1">25kg Bag: <strong>Rs. {fmt(mathResults.naduFinal * 25)}</strong></div>
                </Card>
            </div>

            {/* Main Interactive Grid */}
            <Row gutter={[20, 20]}>
                {/* Left Column: Calculator Inputs */}
                <Col xs={24} lg={13} className="space-y-4">
                    {/* Step 1: Paddy Raw Material & Byproduct Sales */}
                    <Card title={<span className="font-bold text-blue-600 dark:text-blue-400">Step 1: Paddy Raw Material & Milling Yields</span>} className="shadow-sm">
                        <Row gutter={[12, 12]}>
                            <Col xs={24} sm={12}>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Raw Paddy Price (Rs / 1kg)</label>
                                <InputNumber
                                    prefix="Rs."
                                    className="w-full"
                                    min={0}
                                    size="large"
                                    value={calc.weePrice}
                                    onChange={v => updateCalc('weePrice', v)}
                                />
                            </Col>
                            <Col xs={24} sm={12}>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Hal (Rice) Yield %</label>
                                <InputNumber
                                    suffix="%"
                                    className="w-full"
                                    min={1}
                                    max={100}
                                    size="large"
                                    value={calc.halYield}
                                    onChange={v => updateCalc('halYield', v)}
                                />
                            </Col>
                            <Col xs={12} sm={6}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Hunsal %</label>
                                <InputNumber suffix="%" className="w-full" value={calc.hunsalYield} onChange={v => updateCalc('hunsalYield', v)} />
                            </Col>
                            <Col xs={12} sm={6}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Hunsal Rs/kg</label>
                                <InputNumber prefix="Rs." className="w-full" value={calc.hunsalPrice} onChange={v => updateCalc('hunsalPrice', v)} />
                            </Col>
                            <Col xs={12} sm={6}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Kudu %</label>
                                <InputNumber suffix="%" className="w-full" value={calc.kuduYield} onChange={v => updateCalc('kuduYield', v)} />
                            </Col>
                            <Col xs={12} sm={6}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Kudu Rs/kg</label>
                                <InputNumber prefix="Rs." className="w-full" value={calc.kuduPrice} onChange={v => updateCalc('kuduPrice', v)} />
                            </Col>
                        </Row>
                    </Card>

                    {/* Step 2: Milling & Operational Expenses */}
                    <Card title={<span className="font-bold text-amber-600 dark:text-amber-400">Step 2: Milling & Packaging Expenses (per kg)</span>} className="shadow-sm">
                        <Row gutter={[12, 12]}>
                            <Col xs={12} sm={6}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Bag / Sticker Cost</label>
                                <InputNumber prefix="Rs." className="w-full" value={calc.bagCost} onChange={v => updateCalc('bagCost', v)} />
                            </Col>
                            <Col xs={12} sm={6}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Electricity Cost</label>
                                <InputNumber prefix="Rs." className="w-full" value={calc.electricityCost} onChange={v => updateCalc('electricityCost', v)} />
                            </Col>
                            <Col xs={12} sm={6}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Labor Cost</label>
                                <InputNumber prefix="Rs." className="w-full" value={calc.laborCost} onChange={v => updateCalc('laborCost', v)} />
                            </Col>
                            <Col xs={12} sm={6}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Other Cost</label>
                                <InputNumber prefix="Rs." className="w-full" value={calc.otherCost} onChange={v => updateCalc('otherCost', v)} />
                            </Col>
                        </Row>
                    </Card>

                    {/* Step 3: Transport & Logistics */}
                    <Card title={<span className="font-bold text-purple-600 dark:text-purple-400">Step 3: Logistics & Transport Rate</span>} className="shadow-sm">
                        <Row gutter={[12, 12]}>
                            <Col xs={24} sm={12}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Distance (km)</label>
                                <InputNumber className="w-full" value={calc.distanceKm} onChange={v => updateCalc('distanceKm', v)} />
                            </Col>
                            <Col xs={24} sm={12}>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Fuel / Logistics Rate (Rs/kg/km)</label>
                                <InputNumber prefix="Rs." className="w-full" step={0.01} value={calc.fuelCostPerKm} onChange={v => updateCalc('fuelCostPerKm', v)} />
                            </Col>
                        </Row>
                    </Card>
                </Col>

                {/* Right Column: Live Breakdown & Side-by-Side Comparison */}
                <Col xs={24} lg={11} className="space-y-4">
                    {/* Live Calculation Output Card */}
                    <Card title={<span className="font-bold text-slate-900 dark:text-slate-100">Milling Cost & Margin Breakdown</span>} className="shadow-sm">
                        <div className="space-y-3 text-xs">
                            <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                                <span>Paddy Needed for 1kg Rice ({calc.halYield}% Yield)</span>
                                <strong className="font-mono text-slate-900 dark:text-slate-100">{mathResults.weeNeededFor1KgHal.toFixed(3)} kg Paddy</strong>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                                <span>Gross Paddy Cost ({mathResults.weeNeededFor1KgHal.toFixed(2)}kg × Rs.{calc.weePrice})</span>
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">Rs. {fmt(mathResults.grossWeeCost)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 text-emerald-600 dark:text-emerald-400">
                                <span>Less: By-Product Recovery (Hunsal + Kudu)</span>
                                <span className="font-mono font-bold">- Rs. {fmt(mathResults.totalByProductIncome)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800">
                                <span>Net Raw Rice Material Cost</span>
                                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">Rs. {fmt(mathResults.rawHalCostPerKg)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 text-amber-600 dark:text-amber-400">
                                <span>Add: Milling & Overhead Expenses</span>
                                <span className="font-mono font-bold">+ Rs. {fmt(mathResults.totalExpensesPerKg)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 bg-blue-50 dark:bg-blue-950/40 p-2 rounded-xl text-sm font-bold text-blue-900 dark:text-blue-200">
                                <span>Subtotal Ex-Mill Price (1kg)</span>
                                <span className="font-mono text-base text-blue-600 dark:text-blue-400">Rs. {fmt(mathResults.exMillCostPerKg)}</span>
                            </div>
                            <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800 text-purple-600">
                                <span>Add: Logistics Transport ({calc.distanceKm}km)</span>
                                <span className="font-mono font-bold">+ Rs. {fmt(mathResults.transportCostPerKg)}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded-xl text-sm font-bold text-emerald-900 dark:text-emerald-200">
                                <span>Final Delivered Rice Price (1kg)</span>
                                <span className="font-mono text-lg text-emerald-600 dark:text-emerald-400">Rs. {fmt(mathResults.finalCostPerKg)}</span>
                            </div>
                        </div>

                        <Divider className="my-3" />

                        <div className="font-bold text-xs uppercase text-slate-500 mb-2">Calculated Bag Prices</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">5kg Bag: <strong className="font-mono text-blue-600">Rs. {fmt(mathResults.cost5kg)}</strong></div>
                            <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">10kg Bag: <strong className="font-mono text-blue-600">Rs. {fmt(mathResults.cost10kg)}</strong></div>
                            <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">25kg Bag: <strong className="font-mono text-emerald-600 font-bold">Rs. {fmt(mathResults.cost25kg)}</strong></div>
                            <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">50kg Bag: <strong className="font-mono text-purple-600 font-bold">Rs. {fmt(mathResults.cost50kg)}</strong></div>
                        </div>
                    </Card>

                    {/* Side-by-Side Comparison Card */}
                    <Card title={<span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><SwapOutlined className="text-blue-600" /> Side-by-Side Rice Variety Comparison</span>} className="shadow-sm">
                        <Table
                            dataSource={comparisonData}
                            columns={comparisonColumns}
                            pagination={false}
                            size="small"
                            className="w-full"
                        />
                    </Card>
                </Col>
            </Row>

            {/* Save Prices Modal */}
            <Modal
                title={<span className="font-bold text-base flex items-center gap-2"><SaveOutlined className="text-emerald-600" /> Save Calculated Selling Prices to Item Catalog</span>}
                open={saveModalVisible}
                onCancel={() => setSaveModalVisible(false)}
                footer={[
                    <Button key="cancel" onClick={() => setSaveModalVisible(false)}>Cancel</Button>,
                    <Button key="save" type="primary" icon={<CheckCircleOutlined />} loading={saveSubmitting} onClick={handleConfirmSavePrices} className="!bg-emerald-600 font-bold">
                        Confirm & Save Selling Prices
                    </Button>
                ]}
                width={550}
            >
                <div className="space-y-4 py-2">
                    <p className="text-xs text-slate-500">
                        Select which finished rice product to apply the calculated rice selling price to. By-products (Hunsal & Kudu) map globally.
                    </p>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                            1. Select Rice Product Variety to Update
                        </label>
                        <Select
                            showSearch
                            size="large"
                            value={selectedRiceItemId}
                            onChange={v => setSelectedRiceItemId(v)}
                            optionFilterProp="label"
                            className="w-full"
                        >
                            {outputRiceItems.map(item => (
                                <Option key={item.ITEM_ID || item.id} value={item.ITEM_ID || item.id} label={item.NAME || item.name}>
                                    🌾 {String(item.NAME || item.name || 'Rice').toUpperCase()} (Current: Rs. {item.SELLING_PRICE || 0})
                                </Option>
                            ))}
                        </Select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                            Calculated Rice Selling Price (Rs / 1kg)
                        </label>
                        <InputNumber
                            prefix="Rs."
                            size="large"
                            className="w-full font-mono font-bold text-blue-600"
                            value={draftRicePrice}
                            onChange={v => setDraftRicePrice(v || 0)}
                        />
                    </div>

                    <Divider className="my-2" />

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                                2. Hunsal (Broken Rice) Price
                            </label>
                            <InputNumber
                                prefix="Rs."
                                size="large"
                                className="w-full font-mono"
                                value={draftHunsalPrice}
                                onChange={v => setDraftHunsalPrice(v || 0)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                                3. Kudu (Rice Bran) Price
                            </label>
                            <InputNumber
                                prefix="Rs."
                                size="large"
                                className="w-full font-mono"
                                value={draftKuduPrice}
                                onChange={v => setDraftKuduPrice(v || 0)}
                            />
                        </div>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
