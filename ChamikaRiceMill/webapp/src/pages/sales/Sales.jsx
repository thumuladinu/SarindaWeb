import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Space, Tag, message, Typography, Popconfirm, Tooltip, Drawer, Modal, Form, DatePicker, Input, Select } from 'antd';
import { PlusOutlined, PrinterOutlined, EditOutlined, FileTextOutlined, CheckCircleOutlined, SyncOutlined, DeleteOutlined, SendOutlined, SearchOutlined, BarcodeOutlined, UnlockOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';
import AddSaleForm from './AddSaleForm';
import SettleSaleForm from './SettleSaleForm';
import EditSaleForm from './EditSaleForm';
import ViewSaleModal from './ViewSaleModal';

const { Title, Text } = Typography;

export default function Sales() {
    const navigate = useNavigate();
    const [sales, setSales] = useState([]);
    const [filteredSales, setFilteredSales] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Filters
    const [searchText, setSearchText] = useState('');
    const [dateRange, setDateRange] = useState(null);
    const [statusFilter, setStatusFilter] = useState('ALL');
    
    // Drawers & Modals
    const [addDrawerVisible, setAddDrawerVisible] = useState(false);
    const [settleDrawerVisible, setSettleDrawerVisible] = useState(false);
    const [editDrawerVisible, setEditDrawerVisible] = useState(false);
    const [viewModalVisible, setViewModalVisible] = useState(false);
    const [dispatchModalVisible, setDispatchModalVisible] = useState(false);
    
    // State
    const [selectedSale, setSelectedSale] = useState(null);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [creatingDispatch, setCreatingDispatch] = useState(false);
    const [dispatchForm] = Form.useForm();

    const fetchSales = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/mill/sales/list', { withCredentials: true });
            if (response.data.success) {
                const data = Array.isArray(response.data.result) ? response.data.result : [];
                setSales(data);
                setFilteredSales(data);
            }
        } catch (error) {
            console.error('Error fetching sales:', error);
            message.error('Failed to load sales data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSales();
    }, []);

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
                const saleDate = dayjs(s.CREATED_DATE || s.DATE);
                return saleDate.isAfter(start) && saleDate.isBefore(end);
            });
        }

        if (searchText.trim()) {
            const query = searchText.toLowerCase();
            temp = temp.filter(s =>
                s.INVOICE_NO?.toLowerCase().includes(query) ||
                s.CUSTOMER_NAME?.toLowerCase().includes(query) ||
                s.BATCH_NUMBER?.toLowerCase().includes(query)
            );
        }

        setFilteredSales(temp);
    }, [searchText, dateRange, statusFilter, sales]);

    const handleSettleClick = (record) => {
        setSelectedSale(record);
        setSettleDrawerVisible(true);
    };

    const handleEditClick = (record) => {
        setSelectedSale(record);
        setEditDrawerVisible(true);
    };

    const handleDelete = async (id) => {
        try {
            const res = await axios.post('/api/mill/sales/delete', { BILL_ID: id }, { withCredentials: true });
            if (res.data.success) {
                message.success('Sale deleted successfully');
                fetchSales();
            } else {
                message.error(res.data.message || 'Failed to delete sale');
            }
        } catch (e) {
            console.error(e);
            message.error(e.response?.data?.message || 'Failed to delete sale');
        }
    };

    const handleUnlock = async (id) => {
        try {
            const res = await axios.post('/api/mill/sales/unlock', { BILL_ID: id }, { withCredentials: true });
            if (res.data.success) {
                message.success('Sale unlocked and reverted to pending');
                fetchSales();
            } else {
                message.error(res.data.message || 'Failed to unlock sale');
            }
        } catch (e) {
            console.error(e);
            message.error('Failed to unlock sale');
        }
    };

    const handlePrintClick = (record) => {
        const printUrl = `/print-bill/${record.BILL_ID}`;
        window.open(printUrl, '_blank', 'width=850,height=900,toolbar=0,menubar=0');
    };

    const handleCreateDispatchNote = async (values) => {
        setCreatingDispatch(true);
        try {
            const terminalCode = getTerminalDeviceCode();
            const userName = getCurrentUserName();
            const payload = {
                BILL_IDS: selectedRowKeys,
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                DRIVER_NAME: values.DRIVER_NAME,
                LORRY_NO: values.LORRY_NO,
                STAFF_NAME: values.STAFF_NAME,
                DEVICE_ID: terminalCode,
                CREATED_BY: userName,
                CREATED_BY_NAME: userName
            };
            const res = await axios.post('/api/mill/dispatch/create', payload, { withCredentials: true });
            if (res.data.success) {
                message.success('Dispatch Note created: ' + res.data.dispatchNo);
                setDispatchModalVisible(false);
                setSelectedRowKeys([]);
                dispatchForm.resetFields();

                // Open auto-print window
                if (res.data.dispatchId) {
                    window.open(`/print-dispatch/${res.data.dispatchId}`, '_blank', 'width=850,height=900,toolbar=0,menubar=0');
                }

                // Redirect automatically to Dispatch Notes page
                navigate('/dispatch');
            } else {
                message.error(res.data.message || 'Failed to create dispatch note');
            }
        } catch (e) {
            console.error(e);
            message.error('An error occurred');
        } finally {
            setCreatingDispatch(false);
        }
    };

    const columns = [
        {
            title: 'Invoice No',
            dataIndex: 'INVOICE_NO',
            key: 'INVOICE_NO',
            render: (text) => <Text strong>{text}</Text>,
        },
        {
            title: 'Date',
            dataIndex: 'DATE',
            key: 'DATE',
            render: (text) => new Date(text).toLocaleDateString(),
        },
        {
            title: 'Customer',
            dataIndex: 'CUSTOMER_NAME',
            key: 'CUSTOMER_NAME',
            render: (text, record) => text || <Text type="secondary">Walk-in</Text>,
        },
        {
            title: 'Status',
            key: 'status',
            render: (_, record) => {
                if (record.IS_SETTLED) {
                    return <Tag color="green" icon={<CheckCircleOutlined />}>Settled</Tag>;
                }
                if (record.DISPATCH_ID) {
                    return <Tag color="blue" icon={<SendOutlined />}>In Dispatch</Tag>;
                }
                return <Tag color="orange" icon={<SyncOutlined spin />}>Pending Settlement</Tag>;
            }
        },
        {
            title: 'Printed Total',
            dataIndex: 'PRINTED_SUB_TOTAL',
            key: 'PRINTED_SUB_TOTAL',
            align: 'right',
            render: (val) => `Rs. ${parseFloat(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        },
        {
            title: 'Final Amount',
            dataIndex: 'FINAL_AMOUNT',
            key: 'FINAL_AMOUNT',
            align: 'right',
            render: (val, record) => {
                if (!record.IS_SETTLED) return <Text type="secondary">-</Text>;
                return <Text strong>Rs. {parseFloat(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>;
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            render: (_, record) => (
                <Space>
                    <Tooltip title="Print Bag Labels">
                        <Button 
                            icon={<BarcodeOutlined />} 
                            onClick={() => navigate(`/labels?billId=${record.BILL_ID}`)} 
                        />
                    </Tooltip>
                    <Tooltip title="Print Bill">
                        <Button 
                            icon={<PrinterOutlined />} 
                            onClick={() => handlePrintClick(record)} 
                        />
                    </Tooltip>
                    {record.IS_SETTLED ? (
                        <>
                            <Tooltip title="View Details">
                                <Button 
                                    type="default" 
                                    icon={<FileTextOutlined />} 
                                    onClick={() => {
                                        setSelectedSale(record);
                                        setViewModalVisible(true);
                                    }}
                                >
                                    View
                                </Button>
                            </Tooltip>
                            <Popconfirm
                                title="Unlock this sale?"
                                description="This will revert the settlement, removing handwritten items and cheques."
                                onConfirm={() => handleUnlock(record.BILL_ID)}
                                okText="Yes, Unlock"
                                cancelText="No"
                            >
                                <Tooltip title="Unlock / Revert Settle">
                                    <Button type="dashed" danger>
                                        Unlock
                                    </Button>
                                </Tooltip>
                            </Popconfirm>
                        </>
                    ) : (
                        <>
                            <Tooltip title={record.DISPATCH_ID ? "Cannot settle a bill currently in a Dispatch Note" : "Settle Bill (Add Handwritten)"}>
                                <Button 
                                    type="primary" 
                                    icon={<CheckCircleOutlined />} 
                                    disabled={!!record.DISPATCH_ID}
                                    onClick={() => handleSettleClick(record)}
                                >
                                    Settle
                                </Button>
                            </Tooltip>
                            <Tooltip title="Edit Bill">
                                <Button 
                                    icon={<EditOutlined />} 
                                    onClick={() => handleEditClick(record)} 
                                />
                            </Tooltip>
                            <Popconfirm
                                title="Delete this sale?"
                                description="Inventory will be reverted."
                                onConfirm={() => handleDelete(record.BILL_ID)}
                                okText="Delete"
                                cancelText="Cancel"
                                okButtonProps={{ danger: true }}
                            >
                                <Tooltip title="Delete">
                                    <Button danger icon={<DeleteOutlined />} />
                                </Tooltip>
                            </Popconfirm>
                        </>
                    )}
                </Space>
            )
        }
    ];

    return (
        <div className="space-y-4">
            {/* TOP FILTER & ACTION BAR */}
            <div className="glass-card p-4 rounded-2xl border border-gray-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                    <Input
                        placeholder="Search Invoice No, Customer, Batch No..."
                        prefix={<SearchOutlined className="text-gray-400" />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                        className="rounded-xl h-10 min-w-[240px] flex-1"
                    />
                    {/* Desktop RangePicker */}
                    <div className="hidden md:block">
                        <DatePicker.RangePicker
                            value={dateRange}
                            onChange={setDateRange}
                            className="rounded-xl h-10 min-w-[240px]"
                        />
                    </div>
                    {/* Mobile Separate Start & End DatePickers */}
                    <div className="grid grid-cols-2 gap-2 w-full md:hidden">
                        <DatePicker
                            placeholder="Start Date"
                            value={dateRange ? dateRange[0] : null}
                            onChange={(val) => setDateRange(val ? [val, dateRange ? dateRange[1] : null] : null)}
                            className="w-full h-10 rounded-xl text-xs"
                            format="YYYY-MM-DD"
                        />
                        <DatePicker
                            placeholder="End Date"
                            value={dateRange ? dateRange[1] : null}
                            onChange={(val) => setDateRange(val ? [dateRange ? dateRange[0] : null, val] : null)}
                            className="w-full h-10 rounded-xl text-xs"
                            format="YYYY-MM-DD"
                        />
                    </div>
                    <Select
                        value={statusFilter}
                        onChange={setStatusFilter}
                        className="h-10 w-full"
                        options={[
                            { label: 'All Statuses', value: 'ALL' },
                            { label: 'Settled ✅', value: 'SETTLED' },
                            { label: 'In Dispatch 🚚', value: 'DISPATCH' },
                            { label: 'Pending / Draft ⏳', value: 'PENDING' }
                        ]}
                    />
                </div>
                <div className="flex items-center gap-2">
                    {selectedRowKeys.length > 0 && (
                        <Button 
                            type="primary" 
                            className="!bg-indigo-600 hover:!bg-indigo-700 h-10 rounded-xl font-medium shadow-md"
                            icon={<SendOutlined />} 
                            onClick={() => {
                                dispatchForm.setFieldsValue({ DATE: dayjs() });
                                setDispatchModalVisible(true);
                            }}
                        >
                            Dispatch Note ({selectedRowKeys.length})
                        </Button>
                    )}
                    <Button 
                        type="primary" 
                        icon={<PlusOutlined />} 
                        onClick={() => setAddDrawerVisible(true)}
                        className="h-10 rounded-xl font-bold shadow-md"
                    >
                        Create New Bill
                    </Button>
                </div>
            </div>

            {/* DESKTOP TABLE VIEW */}
            <div className="hidden md:block page-paper overflow-hidden">
                <Table
                    rowSelection={{
                        selectedRowKeys,
                        onChange: (newSelectedRowKeys) => setSelectedRowKeys(newSelectedRowKeys),
                        getCheckboxProps: (record) => ({
                            disabled: record.IS_SETTLED === 1 || !!record.DISPATCH_ID,
                        }),
                    }}
                    columns={columns}
                    dataSource={filteredSales}
                    rowKey="BILL_ID"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    scroll={{ x: 'max-content' }}
                    className="w-full"
                />
            </div>

            {/* MOBILE CARDS VIEW */}
            <div className="md:hidden space-y-3 pb-20">
                {filteredSales.length === 0 ? (
                    <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                        No sales bills found
                    </div>
                ) : (
                    filteredSales.map((record) => (
                        <div 
                            key={record.BILL_ID} 
                            onClick={() => {
                                setSelectedSale(record);
                                setViewModalVisible(true);
                            }}
                            className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-white text-base">{record.INVOICE_NO}</div>
                                    <div className="text-xs text-gray-400">
                                        {record.DATE ? dayjs(record.DATE).format('YYYY-MM-DD') : '-'} • {record.CUSTOMER_NAME || 'Walk-in'}
                                    </div>
                                </div>
                                <div>
                                    {record.IS_SETTLED === 1 ? (
                                        <Tag color="success" icon={<CheckCircleOutlined />}>Settled</Tag>
                                    ) : record.DISPATCH_ID ? (
                                        <Tag color="processing" icon={<SendOutlined />}>In Dispatch</Tag>
                                    ) : (
                                        <Tag color="warning" icon={<SyncOutlined spin />}>Pending</Tag>
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-between items-end pt-2 border-t border-white/5">
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-gray-400">Final Amount</div>
                                    <div className="text-lg font-bold text-emerald-400 font-mono">
                                        Rs. {(parseFloat(record.TOTAL_AMOUNT || record.PRINTED_TOTAL || 0)).toFixed(2)}
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap justify-end ml-auto" onClick={(e) => e.stopPropagation()}>
                                    <Tooltip title="Print Bag Labels">
                                        <Button 
                                            size="small"
                                            icon={<BarcodeOutlined />} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                navigate(`/labels?billId=${record.BILL_ID}`);
                                            }} 
                                            className="rounded-xl"
                                        />
                                    </Tooltip>
                                    <Tooltip title="Print Bill">
                                        <Button 
                                            size="small"
                                            icon={<PrinterOutlined />} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePrintClick(record);
                                            }} 
                                            className="rounded-xl"
                                        />
                                    </Tooltip>
                                    {record.IS_SETTLED ? (
                                        <Popconfirm
                                            title="Unlock this sale?"
                                            description="Revert settlement and handwritten items."
                                            onConfirm={() => handleUnlock(record.BILL_ID)}
                                            okText="Unlock"
                                            cancelText="No"
                                        >
                                            <Button 
                                                size="small"
                                                type="dashed" 
                                                danger 
                                                onClick={(e) => e.stopPropagation()}
                                                className="rounded-xl text-xs"
                                            >
                                                Unlock
                                            </Button>
                                        </Popconfirm>
                                    ) : (
                                        <>
                                            <Button 
                                                size="small"
                                                type="primary" 
                                                icon={<CheckCircleOutlined />} 
                                                disabled={!!record.DISPATCH_ID}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSettleClick(record);
                                                }}
                                                className="rounded-xl text-xs"
                                            >
                                                Settle
                                            </Button>
                                            <Button 
                                                size="small"
                                                icon={<EditOutlined />} 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEditClick(record);
                                                }}
                                                className="rounded-xl !text-amber-500"
                                            />
                                            <Popconfirm
                                                title="Delete this sale?"
                                                description="Inventory will be reverted."
                                                onConfirm={() => handleDelete(record.BILL_ID)}
                                                okText="Delete"
                                                cancelText="Cancel"
                                                okButtonProps={{ danger: true }}
                                            >
                                                <Button 
                                                    size="small"
                                                    danger 
                                                    icon={<DeleteOutlined />} 
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="rounded-xl"
                                                />
                                            </Popconfirm>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Drawer
                title="Create New Printed Bill"
                placement="right"
                size="large"
                onClose={() => setAddDrawerVisible(false)}
                open={addDrawerVisible}
                destroyOnClose
            >
                <AddSaleForm 
                    onSuccess={() => {
                        setAddDrawerVisible(false);
                        fetchSales();
                    }}
                    onCancel={() => setAddDrawerVisible(false)}
                />
            </Drawer>

            <Drawer
                title="Settle Bill (Add Handwritten Items)"
                placement="right"
                size="large"
                onClose={() => setSettleDrawerVisible(false)}
                open={settleDrawerVisible}
                destroyOnClose
            >
                {selectedSale && (
                    <SettleSaleForm 
                        bill={selectedSale}
                        onSuccess={() => {
                            setSettleDrawerVisible(false);
                            fetchSales();
                        }}
                        onCancel={() => setSettleDrawerVisible(false)}
                    />
                )}
            </Drawer>

            <Drawer
                title="Edit Printed Bill"
                placement="right"
                size="large"
                onClose={() => setEditDrawerVisible(false)}
                open={editDrawerVisible}
                destroyOnClose
            >
                {selectedSale && (
                    <EditSaleForm 
                        billId={selectedSale.BILL_ID}
                        onSuccess={() => {
                            setEditDrawerVisible(false);
                            fetchSales();
                        }}
                        onCancel={() => setEditDrawerVisible(false)}
                    />
                )}
            </Drawer>

            <Modal
                title="Create Dispatch Note"
                open={dispatchModalVisible}
                onCancel={() => setDispatchModalVisible(false)}
                footer={null}
                destroyOnClose
            >
                <Form layout="vertical" form={dispatchForm} onFinish={handleCreateDispatchNote}>
                    <Form.Item name="DATE" label="Dispatch Date" rules={[{ required: true }]}>
                        <DatePicker className="w-full" />
                    </Form.Item>
                    <Form.Item name="DRIVER_NAME" label="Driver Name">
                        <Input placeholder="Enter driver name" />
                    </Form.Item>
                    <Form.Item name="LORRY_NO" label="Lorry Number">
                        <Input placeholder="Enter lorry number" />
                    </Form.Item>
                    <Form.Item name="STAFF_NAME" label="Staff Name (Helper)">
                        <Input placeholder="Enter staff name" />
                    </Form.Item>
                    
                    <div className="flex justify-end gap-2 mt-6">
                        <Button onClick={() => setDispatchModalVisible(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={creatingDispatch}>Create Note</Button>
                    </div>
                </Form>
            </Modal>

            <ViewSaleModal 
                visible={viewModalVisible}
                onClose={() => setViewModalVisible(false)}
                billId={selectedSale?.BILL_ID}
            />
        </div>
    );
}
