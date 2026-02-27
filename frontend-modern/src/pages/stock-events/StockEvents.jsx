import React, { useState, useEffect } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { Select, DatePicker, Button, Spin, Empty, message, Tag } from 'antd';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    Legend, ResponsiveContainer
} from 'recharts';
import {
    AreaChartOutlined, CheckCircleOutlined, WarningOutlined,
    SearchOutlined, CalendarOutlined
} from '@ant-design/icons';

const { Option } = Select;
const { RangePicker } = DatePicker;

// ─── Colours ─────────────────────────────────────────────────────────────────
const EVENT_TYPE_COLORS = {
    'Buying': '#10b981', 'AdjIn': '#22d3ee', 'Opening': '#a3e635',
    'TransferIn': '#34d399', 'StockTake': '#6ee7b7',
    'Selling': '#f97316', 'AdjOut': '#fb923c', 'StockClear': '#ef4444',
    'TransferOut': '#e879f9', 'Wastage': '#fbbf24',
    'Full Clear': '#dc2626', 'Partial Clear': '#f59e0b',
    'Full Clear + Sale': '#16a34a', 'Partial Clear + Sale': '#0ea5e9',
    'Conversion': '#818cf8', 'Stock Return': '#34d399',
    'Transfer S1→S2': '#a78bfa', 'Transfer S2→S1': '#c084fc',
    'Period Start': '#6b7280', 'Period End': '#6b7280'
};

