import React, { useState, useEffect } from 'react';
import { Input, Select, DatePicker, Button, Collapse, Badge, theme } from 'antd';
import { SearchOutlined, FilterOutlined, ClearOutlined, DownOutlined, UpOutlined, CaretRightOutlined } from '@ant-design/icons';
import MobileDateRange from '../../components/common/MobileDateRange';
import axios from 'axios';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { Panel } = Collapse;

export default function TransactionFilters({ filters, setFilters }) {
    const { token } = theme.useToken();
    const [isCollapsed, setIsCollapsed] = useState(true);

    // Local state for debounced inputs
    const [localCode, setLocalCode] = useState(filters.code);
    const [localMin, setLocalMin] = useState(filters.minAmount);
    const [localMax, setLocalMax] = useState(filters.maxAmount);
    const [items, setItems] = useState([]);
    const [itemsLoading, setItemsLoading] = useState(false);

    // Fetch items for filter
    useEffect(() => {
        const fetchItems = async () => {
            setItemsLoading(true);
            try {
                // Assuming this endpoint exists and returns all items
                const response = await axios.post('/api/getAllItems', {});
                if (response.data.success) {
                    // Filter out special items (CONTAINER, RETURN)
                    const filtered = (response.data.result || []).filter(item =>
                        item.CODE !== 'CONTAINER' && item.CODE !== 'RETURN' && item.isSpecialItem !== true
                    );
                    setItems(filtered);
                }
            } catch (error) {
                console.error("Error fetching items for filter:", error);
            } finally {
                setItemsLoading(false);
            }
        };
        fetchItems();
    }, []);

    // Sync local state if parent filters change externally (e.g. clear)
    useEffect(() => {
        setLocalCode(filters.code);
        setLocalMin(filters.minAmount);
        setLocalMax(filters.maxAmount);
    }, [filters.code, filters.minAmount, filters.maxAmount]);

    // Debounce Logic
    useEffect(() => {
        const timer = setTimeout(() => {
            if (localCode !== filters.code) {
                setFilters(prev => ({ ...prev, code: localCode }));
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [localCode]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localMin !== filters.minAmount) {
                setFilters(prev => ({ ...prev, minAmount: localMin }));
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [localMin]);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (localMax !== filters.maxAmount) {
                setFilters(prev => ({ ...prev, maxAmount: localMax }));
            }
        }, 600);
        return () => clearTimeout(timer);
    }, [localMax]);

    const handleChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const activeFilterCount = Object.entries(filters).filter(([key, val]) => {
        if (!val) return false;
        if (key === 'current' || key === 'pageSize' || key === 'total') return false; // Ignore pagination
        return true;
    }).length;

    return (
        <div className="glass-card rounded-2xl mb-6 animate-fade-in border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
            <div
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors"
                onClick={() => setIsCollapsed(!isCollapsed)}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg transition-colors ${!isCollapsed ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-gray-400'}`}>
                        <FilterOutlined />
                    </div>
                    <div>
                        <h3 className="text-base font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                            Filter Transactions
                            {activeFilterCount > 0 && <Badge count={activeFilterCount} color={token.colorPrimary} />}
                        </h3>
                        {isCollapsed && activeFilterCount > 0 && (
                            <p className="text-xs text-gray-500 m-0">Filters active: {activeFilterCount}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {activeFilterCount > 0 && (
                        <Button
                            type="text"
                            size="small"
                            icon={<ClearOutlined />}
                            className="text-gray-400 hover:text-red-500"
                            onClick={(e) => {
                                e.stopPropagation();
                                setFilters({ code: '', store: null, type: null, item: null, minAmount: '', maxAmount: '', dateRange: null });
                            }}
                        >
                            Clear
                        </Button>
                    )}
                    {isCollapsed ? <DownOutlined className="text-gray-400" /> : <UpOutlined className="text-gray-400" />}
                </div>
            </div>

            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'}`}>
                <div className="p-4 pt-0 border-t border-gray-100 dark:border-white/5 bg-gray-50/30 dark:bg-black/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                        {/* Search Code */}
                        <div className="form-group">
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Search Code</label>
                            <Input
                                placeholder="Type code..."
                                prefix={<SearchOutlined className="text-gray-400" />}
                                className="input-dark-glass h-10 w-full rounded-xl"
                                value={localCode}
                                onChange={(e) => setLocalCode(e.target.value)}
                            />
                        </div>

                        {/* Store Select */}
                        <div className="form-group">
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Store</label>
                            <Select
                                placeholder="All Stores"
                                className="w-full h-10 rounded-xl"
                                popupClassName="glass-dropdown"
                                allowClear
                                value={filters.store}
                                onChange={(val) => handleChange('store', val)}
                            >
                                <Option value="1">Store 1</Option>
                                <Option value="2">Store 2</Option>
                            </Select>
                        </div>

                        {/* Type Select */}
                        <div className="form-group">
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
                            <Select
                                placeholder="All Types"
                                className="w-full h-10"
                                popupClassName="glass-dropdown"
                                allowClear
                                value={filters.type}
                                onChange={(val) => handleChange('type', val)}
                            >
                                <Option value="buy">
                                    <span className="text-red-500 font-medium">Buy (Out)</span>
                                </Option>
                                <Option value="sell">
                                    <span className="text-emerald-500 font-medium">Sell (In)</span>
                                </Option>
                                <Option value="expenses">
                                    <span className="text-orange-500 font-medium">Expenses</span>
                                </Option>
                            </Select>
                        </div>

                        {/* Item Filter */}
                        <div className="form-group">
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Filtered by Item</label>
                            <Select
                                mode="multiple"
                                maxTagCount="responsive"
                                showSearch
                                placeholder="Select Items"
                                optionFilterProp="children"
                                className="w-full h-10"
                                popupClassName="glass-dropdown"
                                allowClear
                                loading={itemsLoading}
                                value={filters.item}
                                onChange={(val) => handleChange('item', val)}
                                filterOption={(input, option) =>
                                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                }
                                options={items.map(item => ({
                                    value: item.ITEM_ID,
                                    label: `${item.CODE} - ${item.NAME}`
                                }))}
                            />
                        </div>

                        {/* Date Range */}
                        <div className="form-group">
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Date Range</label>
                            <MobileDateRange
                                value={filters.dateRange}
                                onChange={(val) => handleChange('dateRange', val)}
                            />
                        </div>

                        {/* Amount Range */}
                        <div className="form-group lg:col-span-2">
                            <label className="text-xs font-medium text-gray-500 mb-1 block">Amount Range</label>
                            <div className="flex gap-2">
                                <Input
                                    type="number"
                                    placeholder="Min"
                                    className="input-dark-glass h-10 w-full rounded-xl"
                                    value={localMin}
                                    onChange={(e) => setLocalMin(e.target.value)}
                                    prefix="Rs."
                                />
                                <Input
                                    type="number"
                                    placeholder="Max"
                                    className="input-dark-glass h-10 w-full rounded-xl"
                                    value={localMax}
                                    onChange={(e) => setLocalMax(e.target.value)}
                                    prefix="Rs."
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
