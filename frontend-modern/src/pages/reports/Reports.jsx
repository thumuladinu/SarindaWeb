import React, { useState } from 'react';
import { Tabs } from 'antd';
import { BarChartOutlined, DollarOutlined, LineChartOutlined, SwapOutlined } from '@ant-design/icons';
import ReportTransactions from './ReportTransactions';
import ReportItemProfit from './ReportItemProfit';
import ReportAvgAnalysis from './ReportAvgAnalysis';
import ReportStockMovement from './ReportStockMovement';

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
            children: <ReportTransactions />
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
            children: <ReportItemProfit />
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
            children: <ReportStockMovement />
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
            children: <ReportAvgAnalysis />
        }
    ];

    return (
        <div className="animate-fade-in pb-24 md:pb-8">
            {/* <h2 className="text-lg md:text-2xl font-bold text-gray-800 dark:text-white mb-4">Reports</h2> */}

            <div className="glass-card p-2 md:p-4 rounded-xl md:rounded-2xl overflow-hidden max-w-full">
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={items}
                    size="small"
                    className="report-tabs compact-tabs"
                />
            </div>
        </div>
    );
}
