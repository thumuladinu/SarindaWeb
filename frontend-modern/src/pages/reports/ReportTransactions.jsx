import React, { useState } from 'react';
import { DatePicker, Button, Table, Tag, message, Spin } from 'antd';
import { FilePdfOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const { RangePicker } = DatePicker;

export default function ReportTransactions() {
    const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);

    const fetchReport = async () => {
        if (!dateRange) {
            message.error("Please select a date range");
            return;
        }
        setLoading(true);
        try {
            const response = await axios.post('/api/reports/transactions', {
                startDate: dateRange[0].format('YYYY-MM-DD'),
                endDate: dateRange[1].format('YYYY-MM-DD')
            });
            if (response.data.success) {
                setData(response.data);
            }
        } catch (error) {
            console.error("Error fetching report:", error);
            message.error("Failed to generate report");
        } finally {
            setLoading(false);
        }
    };

    const generatePDF = () => {
        if (!data) return;

        const doc = new jsPDF();
        const startDate = dateRange[0].format('YYYY-MM-DD');
        const endDate = dateRange[1].format('YYYY-MM-DD');

        doc.setFontSize(18);
        doc.text("Transaction Report", 14, 20);

        doc.setFontSize(10);
        doc.text(`Period: ${startDate} to ${endDate}`, 14, 28);
        doc.text(`Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`, 14, 33);

        doc.setFontSize(12);
        doc.text("Financial Summary", 14, 45);

        autoTable(doc, {
            startY: 50,
            head: [['Category', 'Amount (Rs.)']],
            body: [
                ['Total Income (Selling)', Number(data.summary.income).toFixed(2)],
                ['Total Outgoing (Buying)', Number(data.summary.buying).toFixed(2)],
                ['Expenses', Number(data.summary.expenses).toFixed(2)],
                ['Net Profit / Loss', Number(data.summary.net).toFixed(2)]
            ],
            theme: 'grid',
            headStyles: { fillColor: [22, 163, 74] }
        });

        doc.text("Detailed Transactions", 14, doc.lastAutoTable.finalY + 15);

        const tableBody = data.details.map(item => [
            dayjs(item.CREATED_DATE).format('YYYY-MM-DD HH:mm'),
            item.CODE,
            item.TYPE,
            item.C_NAME || '-',
            Number(item.SUB_TOTAL).toFixed(2)
        ]);

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 20,
            head: [['Date', 'Code', 'Type', 'Customer', 'Amount']],
            body: tableBody,
            theme: 'striped',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [41, 128, 185] }
        });

        doc.save(`Transaction_Report_${startDate}_${endDate}.pdf`);
        message.success('PDF downloaded!');
    };

    // Desktop table columns
    const columns = [
        {
            title: 'Date',
            dataIndex: 'CREATED_DATE',
            width: 120,
            render: d => dayjs(d).format('MM-DD HH:mm')
        },
        { title: 'Code', dataIndex: 'CODE', width: 120, ellipsis: true },
        {
            title: 'Type',
            dataIndex: 'TYPE',
            width: 80,
            render: type => (
                <Tag color={type === 'Selling' ? 'success' : type === 'Buying' ? 'error' : 'warning'} className="text-xs">
                    {type === 'Selling' ? 'Income' : type === 'Buying' ? 'Buying' : 'Expense'}
                </Tag>
            )
        },
        { title: 'Customer', dataIndex: 'C_NAME', width: 120, ellipsis: true },
        {
            title: 'Amount',
            dataIndex: 'SUB_TOTAL',
            align: 'right',
            width: 100,
            render: (val, record) => (
                <span className={`text-sm font-bold ${record.TYPE === 'Selling' ? 'text-emerald-600' : 'text-red-500'}`}>
                    Rs.{Number(val).toFixed(0)}
                </span>
            )
        }
    ];

    // Stat Card Component
    const StatCard = ({ label, value, bgClass, textClass }) => (
        <div className={`${bgClass} p-3 rounded-lg flex-1 min-w-0`}>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">{label}</div>
            <div className={`text-lg font-bold ${textClass} truncate`}>
                {Number(value).toLocaleString()}
            </div>
        </div>
    );

    // Mobile Transaction Card
    const TransactionCard = ({ item }) => (
        <div className="flex items-center justify-between p-3 bg-white/50 dark:bg-white/5 rounded-lg">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <Tag
                        color={item.TYPE === 'Selling' ? 'success' : item.TYPE === 'Buying' ? 'error' : 'warning'}
                        className="text-[10px] m-0"
                    >
                        {item.TYPE === 'Selling' ? 'IN' : item.TYPE === 'Buying' ? 'OUT' : 'EXP'}
                    </Tag>
                    <span className="text-xs text-gray-500">{dayjs(item.CREATED_DATE).format('MM-DD HH:mm')}</span>
                </div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate mt-1">
                    {item.CODE}
                </div>
            </div>
            <div className={`text-right font-bold ${item.TYPE === 'Selling' ? 'text-emerald-600' : 'text-red-500'}`}>
                {item.TYPE === 'Selling' ? '+' : '-'}Rs.{Number(item.SUB_TOTAL).toFixed(0)}
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-3">
            {/* Filter Bar - Same for mobile and desktop */}
            <div className="bg-gray-50 dark:bg-white/5 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-2">Select Period</div>
                <RangePicker
                    value={dateRange}
                    onChange={setDateRange}
                    className="w-full mb-3"
                    format="YYYY-MM-DD"
                    size="middle"
                />
                <div className="flex gap-2">
                    <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        onClick={fetchReport}
                        loading={loading}
                        className="bg-emerald-600 hover:bg-emerald-500 flex-1"
                    >
                        Generate
                    </Button>
                    {data && (
                        <Button
                            icon={<FilePdfOutlined />}
                            onClick={generatePDF}
                            danger
                        >
                            PDF
                        </Button>
                    )}
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex justify-center py-10">
                    <Spin size="large" />
                </div>
            )}

            {/* Data Display */}
            {data && !loading && (
                <div className="flex flex-col gap-3 animate-fade-in">
                    {/* Stats - 2x2 Grid on Mobile */}
                    <div className="grid grid-cols-2 gap-2">
                        <StatCard
                            label="Income"
                            value={data.summary.income}
                            bgClass="bg-emerald-50 dark:bg-emerald-900/20"
                            textClass="text-emerald-600"
                        />
                        <StatCard
                            label="Buying"
                            value={data.summary.buying}
                            bgClass="bg-red-50 dark:bg-red-900/20"
                            textClass="text-red-500"
                        />
                        <StatCard
                            label="Expense"
                            value={data.summary.expenses}
                            bgClass="bg-orange-50 dark:bg-orange-900/20"
                            textClass="text-orange-500"
                        />
                        <StatCard
                            label="Net P/L"
                            value={data.summary.net}
                            bgClass={data.summary.net >= 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-red-100 dark:bg-red-900/30"}
                            textClass={data.summary.net >= 0 ? "text-blue-600" : "text-red-600"}
                        />
                    </div>

                    {/* Desktop: Table View */}
                    <div className="hidden md:block">
                        <div className="glass-card rounded-xl p-3 overflow-hidden">
                            <Table
                                dataSource={data.details}
                                columns={columns}
                                rowKey="TRANSACTION_ID"
                                size="small"
                                pagination={{ pageSize: 10, size: 'small' }}
                                scroll={{ x: 500 }}
                            />
                        </div>
                    </div>

                    {/* Mobile: Card List View */}
                    <div className="md:hidden">
                        <div className="text-xs text-gray-500 mb-2 flex justify-between items-center">
                            <span>Transactions ({data.details.length})</span>
                        </div>
                        <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto pr-1">
                            {data.details.slice(0, 20).map((item, index) => (
                                <TransactionCard key={item.TRANSACTION_ID || index} item={item} />
                            ))}
                            {data.details.length > 20 && (
                                <div className="text-center text-xs text-gray-400 py-2">
                                    + {data.details.length - 20} more (Download PDF for full list)
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
