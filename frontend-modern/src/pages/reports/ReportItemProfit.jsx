import React, { useState, useEffect } from 'react';
import { DatePicker, Button, Table, Select, message, Spin } from 'antd';
import { FilePdfOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { registerSinhalaFont } from '../../fonts/sinhalaFont';

const { RangePicker } = DatePicker;
const { Option } = Select;

export default function ReportItemProfit() {
    const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
    const [selectedItems, setSelectedItems] = useState([]);
    const [allItems, setAllItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);

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

        const tableBody = data.map(item => [
            item.code || '-',
            item.name || '-',
            Number(item.soldQty || 0).toFixed(2),
            Number(item.soldAmount).toFixed(2),
            Number(item.boughtAmount).toFixed(2),
            Number(item.profit).toFixed(2)
        ]);

        autoTable(doc, {
            startY: 40,
            head: [['Code', 'Item Name', 'Sold Qty', 'Sales', 'Buying', 'Profit']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [147, 51, 234], font: 'helvetica', fontStyle: 'bold' },
            styles: { font: 'helvetica', fontSize: 9 },
            columnStyles: { 1: { font: 'NotoSansSinhala' } }
        });

        doc.save(`Item_Profit_Report_${startDate}.pdf`);
        message.success('PDF downloaded!');
    };

    // Desktop table columns
    const columns = [
        { title: 'Code', dataIndex: 'code', width: 80 },
        { title: 'Item Name', dataIndex: 'name', width: 140, ellipsis: true },
        { title: 'Qty', dataIndex: 'soldQty', align: 'center', width: 60, render: val => val ? Number(val).toFixed(2) : '-' },
        {
            title: 'Sales',
            dataIndex: 'soldAmount',
            align: 'right',
            width: 90,
            render: val => <span className="text-xs text-emerald-600">Rs.{Number(val).toLocaleString()}</span>
        },
        {
            title: 'Buying',
            dataIndex: 'boughtAmount',
            align: 'right',
            width: 90,
            render: val => <span className="text-xs text-red-500">Rs.{Number(val).toLocaleString()}</span>
        },
        {
            title: 'Profit',
            dataIndex: 'profit',
            align: 'right',
            width: 90,
            render: val => (
                <span className={`text-xs font-bold ${val >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    Rs.{Number(val).toLocaleString()}
                </span>
            )
        }
    ];

    // Mobile Item Card
    const ItemCard = ({ item }) => (
        <div className="bg-white/50 dark:bg-white/5 rounded-lg p-3">
            <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-400">{item.code}</div>
                    <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</div>
                </div>
                <div className={`text-right font-bold ${item.profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    Rs.{Number(item.profit).toLocaleString()}
                </div>
            </div>
            <div className="flex justify-between text-[11px]">
                <div className="flex gap-3">
                    <span className="text-emerald-600">Sales: {Number(item.soldAmount).toLocaleString()}</span>
                    <span className="text-red-500">Cost: {Number(item.boughtAmount).toLocaleString()}</span>
                </div>
                {item.soldQty && <span className="text-gray-400">Qty: {Number(item.soldQty).toFixed(2)}</span>}
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-3">
            {/* Filter Bar */}
            <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-2">Filter Items (Optional)</div>
                <Select
                    mode="multiple"
                    placeholder="All Items"
                    value={selectedItems}
                    onChange={setSelectedItems}
                    className="w-full mb-3"
                    optionFilterProp="children"
                    maxTagCount={2}
                >
                    {allItems.map(item => (
                        <Option key={item.ITEM_ID} value={item.ITEM_ID}>{item.NAME}</Option>
                    ))}
                </Select>

                <div className="text-xs text-gray-500 mb-2">Period</div>
                <RangePicker
                    value={dateRange}
                    onChange={setDateRange}
                    className="w-full mb-3"
                    format="YYYY-MM-DD"
                />

                <div className="flex gap-2">
                    <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        onClick={fetchReport}
                        loading={loading}
                        className="bg-purple-600 hover:bg-purple-500 flex-1"
                    >
                        Analyze
                    </Button>
                    {data.length > 0 && (
                        <Button icon={<FilePdfOutlined />} onClick={generatePDF} danger>
                            PDF
                        </Button>
                    )}
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex justify-center py-10">
                    <Spin size="large" />
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
                                scroll={{ x: 600 }}
                            />
                        </div>
                    </div>

                    {/* Mobile: Card List */}
                    <div className="md:hidden">
                        <div className="text-xs text-gray-500 mb-2">
                            Items ({data.length})
                        </div>
                        <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto pr-1">
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
