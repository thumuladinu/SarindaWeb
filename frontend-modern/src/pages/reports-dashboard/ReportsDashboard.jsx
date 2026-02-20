/**
 * =====================================================
 * REPORTS DASHBOARD - Stock Lifecycle Analysis
 * src/pages/reports-dashboard/ReportsDashboard.jsx
 * =====================================================
 * Analyzes stock between two Full Clearance events with
 * per-store breakdown, toggleable sections, detailed
 * stock operations, and transfer analysis.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Select, Spin, message, Button, Tag, Tooltip, Empty, Checkbox, Collapse } from 'antd';
import {
    DashboardOutlined, SearchOutlined, ArrowUpOutlined, ArrowDownOutlined,
    SwapOutlined, DollarOutlined, LineChartOutlined, BarChartOutlined,
    InfoCircleOutlined, ReloadOutlined, CalendarOutlined, RiseOutlined,
    FallOutlined, CheckCircleOutlined, WarningOutlined, ShopOutlined,
    CaretRightOutlined, UpOutlined, DownOutlined, ClockCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Option } = Select;
const { Panel } = Collapse;

// =====================================================
// STOCK LINE CHART (SVG)
// =====================================================
const StockLineChart = ({ data, height = 180 }) => {
    const [hoverIdx, setHoverIdx] = React.useState(null);
    if (!data || data.length === 0) return null;
    const stocks = data.map(d => d.stock);
    const maxStock = Math.max(...stocks, 1);
    const minStock = Math.min(...stocks, 0);
    const range = maxStock - minStock || 1;

    const getXY = (i) => {
        const x = (i / (data.length - 1 || 1)) * 100;
        const y = 100 - ((data[i].stock - minStock) / range) * 85 - 5;
        return { x, y };
    };

    const points = data.map((d, i) => { const { x, y } = getXY(i); return `${x},${y}`; });
    const pathD = points.map((p, i) => (i === 0 ? `M ${p}` : `L ${p}`)).join(' ');
    const areaD = pathD + ` L 100,100 L 0,100 Z`;

    const hoverData = hoverIdx !== null ? data[hoverIdx] : null;
    const hoverPos = hoverIdx !== null ? getXY(hoverIdx) : null;

    return (
        <div className="w-full relative h-[180px]">
            <div className="relative w-full h-full">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}
                    onMouseLeave={() => setHoverIdx(null)}>
                    <defs>
                        <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="rgba(16,185,129,0.3)" />
                            <stop offset="100%" stopColor="rgba(16,185,129,0)" />
                        </linearGradient>
                    </defs>
                    {minStock < 0 && (
                        <line x1="0" y1={100 - ((0 - minStock) / range) * 85 - 5}
                            x2="100" y2={100 - ((0 - minStock) / range) * 85 - 5}
                            stroke="rgba(255,255,255,0.1)" strokeWidth="0.3" strokeDasharray="2,2" />
                    )}
                    <path d={areaD} fill="url(#stockGrad)" />
                    <path d={pathD} fill="none" stroke="#10b981" strokeWidth="0.8" />
                    {/* Hover hitboxes */}
                    {data.map((d, i) => {
                        const { x, y } = getXY(i);
                        const w = 100 / (data.length || 1);
                        return <rect key={i} x={x - w / 2} y="0" width={w} height="100" fill="transparent"
                            onMouseEnter={() => setHoverIdx(i)} style={{ cursor: 'crosshair' }} />;
                    })}
                    {/* Hover indicator */}
                    {hoverPos && (
                        <>
                            <line x1={hoverPos.x} y1="0" x2={hoverPos.x} y2="100" stroke="rgba(255,255,255,0.3)" strokeWidth="0.3" strokeDasharray="1,1" />
                            <circle cx={hoverPos.x} cy={hoverPos.y} r="1.2" fill="#10b981" stroke="white" strokeWidth="0.4" />
                        </>
                    )}
                </svg>
                {/* Tooltip */}
                {hoverData && hoverPos && (
                    <div className="absolute z-10 bg-gray-900/95 border border-white/20 rounded-lg p-2 text-xs pointer-events-none shadow-xl backdrop-blur-md"
                        style={{ left: `${Math.min(Math.max(hoverPos.x, 10), 90)}%`, top: '4px', transform: 'translateX(-50%)' }}>
                        <div className="font-bold text-white mb-1">{hoverData.date}</div>
                        <div className="text-emerald-400 font-medium">Stock: {hoverData.stock.toFixed(2)}kg</div>
                        {hoverData.buyQty > 0 && <div className="text-green-300">Buy: +{hoverData.buyQty}kg</div>}
                        {hoverData.sellQty > 0 && <div className="text-red-300">Sell: -{hoverData.sellQty}kg</div>}
                        {hoverData.adjInQty > 0 && <div className="text-blue-300">Adj In: +{hoverData.adjInQty}kg</div>}
                        {hoverData.adjOutQty > 0 && <div className="text-orange-300">Adj Out: -{hoverData.adjOutQty}kg</div>}
                        {hoverData.netChange !== 0 && <div className={`font-bold mt-0.5 ${hoverData.netChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            Net: {hoverData.netChange >= 0 ? '+' : ''}{hoverData.netChange}kg</div>}
                    </div>
                )}
                <div className="flex justify-between text-[9px] text-gray-500 mt-1">
                    <span>{data[0]?.date?.slice(5)}</span>
                    <span className="text-emerald-400 font-medium">Max: {maxStock.toFixed(1)}kg | Min: {minStock.toFixed(1)}kg</span>
                    <span>{data[data.length - 1]?.date?.slice(5)}</span>
                </div>
            </div>
        </div>
    );
};

// =====================================================
// MINI BAR CHART
// =====================================================
const MiniBarChart = ({ data, height = 200 }) => {
    if (!data || data.length === 0) return null;
    const maxVal = Math.max(...data.map(d => Math.max(d.buyQty, d.sellQty, Math.abs(d.stock))), 1);
    return (
        <div className="w-full h-full">
            <div style={{ width: '100%', height: `${height}px` }} className="relative flex items-end gap-px">
                {data.map((d, i) => (
                    <Tooltip key={i} title={<div className="text-xs"><div className="font-bold">{d.date}</div><div className="text-green-300">Buy: {d.buyQty}kg</div><div className="text-red-300">Sell: {d.sellQty}kg</div><div>Stock: {d.stock}kg</div></div>}>
                        <div className="flex-1 flex flex-col items-center justify-end gap-0.5 min-w-[2px]">
                            {d.buyQty > 0 && <div className="w-full bg-emerald-500/70 rounded-t-sm" style={{ height: `${(d.buyQty / maxVal) * height * 0.4}px`, minHeight: '2px' }} />}
                            {d.sellQty > 0 && <div className="w-full bg-red-500/70 rounded-t-sm" style={{ height: `${(d.sellQty / maxVal) * height * 0.4}px`, minHeight: '2px' }} />}
                        </div>
                    </Tooltip>
                ))}
            </div>
            {data.length > 0 && (
                <div className="flex justify-between mt-1 text-[9px] text-gray-500">
                    <span>{data[0]?.date?.slice(5)}</span>
                    {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.date?.slice(5)}</span>}
                    <span>{data[data.length - 1]?.date?.slice(5)}</span>
                </div>
            )}
        </div>
    );
};

// =====================================================
// STORE STOCK BOX
// =====================================================
const StoreStockBox = ({ storeNo, stock, label, color = 'blue' }) => (
    <div className={`flex flex-col items-center p-3 rounded-xl bg-${color}-500/5 border border-${color}-500/20`}>
        <div className={`w-10 h-10 rounded-full bg-${color}-500/20 flex items-center justify-center mb-1`}>
            <span className={`text-sm font-bold text-${color}-400`}>S{storeNo}</span>
        </div>
        <div className="text-[10px] text-gray-500 uppercase">{label}</div>
        <div className={`text-lg font-bold text-${color}-400`}>{parseFloat(stock).toFixed(2)}<span className="text-[10px] font-normal ml-0.5">kg</span></div>
    </div>
);

// =====================================================
// STORE AGGREGATES TABLE
// =====================================================
const StoreAggregateRow = ({ label, s1, s2, total, color, icon }) => (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
            {icon && <span className={`text-${color}-400 text-xs`}>{icon}</span>}
            <span className="text-xs text-gray-400">{label}</span>
        </div>
        <div className={`flex-1 text-right text-xs font-medium text-${color}-400`}>{s1.toFixed(2)}</div>
        <div className={`flex-1 text-right text-xs font-medium text-${color}-400`}>{s2.toFixed(2)}</div>
        <div className={`flex-1 text-right text-xs font-bold text-${color}-300`}>{total.toFixed(2)}</div>
    </div>
);

// =====================================================
// OP TYPE LABELS & COLORS
// =====================================================
const OP_TYPE_LABELS = { 1: 'Full Clear', 2: 'Partial Clear', 3: 'Full + Sale', 4: 'Partial + Sale', 5: 'Transfer', 6: 'Transfer + Clear', 7: 'Partial + Lorry', 8: 'Full + Lorry', 9: 'Conversion', 11: 'Return' };
const OP_TYPE_COLORS = { 1: 'blue', 2: 'geekblue', 3: 'orange', 4: 'gold', 5: 'purple', 6: 'purple', 7: 'lime', 8: 'cyan', 9: 'pink', 11: 'green' };

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function ReportsDashboard() {
    const [items, setItems] = useState([]);
    const [selectedItemId, setSelectedItemId] = useState(null);
    const selectedStore = 'all';
    const [loadingClearances, setLoadingClearances] = useState(false);
    const [loadingAnalysis, setLoadingAnalysis] = useState(false);
    const [clearanceData, setClearanceData] = useState(null);
    const [selectedClearances, setSelectedClearances] = useState([]);
    const [analysisData, setAnalysisData] = useState(null);
    const [showClearanceSelection, setShowClearanceSelection] = useState(true);

    // Toggle sections
    const [showSections, setShowSections] = useState({
        initialStock: true, buysSells: true, transfers: true,
        operations: true, conversions: true, wastage: true,
        finalStock: true, charts: true, financials: true
    });

    const toggleSection = (key) => setShowSections(prev => ({ ...prev, [key]: !prev[key] }));

    // Load items
    useEffect(() => {
        axios.get('/api/reports-dashboard/items')
            .then(res => { if (res.data.success) setItems(res.data.result); })
            .catch(() => message.error('Failed to load items'));
    }, []);

    // Load clearances
    const loadClearances = async (itemId) => {
        if (!itemId) return;
        setLoadingClearances(true);
        setClearanceData(null);
        setSelectedClearances([]);
        setAnalysisData(null);
        try {
            const res = await axios.get(`/api/reports-dashboard/clearances/${itemId}`, { params: { storeNo: selectedStore } });
            if (res.data.success) setClearanceData(res.data);
        } catch { message.error('Failed to load clearance events'); }
        finally { setLoadingClearances(false); }
    };

    useEffect(() => { if (selectedItemId) loadClearances(selectedItemId); }, [selectedItemId]);

    // Combined clearance list
    const allClearanceEvents = useMemo(() => {
        if (!clearanceData) return [];
        const events = [];

        // Add "Now" virtual event at the top
        events.push({
            id: 'now',
            date: new Date().toISOString(),
            source: 'now',
            storeNo: null, opCode: null, opType: null,
            originalStock: null, opId: null
        });

        if (clearanceData.clearances) {
            for (const c of clearanceData.clearances) {
                events.push({
                    id: `op-${c.OP_ID}`, date: c.CREATED_DATE || c.OP_DATE, source: 'operation',
                    opCode: c.OP_CODE, opType: c.OP_TYPE, storeNo: c.STORE_NO,
                    billCode: c.BILL_CODE, wastage: c.WASTAGE_AMOUNT, surplus: c.SURPLUS_AMOUNT,
                    originalStock: c.ORIGINAL_STOCK, opId: c.OP_ID
                });
            }
        }
        if (clearanceData.zeroDates) {
            for (const z of clearanceData.zeroDates) {
                const dateStr = typeof z.date === 'string' ? z.date.split('T')[0] : z.date;
                if (!events.some(e => e.source !== 'now' && (typeof e.date === 'string' ? e.date.split('T')[0] : '') === dateStr)) {
                    events.push({ id: `calc-${dateStr}`, date: z.date, source: 'calculated', storeNo: null, opCode: null, opType: null, originalStock: 0 });
                }
            }
        }
        // Sort but keep "Now" always at top
        const nowEvent = events.find(e => e.id === 'now');
        const rest = events.filter(e => e.id !== 'now');
        rest.sort((a, b) => new Date(b.date) - new Date(a.date));
        return [nowEvent, ...rest];
    }, [clearanceData]);

    const toggleClearance = (eventId) => {
        setSelectedClearances(prev => {
            if (prev.includes(eventId)) return prev.filter(id => id !== eventId);
            if (prev.length >= 2) return [prev[1], eventId];
            return [...prev, eventId];
        });
    };

    // Run analysis
    const runAnalysis = async () => {
        if (selectedClearances.length !== 2) { message.warning('Select exactly 2 clearance events'); return; }
        const event1 = allClearanceEvents.find(e => e.id === selectedClearances[0]);
        const event2 = allClearanceEvents.find(e => e.id === selectedClearances[1]);
        if (!event1 || !event2) return;

        // Handle "Now" virtual event
        const hasNow = event1.id === 'now' || event2.id === 'now';
        const nowDate = new Date();

        const date1 = event1.id === 'now' ? nowDate : new Date(event1.date);
        const date2 = event2.id === 'now' ? nowDate : new Date(event2.date);
        const startDate = date1 < date2 ? date1 : date2;
        const endDate = date1 < date2 ? date2 : date1;
        const startEvent = date1 < date2 ? event1 : event2;
        const endEvent = date1 < date2 ? event2 : event1;

        setLoadingAnalysis(true);
        setAnalysisData(null);
        try {
            const res = await axios.post('/api/reports-dashboard/analyze-period', {
                itemId: selectedItemId,
                startDate: dayjs(startDate).format('YYYY-MM-DD'),
                endDate: dayjs(endDate).format('YYYY-MM-DD'),
                startOpId: startEvent.opId || null,
                endOpId: endEvent.opId || null,
                isNow: hasNow
            });
            if (res.data.success) {
                setAnalysisData({ ...res.data.data, isNow: hasNow });
                setShowClearanceSelection(false);
            }
        } catch { message.error('Analysis failed'); }
        finally { setLoadingAnalysis(false); }
    };

    const selectedItem = items.find(i => i.ITEM_ID === selectedItemId);

    return (
        <div className="animate-fade-in pb-24 md:pb-8">
            {/* Header */}
            <div className="hidden md:flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                        <DashboardOutlined className="text-emerald-400" /> Stock Lifecycle Analysis
                    </h1>
                    <p className="text-xs text-gray-400 mt-1">Deep analytics between clearance events • Per-store breakdown</p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Step 1: Item Selection */}
                <div className="glass-card p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-bold">1</span>
                        Select Item
                    </div>
                    <Select showSearch placeholder="🔍 Search and select an item..." value={selectedItemId}
                        onChange={(val) => { setSelectedItemId(val); setAnalysisData(null); setShowClearanceSelection(true); }}
                        className="w-full" size="large" optionFilterProp="children"
                        filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}>
                        {items.map(item => (<Option key={item.ITEM_ID} value={item.ITEM_ID}>{`${item.CODE} - ${item.NAME}`}</Option>))}
                    </Select>
                </div>

                {/* Step 2: Clearance Selection */}
                {selectedItemId && (
                    <div className="glass-card p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 transition-all duration-300">
                        <div className="flex items-center justify-between mb-0 cursor-pointer" onClick={() => setShowClearanceSelection(!showClearanceSelection)}>
                            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <span className={`w-6 h-6 rounded-full ${showClearanceSelection ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'} text-xs flex items-center justify-center font-bold`}>2</span>
                                Select 2 Clearance Events
                                <div className="ml-2 flex items-center gap-1 text-[10px] bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                                    {selectedClearances.length === 2 ? <span className="text-emerald-400">Ready</span> : <span className="text-gray-500">{selectedClearances.length}/2</span>}
                                </div>
                                {!showClearanceSelection && <span className="text-[10px] text-gray-500 ml-2">(Click to expand)</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                {showClearanceSelection && (
                                    <Button size="small" icon={<ReloadOutlined />} onClick={(e) => { e.stopPropagation(); loadClearances(selectedItemId); }}
                                        className="border-none bg-white/5 text-gray-400 hover:text-white flex items-center justify-center w-8 h-8 rounded-full" />
                                )}
                                {showClearanceSelection ? <UpOutlined className="text-gray-500 text-xs" /> : <DownOutlined className="text-gray-500 text-xs" />}
                            </div>
                        </div>

                        {showClearanceSelection && (
                            <div className="mt-3 pt-3 border-t border-white/5 animate-fade-in">

                                {loadingClearances && <div className="flex justify-center py-8"><Spin size="large" /></div>}
                                {!loadingClearances && allClearanceEvents.length === 0 && (
                                    <Empty description={<span className="text-gray-400 text-sm">No full clearance events found for this item.</span>} className="py-6" />
                                )}
                                {!loadingClearances && allClearanceEvents.length > 0 && (
                                    <>
                                        <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                                            {allClearanceEvents.map((event) => {
                                                const isSelected = selectedClearances.includes(event.id);
                                                const isNow = event.id === 'now';
                                                return (
                                                    <div key={event.id} onClick={() => toggleClearance(event.id)}
                                                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-200 border
                                                    ${isNow && isSelected ? 'bg-cyan-500/10 border-cyan-500/30 ring-1 ring-cyan-500/20' : ''}
                                                    ${isNow && !isSelected ? 'bg-cyan-500/5 border-cyan-500/15 hover:bg-cyan-500/10' : ''}
                                                    ${!isNow && isSelected ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20' : ''}
                                                    ${!isNow && !isSelected ? 'bg-white/5 border-white/5 hover:bg-white/10' : ''}`}>
                                                        <Checkbox checked={isSelected} className="pointer-events-none" />
                                                        {isNow ? (
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="relative flex h-2.5 w-2.5">
                                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                                                                    </span>
                                                                    <span className="text-sm font-semibold text-cyan-400">Now — Current Time</span>
                                                                    <Tag icon={<ClockCircleOutlined />} color="cyan" className="text-[10px] leading-none m-0">Live</Tag>
                                                                </div>
                                                                <div className="text-[10px] text-gray-500 mt-1">{dayjs().format('DD MMM YYYY hh:mm A')} • Analyze up to current moment</div>
                                                            </div>
                                                        ) : (
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-sm font-semibold text-white">{dayjs(event.date).format('DD MMM YYYY')}</span>
                                                                    <span className="text-xs text-gray-500">{dayjs(event.date).format('hh:mm A')}</span>
                                                                    {event.source === 'operation' && <Tag color="blue" className="text-[10px] leading-none m-0">{OP_TYPE_LABELS[event.opType] || `Op ${event.opType}`}</Tag>}
                                                                    {event.source === 'calculated' && <Tag color="orange" className="text-[10px] leading-none m-0">Auto-detected</Tag>}
                                                                    {event.storeNo && <Tag className="text-[10px] leading-none m-0 bg-white/10 border-white/10 text-gray-300">S{event.storeNo}</Tag>}
                                                                </div>
                                                                {event.opCode && <div className="text-[10px] text-gray-500 font-mono mt-1">{event.opCode}</div>}
                                                            </div>
                                                        )}
                                                        {!isNow && event.originalStock !== undefined && (
                                                            <div className="text-right">
                                                                <div className="text-[10px] text-gray-500">Stock</div>
                                                                <div className="text-xs font-medium text-gray-300">{parseFloat(event.originalStock || 0).toFixed(1)}kg</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-4 flex items-center justify-between">
                                            <div className="text-xs text-gray-500">{selectedClearances.length}/2 selected</div>
                                            <Button type="primary" icon={<BarChartOutlined />} onClick={runAnalysis} loading={loadingAnalysis}
                                                disabled={selectedClearances.length !== 2}
                                                className="bg-emerald-600 hover:bg-emerald-500 border-none h-10 px-6 rounded-xl shadow-lg shadow-emerald-500/20 font-semibold">
                                                Analyze Period
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {loadingAnalysis && (
                    <div className="flex flex-col items-center justify-center py-16 glass-card rounded-2xl bg-white/5 border border-white/10">
                        <Spin size="large" /><p className="text-gray-400 mt-4 text-sm animate-pulse">Analyzing stock lifecycle...</p>
                    </div>
                )}

                {/* Analysis Results */}
                {analysisData && !loadingAnalysis && (
                    <AnalysisResults data={analysisData} showSections={showSections} toggleSection={toggleSection} />
                )}
            </div>
        </div>
    );
}

// =====================================================
// ANALYSIS RESULTS COMPONENT
// =====================================================
function AnalysisResults({ data, showSections, toggleSection }) {
    const { item, period, initialStock, finalStock, storeAggregates, aggregates, chartData, financials, conversions, stockOperations, transfers, operationWastage, manualAdjustments = [], netManualAdjustment = 0 } = data;

    // Derived Variables (accessed by multiple sections)
    const totalConverted = conversions ? conversions.reduce((s, c) => s + (c.type === 'out' ? c.sourceQty : 0), 0) : 0;
    const totalConvertedIn = conversions ? conversions.reduce((s, c) => s + (c.type === 'in' ? c.destQty : 0), 0) : 0;

    const sectionToggle = (key, label) => (
        <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-400 hover:text-gray-200 transition-colors">
            <Checkbox checked={showSections[key]} onChange={() => toggleSection(key)} size="small" />
            {label}
        </label>
    );

    return (
        <div className="space-y-4 animate-fade-in">
            {/* Header with toggles */}
            <div className="glass-card p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-white/10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <CheckCircleOutlined className="text-emerald-400" /> {item.CODE} - {item.NAME}
                        </h2>
                        <div className="flex items-center gap-2 mt-1">
                            <Tag icon={<CalendarOutlined />} className="bg-white/10 border-white/10 text-gray-300 m-0">
                                {period.startDate} → {data.isNow ? '📍 Now' : period.endDate}
                            </Tag>
                            {data.isNow && (
                                <Tag icon={<ClockCircleOutlined />} color="cyan" className="text-[10px] m-0">Live</Tag>
                            )}
                            <span className="text-xs text-gray-500">{dayjs(period.endDate).diff(dayjs(period.startDate), 'day')} days</span>
                        </div>
                    </div>
                </div>
                {/* Section toggles */}
                {/* <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 pt-3 border-t border-white/10">
                    {sectionToggle('initialStock', 'Initial Stock')}
                    {sectionToggle('buysSells', 'Buys & Sells')}
                    {sectionToggle('transfers', 'Transfers')}
                    {sectionToggle('operations', 'Operations')}
                    {sectionToggle('conversions', 'Conversions')}
                    {sectionToggle('wastage', 'Wastage')}
                    {sectionToggle('finalStock', 'Final Stock')}
                    {sectionToggle('charts', 'Charts')}
                    {sectionToggle('financials', 'Financials')}
                </div> */}
            </div>

            {/* Shared Derived Variables */}
            {(() => {
                // Determine these early so they can be injected down
            })()}

            {/* STEP 7: Stock Summary */}
            {showSections.financials && (() => {
                // (totalConverted and totalConvertedIn moved to global render scope)
                const netWS = (operationWastage?.totalWastage || 0) - (operationWastage?.totalSurplus || 0);
                const returnOps = stockOperations.filter(op => op.OP_TYPE === 11);
                // For returns with conversions, CLEARED_QUANTITY might be source quantity, not stock added
                // We need to check if the return has conversions
                const totalReturns = returnOps.reduce((s, op) => {
                    if (op.conversions && op.conversions.length > 0) {
                        // Return with conversions: customer returned items that were re-converted.
                        // Check if selected item appears as SOURCE in the conversion chain.
                        // If so, the total converted-out DEST_QUANTITY is what was returned (and then converted).
                        // Use destQuantity (per user rule: DEST_QUANTITY is the canonical amount).
                        const itemIsSource = op.conversions.some(
                            c => c.sourceItemId === data.item.ITEM_ID
                        );
                        if (itemIsSource) {
                            // Sum dest quantities for conversions where this item is source
                            const returnedQty = op.conversions
                                .filter(c => c.sourceItemId === data.item.ITEM_ID)
                                .reduce((sum, c) => sum + (c.destQuantity || 0), 0);
                            return s + returnedQty;
                        }
                        // Item is only a conversion destination → already counted in Converted In
                        return s;
                    }
                    // Direct return (no conversions): CLEARED_QUANTITY is stock added back
                    return s + (op.CLEARED_QUANTITY || 0);
                }, 0);
                const totalAdjIn = manualAdjustments.filter(a => a.isIn).reduce((s, a) => s + a.qty, 0);
                const totalAdjOut = manualAdjustments.filter(a => !a.isIn).reduce((s, a) => s + a.qty, 0);
                const summaryCards = [
                    { label: 'Initial Stock', value: initialStock.total, unit: 'kg', color: 'blue', icon: '📦' },
                    { label: 'Bought', value: aggregates.buying.qty, unit: 'kg', color: 'emerald', icon: '🛒' },
                    { label: 'Sold', value: aggregates.selling.qty, unit: 'kg', color: 'red', icon: '💰' },
                    { label: netWS > 0 ? 'Wastage' : 'Surplus', value: Math.abs(netWS), unit: 'kg', color: netWS > 0 ? 'orange' : 'cyan', icon: netWS > 0 ? '⚠️' : '✨' },
                    { label: 'Conv. Out', value: totalConverted, unit: 'kg', color: 'pink', icon: '⬅️' },
                    { label: 'Conv. In', value: totalConvertedIn, unit: 'kg', color: 'fuchsia', icon: '➡️' },
                    { label: 'Returns', value: totalReturns, unit: 'kg', color: 'green', icon: '↩️', sub: `${returnOps.length} op${returnOps.length !== 1 ? 's' : ''}` },
                    { label: 'Adj In', value: totalAdjIn, unit: 'kg', color: 'teal', icon: '🔧', sub: '+manual' },
                    { label: 'Adj Out', value: totalAdjOut, unit: 'kg', color: 'amber', icon: '🔧', sub: '-manual' },
                    { label: 'Final Stock', value: finalStock.total, unit: 'kg', color: 'purple', icon: '📊' }
                ];
                return (
                    <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px] flex items-center justify-center font-bold">F</span>
                            Stock Summary
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-2">
                            {summaryCards.map((c, i) => (
                                <div key={i} className={`bg-${c.color}-900/10 border border-${c.color}-900/20 rounded-xl p-2.5 text-center relative`}>
                                    <div className="text-base mb-1">{c.icon}</div>
                                    <div className="text-[10px] font-semibold text-gray-500 uppercase">{c.label}</div>
                                    <div className={`text-lg font-bold text-${c.color}-400`}>
                                        {c.value.toFixed(1)}<span className="text-[9px] font-normal ml-0.5">{c.unit}</span>
                                    </div>
                                    {c.sub && <div className="text-[9px] text-gray-500">{c.sub}</div>}
                                    {i < summaryCards.length - 1 && (
                                        <div className="absolute -right-2 top-1/2 -translate-y-1/2 text-gray-600 text-xs z-10 hidden md:block">→</div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Stock Balance Validation */}
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">Stock Balance Check:</span>
                                {(() => {
                                    // netWS = totalWastage - totalSurplus
                                    // Wastage > 0: stock lost → subtract netWS (positive)
                                    // Surplus > 0: stock gained → subtract netWS (negative) = add surplus
                                    // netManualAdjustment: positive = stock added, negative = stock removed
                                    const calculatedFinal = initialStock.total +
                                        aggregates.buying.qty + totalConvertedIn + totalReturns +
                                        netManualAdjustment -
                                        aggregates.selling.qty - netWS - totalConverted;
                                    const diff = Math.abs(finalStock.total - calculatedFinal);
                                    const isBalanced = diff < 0.01;
                                    const wsLabel = netWS > 0
                                        ? `Wastage (-${netWS.toFixed(1)})`
                                        : netWS < 0
                                            ? `Surplus (+${Math.abs(netWS).toFixed(1)})`
                                            : `W/S (0)`;
                                    const adjLabel = `ManualAdj (${netManualAdjustment >= 0 ? '+' : ''}${netManualAdjustment.toFixed(1)})`;

                                    return (
                                        <div className="flex items-center gap-2">
                                            {isBalanced ? (
                                                <span className="text-emerald-400 font-medium">✓ Balanced ({diff.toFixed(3)}kg diff)</span>
                                            ) : (
                                                <span className="text-red-400 font-medium">⚠ Unbalanced ({diff.toFixed(3)}kg diff)</span>
                                            )}
                                            <Tooltip title={`Initial (${initialStock.total.toFixed(1)}) + Bought (${aggregates.buying.qty.toFixed(1)}) + Converted In (${totalConvertedIn.toFixed(1)}) + Returns (${totalReturns.toFixed(1)}) + ${adjLabel} - Sold (${aggregates.selling.qty.toFixed(1)}) - ${wsLabel} - Converted Out (${totalConverted.toFixed(1)}) = ${calculatedFinal.toFixed(1)} vs Final ${finalStock.total.toFixed(1)}`}>
                                                <InfoCircleOutlined className="text-gray-500 cursor-help" />
                                            </Tooltip>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* STEP 8: Financials */}
            {showSections.financials && (() => {
                // 1. Income Amount per kg = revenue / sold amount
                let incomePerKg = financials.totalSellQty > 0 ? financials.totalRevenue / financials.totalSellQty : 0;
                incomePerKg = Number(incomePerKg.toFixed(5));

                // 2. Out going Amount per kg = cost + return expenses / bought amount + return amount
                // Note: user specifically requested "cost + return expnces / bout amount + return amount"
                const outGoingTotal = financials.totalCost + (financials.totalReturnExpense || 0);
                const outGoingQty = financials.totalBuyQty + (financials.totalReturnedQty || 0);
                let outGoingPerKg = outGoingQty > 0 ? outGoingTotal / outGoingQty : 0;
                outGoingPerKg = Number(outGoingPerKg.toFixed(5));

                // 3. Conversion impact for sold kg = Conv. Impact / sold amount
                let convImpactPerSoldKg = financials.totalSellQty > 0 ? (financials.conversionImpact || 0) / financials.totalSellQty : 0;
                convImpactPerSoldKg = Number(convImpactPerSoldKg.toFixed(5));

                // 4. Waste or surplus impact for sold kg(Y) = surplus or waste total kg / total sold kg
                const wsTotalKg = (operationWastage?.totalWastage || 0) - (operationWastage?.totalSurplus || 0);
                let wsImpactRatio = financials.totalSellQty > 0 ? wsTotalKg / financials.totalSellQty : 0;
                wsImpactRatio = Number(wsImpactRatio.toFixed(5));

                // 5. Its effect for sold amount for kg = sold amount per kg + or - sold amount per kg x Y
                // The prompt says: "sold amount per kg x Y" -> which means revenue/kg * wsRatio
                let wsFinancialImpactPerKg = incomePerKg * wsImpactRatio;
                wsFinancialImpactPerKg = Number(wsFinancialImpactPerKg.toFixed(5));

                // 6. Net profit per kg = cal from these
                // Income - Outgoing + Conversion Impact - Wastage Impact (Wastage is bad, so minus)
                let trueNetProfitPerKg = incomePerKg - outGoingPerKg + convImpactPerSoldKg - wsFinancialImpactPerKg;
                trueNetProfitPerKg = Number(trueNetProfitPerKg.toFixed(5));

                const finCards = [
                    {
                        label: 'Revenue',
                        value: financials.totalRevenue,
                        color: 'emerald',
                        sub: `${financials.totalSellQty.toFixed(1)}kg sold`
                    },
                    {
                        label: 'Cost',
                        value: financials.totalCost,
                        color: 'red',
                        sub: `${financials.totalBuyQty.toFixed(1)}kg bought`
                    },
                    {
                        label: 'Gross Profit',
                        value: financials.grossProfit,
                        color: financials.grossProfit >= 0 ? 'emerald' : 'red',
                        sub: `Avg B:${financials.avgBuyPrice?.toFixed(2)} S:${financials.avgSellPrice?.toFixed(2)}`
                    },
                    {
                        label: 'Return Expenses',
                        value: financials.totalReturnExpense || 0,
                        color: 'orange',
                        sub: `${financials.totalReturnedQty?.toFixed(1) || 0}kg returned`
                    },
                    {
                        label: 'Conv. Impact',
                        value: financials.conversionImpact,
                        color: financials.conversionImpact >= 0 ? 'blue' : 'orange',
                        sub: `${conversions?.length || 0} conversions`
                    },
                    {
                        label: 'Net Profit',
                        value: financials.netProfit,
                        color: financials.netProfit >= 0 ? 'emerald' : 'red',
                        sub: 'Final stock operations profit'
                    }
                ];

                const perKgCards = [
                    {
                        label: 'Income / Sold kg',
                        value: incomePerKg,
                        color: 'emerald',
                        sub: `Rev / Sold Kg`
                    },
                    {
                        label: 'Outgoing / Action kg',
                        value: outGoingPerKg,
                        color: 'red',
                        sub: `(Cost+Ret) / (Buy+Ret)`
                    },
                    {
                        label: 'Conv. Impact / Sold kg',
                        value: convImpactPerSoldKg,
                        color: convImpactPerSoldKg >= 0 ? 'blue' : 'orange',
                        sub: `Conv Impact / Sold Kg`
                    },
                    {
                        label: 'W/S Impact / Sold kg',
                        value: -wsFinancialImpactPerKg, // negative because wastage reduces profit
                        color: wsFinancialImpactPerKg <= 0 ? 'emerald' : 'red',
                        sub: `(W/S Ratio) × Income/kg`
                    },
                    {
                        label: 'True Net Profit / kg',
                        value: trueNetProfitPerKg,
                        color: trueNetProfitPerKg >= 0 ? 'emerald' : 'red',
                        sub: 'Smoothed over Sold Stock'
                    }
                ];

                return (
                    <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center font-bold">G</span>
                            Financial Totals
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
                            {finCards.map((f, i) => (
                                <div key={i} className={`flex flex-col bg-${f.color}-50/50 dark:bg-${f.color}-900/10 border border-${f.color}-100 dark:border-${f.color}-900/20 rounded-xl overflow-hidden`}>
                                    <div className="p-3 pb-2 flex-grow">
                                        <div className="text-[10px] font-semibold text-gray-500 uppercase">{f.label}</div>
                                        <div className={`text-lg font-bold text-${f.color}-600 dark:text-${f.color}-400 mt-0.5`}>
                                            {f.value.toFixed(2)} <span className="text-[10px] font-normal">Rs</span>
                                        </div>
                                        {f.sub && <div className="text-[9px] text-gray-400 mt-1 leading-tight">{f.sub}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">H</span>
                            Per-Kg Smoothed Analysis
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            {perKgCards.map((f, i) => (
                                <div key={i} className={`flex flex-col bg-${f.color}-50/50 dark:bg-${f.color}-900/10 border border-${f.color}-100 dark:border-${f.color}-900/20 rounded-xl overflow-hidden`}>
                                    <div className="p-3 pb-2 flex-grow">
                                        <div className="text-[10px] font-semibold text-gray-500 uppercase">{f.label}</div>
                                        <div className={`text-lg font-bold text-${f.color}-600 dark:text-${f.color}-400 mt-0.5`}>
                                            {f.value.toFixed(2)} <span className="text-[10px] font-normal">Rs</span>
                                        </div>
                                        {f.sub && <div className="text-[9px] text-gray-400 mt-1 leading-tight">{f.sub}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* STEP 6: Charts */}
            {showSections.charts && chartData && chartData.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <LineChartOutlined className="text-emerald-400" /> Stock Level Over Time
                        </div>
                        <StockLineChart data={chartData} height={200} />
                    </div>
                    <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <BarChartOutlined className="text-blue-400" /> Daily Movements
                            <span className="ml-auto flex items-center gap-2 text-[10px] font-normal">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>Buy
                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>Sell
                            </span>
                        </div>
                        <MiniBarChart data={chartData} height={200} />
                    </div>
                </div>
            )}

            {/* STEP 1: Initial Stock */}
            {showSections.initialStock && (
                <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">A</span>
                        Initial Stock <span className="font-normal text-gray-500">— after first clearance</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <StoreStockBox storeNo={1} stock={initialStock.store1} label="Store 1" color="blue" />
                        <StoreStockBox storeNo={2} stock={initialStock.store2} label="Store 2" color="purple" />
                        <div className="flex flex-col items-center p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                            <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center mb-1">
                                <span className="text-sm font-bold text-emerald-400">Σ</span>
                            </div>
                            <div className="text-[10px] text-gray-500 uppercase">Combined</div>
                            <div className="text-lg font-bold text-emerald-400">{initialStock.total.toFixed(2)}<span className="text-[10px] font-normal ml-0.5">kg</span></div>
                        </div>
                    </div>
                </div>
            )}



            {/* STEP 5: Final Stock */}
            {showSections.finalStock && (
                <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] flex items-center justify-center font-bold">E</span>
                        Final Stock <span className="font-normal text-gray-500">— after final clearance</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <StoreStockBox storeNo={1} stock={finalStock.store1} label="Store 1" color="blue" />
                        <StoreStockBox storeNo={2} stock={finalStock.store2} label="Store 2" color="purple" />
                        <div className="flex flex-col items-center p-3 rounded-xl bg-orange-500/5 border border-orange-500/20">
                            <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center mb-1">
                                <span className="text-sm font-bold text-orange-400">Σ</span>
                            </div>
                            <div className="text-[10px] text-gray-500 uppercase">Combined</div>
                            <div className="text-lg font-bold text-orange-400">{finalStock.total.toFixed(2)}<span className="text-[10px] font-normal ml-0.5">kg</span></div>
                        </div>
                    </div>
                    {/* Stock change summary */}
                    <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-center gap-6 text-xs">
                        <span className="text-gray-500">Initial: <span className="text-blue-400 font-bold">{initialStock.total.toFixed(2)}kg</span></span>
                        <span className="text-gray-600">→</span>
                        <span className="text-gray-500">Final: <span className="text-orange-400 font-bold">{finalStock.total.toFixed(2)}kg</span></span>
                        <span className={`font-bold ${(finalStock.total - initialStock.total) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            ({(finalStock.total - initialStock.total) >= 0 ? '+' : ''}{(finalStock.total - initialStock.total).toFixed(2)}kg)
                        </span>
                    </div>
                </div>
            )}



            {/* STEP 2: Buys & Sells per store */}
            {showSections.buysSells && (
                <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-center font-bold">B</span>
                        Stock Changes by Store
                    </div>
                    {/* Header */}
                    <div className="flex items-center gap-2 py-1.5 px-2 border-b border-white/10 mb-1">
                        <div className="w-28 flex-shrink-0 text-[10px] text-gray-500 uppercase">Type</div>
                        <div className="flex-1 text-right text-[10px] text-blue-400 uppercase font-bold">S1 (kg)</div>
                        <div className="flex-1 text-right text-[10px] text-purple-400 uppercase font-bold">S2 (kg)</div>
                        <div className="flex-1 text-right text-[10px] text-gray-300 uppercase font-bold">Total</div>
                    </div>
                    <StoreAggregateRow label="Buying" icon={<ArrowDownOutlined />} color="emerald"
                        s1={storeAggregates.store1.buying.qty} s2={storeAggregates.store2.buying.qty} total={aggregates.buying.qty} />
                    <StoreAggregateRow label="Selling" icon={<ArrowUpOutlined />} color="red"
                        s1={storeAggregates.store1.selling.qty} s2={storeAggregates.store2.selling.qty} total={aggregates.selling.qty} />
                    <StoreAggregateRow label="Adj In" icon={<RiseOutlined />} color="blue"
                        s1={storeAggregates.store1.adjIn.qty} s2={storeAggregates.store2.adjIn.qty} total={aggregates.adjIn.qty} />
                    <StoreAggregateRow label="Adj Out" icon={<FallOutlined />} color="orange"
                        s1={storeAggregates.store1.adjOut.qty} s2={storeAggregates.store2.adjOut.qty} total={aggregates.adjOut.qty} />
                    {/* Revenue row */}
                    <div className="mt-2 pt-2 border-t border-white/10">
                        <div className="flex items-center gap-2 py-1.5 px-2">
                            <div className="w-28 flex-shrink-0 text-xs text-gray-400 flex items-center gap-1.5"><DollarOutlined className="text-emerald-400" />Revenue</div>
                            <div className="flex-1 text-right text-xs font-medium text-emerald-400">Rs {storeAggregates.store1.selling.amount.toFixed(0)}</div>
                            <div className="flex-1 text-right text-xs font-medium text-emerald-400">Rs {storeAggregates.store2.selling.amount.toFixed(0)}</div>
                            <div className="flex-1 text-right text-xs font-bold text-emerald-300">Rs {aggregates.selling.amount.toFixed(0)}</div>
                        </div>
                        <div className="flex items-center gap-2 py-1.5 px-2">
                            <div className="w-28 flex-shrink-0 text-xs text-gray-400 flex items-center gap-1.5"><DollarOutlined className="text-red-400" />Cost</div>
                            <div className="flex-1 text-right text-xs font-medium text-red-400">Rs {storeAggregates.store1.buying.amount.toFixed(0)}</div>
                            <div className="flex-1 text-right text-xs font-medium text-red-400">Rs {storeAggregates.store2.buying.amount.toFixed(0)}</div>
                            <div className="flex-1 text-right text-xs font-bold text-red-300">Rs {aggregates.buying.amount.toFixed(0)}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* STEP 3: Stock Operations */}
            {showSections.operations && stockOperations.length > 0 && (
                <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px] flex items-center justify-center font-bold">C</span>
                        Stock Operations ({stockOperations.length})
                    </div>
                    <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                        {stockOperations.map((op, idx) => (
                            <div key={idx} className={`bg-white/5 rounded-xl p-3 border border-white/5 ${op.isReturnAfterClear ? 'ring-1 ring-green-500/30' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-lg bg-${OP_TYPE_COLORS[op.OP_TYPE] || 'gray'}-500/10 flex items-center justify-center`}>
                                        <span className={`text-xs font-bold text-${OP_TYPE_COLORS[op.OP_TYPE] || 'gray'}-400`}>#{op.OP_TYPE}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm text-white font-medium">{op.opTypeLabel}</span>
                                            {op.isReturnAfterClear && <Tag color="green" className="text-[10px] m-0">After Clear</Tag>}
                                            <Tag className="text-[10px] m-0 bg-white/10 border-white/10 text-gray-300">S{op.STORE_NO}</Tag>
                                        </div>
                                        <div className="text-[10px] text-gray-500 font-mono">{op.OP_CODE}</div>
                                        <div className="text-[10px] text-gray-400">{dayjs(op.CREATED_DATE).format('DD MMM YYYY HH:mm')}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-gray-400">Stock: {op.ORIGINAL_STOCK.toFixed(1)}kg</div>
                                        {op.BILL_CODE && <div className="text-[10px] text-emerald-400">{op.BILL_CODE}</div>}
                                        {op.BILL_AMOUNT > 0 && <div className="text-[10px] text-orange-400">Rs {op.BILL_AMOUNT.toFixed(0)}</div>}
                                        {op.WASTAGE_AMOUNT > 0 && <div className="text-[10px] text-orange-400">⚠️ W: {op.WASTAGE_AMOUNT.toFixed(2)}kg</div>}
                                        {op.SURPLUS_AMOUNT > 0 && <div className="text-[10px] text-blue-400">✨ S: {op.SURPLUS_AMOUNT.toFixed(2)}kg</div>}
                                    </div>
                                </div>
                                {/* Conversions within operation */}
                                {op.conversions && op.conversions.length > 0 && (() => {
                                    const totalDest = op.conversions.reduce((s, c) => s + c.destQuantity, 0);
                                    const diff = op.ORIGINAL_STOCK - totalDest;
                                    return (
                                        <div className="mt-2 pt-2 border-t border-white/5">
                                            <div className="text-[10px] text-gray-500 uppercase mb-1">Converted To:</div>
                                            {op.conversions.map((c, ci) => (
                                                <div key={ci} className="flex justify-between items-center px-2 py-1 bg-green-900/10 rounded mb-0.5">
                                                    <span className="text-xs text-gray-300">{c.destItemName}</span>
                                                    <span className="text-xs font-bold text-green-400">+{c.destQuantity.toFixed(2)}kg</span>
                                                </div>
                                            ))}
                                            {/* {Math.abs(diff) > 0.001 && (
                                                <div className={`flex justify-between items-center px-2 py-1 mt-1 rounded ${diff > 0 ? 'bg-orange-900/10' : 'bg-blue-900/10'}`}>
                                                    <span className="text-[10px] text-gray-400">{op.ORIGINAL_STOCK.toFixed(2)}kg → {totalDest.toFixed(2)}kg</span>
                                                    <span className={`text-xs font-bold ${diff > 0 ? 'text-orange-400' : 'text-blue-400'}`}>
                                                        {diff > 0 ? `⚠️ Wastage: ${diff.toFixed(2)}kg` : `✨ Surplus: ${Math.abs(diff).toFixed(2)}kg`}
                                                    </span>
                                                </div>
                                            )} */}
                                        </div>
                                    );
                                })()}
                                {/* Transfer store 2 items */}
                                {op.store2Items && op.store2Items.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-white/5">
                                        <div className="text-[10px] text-gray-500 uppercase mb-1">To Store 2:</div>
                                        {op.store2Items.map((s2, si) => (
                                            <div key={si} className="flex justify-between items-center px-2 py-1 bg-purple-900/10 rounded mb-0.5">
                                                <span className="text-xs text-gray-300">{s2.itemName}</span>
                                                <div className="text-right">
                                                    <span className="text-xs font-bold text-purple-400">+{s2.addedQty.toFixed(2)}kg</span>
                                                    <div className="text-[9px] text-gray-500">{s2.previousStock.toFixed(1)} → {s2.currentStock.toFixed(1)}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* STEP 4: Wastage Summary */}
            {showSections.wastage && operationWastage && (operationWastage.totalWastage > 0 || operationWastage.totalSurplus > 0) && (() => {
                const netWastage = operationWastage.totalWastage - operationWastage.totalSurplus;
                const isWastage = netWastage > 0;
                return (
                    <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] flex items-center justify-center font-bold">D</span>
                            Wastage & Surplus Summary
                            <span className={`ml-auto text-sm font-bold ${isWastage ? 'text-orange-400' : 'text-blue-400'}`}>
                                {isWastage ? `⚠️ Net Wastage: ${netWastage.toFixed(3)}kg` : `✨ Net Surplus: ${Math.abs(netWastage).toFixed(3)}kg`}
                            </span>
                        </div>
                        {operationWastage.operations.length > 0 && (
                            <div className="space-y-1">
                                {operationWastage.operations.map((op, i) => (
                                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg text-xs">
                                        <div>
                                            <span className="text-gray-300 font-medium">{op.opTypeLabel}</span>
                                            <span className="text-gray-500 ml-2 font-mono text-[10px]">{op.opCode}</span>
                                        </div>
                                        <div className="flex gap-3">
                                            {op.wastage > 0 && <span className="text-orange-400">-{op.wastage.toFixed(2)}kg</span>}
                                            {op.surplus > 0 && <span className="text-blue-400">+{op.surplus.toFixed(2)}kg</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* STEP 8: Manual Adjustments */}
            {manualAdjustments.length > 0 && (
                <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 text-[10px] flex items-center justify-center font-bold">M</span>
                        Manual Adjustments
                        <span className="text-[10px] text-gray-500 font-normal ml-1">({manualAdjustments.length} entries from Inventory)</span>
                        <span className={`ml-auto text-xs font-bold ${netManualAdjustment >= 0 ? 'text-teal-400' : 'text-amber-400'}`}>
                            Net: {netManualAdjustment >= 0 ? '+' : ''}{netManualAdjustment.toFixed(3)}kg
                        </span>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-3 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block"></span>
                        AdjIn / Opening add stock &nbsp;•&nbsp;
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span>
                        AdjOut / StockClear / Wastage remove stock
                    </div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
                        {manualAdjustments.map((adj, idx) => (
                            <div key={idx} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border
                                ${adj.isIn
                                    ? 'bg-teal-500/5 border-teal-500/15'
                                    : 'bg-amber-500/5 border-amber-500/15'}`}>
                                {/* Type badge */}
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                                    ${adj.isIn ? 'bg-teal-500/15' : 'bg-amber-500/15'}`}>
                                    <span className={`text-xs font-bold ${adj.isIn ? 'text-teal-400' : 'text-amber-400'}`}>
                                        {adj.isIn ? '+' : '−'}
                                    </span>
                                </div>
                                {/* Label + details */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-semibold text-gray-200">{adj.typeLabel}</span>
                                        <Tag className={`text-[9px] m-0 leading-none px-1.5 py-0.5
                                            ${adj.isIn
                                                ? 'bg-teal-500/15 border-teal-500/20 text-teal-300'
                                                : 'bg-amber-500/15 border-amber-500/20 text-amber-300'}`}>
                                            Manual
                                        </Tag>
                                        <Tag className="text-[9px] m-0 leading-none px-1.5 py-0.5 bg-white/5 border-white/10 text-gray-400">
                                            S{adj.storeNo}
                                        </Tag>
                                    </div>
                                    {adj.comments && (
                                        <div className="text-[10px] text-gray-500 mt-0.5 truncate" title={adj.comments}>
                                            {adj.comments}
                                        </div>
                                    )}
                                    <div className="text-[10px] text-gray-600 mt-0.5">
                                        {dayjs(adj.date).format('DD MMM YYYY hh:mm A')}
                                        {adj.txCode && <span className="ml-2 font-mono">{adj.txCode}</span>}
                                    </div>
                                </div>
                                {/* Signed delta */}
                                <div className={`text-sm font-bold flex-shrink-0 ${adj.isIn ? 'text-teal-400' : 'text-amber-400'}`}>
                                    {adj.delta >= 0 ? '+' : ''}{adj.delta.toFixed(3)}<span className="text-[10px] font-normal ml-0.5">kg</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* STEP 9: Conversions */}
            {showSections.conversions && conversions.length > 0 && (
                <div className="glass-card p-4 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <SwapOutlined className="text-purple-400" /> Item Conversions ({conversions.length})
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
                        {conversions.map((conv, idx) => (
                            <div key={idx} className="bg-white/5 rounded-xl p-3 border border-white/5">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Tag color={conv.type === 'out' ? 'red' : 'green'} className="m-0 text-[10px]">{conv.type === 'out' ? '→ OUT' : '← IN'}</Tag>
                                        <span className="text-xs text-gray-400 font-mono">{conv.opCode}</span>
                                        <span className="text-[10px] text-gray-500">{dayjs(conv.date).format('DD MMM YYYY')}</span>
                                    </div>
                                    <span className={`text-sm font-bold ${conv.profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {conv.profitLoss >= 0 ? '+' : ''}{conv.profitLoss.toFixed(2)} Rs
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                    <div className="flex-1 bg-red-900/10 rounded-lg p-2">
                                        <div className="text-[10px] text-gray-500">Source</div>
                                        <div className="text-gray-300 font-medium">{conv.sourceItemName || '—'}</div>
                                        <div className="text-gray-400">{conv.sourceQty.toFixed(2)}kg × Rs{conv.sourcePrice}</div>
                                    </div>
                                    <SwapOutlined className="text-gray-600" />
                                    <div className="flex-1 bg-emerald-900/10 rounded-lg p-2">
                                        <div className="text-[10px] text-gray-500">Destination</div>
                                        <div className="text-gray-300 font-medium">{conv.destItemName}</div>
                                        <div className="text-gray-400">{conv.destQty.toFixed(2)}kg × Rs{conv.destPrice}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
