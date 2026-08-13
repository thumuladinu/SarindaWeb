import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Table, Button, Space, Tag, message, Typography, Popconfirm, 
    Tooltip, Drawer, Modal, DatePicker, Input, Select, Card, Row, Col, Tabs, Badge 
} from 'antd';
import { 
    PlusOutlined, PrinterOutlined, EditOutlined, FileTextOutlined, 
    CheckCircleOutlined, SyncOutlined, DeleteOutlined, SendOutlined, 
    SearchOutlined, EyeOutlined, CarOutlined, HistoryOutlined, FormOutlined, BarcodeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import db from '../../services/db';
import syncService from '../../services/syncService';
import printService from '../../services/printService';

import AddSaleForm from './AddSaleForm';
import SettleSaleForm from './SettleSaleForm';
import ViewSaleModal from './ViewSaleModal';
import PrintableBill from './PrintableBill';
import CreateDispatchModal from './CreateDispatchModal';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function Sales() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('create');
    const [sales, setSales] = useState([]);
    const [filteredSales, setFilteredSales] = useState([]);
    const [loading, setLoading] = useState(false);

    // Filters for history tab
    const [searchText, setSearchText] = useState('');
    const [dateRange, setDateRange] = useState(null);
    const [statusFilter, setStatusFilter] = useState('ALL');

    // Selection for Dispatch Notes
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [selectedRows, setSelectedRows] = useState([]);

    // Drawers & Modals
    const [settleDrawerVisible, setSettleDrawerVisible] = useState(false);
    const [viewModalVisible, setViewModalVisible] = useState(false);
    const [printModalVisible, setPrintModalVisible] = useState(false);
    const [dispatchModalVisible, setDispatchModalVisible] = useState(false);

    const [selectedSale, setSelectedSale] = useState(null);

    useEffect(() => {
        loadSales();
        const unsub = syncService.subscribe((event) => {
            if (event === 'salesUpdated' || event === 'syncComplete') {
                loadSales();
            }
        });
        return unsub;
    }, []);

    const loadSales = async () => {
        try {
            setLoading(true);
            const bills = await db.sales_bills.orderBy('DATE').reverse().toArray();
            setSales(bills || []);
            setFilteredSales(bills || []);
        } catch (e) {
            console.error('Error loading sales:', e);
        } finally {
            setLoading(false);
        }
    };

    // Filter Logic for Tab 2
    useEffect(() => {
        let temp = [...sales];

        if (statusFilter !== 'ALL') {
            if (statusFilter === 'SETTLED') {
                temp = temp.filter(s => s.IS_SETTLED === 1);
            } else if (statusFilter === 'DISPATCH') {
                temp = temp.filter(s => !!s.DISPATCH_ID);
            } else if (statusFilter === 'PENDING') {
                temp = temp.filter(s => !s.IS_SETTLED && !s.DISPATCH_ID);
            }
        }

        if (dateRange && dateRange[0] && dateRange[1]) {
            const start = dateRange[0].startOf('day');
            const end = dateRange[1].endOf('day');
            temp = temp.filter(s => {
                const saleDate = dayjs(s.DATE || s.CREATED_DATE);
                return (saleDate.isAfter(start) || saleDate.isSame(start, 'day')) &&
                       (saleDate.isBefore(end) || saleDate.isSame(end, 'day'));
            });
        }

        if (searchText.trim()) {
            const query = searchText.toLowerCase();
            temp = temp.filter(s =>
                s.INVOICE_NO?.toLowerCase().includes(query) ||
                s.CUSTOMER_NAME?.toLowerCase().includes(query) ||
                s.BATCH_NO?.toLowerCase().includes(query)
            );
        }

        setFilteredSales(temp);
    }, [searchText, dateRange, statusFilter, sales]);

    const handleDelete = async (record) => {
        try {
            await db.sales_bills.delete(record.LOCAL_ID);
            message.success('Sale deleted successfully');
            loadSales();
        } catch (e) {
            message.error('Failed to delete sale');
        }
    };

    const handlePrintClick = (record) => {
        if (printService.isAutoPrintEnabled()) {
            printService.printBill(record);
            message.success(`Auto-printing bill #${record.INVOICE_NO} to ${printService.getBillPrinter() || 'Default A5 Bill Printer'}...`);
        } else {
            setSelectedSale(record);
            setPrintModalVisible(true);
        }
    };

    const handleViewClick = (record) => {
        setSelectedSale(record);
        setViewModalVisible(true);
    };

    const handleSettleClick = (record) => {
        setSelectedSale(record);
        setSettleDrawerVisible(true);
    };

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys, rows) => {
            setSelectedRowKeys(keys);
            setSelectedRows(rows);
        },
        getCheckboxProps: (record) => ({
            disabled: record.IS_SETTLED === 1 || !!record.DISPATCH_ID,
        }),
    };

    const columns = [
        {
            title: 'Status',
            key: 'status',
            width: 110,
            render: (_, r) => {
                if (r.IS_SETTLED === 1) return <Tag color="success">SETTLED</Tag>;
                if (r.DISPATCH_ID) return <Tag color="processing">DISPATCH</Tag>;
                return <Tag color="warning">PENDING</Tag>;
            }
        },
        {
            title: 'Invoice / Ref',
            dataIndex: 'INVOICE_NO',
            key: 'INVOICE_NO',
            render: (val, r) => (
                <div>
                    <strong className="font-mono text-blue-900">{val || `BILL-${r.LOCAL_ID}`}</strong>
                    {!r.IS_SYNCED && <Tag color="volcano" className="ml-1 text-[10px]">Offline</Tag>}
                    {r.BATCH_NO && <div className="text-[11px] text-gray-500 font-mono">Batch: {r.BATCH_NO}</div>}
                </div>
            )
        },
        {
            title: 'Date',
            dataIndex: 'DATE',
            key: 'DATE',
            width: 110,
            render: val => <span className="text-xs text-gray-600">{dayjs(val).format('YYYY-MM-DD')}</span>
        },
        {
            title: 'Customer',
            dataIndex: 'CUSTOMER_NAME',
            key: 'CUSTOMER_NAME',
            render: (val, r) => (
                <div>
                    <strong className="text-slate-800">{val || 'Walk-in Customer'}</strong>
                    {r.CUSTOMER_PHONE && <span className="text-xs text-gray-500 block">{r.CUSTOMER_PHONE}</span>}
                </div>
            )
        },
        {
            title: 'Amount (Rs)',
            key: 'amount',
            align: 'right',
            render: (_, r) => {
                const total = Number(r.FINAL_AMOUNT || r.NET_AMOUNT || r.TOTAL_AMOUNT || 0);
                return (
                    <div>
                        <span className="font-mono font-bold text-slate-900">
                            Rs. {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        {r.DISCOUNT > 0 && <span className="text-[10px] text-emerald-600 block">Disc: -{r.DISCOUNT}</span>}
                    </div>
                );
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            width: 180,
            render: (_, r) => (
                <Space size="small">
                    <Tooltip title="Print Bag Labels">
                        <Button size="small" icon={<BarcodeOutlined />} onClick={() => navigate(`/labels?billId=${r.BILL_ID || r.LOCAL_ID}`)} />
                    </Tooltip>
                    <Tooltip title="View Details">
                        <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewClick(r)} />
                    </Tooltip>
                    <Tooltip title="Print Official Bill">
                        <Button size="small" icon={<PrinterOutlined />} onClick={() => handlePrintClick(r)} />
                    </Tooltip>
                    {!r.IS_SETTLED ? (
                        <Tooltip title="Settle Bill (Add Handwritten Extras)">
                            <Button 
                                size="small" 
                                type="primary" 
                                className="!bg-emerald-600" 
                                icon={<CheckCircleOutlined />} 
                                onClick={() => handleSettleClick(r)} 
                            >
                                Settle
                            </Button>
                        </Tooltip>
                    ) : null}
                    <Popconfirm title="Delete this sale bill?" onConfirm={() => handleDelete(r)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const tabItems = [
        {
            key: 'create',
            label: (
                <span className="font-bold text-sm flex items-center gap-2 px-2 py-1">
                    <FormOutlined className="text-blue-600" />
                    Create Printed Bill
                </span>
            ),
            children: (
                <div className="pt-2">
                    <AddSaleForm
                        onBillCreated={() => {
                            loadSales();
                        }}
                        onPrintBill={(bill) => {
                            if (printService.isAutoPrintEnabled()) {
                                printService.printBill(bill, { forceSilent: true });
                            } else {
                                setSelectedSale(bill);
                                setPrintModalVisible(true);
                            }
                        }}
                    />
                </div>
            )
        },
        {
            key: 'history',
            label: (
                <span className="font-bold text-sm flex items-center gap-2 px-2 py-1">
                    <HistoryOutlined className="text-slate-600" />
                    Recent Bills & Dispatch
                    <Badge count={sales.length} overflowCount={999} className="ml-1" />
                </span>
            ),
            children: (
                <div className="space-y-4 pt-2">
                    {/* Top Action Bar if Selected */}
                    {selectedRowKeys.length > 0 && (
                        <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-xl flex justify-between items-center animate-fade-in">
                            <span className="text-xs font-bold text-indigo-900">
                                🚚 {selectedRowKeys.length} Bills Selected for Lorry Dispatch
                            </span>
                            <Button
                                type="primary"
                                icon={<CarOutlined />}
                                onClick={() => setDispatchModalVisible(true)}
                                className="!bg-indigo-600 font-bold shadow-md"
                            >
                                Generate Dispatch Note ({selectedRowKeys.length})
                            </Button>
                        </div>
                    )}

                    {/* Filter Bar */}
                    <Card className="officer-card !p-3">
                        <Row gutter={[12, 12]} align="middle">
                            <Col xs={24} sm={8}>
                                <Input
                                    placeholder="Search Invoice, Customer, Batch..."
                                    prefix={<SearchOutlined className="text-gray-400" />}
                                    value={searchText}
                                    onChange={e => setSearchText(e.target.value)}
                                    allowClear
                                />
                            </Col>
                            <Col xs={12} sm={8}>
                                <RangePicker 
                                    className="w-full" 
                                    value={dateRange} 
                                    onChange={v => setDateRange(v)} 
                                />
                            </Col>
                            <Col xs={12} sm={4}>
                                <Select 
                                    value={statusFilter} 
                                    onChange={setStatusFilter} 
                                    className="w-full"
                                >
                                    <Select.Option value="ALL">All Statuses</Select.Option>
                                    <Select.Option value="PENDING">Pending (Ready for Dispatch)</Select.Option>
                                    <Select.Option value="DISPATCH">In Dispatch</Select.Option>
                                    <Select.Option value="SETTLED">Settled & Paid</Select.Option>
                                </Select>
                            </Col>
                            <Col xs={24} sm={4} className="text-right">
                                <Button icon={<SyncOutlined />} onClick={loadSales}>Refresh</Button>
                            </Col>
                        </Row>
                    </Card>

                    {/* Table */}
                    <Card className="officer-card">
                        <Table
                            rowSelection={rowSelection}
                            dataSource={filteredSales}
                            columns={columns}
                            rowKey="LOCAL_ID"
                            loading={loading}
                            pagination={{ pageSize: 15 }}
                            size="small"
                            scroll={{ x: 'max-content' }}
                        />
                    </Card>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-4">
            {/* Page Header */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-md">
                        <FileTextOutlined />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 m-0">Printed Sales & Billing</h2>
                        <p className="text-xs text-slate-500 m-0">Direct bill entry, official printouts, and lorry dispatch management</p>
                    </div>
                </div>

                {activeTab === 'create' && (
                    <Button 
                        icon={<HistoryOutlined />} 
                        onClick={() => setActiveTab('history')}
                        className="font-bold !text-slate-700"
                    >
                        View Bills History ({sales.length})
                    </Button>
                )}
                {activeTab === 'history' && (
                    <Button 
                        type="primary"
                        icon={<PlusOutlined />} 
                        onClick={() => setActiveTab('create')}
                        className="!bg-blue-600 font-bold"
                    >
                        New Printed Bill Form
                    </Button>
                )}
            </div>

            {/* In-Page Primary Tab Navigation */}
            <Card className="officer-card !p-2">
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={tabItems}
                    type="card"
                    className="officer-tabs"
                />
            </Card>

            {/* Settle Sale Drawer */}
            <Drawer
                title={<span className="font-bold text-slate-800">💰 Settle Bill: #{selectedSale?.INVOICE_NO}</span>}
                placement="right"
                width={720}
                onClose={() => setSettleDrawerVisible(false)}
                open={settleDrawerVisible}
                destroyOnClose
            >
                <SettleSaleForm
                    bill={selectedSale}
                    onSuccess={() => {
                        setSettleDrawerVisible(false);
                        loadSales();
                    }}
                    onCancel={() => setSettleDrawerVisible(false)}
                />
            </Drawer>

            {/* View Sale Modal */}
            <ViewSaleModal
                visible={viewModalVisible}
                onClose={() => setViewModalVisible(false)}
                bill={selectedSale}
                onPrint={(bill) => {
                    setViewModalVisible(false);
                    setSelectedSale(bill);
                    setPrintModalVisible(true);
                }}
            />

            {/* Print Bill Modal */}
            <PrintableBill
                visible={printModalVisible}
                onClose={() => setPrintModalVisible(false)}
                bill={selectedSale}
            />

            {/* Create Dispatch Modal */}
            <CreateDispatchModal
                visible={dispatchModalVisible}
                onClose={() => setDispatchModalVisible(false)}
                selectedBills={selectedRows}
                onSuccess={() => {
                    setSelectedRowKeys([]);
                    setSelectedRows([]);
                    loadSales();
                }}
            />
        </div>
    );
}
