import React, { useState, useEffect } from 'react';
import { Select, DatePicker, Button, Spin, App, Empty } from 'antd';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { SearchOutlined, LineChartOutlined, StockOutlined, BarChartOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

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

    useEffect(() => {
        if (selectedItem) {
            fetchData();
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
                                <span className="font-bold text-white tracking-wide">{formatLKR(entry.value)}</span>
                            </div>
                        ))}
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
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <span className="text-gray-400 text-sm">Total Stock:</span>
                        <span className="font-bold text-emerald-400 tracking-wide">{formatStock(payload[0].value)}</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="animate-fade-in pb-24 md:pb-8">
            {/* Header */}
            <div className="hidden md:flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
                        <LineChartOutlined className="text-emerald-400" /> Graphs & Analytics
                    </h1>
                    <p className="text-xs text-gray-400 mt-1">Visualize item price trends and stock lifecycle history</p>
                </div>
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
                        filterOption={(input, option) => (option?.children ?? '').toLowerCase().includes(input.toLowerCase())}
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
                                onClick={fetchData}
                                loading={loadingData}
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
                    {/* Item Price Changes */}
                    <div className="glass-card p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-lg md:shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-orange-500 to-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity" />

                        <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 sm:gap-0 mb-6 md:mb-8 md:pr-4">
                            <h2 className="text-lg md:text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2 md:gap-3">
                                <span className="w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                                    <LineChartOutlined className="text-orange-500 text-sm md:text-base" />
                                </span>
                                Price Action Trends
                            </h2>
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-500 bg-white/5 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-white/5">{period}</span>
                        </div>

                        <div className="h-[280px] md:h-[450px] w-full -ml-4 md:ml-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={graphData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        stroke="#6b7280"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={10}
                                        fontWeight={600}
                                    />
                                    <YAxis
                                        stroke="#6b7280"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `Rs ${value}`}
                                        domain={['auto', 'auto']}
                                        fontWeight={600}
                                        width={65}
                                    />
                                    <RechartsTooltip content={<CustomTooltipPrice />} cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 20, fill: 'rgba(255,255,255,0.02)' }} />
                                    <Legend
                                        iconType="circle"
                                        wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }}
                                        formatter={(value) => <span className="text-gray-400 font-semibold tracking-wide ml-1">{value}</span>}
                                    />

                                    <Line
                                        type="monotone"
                                        name="Avg Buying Price"
                                        dataKey="avgBuyPrice"
                                        stroke="#f97316" // orange-500
                                        strokeWidth={3}
                                        dot={{ r: 3, fill: '#18181b', strokeWidth: 2 }}
                                        activeDot={{ r: 5, stroke: '#f97316', strokeWidth: 3, fill: '#fff' }}
                                        connectNulls={true}
                                        animationDuration={1500}
                                        animationEasing="ease-out"
                                    />
                                    <Line
                                        type="monotone"
                                        name="Avg Selling Price"
                                        dataKey="avgSellPrice"
                                        stroke="#10b981" // emerald-500
                                        strokeWidth={3}
                                        dot={{ r: 3, fill: '#18181b', strokeWidth: 2 }}
                                        activeDot={{ r: 5, stroke: '#10b981', strokeWidth: 3, fill: '#fff' }}
                                        connectNulls={true}
                                        animationDuration={1500}
                                        animationEasing="ease-out"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Stock Changes */}
                    <div className="glass-card p-4 md:p-8 rounded-2xl md:rounded-3xl shadow-lg md:shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 to-blue-500 opacity-50 group-hover:opacity-100 transition-opacity" />

                        <div className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2 sm:gap-0 mb-6 md:mb-8 md:pr-4">
                            <h2 className="text-lg md:text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2 md:gap-3">
                                <span className="w-6 h-6 md:w-8 md:h-8 rounded-md md:rounded-lg bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
                                    <StockOutlined className="text-teal-400 text-sm md:text-base" />
                                </span>
                                Inventory Volume Evolution
                            </h2>
                            <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-gray-500 bg-white/5 px-2 md:px-3 py-0.5 md:py-1 rounded-full border border-white/5">{period}</span>
                        </div>

                        <div className="h-[240px] md:h-[400px] w-full -ml-4 md:ml-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={graphData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                                    <defs>
                                        <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.4} />
                                            <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        stroke="#6b7280"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={10}
                                        fontWeight={600}
                                    />
                                    <YAxis
                                        stroke="#6b7280"
                                        fontSize={10}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={(value) => `${value} kg`}
                                        fontWeight={600}
                                        width={55}
                                    />
                                    <RechartsTooltip content={<CustomTooltipStock />} cursor={{ stroke: 'rgba(255,255,255,0.05)', strokeWidth: 20, fill: 'rgba(255,255,255,0.02)' }} />

                                    <Area
                                        type="monotone"
                                        dataKey="stock"
                                        stroke="#14b8a6" // teal-500
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#colorStock)"
                                        animationDuration={1500}
                                        animationEasing="ease-out"
                                        activeDot={{ r: 5, stroke: '#14b8a6', strokeWidth: 3, fill: '#fff' }}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
