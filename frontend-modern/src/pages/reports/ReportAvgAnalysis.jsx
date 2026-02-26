import React, { useState, useEffect } from 'react';
import { DatePicker, Button, Table, Select, message, Spin } from 'antd';
import { FilePdfOutlined, BarChartOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { registerSinhalaFont } from '../../fonts/sinhalaFont';
import MobileDateRange from '../../components/common/MobileDateRange';
import CollapsibleReportFilters from '../../components/common/CollapsibleReportFilters';

const { RangePicker } = DatePicker;
const { Option } = Select;

export default function ReportAvgAnalysis() {
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
            const response = await axios.post('/api/reports/averages', {
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
        doc.text("Average Price Analysis Report", 14, 20);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Period: ${startDate} to ${endDate}`, 14, 28);
        doc.text(`Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`, 14, 33);

        const tableBody = data.map(item => [
            item.code || '-',
            item.name || '-',
            Number(item.avgBuyPrice).toFixed(2),
            Number(item.avgSellPrice).toFixed(2),
            Number(item.avgSellPrice - item.avgBuyPrice).toFixed(2)
        ]);

        autoTable(doc, {
            startY: 40,
            head: [['Code', 'Item Name', 'Avg Buy', 'Avg Sell', 'Margin']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [249, 115, 22], font: 'helvetica', fontStyle: 'bold' },
            styles: { font: 'helvetica', fontSize: 9 },
            columnStyles: { 1: { font: 'NotoSansSinhala' } }
        });

        doc.save(`Avg_Price_Analysis_${startDate}.pdf`);
        message.success('PDF downloaded!');
    };

    // Desktop table columns
    const columns = [
        { title: 'Code', dataIndex: 'code', width: 80 },
        { title: 'Item Name', dataIndex: 'name', width: 150, ellipsis: true },
        {
            title: 'Avg Buy',
            dataIndex: 'avgBuyPrice',
            align: 'right',
            width: 90,
            render: val => <span className="text-red-500">Rs.{Number(val).toFixed(2)}</span>
        },
        {
            title: 'Avg Sell',
            dataIndex: 'avgSellPrice',
            align: 'right',
            width: 90,
            render: val => <span className="text-emerald-600">Rs.{Number(val).toFixed(2)}</span>
        },
        {
            title: 'Margin',
            key: 'margin',
            align: 'right',
            width: 80,
            render: (_, r) => {
                const margin = r.avgSellPrice - r.avgBuyPrice;
                return <span className={`font-bold ${margin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>Rs.{margin.toFixed(2)}</span>;
            }
        }
    ];

    // Mobile Item Card
    const ItemCard = ({ item }) => {
        const margin = item.avgSellPrice - item.avgBuyPrice;
        return (
            <div className="bg-white/50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/5 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                        <div className="text-[10px] text-gray-400 font-mono tracking-wide">{item.code}</div>
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{item.name}</div>
                    </div>
                    <div className={`text-right font-bold text-base ${margin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        <span className="text-[10px] text-gray-400 font-normal block">Margin</span>
                        Rs.{margin.toFixed(2)}
                    </div>
                </div>
                <div className="flex items-center justify-between text-xs bg-gray-50 dark:bg-black/20 rounded-lg p-2 mt-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-400">Avg Buy</span>
                        <span className="text-red-500 font-medium">Rs.{Number(item.avgBuyPrice).toFixed(2)}</span>
                    </div>
                    <div className="h-6 w-px bg-gray-200 dark:bg-white/10 mx-2"></div>
                    <div className="flex flex-col text-right">
                        <span className="text-[10px] text-gray-400">Avg Sell</span>
                        <span className="text-emerald-600 font-medium">Rs.{Number(item.avgSellPrice).toFixed(2)}</span>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Filter Bar */}
            {/* Filter Bar */}
            <CollapsibleReportFilters
                title="Filter Average Analysis"
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
                        icon={<BarChartOutlined />}
                        onClick={fetchReport}
                        loading={loading}
                        className="bg-orange-500 hover:bg-orange-600 flex-1 h-10 text-sm font-medium rounded-xl border-none shadow-md shadow-orange-500/20"
                    >
                        Analyze Averages
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
                    <div className="text-5xl mb-4">📈</div>
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        No Average Price Data Found
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                        No price data for the selected date range. Try selecting a different period.
                    </p>
                </div>
            )}

            {/* Data Display */}
            {data.length > 0 && !loading && (
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
                                scroll={{ x: 500 }}
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
