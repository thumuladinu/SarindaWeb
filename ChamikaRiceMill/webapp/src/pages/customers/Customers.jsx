import React, { useState, useEffect } from 'react';
import { 
    Table, Button, Input, InputNumber, Modal, Form, Typography, Space, message, Popconfirm, 
    Tooltip, Drawer, Tag, Card, Row, Col, Divider, Badge 
} from 'antd';
import { 
    PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, EyeOutlined,
    BankOutlined, PhoneOutlined, EnvironmentOutlined, DollarOutlined,
    FileTextOutlined, CreditCardOutlined, UserOutlined, PlusCircleOutlined, MinusCircleOutlined
} from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function Customers() {
    const [customers, setCustomers] = useState([]);
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    
    // Add/Edit Drawer State
    const [formDrawerVisible, setFormDrawerVisible] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    // Customer Quick View Drawer State
    const [viewDrawerVisible, setViewDrawerVisible] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [customerSummary, setCustomerSummary] = useState(null);

    useEffect(() => {
        fetchCustomers();
    }, []);

    useEffect(() => {
        if (searchText.trim()) {
            const lower = searchText.toLowerCase().trim();
            setFilteredCustomers(customers.filter(c => 
                (c.NAME && c.NAME.toLowerCase().includes(lower)) ||
                (c.PHONE_NUMBER && c.PHONE_NUMBER.includes(lower)) ||
                (c.PHONE && c.PHONE.includes(lower)) ||
                (c.ADDRESS && c.ADDRESS.toLowerCase().includes(lower)) ||
                (c.LOCATION && c.LOCATION.toLowerCase().includes(lower))
            ));
        } else {
            setFilteredCustomers(customers);
        }
    }, [searchText, customers]);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const res = await axios.post('/api/MillgetAllCustomers', {}, { withCredentials: true });
            if (res.data.success) {
                const data = res.data.result || [];
                data.sort((a, b) => new Date(b.CREATED_DATE || 0) - new Date(a.CREATED_DATE || 0));
                setCustomers(data);
            }
        } catch (e) {
            console.error('Failed to load customers:', e);
            message.error('Failed to load customers');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = () => {
        setEditingCustomer(null);
        form.resetFields();
        form.setFieldsValue({ DISTANCE: 0, bankAccounts: [{ bankName: '', accountNumber: '', branch: '', accountName: '' }] });
        setFormDrawerVisible(true);
    };

    const handleEdit = (record) => {
        setEditingCustomer(record);
        let parsedBanks = [];
        if (record.BANK_DETAILS_JSON) {
            try {
                parsedBanks = typeof record.BANK_DETAILS_JSON === 'string' ? JSON.parse(record.BANK_DETAILS_JSON) : record.BANK_DETAILS_JSON;
            } catch(e) { parsedBanks = []; }
        }
        if (!Array.isArray(parsedBanks) || parsedBanks.length === 0) {
            parsedBanks = [{ bankName: '', accountNumber: '', branch: '', accountName: '' }];
        }

        form.setFieldsValue({
            NAME: record.NAME,
            PHONE_NUMBER: record.PHONE_NUMBER || record.PHONE || '',
            ADDRESS: record.ADDRESS || record.LOCATION || '',
            DISTANCE: record.DISTANCE || record.DISTANCE_KM || 0,
            bankAccounts: parsedBanks
        });
        setFormDrawerVisible(true);
    };

    const handleQuickView = async (record) => {
        setSelectedCustomer(record);
        setCustomerSummary(null);
        setViewDrawerVisible(true);
        setSummaryLoading(true);

        try {
            const res = await axios.post('/api/MillgetCustomerSummary', { CUSTOMER_ID: record.CUSTOMER_ID, NAME: record.NAME }, { withCredentials: true });
            if (res.data.success) {
                setCustomerSummary(res.data);
            }
        } catch (e) {
            console.error('Error fetching customer summary:', e);
            message.error('Failed to load customer details summary');
        } finally {
            setSummaryLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            const res = await axios.post('/api/MilldeactivateCustomer', { CUSTOMER_ID: id }, { withCredentials: true });
            if (res.data.success) {
                message.success('Customer removed successfully');
                fetchCustomers();
            } else {
                message.error('Failed to remove customer');
            }
        } catch (e) {
            console.error(e);
            message.error('Failed to delete customer');
        }
    };

    const handleFinish = async (values) => {
        setSubmitting(true);
        try {
            const cleanBanks = (values.bankAccounts || []).filter(b => b.bankName || b.accountNumber);
            const payload = {
                NAME: values.NAME,
                PHONE_NUMBER: values.PHONE_NUMBER || '',
                PHONE: values.PHONE_NUMBER || '',
                ADDRESS: values.ADDRESS || '',
                LOCATION: values.ADDRESS || '',
                DISTANCE: values.DISTANCE !== undefined ? Number(values.DISTANCE) : 0,
                BANK_DETAILS_JSON: JSON.stringify(cleanBanks)
            };

            if (editingCustomer) {
                payload.CUSTOMER_ID = editingCustomer.CUSTOMER_ID;
                const res = await axios.post('/api/MillupdateCustomer', payload, { withCredentials: true });
                if (res.data.success) {
                    message.success('Customer updated successfully');
                    setFormDrawerVisible(false);
                    fetchCustomers();
                } else {
                    message.error('Failed to update customer');
                }
            } else {
                // Generate a unique CODE for this customer: MCU-WEB01-NNNN
                // Sequential based on existing customer count to avoid collisions
                const existingCount = customers.length || 0;
                const seqNum = String(Date.now()).slice(-4);  // last 4 digits of timestamp for uniqueness
                const customerCode = `MCU-WEB01-${seqNum}`;
                payload.CODE = customerCode;
                payload.DEVICE_ID = 'WEB01';
                payload.CREATED_DATE = dayjs().format('YYYY-MM-DD HH:mm:ss');
                const res = await axios.post('/api/MilladdCustomer', payload, { withCredentials: true });
                if (res.data.success) {
                    message.success('Customer added successfully');
                    setFormDrawerVisible(false);
                    fetchCustomers();
                } else {
                    message.error('Failed to add customer');
                }
            }
        } catch (e) {
            console.error(e);
            message.error('An error occurred');
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            title: 'Customer Name',
            dataIndex: 'NAME',
            key: 'NAME',
            render: (text, record) => (
                <div>
                    <Text strong className="text-sm">{text}</Text>
                    {record.LOCATION && <div className="text-xs text-gray-500">{record.LOCATION}</div>}
                </div>
            )
        },
        {
            title: 'Phone Number',
            dataIndex: 'PHONE_NUMBER',
            key: 'PHONE_NUMBER',
            render: (text, r) => r.PHONE_NUMBER || r.PHONE || '-'
        },
        {
            title: 'Location / Address',
            dataIndex: 'ADDRESS',
            key: 'ADDRESS',
            render: (text, r) => r.ADDRESS || r.LOCATION || '-'
        },
        {
            title: 'Distance (km)',
            dataIndex: 'DISTANCE',
            key: 'DISTANCE',
            align: 'center',
            render: (val, r) => {
                const dist = Number(val || r.DISTANCE_KM || 0);
                return dist > 0 ? <Tag color="purple">{dist} km</Tag> : <span className="text-gray-400">-</span>;
            }
        },
        {
            title: 'Bank Accounts',
            key: 'banks',
            render: (_, record) => {
                let banks = [];
                if (record.BANK_DETAILS_JSON) {
                    try { banks = JSON.parse(record.BANK_DETAILS_JSON); } catch(e) {}
                }
                if (!Array.isArray(banks) || banks.length === 0) return <Tag color="default">None</Tag>;
                return (
                    <Space size={[0, 4]} wrap>
                        {banks.map((b, idx) => (
                            <Tag key={idx} color="blue" icon={<BankOutlined />}>
                                {b.bankName || 'Bank'} {b.accountNumber ? `(${b.accountNumber})` : ''}
                            </Tag>
                        ))}
                    </Space>
                );
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            width: 170,
            render: (_, record) => (
                <Space>
                    <Tooltip title="Quick View & Credit / Bills Summary">
                        <Button icon={<EyeOutlined />} type="primary" ghost onClick={() => handleQuickView(record)}>
                            View
                        </Button>
                    </Tooltip>
                    <Tooltip title="Edit Customer">
                        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    </Tooltip>
                    <Popconfirm
                        title="Delete this customer?"
                        onConfirm={() => handleDelete(record.CUSTOMER_ID)}
                        okText="Yes"
                        cancelText="No"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="Delete">
                            <Button danger icon={<DeleteOutlined />} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const billColumns = [
        {
            title: 'Invoice No',
            dataIndex: 'INVOICE_NO',
            key: 'INVOICE_NO',
            render: (val, r) => <Text strong className="font-mono text-xs">{val || `#${r.BILL_ID}`}</Text>
        },
        {
            title: 'Date',
            dataIndex: 'DATE',
            key: 'DATE',
            render: val => val ? dayjs(val).format('YYYY-MM-DD') : '-'
        },
        {
            title: 'Amount (Rs.)',
            dataIndex: 'FINAL_AMOUNT',
            key: 'FINAL_AMOUNT',
            align: 'right',
            render: (val, r) => (
                <Text strong className="font-mono text-emerald-600">
                    Rs. {Number(val || r.NET_AMOUNT || r.TOTAL_AMOUNT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Text>
            )
        },
        {
            title: 'Status',
            dataIndex: 'IS_SETTLED',
            key: 'IS_SETTLED',
            align: 'center',
            render: val => Number(val) === 1 ? <Tag color="success">SETTLED</Tag> : <Tag color="warning">CREDIT (UNPAID)</Tag>
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 glass-card p-5 rounded-2xl">
                <div>
                    <h2 className="text-xl font-bold text-slate-100 m-0">👤 Customer Directory</h2>
                    <p className="text-xs text-slate-400 m-0">Manage customers, bank details, distance (km), credit balance, and sales history</p>
                </div>
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    size="large"
                    onClick={handleAdd}
                    className="shadow-lg hover:shadow-xl transition-all !bg-blue-600 font-bold"
                >
                    Add Customer
                </Button>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block page-paper overflow-hidden">
                <div className="p-4 border-b border-gray-100">
                    <Input
                        placeholder="Search by customer name, phone, location, or address..."
                        prefix={<SearchOutlined className="text-gray-400" />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        className="max-w-md"
                        allowClear
                    />
                </div>
                <Table
                    columns={columns}
                    dataSource={filteredCustomers}
                    rowKey="CUSTOMER_ID"
                    loading={loading}
                    pagination={{ pageSize: 12 }}
                    scroll={{ x: 'max-content' }}
                />
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3 pb-20">
                <Input
                    placeholder="Search by name, phone, or location..."
                    prefix={<SearchOutlined className="text-gray-400" />}
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    allowClear
                    className="h-10 rounded-xl mb-2"
                />
                {filteredCustomers.length === 0 ? (
                    <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                        No customers found
                    </div>
                ) : (
                    filteredCustomers.map((record) => (
                        <div 
                            key={record.CUSTOMER_ID} 
                            onClick={() => handleQuickView(record)}
                            className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-white text-base">{record.NAME}</div>
                                    <div className="text-xs text-gray-400">{record.LOCATION || record.ADDRESS || 'No Location'}</div>
                                </div>
                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Button size="small" icon={<EyeOutlined />} onClick={() => handleQuickView(record)} />
                                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                                </div>
                            </div>
                            <div className="text-xs bg-zinc-900/60 p-2.5 rounded-xl border border-white/5 space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Phone:</span>
                                    <span className="font-semibold text-white">{record.PHONE_NUMBER || record.PHONE || '-'}</span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add / Edit Customer Drawer */}
            <Drawer
                title={editingCustomer ? "✏️ Edit Customer & Bank Accounts" : "➕ Add New Customer"}
                placement="right"
                width={500}
                onClose={() => setFormDrawerVisible(false)}
                open={formDrawerVisible}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleFinish}
                >
                    <Form.Item 
                        name="NAME" 
                        label="Customer Name"
                        rules={[{ required: true, message: 'Please enter customer name' }]}
                    >
                        <Input placeholder="Enter full name" prefix={<UserOutlined />} />
                    </Form.Item>

                    <Form.Item 
                        name="PHONE_NUMBER" 
                        label="Phone Number"
                    >
                        <Input placeholder="Enter phone number" prefix={<PhoneOutlined />} />
                    </Form.Item>

                    <Form.Item 
                        name="ADDRESS" 
                        label="Location / Address"
                    >
                        <Input.TextArea placeholder="Enter customer address or city location" rows={2} />
                    </Form.Item>

                    <Form.Item 
                        name="DISTANCE" 
                        label="Distance to Customer (km)"
                    >
                        <InputNumber min={0} className="w-full" placeholder="e.g. 50" suffix="km" />
                    </Form.Item>

                    <Divider orientation="left" className="!my-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                        🏦 Bank Account Details (1 or More)
                    </Divider>

                    <Form.List name="bankAccounts">
                        {(fields, { add, remove }) => (
                            <div className="space-y-3">
                                {fields.map(({ key, name, ...restField }) => (
                                    <div key={key} className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 relative">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-700">Bank Account #{name + 1}</span>
                                            {fields.length > 1 && (
                                                <Button 
                                                    type="text" 
                                                    danger 
                                                    icon={<MinusCircleOutlined />} 
                                                    onClick={() => remove(name)}
                                                    size="small"
                                                />
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Form.Item {...restField} name={[name, 'bankName']} className="!mb-0">
                                                <Input placeholder="Bank Name (e.g. Commercial)" size="small" />
                                            </Form.Item>
                                            <Form.Item {...restField} name={[name, 'accountNumber']} className="!mb-0">
                                                <Input placeholder="Account Number" size="small" />
                                            </Form.Item>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Form.Item {...restField} name={[name, 'branch']} className="!mb-0">
                                                <Input placeholder="Branch" size="small" />
                                            </Form.Item>
                                            <Form.Item {...restField} name={[name, 'accountName']} className="!mb-0">
                                                <Input placeholder="Account Holder Name" size="small" />
                                            </Form.Item>
                                        </div>
                                    </div>
                                ))}
                                <Button 
                                    type="dashed" 
                                    onClick={() => add()} 
                                    block 
                                    icon={<PlusCircleOutlined />}
                                    className="!border-blue-400 !text-blue-600 font-semibold"
                                >
                                    Add Another Bank Account
                                </Button>
                            </div>
                        )}
                    </Form.List>

                    <div className="flex justify-end gap-3 mt-8 pt-4 border-t">
                        <Button onClick={() => setFormDrawerVisible(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={submitting} className="!bg-blue-600 font-bold">
                            {editingCustomer ? 'Update Customer' : 'Save Customer'}
                        </Button>
                    </div>
                </Form>
            </Drawer>

            {/* Quick View Customer Drawer */}
            <Drawer
                title={<span className="font-bold text-slate-800">🔍 Customer Summary Profile: {selectedCustomer?.NAME}</span>}
                placement="right"
                width={650}
                onClose={() => setViewDrawerVisible(false)}
                open={viewDrawerVisible}
                destroyOnClose
            >
                {summaryLoading ? (
                    <div className="p-8 text-center text-slate-500 font-bold">Loading customer summary details...</div>
                ) : (
                    <div className="space-y-5">
                        {/* PROFILE CARD */}
                        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-4.5 rounded-2xl shadow-md space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-xl font-bold">{selectedCustomer?.NAME}</div>
                                    <div className="text-xs text-blue-200 flex items-center gap-2 mt-1">
                                        <PhoneOutlined /> {selectedCustomer?.PHONE_NUMBER || selectedCustomer?.PHONE || 'No phone'}
                                        <span className="text-blue-400">•</span>
                                        <EnvironmentOutlined /> {selectedCustomer?.ADDRESS || selectedCustomer?.LOCATION || 'No address'}
                                    </div>
                                </div>
                            </div>

                            {/* BANK ACCOUNTS BADGES */}
                            <div>
                                <div className="text-[11px] font-semibold text-blue-200 mb-1 flex items-center gap-1">
                                    <BankOutlined /> Bank Account(s):
                                </div>
                                {customerSummary?.bankAccounts && customerSummary.bankAccounts.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {customerSummary.bankAccounts.map((b, idx) => (
                                            <div key={idx} className="bg-white/10 backdrop-blur-md px-2.5 py-1 rounded-xl text-xs border border-white/20">
                                                <span className="font-bold text-white">{b.bankName || 'Bank'}</span>: <span className="font-mono">{b.accountNumber}</span> {b.branch ? `(${b.branch})` : ''}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <span className="text-xs text-blue-300 italic">No bank accounts registered</span>
                                )}
                            </div>
                        </div>

                        {/* STATS SUMMARY METRICS */}
                        <Row gutter={[12, 12]}>
                            <Col span={8}>
                                <Card className="!bg-blue-50/70 border-blue-200 text-center">
                                    <div className="text-xs text-blue-800 font-semibold uppercase tracking-wider">Total Sales Bills</div>
                                    <div className="text-xl font-bold text-blue-900 mt-1">{customerSummary?.billsCount || 0}</div>
                                    <div className="text-[11px] text-blue-600 font-mono mt-0.5">
                                        Rs. {Number(customerSummary?.totalBillsAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                </Card>
                            </Col>
                            <Col span={8}>
                                <Card className="!bg-amber-50/70 border-amber-200 text-center">
                                    <div className="text-xs text-amber-800 font-semibold uppercase tracking-wider">Credit (Unsettled)</div>
                                    <div className="text-xl font-bold text-amber-900 mt-1 font-mono">
                                        Rs. {Number(customerSummary?.totalCreditAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                </Card>
                            </Col>
                            <Col span={8}>
                                <Card className="!bg-purple-50/70 border-purple-200 text-center">
                                    <div className="text-xs text-purple-800 font-semibold uppercase tracking-wider">Total Cheques</div>
                                    <div className="text-xl font-bold text-purple-900 mt-1 font-mono">
                                        Rs. {Number(customerSummary?.totalChequesAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-[11px] text-purple-600 mt-0.5">{customerSummary?.cheques?.length || 0} Cheques</div>
                                </Card>
                            </Col>
                        </Row>

                        {/* SALES BILLS TABLE FOR CUSTOMER */}
                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                            <div className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center justify-between">
                                <span>📜 Sales Bills List ({customerSummary?.bills?.length || 0})</span>
                            </div>
                            <Table
                                columns={billColumns}
                                dataSource={customerSummary?.bills || []}
                                rowKey="BILL_ID"
                                pagination={{ pageSize: 5 }}
                                size="small"
                            />
                        </div>
                    </div>
                )}
            </Drawer>
        </div>
    );
}
