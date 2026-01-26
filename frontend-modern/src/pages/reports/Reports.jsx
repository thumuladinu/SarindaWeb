import React, { useState } from 'react';
import { Tabs, Select } from 'antd';
import { BarChartOutlined, DollarOutlined, LineChartOutlined, SwapOutlined } from '@ant-design/icons';
import ReportTransactions from './ReportTransactions';
import ReportItemProfit from './ReportItemProfit';
import ReportAvgAnalysis from './ReportAvgAnalysis';
import ReportStockMovement from './ReportStockMovement';

const { Option } = Select;

export default function Reports() {
    const [activeTab, setActiveTab] = useState('1');

    const items = [
        {
            key: '1',
            label: (
                <span className="flex items-center gap-1 text-xs md:text-sm">
                    <DollarOutlined />
                    <span className="hidden md:inline">Transaction</span>
                    <span className="md:hidden">P&L</span>
                </span>
            ),
            children: <ReportTransactions />,
            mobileLabel: 'Transaction P&L'
        },
        {
            key: '2',
            label: (
                <span className="flex items-center gap-1 text-xs md:text-sm">
                    <LineChartOutlined />
                    <span className="hidden md:inline">Item Profit</span>
                    <span className="md:hidden">Items</span>
                </span>
            ),
            children: <ReportItemProfit />,
            mobileLabel: 'Item Profit Analysis'
        },
        {
            key: '3',
            label: (
                <span className="flex items-center gap-1 text-xs md:text-sm">
                    <SwapOutlined />
                    <span className="hidden md:inline">Stock Movement</span>
                    <span className="md:hidden">Stock</span>
                </span>
            ),
            children: <ReportStockMovement />,
            mobileLabel: 'Stock Movement'
        },
        {
            key: '4',
            label: (
                <span className="flex items-center gap-1 text-xs md:text-sm">
                    <BarChartOutlined />
                    <span className="hidden md:inline">Average Price</span>
                    <span className="md:hidden">Avg</span>
                </span>
            ),
            children: <ReportAvgAnalysis />,
            mobileLabel: 'Average Price Analysis'
        }
    ];

    const renderContent = () => {
        const activeItem = items.find(item => item.key === activeTab);
        return activeItem ? activeItem.children : null;
    };

    return (
        <div className="animate-fade-in pb-24 md:pb-8">
            <div className="glass-card md:p-4 rounded-xl md:rounded-2xl overflow-hidden max-w-full bg-white/50 dark:bg-black/20 backdrop-blur-md">

                {/* Mobile Navigation */}
                <div className="md:hidden p-3 border-b border-gray-100 dark:border-white/5">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select Report</div>
                    <Select
                        className="w-full"
                        size="large"
                        value={activeTab}
                        onChange={setActiveTab}
                    >
                        {items.map(item => (
                            <Option key={item.key} value={item.key}>{item.mobileLabel}</Option>
                        ))}
                    </Select>
                </div>

                {/* Desktop Navigation */}
                <div className="hidden md:block">
                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={items}
                        size="small"
                        className="report-tabs compact-tabs"
                        tabBarStyle={{ marginBottom: 0, padding: '0 1rem' }}
                    />
                </div>

                {/* Content Area - Rendered conditionally on mobile to avoid Tab nesting issues if any, 
                    but here Tabs handles content. For Mobile Dropdown we need to render content manually. */}
                <div className="md:hidden p-2">
                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