const POSITIVE_TYPES = new Set([
    'Buying', 'AdjIn', 'Opening', 'TransferIn', 'StockTake', 'Stock Return'
]);
const NEGATIVE_TYPES = new Set([
    'Selling', 'AdjOut', 'StockClear', 'TransferOut', 'Wastage',
    'Full Clear', 'Partial Clear', 'Full Clear + Sale', 'Partial Clear + Sale',
    'Transfer', 'Transfer + Clear', 'Partial + Lorry', 'Full + Lorry',
    'Transfer S1→S2', 'Transfer S2→S1'
]);

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltipEvents = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    const color = EVENT_TYPE_COLORS[d.event_type] || '#9ca3af';
    const isSnapshot = d.event_source === 'snapshot';
    const deltaSign = (d.delta ?? 0) >= 0 ? '+' : '';
    return (
        <div className="bg-[#18181b]/98 backdrop-blur-3xl p-4 rounded-xl border border-white/10 shadow-2xl z-50 min-w-[240px]">
            <p className="text-gray-400 font-bold mb-2 border-b border-white/10 pb-2 text-[11px] font-mono">{d.time}</p>
            <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span className="text-white font-semibold text-sm">{d.event_type}</span>
                {d.tx_code && <span className="text-gray-500 text-[10px] font-mono ml-auto">{d.tx_code}</span>}
            </div>
            {!isSnapshot && d.delta !== undefined && (
                <p className={`text-xs font-bold mb-3 px-2 py-1 rounded-lg ${(d.delta ?? 0) >= 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>
                    {(d.delta ?? 0) >= 0 ? '▲' : '▼'} Change: {deltaSign}{(d.delta ?? 0).toFixed(3)} kg
                </p>
            )}
            <div className="text-[11px] space-y-1">
                <div className="grid grid-cols-3 gap-1 text-gray-500 font-semibold pb-1 border-b border-white/5">
                    <span></span><span className="text-center">Before</span><span className="text-center">After</span>
                </div>
                <div className="grid grid-cols-3 gap-1 items-center">
                    <span className="text-teal-400 font-semibold">Store 1</span>
                    <span className="text-center text-gray-300">{d.prev_s1 !== undefined && d.prev_s1 !== null ? Number(d.prev_s1).toFixed(3) : '—'}</span>
                    <span className="text-center text-white font-bold">{d.s1?.toFixed(3)}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 items-center">
                    <span className="text-violet-400 font-semibold">Store 2</span>
                    <span className="text-center text-gray-300">{d.prev_s2 !== undefined && d.prev_s2 !== null ? Number(d.prev_s2).toFixed(3) : '—'}</span>
                    <span className="text-center text-white font-bold">{d.s2?.toFixed(3)}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 items-center border-t border-white/5 pt-1">
                    <span className="text-blue-400 font-semibold">Total</span>
                    <span className="text-center text-gray-300">{d.prev_total !== undefined && d.prev_total !== null ? Number(d.prev_total).toFixed(3) : '—'}</span>
                    <span className="text-center text-white font-bold">{d.total?.toFixed(3)}</span>
                </div>
            </div>
        </div>
    );
};

// ─── Summary Table ────────────────────────────────────────────────────────────
const SummaryTable = ({ summary }) => {
    if (!summary) return null;
    const { opening, closing, byType, validation } = summary;

    const totalS1 = byType.reduce((a, r) => a + r.s1, 0);
    const totalS2 = byType.reduce((a, r) => a + r.s2, 0);
    const totalNet = byType.reduce((a, r) => a + r.net, 0);

    const fmtKg = (v) => (v === undefined || v === null) ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(3)} kg`;
    const fmtVal = (v) => (v === undefined || v === null) ? '—' : `${Number(v).toFixed(3)} kg`;

    const rowColor = (row) => {
        if (row.net > 0) return 'text-emerald-400';
        if (row.net < 0) return 'text-red-400';
        return 'text-gray-400';
    };

    return (
        <div className="space-y-6">
            {/* Opening / Closing stock ribbon */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="glass-card p-4 rounded-2xl border border-white/5 bg-white/5">
                    <p className="text-[11px] uppercase font-bold text-gray-500 tracking-wider mb-1">Opening Stock</p>
                    <p className="text-xl font-bold text-white">{Number(opening.total).toFixed(3)} <span className="text-sm font-normal text-gray-400">kg</span></p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span className="text-teal-400">S1: {Number(opening.s1).toFixed(3)}</span>
                        <span className="text-violet-400">S2: {Number(opening.s2).toFixed(3)}</span>
                    </div>
                </div>
                <div className="glass-card p-4 rounded-2xl border border-white/5 bg-white/5">
                    <p className="text-[11px] uppercase font-bold text-gray-500 tracking-wider mb-1">Closing Stock</p>
                    <p className="text-xl font-bold text-white">{Number(closing.total).toFixed(3)} <span className="text-sm font-normal text-gray-400">kg</span></p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-500">
                        <span className="text-teal-400">S1: {Number(closing.s1).toFixed(3)}</span>
                        <span className="text-violet-400">S2: {Number(closing.s2).toFixed(3)}</span>
                    </div>
                </div>
                <div className={`glass-card p-4 rounded-2xl border bg-white/5 col-span-2 md:col-span-1 ${validation.valid ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
                    <p className="text-[11px] uppercase font-bold text-gray-500 tracking-wider mb-1">Validation</p>
                    {validation.valid ? (
                        <div className="flex items-center gap-2">
                            <CheckCircleOutlined className="text-emerald-400 text-xl" />
                            <span className="text-emerald-400 font-bold text-sm">Stock Balanced</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <WarningOutlined className="text-red-400 text-xl" />
                            <span className="text-red-400 font-bold text-sm">Discrepancy Found</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Movement table */}
            <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        Stock Movement by Type
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-gray-500 uppercase text-[10px] tracking-wider border-b border-white/5">
                                <th className="text-left px-5 py-3 font-semibold">Event Type</th>
                                <th className="text-right px-5 py-3 font-semibold">Store 1</th>
                                <th className="text-right px-5 py-3 font-semibold">Store 2</th>
                                <th className="text-right px-5 py-3 font-semibold">Net</th>
                            </tr>
                        </thead>
                        <tbody>
                            {byType.map((row, i) => {
                                const col = rowColor(row);
                                const dot = EVENT_TYPE_COLORS[row.type] || '#6b7280';
                                return (
                                    <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />
                                                <span className="text-gray-200 font-medium">{row.type}</span>
                                            </div>
                                        </td>
                                        <td className={`text-right px-5 py-3 font-mono font-bold ${row.s1 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {fmtKg(row.s1)}
                                        </td>
                                        <td className={`text-right px-5 py-3 font-mono font-bold ${row.s2 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {fmtKg(row.s2)}
                                        </td>
                                        <td className={`text-right px-5 py-3 font-mono font-bold ${col}`}>
                                            {fmtKg(row.net)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t border-white/10 bg-white/5">
                                <td className="px-5 py-3 text-white font-bold text-xs uppercase tracking-wider">Total Movement</td>
                                <td className={`text-right px-5 py-3 font-mono font-bold ${totalS1 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtKg(totalS1)}</td>
                                <td className={`text-right px-5 py-3 font-mono font-bold ${totalS2 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtKg(totalS2)}</td>
                                <td className={`text-right px-5 py-3 font-mono font-bold ${totalNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtKg(totalNet)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* Validation proof */}
            <div className={`glass-card rounded-2xl border p-5 space-y-3 ${validation.valid ? 'border-emerald-500/20' : 'border-red-500/30 bg-red-500/5'}`}>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {validation.valid
                        ? <CheckCircleOutlined className="text-emerald-400" />
                        : <WarningOutlined className="text-red-400" />}
                    Mathematical Validation
                </h3>

                <div className="font-mono text-[11px] space-y-1.5 text-gray-400">
                    <div className="flex justify-between gap-4">
                        <span>Opening stock (at start of period)</span>
                        <span className="text-white font-bold">S1={fmtVal(opening.s1)}  S2={fmtVal(opening.s2)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span>+ Net events in period (sum of all deltas)</span>
                        <span className={`font-bold ${summary.deltaSum.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            S1={fmtKg(summary.deltaSum.s1)}  S2={fmtKg(summary.deltaSum.s2)}
                        </span>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-white/10 pt-1.5">
                        <span>= Expected closing stock</span>
                        <span className="text-blue-400 font-bold">S1={fmtVal(validation.expected.s1)}  S2={fmtVal(validation.expected.s2)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                        <span>Actual closing stock (from DB)</span>
                        <span className="text-white font-bold">S1={fmtVal(validation.actual.s1)}  S2={fmtVal(validation.actual.s2)}</span>
                    </div>
                    <div className={`flex justify-between gap-4 border-t border-white/10 pt-1.5 ${validation.valid ? 'text-emerald-400' : 'text-red-400'}`}>
                        <span className="font-bold">{validation.valid ? '✓ Balanced — no discrepancy' : '✗ Discrepancy'}</span>
                        {!validation.valid && (
                            <span className="font-bold">
                                S1 Δ={fmtKg(validation.discrepancy.s1)}  S2 Δ={fmtKg(validation.discrepancy.s2)}
                            </span>
                        )}
                    </div>
                </div>

                {!validation.valid && validation.issues?.length > 0 && (
                    <div className="mt-3 space-y-2">
                        <p className="text-xs font-bold text-red-400 uppercase tracking-wide">Possible issues:</p>
                        {validation.issues.map((issue, i) => (
                            <div key={i} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs">
                                {issue.time && <span className="text-gray-400 font-mono block mb-1">{issue.time}</span>}
                                {issue.type && <span className="text-red-300 font-semibold">[{issue.type}]</span>}
                                {issue.tx_code && <span className="text-gray-500 ml-1">{issue.tx_code}</span>}
                                <p className="text-red-300 mt-1">{issue.reason}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StockEvents() {
    const [items, setItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [datetimeRange, setDatetimeRange] = useState(null);

    const [eventData, setEventData] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hiddenSeries, setHiddenSeries] = useState([]);
    const [analyzed, setAnalyzed] = useState(false);

    // Fetch items list on mount
    useEffect(() => {
        const fetchItems = async () => {
            setLoadingItems(true);
            try {
                const res = await axios.get('/api/reports-dashboard/items');
                if (res.data.success) setItems(res.data.result || []);
            } catch (e) {
                message.error('Failed to load items');
            } finally {
                setLoadingItems(false);
            }
        };
        fetchItems();
    }, []);

    const handleLegendClick = (e) => {
        const { dataKey } = e;
        setHiddenSeries(prev =>
            prev.includes(dataKey) ? prev.filter(k => k !== dataKey) : [...prev, dataKey]
        );
    };

    const handleAnalyze = async () => {
        if (!selectedItem || !datetimeRange || !datetimeRange[0] || !datetimeRange[1]) {
            message.warning('Please select an item and a datetime range');
            return;
        }
        const startDatetime = datetimeRange[0].format('YYYY-MM-DD HH:mm:ss');
        const endDatetime = datetimeRange[1].format('YYYY-MM-DD HH:mm:ss');

        setLoading(true);
        setAnalyzed(false);
        try {
            const res = await axios.post('/api/graphs/stock-events', {
                itemId: selectedItem,
                startDatetime,
                endDatetime
            });
            if (res.data.success) {
                setEventData(res.data.result || []);
                setSummary(res.data.summary || null);
                setAnalyzed(true);
                if (!res.data.result?.length) message.info('No events found in selected range');
            } else {
                message.error(res.data.message || 'Failed to fetch events');
            }
        } catch (e) {
            message.error('Error fetching events: ' + (e.response?.data?.message || e.message));
        } finally {
            setLoading(false);
        }
    };

    const eventCount = eventData.filter(d => d.event_source !== 'snapshot').length;
    const selectedItemName = items.find(i => i.ITEM_ID === selectedItem);

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Page header */}
            <div className="flex items-start gap-4">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 flex items-center justify-center ring-1 ring-white/10 flex-shrink-0">
                    <AreaChartOutlined className="text-violet-400 text-xl" />
                </div>
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-white">Stock Events</h1>
                    <p className="text-gray-500 text-sm mt-0.5">Event-by-event inventory tracking with full mathematical validation</p>
                </div>
            </div>

            {/* Controls */}
            <div className="glass-card p-5 rounded-2xl border border-white/5 bg-white/5 space-y-4">
                {/* Item selector */}
                <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] flex items-center justify-center font-bold">1</span>
                        Select Item
                    </p>
                    <Select
                        showSearch
                        className="w-full"
                        size="large"
                        placeholder="🔍 Search and select an item…"
                        value={selectedItem}
                        onChange={setSelectedItem}
                        loading={loadingItems}
                        optionFilterProp="children"
                        filterOption={(input, option) => {
                            const label = typeof option?.label === 'string'
                                ? option.label
                                : String(option?.children ?? '');
                            return label.toLowerCase().includes(input.toLowerCase());
                        }}
                    >
                        {items.map(item => (
                            <Option key={item.ITEM_ID} value={item.ITEM_ID}>{item.CODE} - {item.NAME}</Option>
                        ))}
                    </Select>
                </div>

                {/* Datetime range */}
                {selectedItem && (
                    <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">2</span>
                            Date & Time Range <span className="text-gray-600 lowercase normal-case font-normal">(select exact times for precise boundaries)</span>
                        </p>
                        <RangePicker
                            showTime={{ format: 'HH:mm' }}
                            format="YYYY-MM-DD HH:mm"
                            size="large"
                            className="w-full"
                            value={datetimeRange}
                            onChange={setDatetimeRange}
                            allowClear
                            placeholder={['Start date & time', 'End date & time']}
                            suffixIcon={<CalendarOutlined className="text-gray-500" />}
                        />
                    </div>
                )}

                {/* Analyze button */}
                {selectedItem && datetimeRange && (
                    <Button
                        type="primary"
                        size="large"
                        icon={<SearchOutlined />}
                        onClick={handleAnalyze}
                        loading={loading}
                        className="w-full md:w-auto bg-gradient-to-r from-violet-600 to-blue-600 border-none font-semibold"
                    >
                        {loading ? 'Analyzing…' : 'Analyze Events'}
                    </Button>
                )}
            </div>

            {/* Results */}
            {loading && (
                <div className="flex justify-center items-center h-48">
                    <Spin size="large" />
                </div>
            )}

            {!loading && analyzed && (
                <div className="space-y-6">
                    {/* ── Chart ── */}
                    <div className="glass-card p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-lg border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-blue-400 to-teal-500 opacity-60 group-hover:opacity-100 transition-opacity" />

                        <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 sm:gap-0 mb-6">
                            <div>
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <AreaChartOutlined className="text-violet-400" />
                                    Inventory Volume — Event by Event
                                </h2>
                                {selectedItemName && (
                                    <p className="text-xs text-gray-500 mt-0.5">{selectedItemName.CODE} — {selectedItemName.NAME}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <Tag color="default" className="border-white/10 text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                                    {eventCount} event{eventCount !== 1 ? 's' : ''}
                                </Tag>
                            </div>
                        </div>

                        {eventData.length <= 1 ? (
                            <div className="flex justify-center items-center h-48">
                                <Empty description={<span className="text-gray-400">No events found for this range</span>} />
                            </div>
                        ) : (
                            <div className="h-[340px] md:h-[520px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={eventData.map((d, i) => ({ ...d, _idx: i }))}
                                        margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                                        <XAxis
                                            dataKey="_idx"
                                            type="number"
                                            domain={[0, eventData.length - 1]}
                                            stroke="#6b7280"
                                            fontSize={9}
                                            tickLine={false}
                                            axisLine={false}
                                            tickMargin={10}
                                            fontWeight={600}
                                            tickCount={Math.min(12, eventData.length)}
                                            tickFormatter={(idx) => eventData[idx]?.label || ''}
                                        />
                                        <YAxis
                                            stroke="#6b7280"
                                            fontSize={10}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v) => `${v} kg`}
                                            fontWeight={600}
                                            width={65}
                                        />
                                        <Tooltip content={<CustomTooltipEvents />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 16 }} />
                                        <Legend
                                            onClick={handleLegendClick}
                                            iconType="circle"
                                            wrapperStyle={{ paddingTop: '20px', fontSize: '11px', cursor: 'pointer' }}
                                            formatter={(value, entry) => (
                                                <span className={`font-semibold tracking-wide ml-1 transition-opacity ${hiddenSeries.includes(entry.dataKey) ? 'opacity-30' : 'opacity-100'}`} style={{ color: entry.color }}>
                                                    {value} {hiddenSeries.includes(entry.dataKey) ? '(Hidden)' : ''}
                                                </span>
                                            )}
                                        />
                                        <Line
                                            hide={hiddenSeries.includes('s1')}
                                            type="stepAfter"
                                            dataKey="s1"
                                            name="Store 1 Stock"
                                            stroke="#14b8a6"
                                            strokeWidth={2}
                                            dot={(props) => {
                                                const d = props.payload;
                                                if (!d || d.event_source === 'snapshot' || (d.delta_s1 === 0 && d.storeNo !== 1)) return null;
                                                return <circle key={props.key} cx={props.cx} cy={props.cy} r={3.5} fill="#14b8a6" stroke="#0d1f1f" strokeWidth={1.5} />;
                                            }}
                                            activeDot={{ r: 6, stroke: '#14b8a6', strokeWidth: 2, fill: '#fff' }}
                                            connectNulls
                                            legendType="circle"
                                        />
                                        <Line
                                            hide={hiddenSeries.includes('s2')}
                                            type="stepAfter"
                                            dataKey="s2"
                                            name="Store 2 Stock"
                                            stroke="#8b5cf6"
                                            strokeWidth={2}
                                            dot={(props) => {
                                                const d = props.payload;
                                                if (!d || d.event_source === 'snapshot' || (d.delta_s2 === 0 && d.storeNo !== 2)) return null;
                                                return <circle key={props.key} cx={props.cx} cy={props.cy} r={3.5} fill="#8b5cf6" stroke="#1a0a2e" strokeWidth={1.5} />;
                                            }}
                                            activeDot={{ r: 6, stroke: '#8b5cf6', strokeWidth: 2, fill: '#fff' }}
                                            connectNulls
                                            legendType="circle"
                                        />
                                        <Line
                                            hide={hiddenSeries.includes('total')}
                                            type="stepAfter"
                                            dataKey="total"
                                            name="Total Stock"
                                            stroke="#3b82f6"
                                            strokeWidth={3}
                                            dot={(props) => {
                                                const d = props.payload;
                                                if (!d || d.event_source === 'snapshot') return <circle key={props.key} cx={props.cx} cy={props.cy} r={4} fill="#3b82f6" stroke="#0a1628" strokeWidth={1} opacity={0.4} />;
                                                return <circle key={props.key} cx={props.cx} cy={props.cy} r={4.5} fill="#3b82f6" stroke="#0a1628" strokeWidth={1.5} />;
                                            }}
                                            activeDot={{ r: 7, stroke: '#3b82f6', strokeWidth: 3, fill: '#fff' }}
                                            connectNulls
                                            legendType="circle"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    {/* ── Summary & Validation ── */}
                    {summary && <SummaryTable summary={summary} />}
                </div>
            )}
        </div>
    );
}
