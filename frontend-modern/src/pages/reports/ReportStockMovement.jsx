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
            tableHead = [['Code', 'Item', 'Type', 'Buy', 'Sell', 'Adj In', 'Adj Out', 'Others', 'Net']];
            tableBody = []; // Initialize tableBody here

            data.forEach(item => {
                const addRow = (type, prefix, netVal) => {
                    const othersVal = ((item[`${prefix}_Opening`] || 0) + (item[`${prefix}_TransferIn`] || 0) + (item[`${prefix}_StockTake`] || 0)) -
                        ((item[`${prefix}_Wastage`] || 0) + (item[`${prefix}_TransferOut`] || 0) + (item[`${prefix}_StockClear`] || 0));

                    tableBody.push([
                        item.code,
                        item.name,
                        type,
                        Number(item[`${prefix}_Buying`]).toFixed(1),
                        Number(item[`${prefix}_Selling`]).toFixed(1),
                        Number(item[`${prefix}_AdjIn`]).toFixed(1),
                        Number(item[`${prefix}_AdjOut`]).toFixed(1),
                        Number(othersVal).toFixed(1),
                        Number(netVal).toFixed(2)
                    ]);
                };
                addRow('Store 1', 'S1', item.netS1);
                addRow('Store 2', 'S2', item.netS2);
                addRow('Total', 'Total', item.netChange);
                // Add row for spacing/divider visually in PDF
                // Use a thin line or empty space
                // Here we just add an empty row, but we can style it in didParseCell
                tableBody.push(['', '', '', '', '', '', '', '', '']);
            });
        } else {
            tableHead = [['Code', 'Item', 'Buy', 'Sell', 'Adj In', 'Adj Out', 'Others', 'Net']];
            const prefix = selectedStore === '1' ? 'S1' : 'S2';
            const netKey = selectedStore === '1' ? 'netS1' : 'netS2';

            tableBody = [];
            data.forEach(item => {
                const othersVal = ((item[`${prefix}_Opening`] || 0) + (item[`${prefix}_TransferIn`] || 0) + (item[`${prefix}_StockTake`] || 0)) -
                    ((item[`${prefix}_Wastage`] || 0) + (item[`${prefix}_TransferOut`] || 0) + (item[`${prefix}_StockClear`] || 0));
                tableBody.push([
                    item.code,
                    item.name,
                    Number(item[`${prefix}_Buying`]).toFixed(1),
                    Number(item[`${prefix}_Selling`]).toFixed(1),
                    Number(item[`${prefix}_AdjIn`]).toFixed(1),
                    Number(item[`${prefix}_AdjOut`]).toFixed(1),
                    Number(othersVal).toFixed(1),
                    Number(item[netKey]).toFixed(2)
                ]);
                // Add spacer row for PDF
                tableBody.push(['', '', '', '', '', '', '', '']);
            });
        }

        autoTable(doc, {
            startY: 40,
            head: tableHead,
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246], font: 'helvetica', fontStyle: 'bold', fontSize: 7 },
            styles: { font: 'helvetica', fontSize: 7, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.1 },
            columnStyles: {
                1: { font: 'NotoSansSinhala' } // Item Name
            },
            didParseCell: function (data) {
                // Bold Total rows
                if (data.row.raw[2] === 'Total') {
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.fillColor = [240, 240, 240];
                    // Add bottom border to Total row
                    if (selectedStore === 'all') {
                        data.cell.styles.lineWidth = { bottom: 0.5, top: 0, left: 0.1, right: 0.1 };
                        data.cell.styles.lineColor = [0, 0, 0];
                    }
                }
                // Style spacer rows
                if (data.row.raw[0] === '') {
                    data.cell.styles.fillColor = [255, 255, 255];
                    data.cell.styles.cellPadding = 0;
                    data.cell.styles.minCellHeight = 2; // Small height for divider
                    data.cell.styles.lineWidth = 0; // No borders for spacer
                }
            }
        });

        doc.save(`Stock_Movement_${storeLabel.replace(' ', '_')}_${startDate}_${endDate}.pdf`);
        message.success('PDF downloaded!');
    };

    // Simplified Columns for PDF/Desktop that show breakdown
    const columns = [
        { title: 'Code', dataIndex: 'code', width: 60, fixed: 'left' },
        { title: 'Item', dataIndex: 'name', width: 120, ellipsis: true, fixed: 'left' },
        {
            title: 'Type',
            dataIndex: 'typeKey',
            width: 80,
            render: (val) => <span className="font-semibold text-xs text-gray-500">{val}</span>
        },
        {
            title: 'Buy',
            dataIndex: 'buying',
            align: 'right',
            width: 70,
            render: val => val ? <span className="text-emerald-600 text-xs font-medium">{Number(val).toFixed(1)}</span> : '-'
        },
        {
            title: 'Sell',
            dataIndex: 'selling',
            align: 'right',
            width: 70,
            render: val => val ? <span className="text-red-500 text-xs font-medium">{Number(val).toFixed(1)}</span> : '-'
        },
        {
            title: 'Adj In',
            dataIndex: 'adjIn',
            align: 'right',
            width: 70,
            render: val => val ? <span className="text-blue-500 text-xs">{Number(val).toFixed(1)}</span> : '-'
        },
        {
            title: 'Adj Out',
            dataIndex: 'adjOut',
            align: 'right',
            width: 70,
            render: val => val ? <span className="text-orange-500 text-xs">{Number(val).toFixed(1)}</span> : '-'
        },
        {
            title: 'Others',
            dataIndex: 'others',
            align: 'right',
            width: 70,
            render: val => val ? <span className="text-gray-600 text-xs">{Number(val).toFixed(1)}</span> : '-'
        },
        {
            title: 'Net',
            dataIndex: 'net',
            align: 'right',
            width: 80,
            fixed: 'right',
            render: val => (
                <span className={`font-bold text-xs ${val >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                    {val >= 0 ? '+' : ''}{Number(val).toFixed(2)}
                </span>
            )
        }
    ];

    // Prepare data for table: 1 item -> 1-3 rows depending on selection
    const tableData = React.useMemo(() => {
        if (!data) return [];
        let rows = [];
        data.forEach(item => {
            // Helper to calculate Others (Net of everything else)
            // Others In: Opening + TransferIn + StockTake
            // Others Out: Wastage + TransferOut + StockClear
            const calcOthers = (prefix) => {
                const i = (item[`${prefix}_Opening`] || 0) + (item[`${prefix}_TransferIn`] || 0) + (item[`${prefix}_StockTake`] || 0);
                const o = (item[`${prefix}_Wastage`] || 0) + (item[`${prefix}_TransferOut`] || 0) + (item[`${prefix}_StockClear`] || 0);
                return i - o;
            };

            const createRow = (typeKey, prefix, netVal) => ({
                key: `${item.id}-${typeKey}`,
                id: item.id,
                code: item.code,
                name: item.name,
                typeKey,
                buying: item[`${prefix}_Buying`],
                selling: item[`${prefix}_Selling`],
                adjIn: item[`${prefix}_AdjIn`],
                adjOut: item[`${prefix}_AdjOut`],
                others: calcOthers(prefix),
                net: netVal
            });

            if (selectedStore === 'all') {
                rows.push(createRow('Store 1', 'S1', item.netS1));
                rows.push(createRow('Store 2', 'S2', item.netS2));
                rows.push(createRow('Total', 'Total', item.netChange));
            } else if (selectedStore === '1') {
                rows.push(createRow('Store 1', 'S1', item.netS1));
            } else if (selectedStore === '2') {
                rows.push(createRow('Store 2', 'S2', item.netS2));
            }
        });
        return rows;
    }, [data, selectedStore]);

    // Mobile Item Card with detailed breakdown
    const ItemCard = ({ item }) => {
        // Determine the net value to display based on selection
        let displayNet = item.netChange;
        if (selectedStore === '1') displayNet = item.netS1;
        else if (selectedStore === '2') displayNet = item.netS2;

        // Helper to show breakdown row
        const BreakdownRow = ({ label, prefix, color }) => {
            const othersVal = ((item[`${prefix}Opening`] || 0) + (item[`${prefix}TransferIn`] || 0) + (item[`${prefix}StockTake`] || 0)) -
                ((item[`${prefix}Wastage`] || 0) + (item[`${prefix}TransferOut`] || 0) + (item[`${prefix}StockClear`] || 0));

            return (
                <div className={`flex flex-col ${color} rounded-lg p-2 mb-2`}>
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-semibold">{label}</span>
                        <span className="text-xs font-bold">
                            Net: {Number(item[`net${prefix.replace('_', '')}`] !== undefined ? item[`net${prefix.replace('_', '')}`] : item.netChange).toFixed(1)}
                        </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-[10px]">
                        <span className="text-emerald-600">Buy: {Number(item[`${prefix}Buying`]).toFixed(1)}</span>
                        <span className="text-red-500">Sell: {Number(item[`${prefix}Selling`]).toFixed(1)}</span>
                        <span className="text-blue-500">AdjIn: {Number(item[`${prefix}AdjIn`]).toFixed(1)}</span>
                        <span className="text-orange-500">AdjOut: {Number(item[`${prefix}AdjOut`]).toFixed(1)}</span>
                        <span className="text-gray-500">Other: {Number(othersVal).toFixed(1)}</span>
                    </div>
                </div>
            );
        };

        return (
            <div className="bg-white/50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/5 shadow-sm mb-4 border-b-4 border-b-gray-200 dark:border-b-gray-700">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0 pr-2">
                        <div className="text-[10px] text-gray-400 font-mono tracking-wide">{item.code}</div>
                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">{item.name}</div>
                    </div>
                    <div className={`text-right font-bold text-base ${displayNet >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>
                        <span className="text-[10px] text-gray-400 font-normal block">Net Change</span>
                        {displayNet >= 0 ? '+' : ''}{Number(displayNet).toFixed(2)}
                    </div>
                </div>

                {selectedStore === 'all' ? (
                    <>
                        <BreakdownRow label="🏪 Store 1" prefix="S1_" color="bg-blue-50/50 dark:bg-blue-900/10" />
                        <BreakdownRow label="🏪 Store 2" prefix="S2_" color="bg-purple-50/50 dark:bg-purple-900/10" />
                    </>
                ) : (
                    <div className="grid grid-cols-3 gap-2 text-xs bg-gray-50 dark:bg-black/20 rounded-lg p-2">
                        <div className="flex flex-col"><span className="text-gray-400">Buy</span><span className="text-emerald-600">{Number(item[`${selectedStore === '1' ? 'S1' : 'S2'}_Buying`]).toFixed(1)}</span></div>
                        <div className="flex flex-col"><span className="text-gray-400">Sell</span><span className="text-red-500">{Number(item[`${selectedStore === '1' ? 'S1' : 'S2'}_Selling`]).toFixed(1)}</span></div>
                        <div className="flex flex-col">
                            <span className="text-gray-400">Others</span>
                            <span className="text-blue-500">
                                {Number(((item[`${selectedStore === '1' ? 'S1' : 'S2'}_Opening`] || 0) + (item[`${selectedStore === '1' ? 'S1' : 'S2'}_TransferIn`] || 0) + (item[`${selectedStore === '1' ? 'S1' : 'S2'}_StockTake`] || 0)) -
                                    ((item[`${selectedStore === '1' ? 'S1' : 'S2'}_Wastage`] || 0) + (item[`${selectedStore === '1' ? 'S1' : 'S2'}_TransferOut`] || 0) + (item[`${selectedStore === '1' ? 'S1' : 'S2'}_StockClear`] || 0))).toFixed(1)}
                            </span>
                        </div>
                        <div className="flex flex-col"><span className="text-gray-400">Adj In</span><span className="text-blue-600">{Number(item[`${selectedStore === '1' ? 'S1' : 'S2'}_AdjIn`]).toFixed(1)}</span></div>
                        <div className="flex flex-col"><span className="text-gray-400">Adj Out</span><span className="text-orange-500">{Number(item[`${selectedStore === '1' ? 'S1' : 'S2'}_AdjOut`]).toFixed(1)}</span></div>
                    </div>
                )}
            </div>
        );
    };

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
                    {/* Main Report Content */}
                    <div className="hidden md:block">
                        <div className="glass-card rounded-xl p-3 overflow-hidden">
                            <Table
                                dataSource={tableData}
                                columns={columns}
                                rowKey="key"
                                size="small"
                                pagination={{ pageSize: 45, size: 'small' }} // 15 items * 3 rows = 45
                                scroll={{ x: 800 }}
                                onRow={(record) => {
                                    if (record.typeKey === 'Total') return { className: 'bg-gray-50 font-semibold border-b-2 border-gray-300 dark:border-gray-600' };
                                    return { className: 'border-b border-gray-100 dark:border-gray-800' };
                                }}
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
