import React, { useState, useEffect, useMemo } from 'react';
import { Select, DatePicker, Button, Spin, App, Empty, Dropdown } from 'antd';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, AreaChart, Area, Legend, ComposedChart, BarChart, Bar, Tooltip } from 'recharts';
import { SearchOutlined, LineChartOutlined, StockOutlined, BarChartOutlined, DownloadOutlined, FilePdfOutlined, FileImageOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import html2canvas from 'html2canvas';

const { RangePicker } = DatePicker;
const { Option } = Select;

export default function Graphs() {
    const { message } = App.useApp();
    const [items, setItems] = useState([]);
    const [loadingParams, setLoadingParams] = useState(false);

    const [selectedItem, setSelectedItem] = useState(null);
    const [period, setPeriod] = useState('Daily');
    const [dates, setDates] = useState([dayjs().subtract(30, 'days'), dayjs()]);

    const getLimitDays = (p) => {
        if (p === 'Daily') return 100;
        if (p === 'Weekly') return 700;
        if (p === 'Monthly') return 3043;
        if (p === 'Yearly') return 36500;
        return 100;
    };

    const [loadingData, setLoadingData] = useState(false);
    const [graphData, setGraphData] = useState([]);

    const [eventData, setEventData] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(false);

    useEffect(() => {
        const fetchItems = async () => {
            setLoadingParams(true);
            try {
                const res = await axios.get('/api/reports-dashboard/items');
                if (res.data.success) {
                    setItems(res.data.result || []);
                    if (res.data.result?.length > 0) {
                        setSelectedItem(res.data.result[0].ITEM_ID);
                    }
                }
            } catch (err) {
                message.error('Failed to load items');
            } finally {
                setLoadingParams(false);
            }
        };
        fetchItems();
    }, []);

    const fetchData = async () => {
        if (!selectedItem || !dates || !dates[0] || !dates[1]) return;

        const limitDays = getLimitDays(period);
        const diffDays = dates[1].diff(dates[0], 'days');

        if (diffDays > limitDays) {
            message.warning(`Date range for ${period} cannot exceed ${limitDays} days mapping to 100 max points.`);
            return;
        }

        setLoadingData(true);
        try {
            const res = await axios.post('/api/graphs/item-data', {
                itemId: selectedItem,
                period,
                startDate: dates[0].format('YYYY-MM-DD'),
                endDate: dates[1].format('YYYY-MM-DD')
            });

            if (res.data.success) {
                setGraphData(res.data.result);
            } else {
                message.error(res.data.message || 'Failed to load data');
            }
        } catch (err) {
            message.error(err.response?.data?.message || 'Error loading graph data');
        } finally {
            setLoadingData(false);
        }
    };

    const fetchEventData = async () => {
        if (!selectedItem || !dates || !dates[0] || !dates[1]) return;
        setLoadingEvents(true);
        try {
            const res = await axios.post('/api/graphs/stock-events', {
                itemId: selectedItem,
                startDate: dates[0].format('YYYY-MM-DD'),
                endDate: dates[1].format('YYYY-MM-DD')
            });
            if (res.data.success) {
                setEventData(res.data.result || []);
            } else {
                message.error(res.data.message || 'Failed to load event data');
            }
        } catch (err) {
            message.error(err.response?.data?.message || 'Error loading event data');
        } finally {
            setLoadingEvents(false);
        }
    };

    useEffect(() => {
        if (selectedItem) {
            fetchData();
            fetchEventData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedItem, period]);

    const handleDateChange = (val) => {
        setDates(val);
    };

    const formatLKR = (val) => {
        if (val === null || val === undefined) return '-';
        return 'Rs ' + val.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Calculate evenly spaced ticks for export charts to perfectly align gridline and labels
    const exportTicks = useMemo(() => {
        if (!graphData || graphData.length === 0) return [];
        const maxTicks = 15;
        if (graphData.length <= maxTicks) return graphData.map(d => d.label);
        const step = Math.ceil(graphData.length / maxTicks);
        return graphData.filter((_, i) => i % step === 0).map(d => d.label);
    }, [graphData]);

    const exportReport = async (format) => {
        let itemName = 'Unknown_Item';
        let itemCode = 'Unknown_Code';
        if (selectedItem) {
            const found = items.find(i => i.ITEM_ID === selectedItem);
            if (found) {
                itemName = found.NAME.replace(/[^a-z0-9]/gi, '_');
                itemCode = found.CODE;
            }
        }
        const dateStr = dayjs().format('YYYY-MM-DD_HH-mm');
        const fileName = `Analytics_Report_${itemName}_${dateStr} `;

        try {
            message.loading({ content: 'Generating report...', key: 'export' });

            // Allow DOM to settle before capturing
            await new Promise(resolve => setTimeout(resolve, 500));

            if (format === 'png') {
                const element = document.getElementById('full-report-export');
                // Temporarily make it visible for html2canvas but keep it completely off-screen
                const originalDisplay = element.style.display;
                const originalPosition = element.style.position;
                const originalLeft = element.style.left;
                const originalTop = element.style.top;

                element.style.display = 'block';
                element.style.position = 'fixed';
                element.style.left = '-20000px';
                element.style.top = '-20000px';

                const canvas = await html2canvas(element, {
                    backgroundColor: '#18181b',
                    scale: 2,
                    logging: false,
                    useCORS: true,
                    width: 1600, // Use the width of the export container
                    windowWidth: 1600
                });

                // Restore original styles
                element.style.display = originalDisplay;
                element.style.position = originalPosition;
                element.style.left = originalLeft;
                element.style.top = originalTop;

                const imgData = canvas.toDataURL('image/png');
                const link = document.createElement('a');
                link.download = `${fileName}.png`;
                link.href = imgData;
                link.click();
            }

            message.success({ content: 'Report generated successfully!', key: 'export', duration: 2 });
        } catch (error) {
            console.error('Export error:', error);
            message.error({ content: 'Report generation failed.', key: 'export', duration: 2 });
        }
    };
    const formatStock = (val) => {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('en-LK', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg';
    };

    const CustomTooltipPrice = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-[#18181b]/95 backdrop-blur-3xl p-4 rounded-xl border border-white/10 shadow-2xl z-50 ring-1 ring-white/5">
                    <p className="text-gray-300 font-bold mb-3 border-b border-white/10 pb-2">{label}</p>
                    <div className="space-y-2">
                        {payload.map((entry, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                                <span className="text-gray-400 text-sm">{entry.name}:</span>
                                <span className="font-bold text-white tracking-wide">{entry.name.includes('Stock') ? formatStock(entry.value) : formatLKR(entry.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return null;
    };

    const [hiddenSeries, setHiddenSeries] = useState([]);

    const handleLegendClick = (e) => {
        const { dataKey } = e;
        setHiddenSeries(prev =>
            prev.includes(dataKey)
                ? prev.filter(k => k !== dataKey)
                : [...prev, dataKey]
        );
    };

    const EVENT_TYPE_COLORS = {
        'Buying': '#10b981', 'AdjIn': '#22d3ee', 'Opening': '#a3e635',
        'TransferIn': '#34d399', 'StockTake': '#6ee7b7',
        'Selling': '#f97316', 'AdjOut': '#fb923c', 'StockClear': '#ef4444',
        'TransferOut': '#e879f9', 'Wastage': '#fbbf24',
        'Full Clear': '#dc2626', 'Partial Clear': '#f59e0b',
        'Full Clear + Sale': '#16a34a', 'Partial Clear + Sale': '#0ea5e9',
        'Conversion': '#818cf8', 'Stock Return': '#34d399',
        'Transfer S1→S2': '#a78bfa', 'Transfer S2→S1': '#c084fc',
        'Opening Snapshot': '#6b7280'
    };

    const CustomTooltipEvents = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const d = payload[0]?.payload;
            if (!d) return null;
            const color = EVENT_TYPE_COLORS[d.event_type] || '#9ca3af';
            const isSnapshot = d.event_source === 'snapshot';
            const deltaSign = (d.delta ?? 0) >= 0 ? '+' : '';
            return (
                <div className="bg-[#18181b]/98 backdrop-blur-3xl p-4 rounded-xl border border-white/10 shadow-2xl z-50 min-w-[240px]">
                    {/* Timestamp */}
                    <p className="text-gray-400 font-bold mb-2 border-b border-white/10 pb-2 text-[11px] font-mono">{d.time}</p>

                    {/* Event type badge */}
                    <div className="flex items-center gap-2 mb-3">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-white font-semibold text-sm">{d.event_type}</span>
                        {d.tx_code && <span className="text-gray-500 text-[10px] font-mono ml-auto">{d.tx_code}</span>}
                    </div>

                    {/* Change delta — skip for snapshots */}
                    {!isSnapshot && d.delta !== undefined && (
                        <p className={`text-xs font-bold mb-3 px-2 py-1 rounded-lg ${(d.delta ?? 0) >= 0 ? 'text-emerald-400 bg-emerald-400/10' : 'text-red-400 bg-red-400/10'}`}>
                            {(d.delta ?? 0) >= 0 ? '▲' : '▼'} Change: {deltaSign}{(d.delta ?? 0).toFixed(3)} kg
                        </p>
                    )}

                    {/* Before → After table */}
                    <div className="text-[11px] space-y-1">
                        <div className="grid grid-cols-3 gap-1 text-gray-500 font-semibold pb-1 border-b border-white/5">
                            <span></span><span className="text-center">Before</span><span className="text-center">After</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 items-center">
                            <span className="text-teal-400 font-semibold">Store 1</span>
                            <span className="text-center text-gray-300">{d.prev_s1 !== undefined ? Number(d.prev_s1).toFixed(3) : '—'}</span>
                            <span className="text-center text-white font-bold">{d.s1?.toFixed(3)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 items-center">
                            <span className="text-violet-400 font-semibold">Store 2</span>
                            <span className="text-center text-gray-300">{d.prev_s2 !== undefined ? Number(d.prev_s2).toFixed(3) : '—'}</span>
                            <span className="text-center text-white font-bold">{d.s2?.toFixed(3)}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 items-center border-t border-white/5 pt-1">
                            <span className="text-blue-400 font-semibold">Total</span>
                            <span className="text-center text-gray-300">{d.prev_total !== undefined ? Number(d.prev_total).toFixed(3) : '—'}</span>
                            <span className="text-center text-white font-bold">{d.total?.toFixed(3)}</span>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    const CustomTooltipStock = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-[#18181b]/95 backdrop-blur-3xl p-4 rounded-xl border border-white/10 shadow-2xl z-50 ring-1 ring-white/5">
                    <p className="text-gray-300 font-bold mb-3 border-b border-white/10 pb-2">{label}</p>
                    <div className="space-y-2">
                        {payload.map((entry, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color || entry.stroke || '#ccc' }} />
                                <span className="text-gray-400 text-sm">{entry.name}:</span>
                                <span className="font-bold text-white tracking-wide">{formatStock(entry.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="animate-fade-in pb-24 md:pb-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div className="hidden md:block">
                    <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                        <LineChartOutlined className="text-emerald-400" /> Graphs & Analytics
                    </h1>
                    <p className="text-xs text-gray-400 mt-1">Visualize item price trends and stock lifecycle history</p>
                </div>
                {graphData.length > 0 && (
                    <Button
                        type="primary"
                        icon={<DownloadOutlined />}
                        onClick={() => exportReport('png')}
                        className="bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-white shadow-lg w-full md:w-auto"
                    >
                        Download as Image (PNG)
                    </Button>
                )}
            </div>

            <div className="space-y-4 mb-6">
                {/* Step 1: Item Selection */}
                <div className="glass-card p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10">
                    <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs flex items-center justify-center font-bold">1</span>
                        Select Item
                    </div>
                    <Select
                        showSearch
                        className="w-full"
                        size="large"
                        placeholder="🔍 Search and select an item..."
                        value={selectedItem}
                        onChange={setSelectedItem}
                        loading={loadingParams}
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

                {/* Step 2: Date & Period Selection */}
                {selectedItem && (
                    <div className="glass-card p-4 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 transition-all duration-300">
                        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs flex items-center justify-center font-bold">2</span>
                            Period & Date Range
                        </div>
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1">
                                <Select className="w-full" size="large" value={period} onChange={setPeriod}>
                                    <Option value="Daily">Daily Analysis</Option>
                                    <Option value="Weekly">Weekly Average</Option>
                                    <Option value="Monthly">Monthly Trends</Option>
                                    <Option value="Yearly">Yearly Summary</Option>
                                </Select>
                            </div>
                            <div className="flex-2">
                                <RangePicker
                                    className="w-full bg-white/5 border-white/10 hover:border-emerald-500/50 focus:border-emerald-500 transition-colors"
                                    size="large"
                                    value={dates}
                                    onChange={handleDateChange}
                                    allowClear={false}
                                />
                            </div>
                            <Button
                                type="primary"
                                size="large"
                                icon={<BarChartOutlined />}
                                onClick={() => { fetchData(); fetchEventData(); }}
                                loading={loadingData || loadingEvents}
                                disabled={!selectedItem || !dates[0] || !dates[1]}
                                className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 border-none h-10 px-6 rounded-xl shadow-lg shadow-emerald-500/20 font-semibold"
                            >
                                Analyze Data
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {loadingData ? (
                <div className="flex flex-col justify-center items-center py-32 rounded-3xl glass-card border border-white/5 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-teal-500/5 animate-pulse" />
                    <Spin size="large" className="scale-150" />
                    <p className="mt-6 text-emerald-500 font-semibold tracking-widest uppercase text-sm animate-pulse">Computing Analytics...</p>
                </div>
            ) : graphData.length === 0 ? (
                <div className="flex flex-col justify-center items-center py-32 rounded-3xl glass-card border border-white/5 opacity-80">
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<span className="text-gray-400 font-medium">No sufficient data points found for this selection</span>}
                    />
                </div>
            ) : (
                <div className="flex flex-col gap-6 md:gap-8">
                    {/* Financial Overview (Sales vs Buying) */}
                    <div id="financial-overview-chart" className="glass-card p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-lg border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-orange-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                        <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 sm:gap-0 mb-6 md:mb-8 md:pr-4">
                            <h2 className="text-lg md:text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2 md:gap-3">
                                <span className="w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                    <BarChartOutlined className="text-emerald-500 text-sm md:text-base" />
                                </span>
                                Sales vs Buying Overview
                            </h2>
                            <div className="flex items-center gap-2 md:gap-3">
                                <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-500 bg-white/5 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-white/5">Financials</span>
                            </div>
                        </div>
                        <div className="h-[280px] md:h-[350px] w-full -ml-4 md:ml-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={graphData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={true} />
                                    <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickMargin={10} fontWeight={600} />
                                    <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `Rs ${value / 1000}k`} fontWeight={600} width={65} />
                                    <Tooltip content={<CustomTooltipPrice />} cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 20 }} />
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
                                    <Line hide={hiddenSeries.includes('sellAmount')} type="monotone" name="Sales Amount" dataKey="sellAmount" stroke="#10b981" strokeWidth={3} dot={{ r: 3, fill: '#18181b', strokeWidth: 2 }} activeDot={{ r: 5, stroke: '#10b981', strokeWidth: 3, fill: '#fff' }} connectNulls />
                                    <Line hide={hiddenSeries.includes('buyAmount')} type="monotone" name="Buying Amount" dataKey="buyAmount" stroke="#f97316" strokeWidth={3} dot={{ r: 3, fill: '#18181b', strokeWidth: 2 }} activeDot={{ r: 5, stroke: '#f97316', strokeWidth: 3, fill: '#fff' }} connectNulls />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Profit Analysis (Sold Amt) */}
                    <div id="profit-analysis-chart" className="glass-card p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-lg border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                        <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 sm:gap-0 mb-6 md:mb-8 md:pr-4">
                            <h2 className="text-lg md:text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2 md:gap-3">
                                <span className="w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                                    <StockOutlined className="text-purple-400 text-sm md:text-base" />
                                </span>
                                Profit Analysis (Sold Amt)
                            </h2>
                            <div className="flex items-center gap-2 md:gap-3">
                                <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-500 bg-white/5 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-white/5">Profitability</span>
                            </div>
                        </div>
                        <div className="h-[280px] md:h-[350px] w-full -ml-4 md:ml-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={graphData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                    <defs>
                                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={true} />
                                    <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickMargin={10} fontWeight={600} />
                                    <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `Rs ${value / 1000}k`} fontWeight={600} width={65} />
                                    <Tooltip content={<CustomTooltipPrice />} />
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
                                    <Area hide={hiddenSeries.includes('profitSoldAmt')} type="monotone" name="Profit (Sold Amt)" dataKey="profitSoldAmt" stroke="#8b5cf6" fill="url(#colorProfit)" strokeWidth={3} activeDot={{ r: 6, stroke: '#8b5cf6', strokeWidth: 3, fill: '#fff' }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Item Price Changes */}
                    <div id="price-action-chart" className="glass-card p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-lg md:shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 to-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity" />

                        <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 sm:gap-0 mb-6 md:mb-8 md:pr-4">
                            <h2 className="text-lg md:text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2 md:gap-3">
                                <span className="w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                                    <LineChartOutlined className="text-orange-500 text-sm md:text-base" />
                                </span>
                                Price Action Trends
                            </h2>
                            <div className="flex items-center gap-2 md:gap-3">
                                <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-500 bg-white/5 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-white/5">{period} Avg</span>
                            </div>
                        </div>

                        <div className="h-[280px] md:h-[450px] w-full -ml-4 md:ml-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={graphData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={true} />
                                    <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickMargin={10} fontWeight={600} />
                                    <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `Rs ${value} `} domain={['auto', 'auto']} fontWeight={600} width={65} />
                                    <Tooltip content={<CustomTooltipPrice />} cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 20 }} />
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
                                        hide={hiddenSeries.includes('avgBuyPrice')}
                                        type="monotone"
                                        name="Avg Buying Price"
                                        dataKey="avgBuyPrice"
                                        stroke="#f97316"
                                        strokeWidth={3}
                                        dot={{ r: 3, fill: '#18181b', strokeWidth: 2 }}
                                        activeDot={{ r: 5, stroke: '#f97316', strokeWidth: 3, fill: '#fff' }}
                                        connectNulls={true}
                                        animationDuration={1500}
                                    />
                                    <Line
                                        hide={hiddenSeries.includes('avgSellPrice')}
                                        type="monotone"
                                        name="Avg Selling Price"
                                        dataKey="avgSellPrice"
                                        stroke="#10b981"
                                        strokeWidth={3}
                                        dot={{ r: 3, fill: '#18181b', strokeWidth: 2 }}
                                        activeDot={{ r: 5, stroke: '#10b981', strokeWidth: 3, fill: '#fff' }}
                                        connectNulls={true}
                                        animationDuration={1500}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Inventory Volume Evolution */}
                    <div id="inventory-volume-chart" className="glass-card p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-lg border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 via-violet-500 to-blue-500 opacity-50 group-hover:opacity-100 transition-opacity" />

                        <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 sm:gap-0 mb-6 md:mb-8 md:pr-4">
                            <h2 className="text-lg md:text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2 md:gap-3">
                                <span className="w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
                                    <StockOutlined className="text-teal-400 text-sm md:text-base" />
                                </span>
                                Inventory Volume Evolution
                            </h2>
                            <div className="flex items-center gap-2 md:gap-3">
                                <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-500 bg-white/5 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-white/5">{period}</span>
                            </div>
                        </div>

                        <div className="h-[300px] md:h-[500px] w-full -ml-4 md:ml-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={graphData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                    <defs>
                                        <linearGradient id="colorS1" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorS2" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={true} />
                                    <XAxis dataKey="label" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickMargin={10} fontWeight={600} />
                                    <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `${value} kg`} fontWeight={600} width={55} />
                                    <Tooltip content={<CustomTooltipStock />} />
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

                                    <Area
                                        hide={hiddenSeries.includes('stockS1')}
                                        type="monotone"
                                        dataKey="stockS1"
                                        name="Store 1 Stock"
                                        stroke="#14b8a6"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorS1)"
                                        animationDuration={1500}
                                    />
                                    <Area
                                        hide={hiddenSeries.includes('stockS2')}
                                        type="monotone"
                                        dataKey="stockS2"
                                        name="Store 2 Stock"
                                        stroke="#8b5cf6"
                                        strokeWidth={2}
                                        fillOpacity={1}
                                        fill="url(#colorS2)"
                                        animationDuration={1500}
                                    />
                                    <Area
                                        hide={hiddenSeries.includes('stock')}
                                        type="monotone"
                                        dataKey="stock"
                                        name="Total Stock"
                                        stroke="#3b82f6"
                                        strokeWidth={4}
                                        fillOpacity={1}
                                        fill="url(#colorTotal)"
                                        animationDuration={1500}
                                        activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 3, fill: '#fff' }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Event-by-Event Inventory Volume Evolution */}
                    <div id="inventory-events-chart" className="glass-card p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-lg border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-teal-400 to-violet-500 opacity-50 group-hover:opacity-100 transition-opacity" />

                        <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 sm:gap-0 mb-6 md:mb-8 md:pr-4">
                            <h2 className="text-lg md:text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2 md:gap-3">
                                <span className="w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                    <StockOutlined className="text-blue-400 text-sm md:text-base" />
                                </span>
                                Inventory Volume Evolution — Event by Event
                            </h2>
                            <div className="flex items-center gap-2 md:gap-3">
                                <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-500 bg-white/5 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-white/5">
                                    {eventData.length > 1 ? `${eventData.length - 1} events` : 'No events'}
                                </span>
                            </div>
                        </div>

                        {loadingEvents ? (
                            <div className="flex justify-center items-center h-48">
                                <Spin size="large" />
                            </div>
                        ) : eventData.length <= 1 ? (
                            <div className="flex justify-center items-center h-48">
                                <Empty description={<span className="text-gray-400">No events found in this period</span>} />
                            </div>
                        ) : (
                            <div className="h-[340px] md:h-[520px] w-full -ml-4 md:ml-0">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                        data={eventData.map((d, i) => ({ ...d, _idx: i }))}
                                        margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                                    >
                                        <defs>
                                            <linearGradient id="evS1Grad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
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
                                            width={60}
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
                </div>
            )}

            {/* Hidden Export Container - Simplified to just hold charts for snapshots */}
            <div
                id="full-report-export"
                style={{
                    position: 'absolute',
                    left: '-9999px',
                    top: 0,
                    width: '1600px', // Wider container for Landscape A4 optimal scaling
                    backgroundColor: '#18181b',
                    padding: '20px',
                    display: 'none',
                    zIndex: -1
                }}
            >
                {graphData.length > 0 && (
                    <>
                        {/* Header for PNG export. PDF export temporarily hides this via class name. */}
                        <div className="hide-for-pdf-capture" style={{ paddingBottom: '30px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '40px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h1 style={{ color: 'white', fontSize: '32px', fontWeight: 'bold', margin: '0 0 10px 0' }}>Analytics Report</h1>
                                    {selectedItem && (() => {
                                        const stItem = items.find(i => i.ITEM_ID === selectedItem);
                                        return stItem ? (
                                            <h2 style={{ color: '#34d399', fontSize: '24px', margin: 0 }}>
                                                {stItem.CODE} - {stItem.NAME}
                                            </h2>
                                        ) : null;
                                    })()}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ color: '#9ca3af', margin: '0 0 5px 0', fontSize: '16px' }}>Generated: {dayjs().format('MMMM D, YYYY')} at {dayjs().format('h:mm A')}</p>
                                    <p style={{ color: '#9ca3af', margin: 0, fontSize: '16px' }}>
                                        Range: {dates?.[0]?.format('MMM D, YYYY')} - {dates?.[1]?.format('MMM D, YYYY')}
                                    </p>
                                    <p style={{ color: '#9ca3af', margin: '5px 0 0 0', fontSize: '16px' }}>Period: {period.charAt(0).toUpperCase() + period.slice(1)}</p>
                                </div>
                            </div>
                        </div>

                        <div id="export-revenue-chart" style={{ width: '100%', marginBottom: '40px', backgroundColor: 'transparent' }}>
                            <div className="hide-for-pdf-capture" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                <h2 style={{ color: 'white', fontSize: '24px', margin: 0 }}>Sales vs Buying Overview</h2>
                            </div>
                            <div style={{ height: '350px', width: '100%' }}>
                                <LineChart width={1520} height={350} data={graphData} margin={{ top: 10, right: 30, left: 10, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={true} />
                                    <XAxis dataKey="label" stroke="#9ca3af" fontSize={14} tickLine={false} axisLine={false} tickMargin={15} ticks={exportTicks} tickFormatter={(val) => dayjs(val).format('MMM DD')} />
                                    <YAxis stroke="#9ca3af" fontSize={14} tickLine={false} axisLine={false} tickFormatter={(value) => `Rs ${value}`} width={100} />
                                    <Legend verticalAlign="bottom" height={40} iconSize={12} wrapperStyle={{ paddingTop: '20px', fontSize: '16px', fontWeight: 600 }} />
                                    <Line type="monotone" name="Sales Amount" dataKey="sellAmount" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#18181b', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
                                    <Line type="monotone" name="Buying Amount" dataKey="buyAmount" stroke="#f97316" strokeWidth={3} dot={{ r: 4, fill: '#18181b', strokeWidth: 2 }} connectNulls isAnimationActive={false} />
                                </LineChart>
                            </div>
                        </div>

                        <div id="export-profit-chart" style={{ width: '100%', marginBottom: '40px', backgroundColor: 'transparent' }}>
                            <div className="hide-for-pdf-capture" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                <h2 style={{ color: 'white', fontSize: '24px', margin: 0 }}>Profit Analysis (Sold Amt)</h2>
                            </div>
                            <div style={{ height: '350px', width: '100%' }}>
                                <AreaChart width={1520} height={350} data={graphData} margin={{ top: 10, right: 30, left: 10, bottom: 40 }}>
                                    <defs>
                                        <linearGradient id="colorProfitExp" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={true} />
                                    <XAxis dataKey="label" stroke="#9ca3af" fontSize={14} tickLine={false} axisLine={false} tickMargin={15} ticks={exportTicks} tickFormatter={(val) => dayjs(val).format('MMM DD')} />
                                    <YAxis stroke="#9ca3af" fontSize={14} tickLine={false} axisLine={false} tickFormatter={(value) => `Rs ${value}`} width={100} />
                                    <Legend verticalAlign="bottom" height={40} iconSize={12} wrapperStyle={{ paddingTop: '20px', fontSize: '16px', fontWeight: 600 }} />
                                    <Area type="monotone" name="Profit (Sold Amt)" dataKey="profitSoldAmt" stroke="#8b5cf6" strokeWidth={3} fill="url(#colorProfitExp)" isAnimationActive={false} />
                                </AreaChart>
                            </div>
                        </div>

                        <div id="export-price-chart" style={{ width: '100%', marginBottom: '40px', backgroundColor: 'transparent' }}>
                            <div className="hide-for-pdf-capture" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                <h2 style={{ color: 'white', fontSize: '24px', margin: 0 }}>Price Action Trends</h2>
                            </div>
                            <div style={{ height: '400px', width: '100%' }}>
                                <LineChart width={1520} height={400} data={graphData} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={true} />
                                    <XAxis dataKey="label" stroke="#9ca3af" fontSize={14} tickLine={false} axisLine={false} tickMargin={15} ticks={exportTicks} tickFormatter={(val) => dayjs(val).format('MMM DD')} />
                                    <YAxis stroke="#9ca3af" fontSize={14} tickLine={false} axisLine={false} tickFormatter={(value) => `Rs ${value}`} width={80} />
                                    <Legend verticalAlign="bottom" height={40} iconSize={0} wrapperStyle={{ paddingTop: '40px', fontSize: '16px', fontWeight: 600 }} cursor="default" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} />
                                    {!hiddenSeries.includes('avgBuyPrice') && <Line type="monotone" name="Avg Buying Price" dataKey="avgBuyPrice" stroke="#f97316" strokeWidth={3} dot={{ r: 4, fill: '#18181b', strokeWidth: 2 }} connectNulls={true} isAnimationActive={false} />}
                                    {!hiddenSeries.includes('avgSellPrice') && <Line type="monotone" name="Avg Selling Price" dataKey="avgSellPrice" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#18181b', strokeWidth: 2 }} connectNulls={true} isAnimationActive={false} />}
                                </LineChart>
                            </div>
                        </div>

                        <div id="export-inventory-chart" style={{ width: '100%', backgroundColor: 'transparent' }}>
                            <div className="hide-for-pdf-capture" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                <h2 style={{ color: 'white', fontSize: '24px', margin: 0 }}>Inventory Volume Evolution</h2>
                            </div>
                            <div style={{ height: '400px', width: '100%' }}>
                                <AreaChart width={1520} height={400} data={graphData} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
                                    <defs>
                                        <linearGradient id="colorS1Exp" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorS2Exp" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorTotalExp" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={true} />
                                    <XAxis dataKey="label" stroke="#9ca3af" fontSize={14} tickLine={false} axisLine={false} tickMargin={15} ticks={exportTicks} tickFormatter={(val) => dayjs(val).format('MMM DD')} />
                                    <YAxis stroke="#9ca3af" fontSize={14} tickLine={false} axisLine={false} tickFormatter={(value) => `${value} kg`} width={80} />
                                    <Legend verticalAlign="bottom" height={40} iconSize={0} wrapperStyle={{ paddingTop: '40px', fontSize: '16px', fontWeight: 600 }} cursor="default" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} />
                                    {!hiddenSeries.includes('stockS1') && <Area type="monotone" dataKey="stockS1" name="Store 1 Stock" stroke="#14b8a6" strokeWidth={2} fillOpacity={1} fill="url(#colorS1Exp)" isAnimationActive={false} />}
                                    {!hiddenSeries.includes('stockS2') && <Area type="monotone" dataKey="stockS2" name="Store 2 Stock" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorS2Exp)" isAnimationActive={false} />}
                                    {!hiddenSeries.includes('stock') && <Area type="monotone" dataKey="stock" name="Total Stock" stroke="#3b82f6" strokeWidth={4} fillOpacity={1} fill="url(#colorTotalExp)" isAnimationActive={false} />}
                                </AreaChart>
                            </div>
                        </div>

                        {eventData.length > 1 && (
                            <div id="export-events-chart" style={{ width: '100%', marginTop: '40px', backgroundColor: 'transparent' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                    <h2 style={{ color: 'white', fontSize: '24px', margin: 0 }}>Inventory Volume Evolution — Event by Event</h2>
                                </div>
                                <div style={{ height: '420px', width: '100%' }}>
                                    <LineChart width={1520} height={420} data={eventData} margin={{ top: 10, right: 30, left: 10, bottom: 60 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                                        <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} tickMargin={15}
                                            interval={Math.max(0, Math.floor((eventData.length - 1) / 14))} />
                                        <YAxis stroke="#9ca3af" fontSize={14} tickLine={false} axisLine={false} tickFormatter={(v) => `${v} kg`} width={80} />
                                        <Legend verticalAlign="bottom" height={40} iconSize={12} wrapperStyle={{ paddingTop: '40px', fontSize: '16px', fontWeight: 600 }} />
                                        <Line type="stepAfter" dataKey="s1" name="Store 1 Stock" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3.5, fill: '#14b8a6' }} isAnimationActive={false} />
                                        <Line type="stepAfter" dataKey="s2" name="Store 2 Stock" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3.5, fill: '#8b5cf6' }} isAnimationActive={false} />
                                        <Line type="stepAfter" dataKey="total" name="Total Stock" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} isAnimationActive={false} />
                                    </LineChart>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

        </div>
    );
}
