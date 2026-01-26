import React, { useState, useEffect } from 'react';
import { DatePicker, Button, Table, Select, message, Spin } from 'antd';
import { FilePdfOutlined, SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { registerSinhalaFont } from '../../fonts/sinhalaFont';
import MobileDateRange from '../../components/common/MobileDateRange';
import CollapsibleReportFilters from '../../components/common/CollapsibleReportFilters';

const { RangePicker } = DatePicker;
const { Option } = Select;

export default function ReportStockMovement() {
    const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
    const [selectedItems, setSelectedItems] = useState([]);
    const [selectedStore, setSelectedStore] = useState('all');
    const [allItems, setAllItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [hasSearched, setHasSearched] = useState(false);

    useEffect(() => {
        axios.post('/api/getAllItems', { status: 'Active' })
            .then(res => {
                if (res.data.success) setAllItems(res.data.result);
            })
            .catch(err => console.error("Failed to load items", err));
    }, []);

    const fetchReport = async () => {
        if (!dateRange) {
            message.error("Please select a date range");
            return;
        }
        setLoading(true);
        setHasSearched(true);
        try {
            const response = await axios.post('/api/reports/stockMovement', {
                startDate: dateRange[0].format('YYYY-MM-DD'),
                endDate: dateRange[1].format('YYYY-MM-DD'),
                itemIds: selectedItems,
                storeNo: selectedStore
            });
            if (response.data.success) {
                setData(response.data.result);
            }
        } catch (error) {
            console.error("Error fetching report:", error);
            message.error("Failed to generate report");
        } finally {
            setLoading(false);
        }
    };

    const generatePDF = () => {
        if (!data || data.length === 0) return;

        const doc = new jsPDF({ orientation: selectedStore === 'all' ? 'landscape' : 'portrait' });
        registerSinhalaFont(doc);
        doc.setFont('helvetica', 'bold');

        const startDate = dateRange[0].format('YYYY-MM-DD');
        const endDate = dateRange[1].format('YYYY-MM-DD');

        doc.setFontSize(18);
        doc.text("Stock Movement Report", 14, 20);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const storeLabel = selectedStore === 'all' ? 'All Stores' : `Store ${selectedStore}`;
        doc.text(`Store: ${storeLabel} | Period: ${startDate} to ${endDate}`, 14, 28);
        doc.text(`Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`, 14, 33);

        // Different columns based on store selection
        let tableHead, tableBody;

        if (selectedStore === 'all') {
            // Include store-wise breakdown
            tableHead = [['Code', 'Item Name', 'S1 Buy', 'S1 Sell', 'S1 Net', 'S2 Buy', 'S2 Sell', 'S2 Net', 'Total Buy', 'Total Sell', 'Total Net']];
            tableBody = data.map(item => [
                item.code || '-',
                item.name || '-',
                Number(item.buyQtyS1).toFixed(1),
                Number(item.sellQtyS1).toFixed(1),
                Number(item.netS1).toFixed(1),
                Number(item.buyQtyS2).toFixed(1),
                Number(item.sellQtyS2).toFixed(1),
                Number(item.netS2).toFixed(1),
                Number(item.buyQty).toFixed(2),
                Number(item.sellQty).toFixed(2),
                Number(item.netChange).toFixed(2)
            ]);
        } else {
            // Single store - simple view
            tableHead = [['Code', 'Item Name', 'Buy Qty', 'Sell Qty', 'Net Change']];
            tableBody = data.map(item => [
                item.code || '-',
                item.name || '-',
                Number(item.buyQty).toFixed(2),
                Number(item.sellQty).toFixed(2),
                Number(item.netChange).toFixed(2)
            ]);
        }

        autoTable(doc, {
            startY: 40,
            head: tableHead,
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246], font: 'helvetica', fontStyle: 'bold', fontSize: 8 },
            styles: { font: 'helvetica', fontSize: 8 },
            columnStyles: { 1: { font: 'NotoSansSinhala' } }
        });

        doc.save(`Stock_Movement_${storeLabel.replace(' ', '_')}_${startDate}_${endDate}.pdf`);
        message.success('PDF downloaded!');
    };

    // Desktop table columns - show store-wise when "All Stores" selected
    const columns = [
        { title: 'Code', dataIndex: 'code', width: 70, fixed: 'left' },
        { title: 'Item', dataIndex: 'name', width: 120, ellipsis: true },
        ...(selectedStore === 'all' ? [
            {
                title: 'S1 Net',
                dataIndex: 'netS1',
                align: 'right',
                width: 70,
                render: val => (
                    <span className={`text-xs font-medium ${val >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                        {val >= 0 ? '+' : ''}{Number(val).toFixed(1)}
                    </span>
                )
            },
            {
                title: 'S2 Net',
                dataIndex: 'netS2',
                align: 'right',
                width: 70,
                render: val => (
                    <span className={`text-xs font-medium ${val >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                        {val >= 0 ? '+' : ''}{Number(val).toFixed(1)}
                    </span>
                )
            }
        ] : []),
        {
            title: 'Buy',
            dataIndex: 'buyQty',
            align: 'right',
            width: 70,
            render: val => <span className="text-red-500 text-xs">{Number(val).toFixed(1)}</span>
        },
        {
            title: 'Sell',
            dataIndex: 'sellQty',
            align: 'right',
            width: 70,
            render: val => <span className="text-emerald-600 text-xs">{Number(val).toFixed(1)}</span>
        },
        {
            title: 'Net',
            dataIndex: 'netChange',
            align: 'right',
            width: 80,
            render: val => (
                <span className={`font-bold ${val >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                    {val >= 0 ? '+' : ''}{Number(val).toFixed(2)}
                </span>
            )
        }
    ];

    // Mobile Item Card with store breakdown
    const ItemCard = ({ item }) => (
        <div className="bg-white/50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/5 shadow-sm">
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0 pr-2">
                    <div className="text-[10px] text-gray-400 font-mono tracking-wide">{item.code}</div>
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{item.name}</div>
                </div>
                <div className={`text-right font-bold text-base ${item.netChange >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                    <span className="text-[10px] text-gray-400 font-normal block">Net Change</span>
                    {item.netChange >= 0 ? '+' : ''}{Number(item.netChange).toFixed(2)}
                </div>
            </div>

            {/* Store breakdown when showing all stores */}
            {selectedStore === 'all' && (
                <div className="space-y-2 mb-2">
                    {/* Store 1 Row */}
                    <div className="flex flex-col bg-blue-50/50 dark:bg-blue-900/10 rounded-lg p-2">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">🏪 Store 1</span>
                            <span className={`text-xs font-bold ${item.netS1 >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                                Net: {item.netS1 >= 0 ? '+' : ''}{Number(item.netS1).toFixed(1)}
                            </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-red-500">Buy: {Number(item.buyQtyS1).toFixed(1)}</span>
                            <span className="text-emerald-600">Sell: {Number(item.sellQtyS1).toFixed(1)}</span>
                        </div>
                    </div>
                    {/* Store 2 Row */}
                    <div className="flex flex-col bg-purple-50/50 dark:bg-purple-900/10 rounded-lg p-2">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">🏪 Store 2</span>
                            <span className={`text-xs font-bold ${item.netS2 >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                                Net: {item.netS2 >= 0 ? '+' : ''}{Number(item.netS2).toFixed(1)}
                            </span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-red-500">Buy: {Number(item.buyQtyS2).toFixed(1)}</span>
                            <span className="text-emerald-600">Sell: {Number(item.sellQtyS2).toFixed(1)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Total row */}
            <div className="flex justify-between items-center text-xs bg-gray-50 dark:bg-black/20 rounded-lg p-2">
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400">Total Buy</span>
                    <span className="text-red-500 font-medium">{Number(item.buyQty).toFixed(2)}</span>
                </div>
                <div className="h-6 w-px bg-gray-200 dark:bg-white/10 mx-2"></div>
                <div className="flex flex-col text-right">
                    <span className="text-[10px] text-gray-400">Total Sell</span>
                    <span className="text-emerald-600 font-medium">{Number(item.sellQty).toFixed(2)}</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-4">
            {/* Filter Bar */}
            {/* Filter Bar */}
            <CollapsibleReportFilters
                title="Filter Stock Movement"
                activeFilterCount={(selectedItems.length > 0 || selectedStore !== 'all') ? 1 : 0}
                onClear={() => {
                    setSelectedItems([]);
                    setSelectedStore('all');
                }}
                defaultCollapsed={false}
            >
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Filter Items</div>
                <Select
                    mode="multiple"
                    placeholder="Search & Select Items"
                    value={selectedItems}
                    onChange={setSelectedItems}
                    className="w-full mb-4"
                    optionFilterProp="children"
                    maxTagCount="responsive"
                    size="large"
                >
                    {allItems.map(item => (
                        <Option key={item.ITEM_ID} value={item.ITEM_ID}>{item.NAME}</Option>
                    ))}
                </Select>

                {/* Store Filter */}
                <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Store</div>
                    <Select
                        value={selectedStore}
                        onChange={setSelectedStore}
                        className="w-full"
                        size="large"
                    >
                        <Option value="all">All Stores</Option>
                        <Option value="1">Store 1</Option>
                        <Option value="2">Store 2</Option>
                    </Select>
                </div>

                <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Period</div>
                    <MobileDateRange
                        value={dateRange}
                        onChange={setDateRange}
                        className="w-full"
                    />
                </div>

                <div className="flex gap-2">
                    <Button
                        type="primary"
                        icon={<SwapOutlined />}
                        onClick={fetchReport}
                        loading={loading}
                        className="bg-blue-600 hover:bg-blue-500 flex-1 h-10 text-sm font-medium rounded-xl border-none shadow-md shadow-blue-500/20"
                    >
                        Generate Report
                    </Button>
                    {data.length > 0 && (
                        <Button icon={<FilePdfOutlined />} onClick={generatePDF} danger className="h-10 w-12 flex items-center justify-center rounded-xl" />
                    )}
                </div>
            </CollapsibleReportFilters>

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-10">
                    <Spin size="large" />
                </div>
            )}

            {/* Empty State */}
            {!loading && hasSearched && data.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="text-5xl mb-4">📦</div>
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        No Stock Movement Found
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                        No buy/sell transactions for the selected date range. Try selecting a different period.
                    </p>
                </div>
            )}

            {/* Data Display */}
            {data.length > 0 && !loading && (
                <div className="animate-fade-in">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-center">
                            <div className="text-[10px] text-gray-500">Total Buy</div>
                            <div className="text-lg font-bold text-red-500">
                                {data.reduce((sum, i) => sum + i.buyQty, 0).toFixed(1)}
                            </div>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg text-center">
                            <div className="text-[10px] text-gray-500">Total Sell</div>
                            <div className="text-lg font-bold text-emerald-600">
                                {data.reduce((sum, i) => sum + i.sellQty, 0).toFixed(1)}
                            </div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg text-center">
                            <div className="text-[10px] text-gray-500">Net Change</div>
                            <div className={`text-lg font-bold ${data.reduce((sum, i) => sum + i.netChange, 0) >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                                {data.reduce((sum, i) => sum + i.netChange, 0).toFixed(1)}
                            </div>
                        </div>
                    </div>

                    {/* Desktop: Table */}
                    <div className="hidden md:block">
                        <div className="glass-card rounded-xl p-3 overflow-hidden">
                            <Table
                                dataSource={data}
                                columns={columns}
                                rowKey="id"
                                size="small"
                                pagination={{ pageSize: 15, size: 'small' }}
                                scroll={{ x: 600 }}
                            />
                        </div>
                    </div>

                    {/* Mobile: Card List */}
                    <div className="md:hidden">
                        <div className="text-xs text-gray-500 mb-2">
                            Items ({data.length})
                        </div>
                        <div className="flex flex-col gap-2">
                            {data.map((item, index) => (
                                <ItemCard key={item.id || index} item={item} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
