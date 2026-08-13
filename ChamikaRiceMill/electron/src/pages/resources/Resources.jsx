import React, { useState, useEffect } from 'react';
import { 
    Card, Tabs, Table, Button, Modal, Form, Input, InputNumber, 
    Tag, message, Row, Col, Space 
} from 'antd';
import { 
    TeamOutlined, CarOutlined, EnvironmentOutlined, PlusOutlined, 
    EditOutlined, SyncOutlined, UserOutlined 
} from '@ant-design/icons';
import db from '../../services/db';
import syncService from '../../services/syncService';

export default function Resources() {
    const [activeTab, setActiveTab] = useState('customers');
    const [customers, setCustomers] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [places, setPlaces] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modals
    const [custModal, setCustModal] = useState(false);
    const [vehModal, setVehModal] = useState(false);
    const [placeModal, setPlaceModal] = useState(false);

    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();

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
            const [cList, vList, pList] = await Promise.all([
                db.customers.toArray(),
                db.vehicles.toArray(),
                db.places.toArray()
            ]);
            setCustomers(cList || []);
            setVehicles(vList || []);
            setPlaces(pList || []);
        } catch (e) {
            console.error('Error loading resources:', e);
        } finally {
            setLoading(false);
        }
    };

    // Customer Save
    const handleSaveCustomer = async (values) => {
        try {
            if (editingRecord) {
                await db.customers.update(editingRecord.CUSTOMER_ID, values);
                message.success('Customer updated');
            } else {
                await db.customers.add({
                    CUSTOMER_ID: Date.now(),
                    ...values,
                    BALANCE: 0
                });
                message.success('Customer added');
            }
            setCustModal(false);
            form.resetFields();
            loadAll();
        } catch (e) {
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
            render: val => <strong className="text-slate-900">{val}</strong>
        },
        {
            title: 'Phone',
            dataIndex: 'PHONE',
            key: 'PHONE',
            render: val => <span className="text-xs text-gray-600">{val || '-'}</span>
        },
        {
            title: 'Address / Area',
            dataIndex: 'ADDRESS',
            key: 'ADDRESS',
            render: val => <span className="text-xs text-gray-600">{val || '-'}</span>
        },
        {
            title: 'Outstanding Balance',
            dataIndex: 'BALANCE',
            key: 'BALANCE',
            align: 'right',
            render: val => (
                <span className={`font-mono font-bold ${Number(val) > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    Rs. {Number(val || 0).toFixed(2)}
                </span>
            )
        },
        {
            title: 'Credit Limit',
            dataIndex: 'CREDIT_LIMIT',
            key: 'CREDIT_LIMIT',
            align: 'right',
            render: val => <span className="font-mono text-xs text-gray-500">Rs. {Number(val || 0).toFixed(2)}</span>
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
                        setCustModal(true);
                    }}
                />
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
                        <p className="text-xs text-slate-500 m-0">Manage Customers, Transport Lorries, and Paddy Sourcing Locations</p>
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
                            onClick={() => {
                                setEditingRecord(null);
                                form.resetFields();
                                setCustModal(true);
                            }}
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

            {/* TAB 2: VEHICLES */}
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

            {/* TAB 3: PLACES */}
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

            {/* Customer Modal */}
            <Modal
                title={editingRecord ? 'Edit Customer' : 'Add Customer'}
                open={custModal}
                onCancel={() => setCustModal(false)}
                footer={null}
            >
                <Form form={form} layout="vertical" onFinish={handleSaveCustomer}>
                    <Form.Item label="Customer Name" name="NAME" rules={[{ required: true, message: 'Required' }]}>
                        <Input placeholder="e.g. Silva Grocery" />
                    </Form.Item>
                    <Form.Item label="Phone Number" name="PHONE">
                        <Input placeholder="e.g. 0771234567" />
                    </Form.Item>
                    <Form.Item label="Address" name="ADDRESS">
                        <Input placeholder="e.g. Embilipitiya" />
                    </Form.Item>
                    <Form.Item label="Credit Limit (Rs)" name="CREDIT_LIMIT">
                        <InputNumber min={0} className="w-full" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" className="w-full !bg-blue-600">Save Customer</Button>
                </Form>
            </Modal>

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
