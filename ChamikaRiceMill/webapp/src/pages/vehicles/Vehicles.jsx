import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Form, Modal, Popconfirm, Tag, Select, App, Card, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, CarOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Option } = Select;

const VEHICLE_TYPES = [
    { value: 'Lorry', label: 'Lorry 🚚' },
    { value: 'Tractor', label: 'Tractor 🚜' },
    { value: 'Truck', label: 'Truck 🚛' },
    { value: 'Van', label: 'Van 🚐' },
    { value: 'Other', label: 'Other' },
];

export default function Vehicles() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [vehicles, setVehicles] = useState([]);
    const [driversList, setDriversList] = useState([]);
    const [filteredVehicles, setFilteredVehicles] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');

    // Modal state
    const [modalVisible, setModalVisible] = useState(false);
    const [editingVehicle, setEditingVehicle] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    const [form] = Form.useForm();

    useEffect(() => {
        fetchVehicles();
    }, []);

    useEffect(() => {
        filterData();
    }, [searchText, typeFilter, vehicles]);

    const fetchVehicles = async () => {
        setLoading(true);
        try {
            const [vRes, sRes] = await Promise.all([
                axios.get('/api/mill/vehicles/list', { withCredentials: true }),
                axios.get('/api/mill/staff/list?role=driver', { withCredentials: true })
            ]);
            if (vRes.data.success) {
                setVehicles(vRes.data.result || []);
            }
            if (sRes.data.success) {
                setDriversList(sRes.data.result || []);
            }
        } catch (e) {
            console.error('Error loading vehicles:', e);
            message.error('Failed to load vehicles');
        } finally {
            setLoading(false);
        }
    };

    const filterData = () => {
        let temp = [...vehicles];

        if (typeFilter !== 'all') {
            temp = temp.filter(v => (v.VEHICLE_TYPE || 'Lorry') === typeFilter);
        }

        if (searchText.trim()) {
            const query = searchText.toLowerCase();
            temp = temp.filter(v =>
                v.VEHICLE_NO?.toLowerCase().includes(query) ||
                v.DRIVER_NAME?.toLowerCase().includes(query) ||
                v.REMARK?.toLowerCase().includes(query)
            );
        }

        setFilteredVehicles(temp);
    };

    const handleOpenAdd = () => {
        setEditingVehicle(null);
        form.resetFields();
        form.setFieldsValue({ VEHICLE_TYPE: 'Lorry' });
        setModalVisible(true);
    };

    const handleOpenEdit = (record) => {
        setEditingVehicle(record);
        form.setFieldsValue({
            VEHICLE_NO: record.VEHICLE_NO,
            VEHICLE_TYPE: record.VEHICLE_TYPE || 'Lorry',
            DRIVER_NAME: record.DRIVER_NAME || '',
            REMARK: record.REMARK || ''
        });
        setModalVisible(true);
    };

    const handleDelete = async (id) => {
        try {
            const res = await axios.post('/api/mill/vehicles/delete', { VEHICLE_ID: id }, { withCredentials: true });
            if (res.data.success) {
                message.success('Vehicle deleted');
                fetchVehicles();
            } else {
                message.error(res.data.message || 'Failed to delete vehicle');
            }
        } catch (e) {
            console.error(e);
            message.error('Error deleting vehicle');
        }
    };

    const handleFormSubmit = async (values) => {
        setSubmitting(true);
        try {
            const endpoint = editingVehicle ? '/api/mill/vehicles/update' : '/api/mill/vehicles/add';
            const payload = editingVehicle ? { ...values, VEHICLE_ID: editingVehicle.VEHICLE_ID } : values;

            const res = await axios.post(endpoint, payload, { withCredentials: true });
            if (res.data.success) {
                message.success(editingVehicle ? 'Vehicle updated' : 'Vehicle added');
                setModalVisible(false);
                fetchVehicles();
            } else {
                message.error(res.data.message || 'Failed to save vehicle');
            }
        } catch (e) {
            console.error(e);
            message.error(e.response?.data?.message || 'Error saving vehicle');
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            title: 'Vehicle No',
            dataIndex: 'VEHICLE_NO',
            key: 'VEHICLE_NO',
            render: text => <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{text}</span>
        },
        {
            title: 'Vehicle Type',
            dataIndex: 'VEHICLE_TYPE',
            key: 'VEHICLE_TYPE',
            render: type => {
                const colors = { Lorry: 'blue', Tractor: 'green', Truck: 'orange', Van: 'purple' };
                return <Tag color={colors[type] || 'default'}>{type || 'Lorry'}</Tag>;
            }
        },
        {
            title: 'Assigned Driver',
            dataIndex: 'DRIVER_NAME',
            key: 'DRIVER_NAME',
            render: text => text || <span className="text-gray-400 text-xs">-</span>
        },
        {
            title: 'Remark / Notes',
            dataIndex: 'REMARK',
            key: 'REMARK',
            render: text => text || <span className="text-gray-400 text-xs">-</span>
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            width: 120,
            render: (_, record) => (
                <div className="flex gap-2 justify-center">
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)} />
                    <Popconfirm
                        title="Delete vehicle?"
                        onConfirm={() => handleDelete(record.VEHICLE_ID)}
                        okText="Yes"
                        cancelText="No"
                        okButtonProps={{ danger: true }}
                    >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    onClick={handleOpenAdd}
                    className="!bg-emerald-600 hover:!bg-emerald-700 h-10 rounded-xl font-bold shadow-md"
                >
                    Add New Vehicle
                </Button>
            </div>

            {/* Filter Bar */}
            <Card size="small" className="shadow-sm">
                <Row gutter={[12, 12]}>
                    <Col xs={24} sm={12} md={16}>
                        <Input
                            placeholder="Search by Vehicle No, Driver, or Remarks..."
                            prefix={<SearchOutlined />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            allowClear
                        />
                    </Col>
                    <Col xs={24} sm={12} md={8}>
                        <Select className="w-full" value={typeFilter} onChange={setTypeFilter}>
                            <Option value="all">All Vehicle Types</Option>
                            {VEHICLE_TYPES.map(t => (
                                <Option key={t.value} value={t.value}>{t.label}</Option>
                            ))}
                        </Select>
                    </Col>
                </Row>
            </Card>

            {/* Desktop Table View */}
            <div className="hidden md:block">
                <Card size="small" className="shadow-sm overflow-hidden">
                    <Table
                        columns={columns}
                        dataSource={filteredVehicles}
                        rowKey="VEHICLE_ID"
                        loading={loading}
                        pagination={{ pageSize: 10 }}
                    />
                </Card>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3 pb-20">
                {filteredVehicles.length === 0 ? (
                    <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                        No vehicles found
                    </div>
                ) : (
                    filteredVehicles.map((record) => (
                        <div 
                            key={record.VEHICLE_ID} 
                            onClick={() => handleOpenEdit(record)}
                            className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-mono font-bold text-white text-base">{record.VEHICLE_NO}</div>
                                    <div className="text-xs text-gray-400">{record.VEHICLE_TYPE?.toUpperCase() || 'Lorry'}</div>
                                </div>
                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Button 
                                        size="small" 
                                        icon={<EditOutlined />} 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenEdit(record);
                                        }} 
                                    />
                                    <Popconfirm title="Delete vehicle?" onConfirm={() => handleDelete(record.VEHICLE_ID)} okText="Yes" cancelText="No" okButtonProps={{ danger: true }}>
                                        <Button 
                                            size="small" 
                                            danger 
                                            icon={<DeleteOutlined />} 
                                            onClick={(e) => e.stopPropagation()} 
                                        />
                                    </Popconfirm>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-900/60 p-2.5 rounded-xl border border-white/5">
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Driver</span>
                                    <span className="font-semibold text-white">{record.DRIVER_NAME || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Capacity</span>
                                    <span className="font-bold text-emerald-400 font-mono">
                                        {record.MAX_CAPACITY_KG ? `${record.MAX_CAPACITY_KG} kg` : '-'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add / Edit Modal */}
            <Modal
                title={editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                footer={null}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleFormSubmit}>
                    <Form.Item
                        name="VEHICLE_NO"
                        label="Vehicle Number"
                        rules={[{ required: true, message: 'Please enter vehicle number (e.g. VR-2435)' }]}
                    >
                        <Input placeholder="e.g. VR-2435 / WP CA-1234" />
                    </Form.Item>

                    <Form.Item
                        name="VEHICLE_TYPE"
                        label="Vehicle Type"
                        rules={[{ required: true }]}
                    >
                        <Select>
                            {VEHICLE_TYPES.map(t => (
                                <Option key={t.value} value={t.value}>{t.label}</Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="DRIVER_NAME" label="Assigned Driver (Optional)">
                        <Select showSearch placeholder="Select Assigned Driver..." allowClear optionFilterProp="children">
                            {driversList.map(d => (
                                <Option key={d.STAFF_ID} value={d.NAME}>
                                    {d.NAME} {d.PHONE_NUMBER ? `(${d.PHONE_NUMBER})` : ''}
                                </Option>
                            ))}
                        </Select>
                    </Form.Item>

                    <Form.Item name="REMARK" label="Remark / Note">
                        <Input.TextArea rows={2} placeholder="Optional remark" />
                    </Form.Item>

                    <div className="flex justify-end gap-2 pt-3 border-t">
                        <Button onClick={() => setModalVisible(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={submitting}>
                            {editingVehicle ? 'Update Vehicle' : 'Add Vehicle'}
                        </Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
