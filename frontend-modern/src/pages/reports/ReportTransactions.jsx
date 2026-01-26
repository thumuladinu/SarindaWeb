import React, { useState } from 'react';
import { DatePicker, Button, Table, Tag, message, Spin } from 'antd';
import { FilePdfOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import MobileDateRange from '../../components/common/MobileDateRange';
import CollapsibleReportFilters from '../../components/common/CollapsibleReportFilters';

const { RangePicker } = DatePicker;

export default function ReportTransactions() {
    const [dateRange, setDateRange] = useState([dayjs().startOf('month'), dayjs().endOf('month')]);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);

    const fetchReport = async () => {
        if (!dateRange) {
            message.error("Please select a date range");
            return;
        }
        setLoading(true);
        setHasSearched(true);
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

    // Mobile TransactionCard
    const TransactionCard = ({ item }) => (
        <div className="bg-white/50 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/5 shadow-sm flex items-center justify-between">
            <div className="flex-1 min-w-0 pr-3">
                <div className="flex items-center gap-2 mb-1">
                    <Tag
                        color={item.TYPE === 'Selling' ? 'success' : item.TYPE === 'Buying' ? 'error' : 'warning'}
                        className="text-[10px] m-0 font-bold px-1.5 py-0.5"
                    >
                        {item.TYPE === 'Selling' ? 'IN' : item.TYPE === 'Buying' ? 'OUT' : 'EXP'}
                    </Tag>
                    <span className="text-[10px] text-gray-400">{dayjs(item.CREATED_DATE).format('MMM DD, HH:mm')}</span>
                </div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate font-mono tracking-wide">
                    {item.CODE}
                </div>
                {item.C_NAME && (
                    <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                        👤 {item.C_NAME}
                    </div>
                )}
            </div>
            <div className={`text-right font-bold text-base ${item.TYPE === 'Selling' ? 'text-emerald-600' : 'text-red-500'}`}>
                {item.TYPE === 'Selling' ? '+' : '-'}Rs.{Number(item.SUB_TOTAL).toFixed(0)}
            </div>
        </div>
    );



    return (
        <div className="flex flex-col gap-4">
            {/* Filter Bar */}
            <CollapsibleReportFilters
                title="Filter Transactions"
                activeFilterCount={dateRange ? 1 : 0}
                onClear={() => setDateRange([dayjs().startOf('month'), dayjs().endOf('month')])}
                defaultCollapsed={false}
            >
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select Period</div>
                <MobileDateRange
                    value={dateRange}
                    onChange={setDateRange}
                    className="w-full mb-4"
                />
                <div className="flex gap-3">
                    <Button
                        type="primary"
                        icon={<SearchOutlined />}
                        onClick={fetchReport}
                        loading={loading}
                        className="bg-emerald-600 hover:bg-emerald-500 flex-1 h-10 text-sm font-medium rounded-xl border-none shadow-md shadow-emerald-500/20"
                    >
                        Generate Report
                    </Button>
                    {data && (
                        <Button
                            icon={<FilePdfOutlined />}
                            onClick={generatePDF}
                            danger
                            className="h-10 w-12 flex items-center justify-center rounded-xl"
                        />
                    )}
                </div>
            </CollapsibleReportFilters>

            {/* Loading State */}
            {loading && (
                <div className="flex justify-center py-10">
                    <Spin size="large" />
                </div>
            )}

            {/* Empty State */}
            {!loading && hasSearched && (!data || data.details?.length === 0) && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="text-5xl mb-4">📊</div>
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        No Transactions Found
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                        No transactions for the selected date range. Try selecting a different period.
                    </p>
                </div>
            )}

            {/* Data Display */}
            {data && data.details?.length > 0 && !loading && (
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
                        <div className="flex flex-col gap-2">
                            {data.details.map((item, index) => (
                                <TransactionCard key={item.TRANSACTION_ID || index} item={item} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
