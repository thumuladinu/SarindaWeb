import React from 'react';
import { Input, Select, DatePicker, Button } from 'antd';
import { SearchOutlined, FilterOutlined, ClearOutlined } from '@ant-design/icons';

const { RangePicker } = DatePicker;
const { Option } = Select;

export default function InventoryHistoryFilters({ filters, setFilters, collapsed, setCollapsed, itemOptions }) {

    const handleChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="glass-card rounded-2xl mb-6 animate-fade-in overflow-hidden">
            {/* Header / Toggle */}
            <div
                className="flex items-center justify-between p-4 md:p-6 cursor-pointer hover:bg-white/5 transition-colors"
                onClick={() => setCollapsed(!collapsed)}
            >
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white flex items-center gap-2">
                    <FilterOutlined className="text-emerald-500" />
                    Advanced Filters
                    <span className="text-xs font-normal text-gray-500 ml-2">
                        {collapsed ? '(Click to Expand)' : '(Click to Collapse)'}
                    </span>
                </h3>
                <div className="flex gap-2">
                    <Button
                        type="text"
                        icon={<ClearOutlined />}
                        className="text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                        onClick={(e) => {
                            e.stopPropagation();
                            setFilters({ search: '', type: 'all', store: 'all', item: 'all', dateRange: null });
                        }}
                    >
                        Clear
                    </Button>
                </div>
            </div>

            {/* Collapsible Content */}
            {!collapsed && (
                <div className="p-4 md:p-6 pt-0 md:pt-2 mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 border-t border-gray-100 dark:border-white/5">

                    {/* Search */}
                    <div className="form-group">
                        <Input
                            placeholder="Search Code, Item Name..."
                            prefix={<SearchOutlined className="text-gray-400" />}
                            className="input-dark-glass h-10 w-full rounded-xl"
                            value={filters.search}
                            onChange={(e) => handleChange('search', e.target.value)}
                        />
                    </div>

                    {/* Store Select */}
                    <div className="form-group">
                        <Select
                            placeholder="Select Store"
                            className="w-full h-10 rounded-xl"
                            popupClassName="glass-dropdown"
                            value={filters.store}
                            onChange={(val) => handleChange('store', val)}
                        >
                            <Option value="all">All Stores</Option>
                            <Option value="1">Store 1</Option>
                            <Option value="2">Store 2</Option>
                        </Select>
                    </div>

                    {/* Type Select */}
                    <div className="form-group">
                        <Select
                            placeholder="Transaction Type"
                            className="w-full h-10"
                            popupClassName="glass-dropdown"
                            value={filters.type}
                            onChange={(val) => handleChange('type', val)}
                        >
                            <Option value="all">All Types</Option>
                            <Option value="AdjIn">Stock In (+)</Option>
                            <Option value="AdjOut">Stock Out (-)</Option>
                            <Option value="StockClear">Stock Clear (Reset)</Option>
                            <Option value="Opening">Opening Stock</Option>
                        </Select>
                    </div>

                    {/* Item Select */}
                    <div className="form-group">
                        <Select
                            placeholder="Select Item"
                            className="w-full h-10"
                            popupClassName="glass-dropdown"
                            value={filters.item}
                            onChange={(val) => handleChange('item', val)}
                            showSearch
                            optionFilterProp="children"
                        >
                            <Option value="all">All Items</Option>
                            {itemOptions && itemOptions.map(item => (
                                <Option key={item.id} value={String(item.id)}>{item.name}</Option>
                            ))}
                        </Select>
                    </div>

                    {/* Date Range */}
                    <div className="form-group lg:col-span-4">
                        <RangePicker
                            className="w-full h-10 border-gray-300 dark:border-white/10 bg-transparent rounded-xl"
                            popupClassName="glass-dropdown"
                            value={filters.dateRange}
                            onChange={(val) => handleChange('dateRange', val)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
