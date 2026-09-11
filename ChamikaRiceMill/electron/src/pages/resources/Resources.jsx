import React, { useState, useEffect } from 'react';
import { 
    Card, Table, Button, Modal, Form, Input, InputNumber, 
    Tag, message, Row, Col, Space, Drawer, Divider, Tooltip 
} from 'antd';
import { 
    TeamOutlined, CarOutlined, EnvironmentOutlined, PlusOutlined, 
    EditOutlined, SyncOutlined, UserOutlined, EyeOutlined, BankOutlined,
    PhoneOutlined, PlusCircleOutlined, MinusCircleOutlined, DollarOutlined,
    FileTextOutlined, SafetyOutlined
} from '@ant-design/icons';
import db from '../../services/db';
import syncService from '../../services/syncService';
import axios from 'axios';
import dayjs from 'dayjs';

export default function Resources() {
    const [activeTab, setActiveTab] = useState('customers');
    const [customers, setCustomers] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [places, setPlaces] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modals & Drawers
    const [custModal, setCustModal] = useState(false);
    const [vehModal, setVehModal] = useState(false);
    const [placeModal, setPlaceModal] = useState(false);

    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();

    // Customer Quick View Drawer State
    const [custDrawerVisible, setCustDrawerVisible] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [custSummaryLoading, setCustSummaryLoading] = useState(false);
    const [custSummary, setCustSummary] = useState(null);

    // Staff Quick View Drawer State
    const [staffDrawerVisible, setStaffDrawerVisible] = useState(false);
    const [selectedStaff, setSelectedStaff] = useState(null);
    const [staffSummaryLoading, setStaffSummaryLoading] = useState(false);
    const [staffSummary, setStaffSummary] = useState(null);

    useEffect(() => {
        loadAll();
        const unsub = syncService.subscribe((event) => {
            if (event === 'referenceDataUpdated' || event === 'syncComplete') {
                loadAll();
            }
        });
        return unsub;
    }, []);

    const loadAll = async () => {
        try {
            setLoading(true);
            const [cList, vList, pList, sList] = await Promise.all([
                db.customers.toArray(),
                db.vehicles.toArray(),
                db.places.toArray(),
                db.staff.toArray()
            ]);
            setCustomers(cList || []);
            setVehicles(vList || []);
            setPlaces(pList || []);
            setStaffList(sList || []);
        } catch (e) {
            console.error('Error loading resources:', e);
        } finally {
            setLoading(false);
        }
    };

    // Open Add / Edit Customer Modal
    const handleOpenCustModal = (record = null) => {
        setEditingRecord(record);
        if (record) {
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
                PHONE: record.PHONE || record.PHONE_NUMBER || '',
                ADDRESS: record.ADDRESS || record.LOCATION || '',
                DISTANCE: record.DISTANCE || record.DISTANCE_KM || 0,
                CREDIT_LIMIT: record.CREDIT_LIMIT || 0,
                bankAccounts: parsedBanks
            });
        } else {
            form.resetFields();
            form.setFieldsValue({ DISTANCE: 0, bankAccounts: [{ bankName: '', accountNumber: '', branch: '', accountName: '' }] });
        }
        setCustModal(true);
    };

    // Customer Quick View
    const handleQuickViewCustomer = async (record) => {
        setSelectedCustomer(record);
        setCustSummary(null);
        setCustDrawerVisible(true);
        setCustSummaryLoading(true);

        try {
            const serverUrl = localStorage.getItem('mill_server_url') || 'http://localhost:3001';
            const res = await axios.post(`${serverUrl}/api/MillgetCustomerSummary`, { CUSTOMER_ID: record.CUSTOMER_ID, NAME: record.NAME });
            if (res.data.success) {
                setCustSummary(res.data);
            }
        } catch (e) {
            console.warn('Could not fetch server customer summary, loading local Dexie bills:', e);
            // Fallback to local Dexie calculation offline!
            const localBills = await db.sales_bills.where('CUSTOMER_ID').equals(record.CUSTOMER_ID).or('CUSTOMER_NAME').equals(record.NAME).toArray();
            let billsCount = localBills.length;
            let totalBillsAmount = 0;
            let totalCreditAmount = 0;

            localBills.forEach(b => {
                const amt = Number(b.FINAL_AMOUNT || b.NET_AMOUNT || b.TOTAL_AMOUNT || 0);
                totalBillsAmount += amt;
                if (Number(b.IS_SETTLED) === 0) totalCreditAmount += amt;
            });

            let parsedBanks = [];
            if (record.BANK_DETAILS_JSON) {
                try { parsedBanks = JSON.parse(record.BANK_DETAILS_JSON); } catch(err) {}
            }

            setCustSummary({
                customer: record,
                bankAccounts: parsedBanks,
                billsCount,
                totalBillsAmount,
                totalCreditAmount,
                totalChequesAmount: 0,
                bills: localBills,
                cheques: []
            });
        } finally {
            setCustSummaryLoading(false);
        }
    };

    // Staff Quick View
    const handleQuickViewStaff = async (record) => {
        setSelectedStaff(record);
        setStaffSummary(null);
        setStaffDrawerVisible(true);
        setStaffSummaryLoading(true);

        try {
            const serverUrl = localStorage.getItem('mill_server_url') || 'http://localhost:3001';
            const res = await axios.post(`${serverUrl}/api/MillgetStaffSummary`, { STAFF_ID: record.STAFF_ID, NAME: record.NAME, USERNAME: record.USERNAME });
            if (res.data.success) {
                setStaffSummary(res.data);
            }
        } catch (e) {
            console.warn('Could not fetch server staff summary, using local Dexie:', e);
            const allBills = await db.sales_bills.toArray();
            const staffBills = allBills.filter(b => 
                b.CREATED_BY === record.STAFF_ID || 
                b.CREATED_BY_NAME === record.NAME || 
                b.CREATED_BY_NAME === record.USERNAME
            );
            let totalBillsAmount = 0;
            let totalCreditAmount = 0;
            staffBills.forEach(b => {
                const amt = Number(b.FINAL_AMOUNT || b.NET_AMOUNT || b.TOTAL_AMOUNT || 0);
                totalBillsAmount += amt;
                if (Number(b.IS_SETTLED) === 0) totalCreditAmount += amt;
            });

            setStaffSummary({
                staff: record,
                billsCount: staffBills.length,
                totalBillsAmount,
                totalCreditAmount,
                totalChequesAmount: 0,
                bills: staffBills,
                cheques: []
            });
        } finally {
            setStaffSummaryLoading(false);
        }
    };

    // Customer Save
    const handleSaveCustomer = async (values) => {
        try {
            const cleanBanks = (values.bankAccounts || []).filter(b => b.bankName || b.accountNumber);
            const payload = {
                NAME: values.NAME,
                PHONE: values.PHONE || '',
                PHONE_NUMBER: values.PHONE || '',
                ADDRESS: values.ADDRESS || '',
                LOCATION: values.ADDRESS || '',
                DISTANCE: values.DISTANCE !== undefined ? Number(values.DISTANCE) : 0,
                CREDIT_LIMIT: values.CREDIT_LIMIT || 0,
                BANK_DETAILS_JSON: JSON.stringify(cleanBanks),
                IS_ACTIVE: 1
            };

            if (editingRecord) {
                await db.customers.update(editingRecord.CUSTOMER_ID, payload);
                message.success('Customer updated');
            } else {
                await db.customers.add({
                    CUSTOMER_ID: Date.now(),
                    ...payload,
                    BALANCE: 0
                });
                message.success('Customer added');
            }
            setCustModal(false);
            form.resetFields();
            loadAll();

            // Try syncing customer up to cloud API if online
            const serverUrl = localStorage.getItem('mill_server_url') || 'http://localhost:3001';
            const endpoint = editingRecord ? `${serverUrl}/api/MillupdateCustomer` : `${serverUrl}/api/MilladdCustomer`;
            const reqData = editingRecord ? { CUSTOMER_ID: editingRecord.CUSTOMER_ID, ...payload } : payload;
            axios.post(endpoint, reqData).catch(() => {});
        } catch (e) {
            console.error(e);
            message.error('Failed to save customer');
        }
    };

    // Vehicle Save
    const handleSaveVehicle = async (values) => {
        try {
            if (editingRecord) {
                await db.vehicles.update(editingRecord.VEHICLE_ID, values);
                message.success('Vehicle updated');
            } else {
                await db.vehicles.add({
                    VEHICLE_ID: Date.now(),
                    ...values,
                    IS_ACTIVE: 1
                });
                message.success('Vehicle added');
            }
            setVehModal(false);
            form.resetFields();
            loadAll();
        } catch (e) {
            message.error('Failed to save vehicle');
        }
    };

    // Place Save
    const handleSavePlace = async (values) => {
        try {
            if (editingRecord) {
                await db.places.update(editingRecord.PLACE_ID, values);
                message.success('Place updated');
            } else {
                await db.places.add({
                    PLACE_ID: Date.now(),
                    ...values
                });
                message.success('Place added');
            }
            setPlaceModal(false);
            form.resetFields();
            loadAll();
        } catch (e) {
            message.error('Failed to save place');
        }
    };

    // Customer Columns
    const custColumns = [
        {
            title: 'Customer Name',
            dataIndex: 'NAME',
            key: 'NAME',
            render: (val, r) => (
                <div>
                    <strong className="text-slate-900">{val}</strong>
                    {(r.LOCATION || r.ADDRESS) && <div className="text-xs text-gray-500">{r.LOCATION || r.ADDRESS}</div>}
                </div>
            )
        },
        {
            title: 'Phone',
            dataIndex: 'PHONE',
            key: 'PHONE',
            render: (val, r) => r.PHONE || r.PHONE_NUMBER || '-'
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
                    try { banks = typeof record.BANK_DETAILS_JSON === 'string' ? JSON.parse(record.BANK_DETAILS_JSON) : record.BANK_DETAILS_JSON; } catch(e) {}
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
            key: 'act',
            align: 'center',
            width: 150,
            render: (_, r) => (
                <Space>
                    <Tooltip title="Quick View Summary">
                        <Button size="small" type="primary" ghost icon={<EyeOutlined />} onClick={() => handleQuickViewCustomer(r)}>
                            View
                        </Button>
                    </Tooltip>
                    <Tooltip title="Edit Customer">
                        <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenCustModal(r)} />
                    </Tooltip>
                </Space>
            )
        }
    ];

    // Vehicle Columns
    const vehColumns = [
        {
            title: 'Vehicle No',
            dataIndex: 'VEHICLE_NO',
            key: 'VEHICLE_NO',
            render: val => <strong className="font-mono text-blue-900">{val}</strong>
        },
        {
            title: 'Driver Name',
            dataIndex: 'DRIVER_NAME',
            key: 'DRIVER_NAME',
            render: val => <span>{val || '-'}</span>
        },
        {
            title: 'Driver Phone',
            dataIndex: 'PHONE',
            key: 'PHONE',
            render: val => <span className="text-xs text-gray-600">{val || '-'}</span>
        },
        {
            title: 'Capacity (KG)',
            dataIndex: 'CAPACITY_KG',
            key: 'CAPACITY_KG',
            align: 'right',
            render: val => <span className="font-mono">{Number(val || 0).toFixed(0)} KG</span>
        },
        {
            title: 'Action',
            key: 'act',
            align: 'center',
            render: (_, r) => (
                <Button 
                    size="small" 
                    icon={<EditOutlined />} 
                    onClick={() => {
                        setEditingRecord(r);
                        form.setFieldsValue(r);
                        setVehModal(true);
                    }}
                />
            )
        }
    ];

    // Place Columns
    const placeColumns = [
        {
            title: 'Place / Paddy Source',
            dataIndex: 'NAME',
            key: 'NAME',
            render: val => <strong className="text-slate-900">{val}</strong>
        },
        {
            title: 'District / Region',
            dataIndex: 'DISTRICT',
            key: 'DISTRICT',
            render: val => <Tag color="blue">{val || 'General'}</Tag>
        },
        {
            title: 'Transport Rate (Rs/KG)',
            dataIndex: 'TRANSPORT_RATE_PER_KG',
            key: 'TRANSPORT_RATE_PER_KG',
            align: 'right',
            render: val => <span className="font-mono font-bold text-blue-800">Rs. {Number(val || 0).toFixed(2)}</span>
        },
        {
            title: 'Action',
            key: 'act',
            align: 'center',
            render: (_, r) => (
                <Button 
                    size="small" 
                    icon={<EditOutlined />} 
                    onClick={() => {
                        setEditingRecord(r);
                        form.setFieldsValue(r);
                        setPlaceModal(true);
                    }}
                />
            )
        }
    ];

    // Staff Columns
    const staffColumns = [
        {
            title: 'Staff Personnel',
            dataIndex: 'NAME',
            key: 'NAME',
            render: (val, r) => (
                <div>
                    <strong className="text-slate-900">{val}</strong>
                    {r.USERNAME && <div className="text-xs text-purple-600 font-mono">@{r.USERNAME}</div>}
                </div>
            )
        },
        {
            title: 'Role',
            dataIndex: 'ROLE',
            key: 'ROLE',
            render: val => <Tag color="purple" className="uppercase font-bold text-[10px]">{val || 'Officer'}</Tag>
        },
        {
            title: 'Phone',
            dataIndex: 'PHONE_NUMBER',
            key: 'PHONE_NUMBER',
            render: val => val || '-'
        },
        {
            title: 'Actions',
            key: 'act',
            align: 'center',
            render: (_, r) => (
                <Button size="small" type="primary" ghost icon={<EyeOutlined />} onClick={() => handleQuickViewStaff(r)}>
                    View Stats
                </Button>
            )
        }
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-md">
                        <TeamOutlined />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 m-0">Resources & Operations Directory</h2>
                        <p className="text-xs text-slate-500 m-0">Manage Customers, Bank Accounts, Lorries, Places, and Staff Performance</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button icon={<SyncOutlined />} onClick={loadAll}>Refresh</Button>
                </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={() => setActiveTab('customers')}
                    className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${activeTab === 'customers' ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                    <UserOutlined /> Customers ({customers.length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('staff')}
                    className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${activeTab === 'staff' ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                    <TeamOutlined /> Staff & Officers ({staffList.length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('vehicles')}
                    className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${activeTab === 'vehicles' ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                    <CarOutlined /> Vehicles / Lorries ({vehicles.length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('places')}
                    className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${activeTab === 'places' ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                    <EnvironmentOutlined /> Sourcing Places ({places.length})
                </button>
            </div>

            {/* TAB 1: CUSTOMERS */}
            {activeTab === 'customers' && (
                <Card 
                    title={<span className="font-bold text-slate-800">Customer Directory</span>}
                    extra={
                        <Button 
                            type="primary" 
                            icon={<PlusOutlined />} 
                            onClick={() => handleOpenCustModal(null)}
                            className="!bg-blue-600"
                        >
                            Add Customer
                        </Button>
                    }
                    className="officer-card"
                >
                    <Table
                        dataSource={customers}
                        columns={custColumns}
                        rowKey="CUSTOMER_ID"
                        loading={loading}
                        pagination={{ pageSize: 15 }}
                        size="small"
                    />
                </Card>
            )}

            {/* TAB 2: STAFF */}
            {activeTab === 'staff' && (
                <Card 
                    title={<span className="font-bold text-slate-800">Mill Officers & Staff Directory</span>}
                    className="officer-card"
                >
                    <Table
                        dataSource={staffList}
                        columns={staffColumns}
                        rowKey="STAFF_ID"
                        loading={loading}
                        pagination={{ pageSize: 15 }}
                        size="small"
                    />
                </Card>
            )}

            {/* TAB 3: VEHICLES */}
            {activeTab === 'vehicles' && (
                <Card 
                    title={<span className="font-bold text-slate-800">Vehicles & Transport Lorries</span>}
                    extra={
                        <Button 
                            type="primary" 
                            icon={<PlusOutlined />} 
                            onClick={() => {
                                setEditingRecord(null);
                                form.resetFields();
                                setVehModal(true);
                            }}
                            className="!bg-blue-600"
                        >
                            Add Vehicle
                        </Button>
                    }
                    className="officer-card"
                >
                    <Table
                        dataSource={vehicles}
                        columns={vehColumns}
                        rowKey="VEHICLE_ID"
                        loading={loading}
                        pagination={{ pageSize: 15 }}
                        size="small"
                    />
                </Card>
            )}

            {/* TAB 4: PLACES */}
            {activeTab === 'places' && (
                <Card 
                    title={<span className="font-bold text-slate-800">Paddy Sourcing Places & Transport Rates</span>}
                    extra={
                        <Button 
                            type="primary" 
                            icon={<PlusOutlined />} 
                            onClick={() => {
                                setEditingRecord(null);
                                form.resetFields();
                                setPlaceModal(true);
                            }}
                            className="!bg-blue-600"
                        >
                            Add Place
                        </Button>
                    }
                    className="officer-card"
                >
                    <Table
                        dataSource={places}
                        columns={placeColumns}
                        rowKey="PLACE_ID"
                        loading={loading}
                        pagination={{ pageSize: 15 }}
                        size="small"
                    />
                </Card>
            )}

            {/* Customer Add / Edit Modal */}
            <Modal
                title={editingRecord ? '✏️ Edit Customer & Bank Accounts' : '➕ Add Customer'}
                open={custModal}
                onCancel={() => setCustModal(false)}
                footer={null}
                width={520}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleSaveCustomer}>
                    <Form.Item label="Customer Name" name="NAME" rules={[{ required: true, message: 'Required' }]}>
                        <Input placeholder="e.g. Silva Grocery" prefix={<UserOutlined />} />
                    </Form.Item>
                    <Form.Item label="Phone Number" name="PHONE">
                        <Input placeholder="e.g. 0771234567" prefix={<PhoneOutlined />} />
                    </Form.Item>
                    <Form.Item label="Address / Location" name="ADDRESS">
                        <Input.TextArea placeholder="e.g. Embilipitiya" rows={2} />
                    </Form.Item>
                    <Form.Item label="Distance to Customer (km)" name="DISTANCE">
                        <InputNumber min={0} className="w-full" placeholder="e.g. 50" suffix="km" />
                    </Form.Item>

                    <Divider orientation="left" className="!my-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
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

                    <div className="mt-6">
                        <Button type="primary" htmlType="submit" className="w-full !bg-blue-600 font-bold">
                            {editingRecord ? 'Update Customer' : 'Save Customer'}
                        </Button>
                    </div>
                </Form>
            </Modal>

            {/* Customer Quick View Drawer */}
            <Drawer
                title={<span className="font-bold text-slate-800">🔍 Customer Summary: {selectedCustomer?.NAME}</span>}
                placement="right"
                width={600}
                onClose={() => setCustDrawerVisible(false)}
                open={custDrawerVisible}
                destroyOnClose
            >
                {custSummaryLoading ? (
                    <div className="p-8 text-center text-slate-500 font-bold">Loading summary...</div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-4 rounded-2xl shadow-md space-y-2">
                            <div className="text-xl font-bold">{selectedCustomer?.NAME}</div>
                            <div className="text-xs text-blue-200 flex items-center gap-2">
                                <PhoneOutlined /> {selectedCustomer?.PHONE || selectedCustomer?.PHONE_NUMBER || 'No Phone'}
                                <span>•</span>
                                <EnvironmentOutlined /> {selectedCustomer?.ADDRESS || selectedCustomer?.LOCATION || 'No Address'}
                            </div>

                            <div className="mt-2">
                                <div className="text-[11px] font-semibold text-blue-200 mb-1 flex items-center gap-1">
                                    <BankOutlined /> Bank Accounts:
                                </div>
                                {custSummary?.bankAccounts && custSummary.bankAccounts.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {custSummary.bankAccounts.map((b, idx) => (
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

                        <Row gutter={[12, 12]}>
                            <Col span={8}>
                                <Card className="!bg-blue-50/70 border-blue-200 text-center">
                                    <div className="text-xs text-blue-800 font-semibold uppercase">Total Bills</div>
                                    <div className="text-xl font-bold text-blue-900 mt-1">{custSummary?.billsCount || 0}</div>
                                    <div className="text-[11px] text-blue-600 font-mono">
                                        Rs. {Number(custSummary?.totalBillsAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                </Card>
                            </Col>
                            <Col span={8}>
                                <Card className="!bg-amber-50/70 border-amber-200 text-center">
                                    <div className="text-xs text-amber-800 font-semibold uppercase">Credit Total</div>
                                    <div className="text-xl font-bold text-amber-900 mt-1 font-mono">
                                        Rs. {Number(custSummary?.totalCreditAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                </Card>
                            </Col>
                            <Col span={8}>
                                <Card className="!bg-purple-50/70 border-purple-200 text-center">
                                    <div className="text-xs text-purple-800 font-semibold uppercase">Cheques Total</div>
                                    <div className="text-xl font-bold text-purple-900 mt-1 font-mono">
                                        Rs. {Number(custSummary?.totalChequesAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                </Card>
                            </Col>
                        </Row>

                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                            <div className="font-bold text-xs text-slate-700 uppercase">
                                Sales Bills List ({custSummary?.bills?.length || 0})
                            </div>
                            <Table
                                columns={[
                                    { title: 'Invoice No', dataIndex: 'INVOICE_NO', key: 'INVOICE_NO', render: (val, r) => <span className="font-mono font-bold text-xs">{val || `#${r.BILL_ID}`}</span> },
                                    { title: 'Date', dataIndex: 'DATE', key: 'DATE', render: val => val ? dayjs(val).format('YYYY-MM-DD') : '-' },
                                    { title: 'Amount', dataIndex: 'FINAL_AMOUNT', key: 'FINAL_AMOUNT', align: 'right', render: (val, r) => <span className="font-mono text-emerald-600 font-bold">Rs. {Number(val || r.NET_AMOUNT || r.TOTAL_AMOUNT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> },
                                    { title: 'Status', dataIndex: 'IS_SETTLED', key: 'IS_SETTLED', align: 'center', render: val => Number(val) === 1 ? <Tag color="success">SETTLED</Tag> : <Tag color="warning">CREDIT</Tag> }
                                ]}
                                dataSource={custSummary?.bills || []}
                                rowKey="BILL_ID"
                                pagination={{ pageSize: 5 }}
                                size="small"
                            />
                        </div>
                    </div>
                )}
            </Drawer>

            {/* Staff Quick View Drawer */}
            <Drawer
                title={<span className="font-bold text-slate-800">🔍 Staff Performance: {selectedStaff?.NAME}</span>}
                placement="right"
                width={600}
                onClose={() => setStaffDrawerVisible(false)}
                open={staffDrawerVisible}
                destroyOnClose
            >
                {staffSummaryLoading ? (
                    <div className="p-8 text-center text-slate-500 font-bold">Loading staff summary...</div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-4 rounded-2xl shadow-md space-y-2">
                            <div className="text-xl font-bold">{selectedStaff?.NAME}</div>
                            <div className="text-xs text-purple-200 flex items-center gap-2">
                                <Tag color="purple" className="font-bold uppercase text-[10px]">{selectedStaff?.ROLE || 'Staff'}</Tag>
                                <span>•</span>
                                <PhoneOutlined /> {selectedStaff?.PHONE_NUMBER || 'No Phone'}
                                {selectedStaff?.USERNAME && <><span className="text-purple-400">•</span> @{selectedStaff.USERNAME}</>}
                            </div>
                        </div>

                        <Row gutter={[12, 12]}>
                            <Col span={8}>
                                <Card className="!bg-blue-50/70 border-blue-200 text-center">
                                    <div className="text-xs text-blue-800 font-semibold uppercase">Bills Created</div>
                                    <div className="text-xl font-bold text-blue-900 mt-1">{staffSummary?.billsCount || 0}</div>
                                    <div className="text-[11px] text-blue-600 font-mono">
                                        Rs. {Number(staffSummary?.totalBillsAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                </Card>
                            </Col>
                            <Col span={8}>
                                <Card className="!bg-amber-50/70 border-amber-200 text-center">
                                    <div className="text-xs text-amber-800 font-semibold uppercase">Credit Managed</div>
                                    <div className="text-xl font-bold text-amber-900 mt-1 font-mono">
                                        Rs. {Number(staffSummary?.totalCreditAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                </Card>
                            </Col>
                            <Col span={8}>
                                <Card className="!bg-purple-50/70 border-purple-200 text-center">
                                    <div className="text-xs text-purple-800 font-semibold uppercase">Cheques Collected</div>
                                    <div className="text-xl font-bold text-purple-900 mt-1 font-mono">
                                        Rs. {Number(staffSummary?.totalChequesAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </div>
                                </Card>
                            </Col>
                        </Row>

                        <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                            <div className="font-bold text-xs text-slate-700 uppercase">
                                Sales Bills Created by Staff ({staffSummary?.bills?.length || 0})
                            </div>
                            <Table
                                columns={[
                                    { title: 'Invoice No', dataIndex: 'INVOICE_NO', key: 'INVOICE_NO', render: (val, r) => <span className="font-mono font-bold text-xs">{val || `#${r.BILL_ID}`}</span> },
                                    { title: 'Customer', dataIndex: 'CUSTOMER_NAME', key: 'CUSTOMER_NAME', render: val => val || 'Walk-in' },
                                    { title: 'Amount', dataIndex: 'FINAL_AMOUNT', key: 'FINAL_AMOUNT', align: 'right', render: (val, r) => <span className="font-mono text-emerald-600 font-bold">Rs. {Number(val || r.NET_AMOUNT || r.TOTAL_AMOUNT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> },
                                    { title: 'Status', dataIndex: 'IS_SETTLED', key: 'IS_SETTLED', align: 'center', render: val => Number(val) === 1 ? <Tag color="success">SETTLED</Tag> : <Tag color="warning">CREDIT</Tag> }
                                ]}
                                dataSource={staffSummary?.bills || []}
                                rowKey="BILL_ID"
                                pagination={{ pageSize: 5 }}
                                size="small"
                            />
                        </div>
                    </div>
                )}
            </Drawer>

            {/* Vehicle Modal */}
            <Modal
                title={editingRecord ? 'Edit Vehicle' : 'Add Vehicle'}
                open={vehModal}
                onCancel={() => setVehModal(false)}
                footer={null}
            >
                <Form form={form} layout="vertical" onFinish={handleSaveVehicle}>
                    <Form.Item label="Vehicle No" name="VEHICLE_NO" rules={[{ required: true, message: 'Required' }]}>
                        <Input placeholder="e.g. WP NA-5820" />
                    </Form.Item>
                    <Form.Item label="Driver Name" name="DRIVER_NAME">
                        <Input placeholder="e.g. Kamal Perera" />
                    </Form.Item>
                    <Form.Item label="Driver Phone" name="PHONE">
                        <Input placeholder="e.g. 0779876543" />
                    </Form.Item>
                    <Form.Item label="Capacity (KG)" name="CAPACITY_KG">
                        <InputNumber min={0} className="w-full" placeholder="e.g. 10000" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" className="w-full !bg-blue-600">Save Vehicle</Button>
                </Form>
            </Modal>

            {/* Place Modal */}
            <Modal
                title={editingRecord ? 'Edit Sourcing Place' : 'Add Sourcing Place'}
                open={placeModal}
                onCancel={() => setPlaceModal(false)}
                footer={null}
            >
                <Form form={form} layout="vertical" onFinish={handleSavePlace}>
                    <Form.Item label="Place / Field Name" name="NAME" rules={[{ required: true, message: 'Required' }]}>
                        <Input placeholder="e.g. Ampara Field" />
                    </Form.Item>
                    <Form.Item label="District" name="DISTRICT">
                        <Input placeholder="e.g. Ampara" />
                    </Form.Item>
                    <Form.Item label="Transport Rate / KG (Rs)" name="TRANSPORT_RATE_PER_KG">
                        <InputNumber min={0} step={0.1} className="w-full" placeholder="e.g. 3.50" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" className="w-full !bg-blue-600">Save Place</Button>
                </Form>
            </Modal>
        </div>
    );
}
