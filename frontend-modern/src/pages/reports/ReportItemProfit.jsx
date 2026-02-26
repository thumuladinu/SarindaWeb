import React, { useState, useEffect } from 'react';
import { DatePicker, Button, Table, Select, message, Spin } from 'antd';
import { FilePdfOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { registerSinhalaFont } from '../../fonts/sinhalaFont';
import MobileDateRange from '../../components/common/MobileDateRange';
import CollapsibleReportFilters from '../../components/common/CollapsibleReportFilters';

const { RangePicker } = DatePicker;
const { Option } = Select;

export default function ReportItemProfit() {
    const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
    const [selectedItems, setSelectedItems] = useState([]);
    const [allItems, setAllItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [hasSearched, setHasSearched] = useState(false);

    useEffect(() => {
        axios.post('/api/getAllItems', { status: 'Active' })
            .then(res => {
                if (res.data.success) {
                    // Filter out special items (CONTAINER, RETURN)
                    const filtered = (res.data.result || []).filter(item =>
                        item.CODE !== 'CONTAINER' && item.CODE !== 'RETURN' && item.isSpecialItem !== true
                    );
                    setAllItems(filtered);
                }
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
            const response = await axios.post('/api/reports/items', {
                startDate: dateRange[0].format('YYYY-MM-DD'),
                endDate: dateRange[1].format('YYYY-MM-DD'),
                itemIds: selectedItems
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

        const doc = new jsPDF();
        registerSinhalaFont(doc);
        doc.setFont('helvetica', 'bold');

        const startDate = dateRange[0].format('YYYY-MM-DD');
        const endDate = dateRange[1].format('YYYY-MM-DD');

        doc.setFontSize(18);
        doc.text("Item Profit Analysis Report", 14, 20);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Period: ${startDate} to ${endDate}`, 14, 28);
        doc.text(`Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`, 14, 33);

        const totalProfitSoldAmt = data.reduce((sum, item) => {
            const avgSale = item.soldQty > 0 ? (item.soldAmount / item.soldQty) : (item.masterSellPrice || 0);
            const avgBuy = item.boughtQty > 0 ? (item.boughtAmount / item.boughtQty) : (item.masterBuyPrice || 0);
            return sum + ((avgSale - avgBuy) * (item.soldQty || 0));
        }, 0);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`Total Net Profit (Sold Amt): Rs. ${totalProfitSoldAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, 40);

        const tableBody = data.map(item => {
            const avgSale = item.soldQty > 0 ? (item.soldAmount / item.soldQty) : (item.masterSellPrice || 0);
            const avgBuy = item.boughtQty > 0 ? (item.boughtAmount / item.boughtQty) : (item.masterBuyPrice || 0);
            const netProfit = (item.soldAmount || 0) - (item.boughtAmount || 0);
            const salesProfit = (avgSale - avgBuy) * (item.soldQty || 0);

            return [
                `${item.code || ''} - ${item.name || ''}`,
                `${Number(item.soldAmount || 0).toFixed(2)}\n(${Number(item.soldQty || 0).toFixed(2)}kg)`,
                `${Number(item.boughtAmount || 0).toFixed(2)}\n(${Number(item.boughtQty || 0).toFixed(2)}kg)`,
                Number(netProfit).toFixed(2),
                Number(avgSale).toFixed(2),
                Number(avgBuy).toFixed(2),
                `${Number(salesProfit).toFixed(2)}\n(${Number(item.soldQty || 0).toFixed(2)}kg)`
            ];
        });

        autoTable(doc, {
            startY: 45,
            head: [['Item', 'Sales', 'Buying', 'Net Profit', 'Avg Sale/kg', 'Avg Buy/kg', 'Profit (Sold Amt)']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [147, 51, 234], font: 'helvetica', fontStyle: 'bold' },
            styles: { font: 'helvetica', fontSize: 7 },
            columnStyles: {
                0: { cellWidth: 55 },
                1: { align: 'right' },
                2: { align: 'right' },
                3: { align: 'right' },
                4: { align: 'right' },
                5: { align: 'right' },
                6: { align: 'right' }
            },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 0) {
                    const content = data.cell.raw || '';
                    if (/[^\x00-\x7F]/.test(content)) {
                        data.cell.styles.font = 'NotoSansSinhala';
                    } else {
                        data.cell.styles.font = 'helvetica';
                    }
                }
            }
        });
        doc.save(`Item_Profit_Report_${startDate}.pdf`);
        message.success('PDF downloaded!');
    };

    // Desktop table columns
    const columns = [
        {
            title: 'Item',
            key: 'item',
            width: 140,
            render: (_, r) => (
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-mono leading-none">{r.code}</span>
                    <span className="text-xs font-medium truncate">{r.name}</span>
                </div>
            )
        },
        {
            title: 'Sales',
            dataIndex: 'soldAmount',
            align: 'right',
            width: 85,
            render: (val, r) => (
                <div className="flex flex-col items-end leading-tight">
                    <span className="text-[11px] text-emerald-600">Rs.{Number(val).toLocaleString()}</span>
                    <span className="text-[9px] text-gray-400">({Number(r.soldQty || 0).toFixed(2)}kg)</span>
                </div>
            )
        },
        {
            title: 'Buying',
            dataIndex: 'boughtAmount',
            align: 'right',
            width: 85,
            render: (val, r) => (
                <div className="flex flex-col items-end leading-tight">
                    <span className="text-[11px] text-red-500">Rs.{Number(val).toLocaleString()}</span>
                    <span className="text-[9px] text-gray-400">({Number(r.boughtQty || 0).toFixed(2)}kg)</span>
                </div>
            )
        },
        {
            title: 'Net Profit',
            key: 'netProfit',
            align: 'right',
            width: 90,
            render: (_, r) => {
                const profit = (r.soldAmount || 0) - (r.boughtAmount || 0);
                return (
                    <span className={`text-[11px] font-bold ${profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        Rs.{profit.toLocaleString()}
                    </span>
                );
            }
        },
        {
            title: 'Avg Sale/kg',
            key: 'avgSale',
            align: 'right',
            width: 75,
            render: (_, r) => {
                const avg = r.soldQty > 0 ? (r.soldAmount / r.soldQty) : (r.masterSellPrice || 0);
                return <span className="text-[11px]">Rs.{avg.toFixed(2)}</span>;
            }
        },
        {
            title: 'Avg Buy/kg',
            key: 'avgBuy',
            align: 'right',
            width: 75,
            render: (_, r) => {
                const avg = r.boughtQty > 0 ? (r.boughtAmount / r.boughtQty) : (r.masterBuyPrice || 0);
                return <span className="text-[11px]">Rs.{avg.toFixed(2)}</span>;
            }
        },
        {
            title: 'Profit (Sold Amt)',
            key: 'calculatedProfit',
            align: 'right',
            width: 110,
            render: (_, r) => {
                const avgSale = r.soldQty > 0 ? (r.soldAmount / r.soldQty) : (r.masterSellPrice || 0);
                const avgBuy = r.boughtQty > 0 ? (r.boughtAmount / r.boughtQty) : (r.masterBuyPrice || 0);
                const profit = (avgSale - avgBuy) * (r.soldQty || 0);
                return (
                    <div className="flex flex-col items-end leading-tight">
                        <span className={`text-[11px] font-bold ${profit >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                            Rs.{profit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[9px] text-gray-400">({Number(r.soldQty || 0).toFixed(2)}kg)</span>
                    </div>
                );
            }
        }
    ];

    // Mobile Item Card
    const ItemCard = ({ item }) => {
        const avgSale = item.soldQty > 0 ? (item.soldAmount / item.soldQty) : (item.masterSellPrice || 0);
        const avgBuy = item.boughtQty > 0 ? (item.boughtAmount / item.boughtQty) : (item.masterBuyPrice || 0);
        const netProfit = (item.soldAmount || 0) - (item.boughtAmount || 0);
        const salesProfit = (avgSale - avgBuy) * (item.soldQty || 0);

        return (
            <div className="bg-white/50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                        <div className="text-[10px] text-gray-400 font-mono tracking-wide">{item.code}</div>
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{item.name}</div>
                    </div>
                    <div className="text-right">
                        <span className="text-[10px] text-gray-400 font-normal block uppercase">Net Profit</span>
                        <div className={`font-bold text-base ${netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                            Rs.{netProfit.toLocaleString()}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="bg-gray-50/50 dark:bg-black/20 rounded-lg p-2">
                        <span className="text-[9px] text-gray-400 uppercase block">Total Sales</span>
                        <div className="flex flex-col">
                            <span className="text-emerald-600 font-bold text-xs">Rs.{Number(item.soldAmount).toLocaleString()}</span>
                            <span className="text-[9px] text-gray-400">({Number(item.soldQty || 0).toFixed(2)}kg)</span>
                        </div>
                    </div>
                    <div className="bg-gray-50/50 dark:bg-black/20 rounded-lg p-2">
                        <span className="text-[9px] text-gray-400 uppercase block">Total Buying</span>
                        <div className="flex flex-col">
                            <span className="text-red-500 font-bold text-xs">Rs.{Number(item.boughtAmount).toLocaleString()}</span>
                            <span className="text-[9px] text-gray-400">({Number(item.boughtQty || 0).toFixed(2)}kg)</span>
                        </div>
                    </div>
                    <div className="bg-gray-50/50 dark:bg-black/20 rounded-lg p-2">
                        <span className="text-[9px] text-gray-400 uppercase block">Avg Sale</span>
                        <span className="text-gray-700 dark:text-gray-300 font-semibold text-xs">Rs.{avgSale.toFixed(2)}</span>
                    </div>
                    <div className="bg-gray-50/50 dark:bg-black/20 rounded-lg p-2">
                        <span className="text-[9px] text-gray-400 uppercase block">Avg Buy</span>
                        <span className="text-gray-700 dark:text-gray-300 font-semibold text-xs">Rs.{avgBuy.toFixed(2)}</span>
                    </div>
                </div>

                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-white/5 flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="text-[9px] text-gray-400 uppercase">Sold Qty</span>
                        <span className="text-gray-600 dark:text-gray-300 font-medium text-xs font-mono">{Number(item.soldQty || 0).toFixed(2)} kg</span>
                    </div>
                    <div className="text-right">
                        <span className="text-[9px] text-gray-400 uppercase block">Profit (Sold Amt)</span>
                        <span className={`text-sm font-bold ${salesProfit >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                            Rs.{salesProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                    </div>
                </div>
            </div>
        );
    };



    return (
        <div className="flex flex-col gap-4">
            {/* Filter Bar */}
            <CollapsibleReportFilters
                title="Filter Item Profit"
                activeFilterCount={selectedItems.length > 0 ? 1 : 0}
                onClear={() => setSelectedItems([])}
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

                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Period</div>
                <MobileDateRange
                    value={dateRange}
                    onChange={setDateRange}
                    className="w-full mb-4"
                />

                <div className="flex gap-2">
                    <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        onClick={fetchReport}
                        loading={loading}
                        className="bg-purple-600 hover:bg-purple-500 flex-1 h-10 text-sm font-medium rounded-xl border-none shadow-md shadow-purple-500/20"
                    >
                        Analyze Profit
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
                    <div className="text-5xl mb-4">💰</div>
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        No Item Profit Data Found
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                        No profit data for the selected date range. Try selecting a different period.
                    </p>
                </div>
            )}

            {/* Data Display */}
            {data.length > 0 && !loading && (
                <div className="animate-fade-in flex flex-col gap-4">
                    {/* Summary Card */}
                    {(() => {
                        const totalProfit = data.reduce((sum, item) => {
                            const avgSale = item.soldQty > 0 ? (item.soldAmount / item.soldQty) : (item.masterSellPrice || 0);
                            const avgBuy = item.boughtQty > 0 ? (item.boughtAmount / item.boughtQty) : (item.masterBuyPrice || 0);
                            return sum + ((avgSale - avgBuy) * (item.soldQty || 0));
                        }, 0);
                        return (
                            <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-5 text-white shadow-xl shadow-purple-500/20">
                                <div className="text-xs font-medium text-purple-100 uppercase tracking-wider mb-1">Total Net Profit (Sold Amt)</div>
                                <div className="text-3xl font-black tracking-tight flex items-baseline">
                                    <span className="text-lg font-bold opacity-80 mr-1">Rs.</span>
                                    {totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="mt-2 text-[10px] text-purple-200 bg-white/10 w-fit px-2 py-0.5 rounded-full border border-white/5">
                                    Based on {data.length} selected items
                                </div>
                            </div>
                        );
                    })()}

                    <div className="animate-fade-in">
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
                </div>
            )}
        </div>
    );
}
