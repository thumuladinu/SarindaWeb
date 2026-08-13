import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Modal, Form, Typography, Space, message, Popconfirm, Tooltip, Drawer } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import axios from 'axios';

const { Title, Text } = Typography;

export default function Customers() {
    const [customers, setCustomers] = useState([]);
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchCustomers();
    }, []);

    useEffect(() => {
        if (searchText) {
            const lower = searchText.toLowerCase();
            setFilteredCustomers(customers.filter(c => 
                (c.NAME && c.NAME.toLowerCase().includes(lower)) ||
                (c.PHONE_NUMBER && c.PHONE_NUMBER.includes(lower)) ||
                (c.ADDRESS && c.ADDRESS.toLowerCase().includes(lower))
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
                // Sort newest first
                data.sort((a, b) => new Date(b.CREATED_DATE) - new Date(a.CREATED_DATE));
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
        setDrawerVisible(true);
    };

    const handleEdit = (record) => {
        setEditingCustomer(record);
        form.setFieldsValue(record);
        setDrawerVisible(true);
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
            if (editingCustomer) {
                const payload = { CUSTOMER_ID: editingCustomer.CUSTOMER_ID, ...values };
                const res = await axios.post('/api/MillupdateCustomer', payload, { withCredentials: true });
                if (res.data.success) {
                    message.success('Customer updated successfully');
                    setDrawerVisible(false);
                    fetchCustomers();
                } else {
                    message.error('Failed to update customer');
                }
            } else {
                // Add new
                const res = await axios.post('/api/MilladdCustomer', values, { withCredentials: true });
                if (res.data.success) {
                    message.success('Customer added successfully');
                    setDrawerVisible(false);
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
            title: 'Name',
            dataIndex: 'NAME',
            key: 'NAME',
            render: text => <Text strong>{text}</Text>
        },
        {
            title: 'Phone Number',
            dataIndex: 'PHONE_NUMBER',
            key: 'PHONE_NUMBER',
            render: text => text || '-'
        },
        {
            title: 'Address / Location',
            dataIndex: 'ADDRESS',
            key: 'ADDRESS',
            render: text => text || '-'
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            width: 150,
            render: (_, record) => (
                <Space>
                    <Tooltip title="Edit">
                        <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    </Tooltip>
                    <Popconfirm
                        title="Are you sure you want to delete this customer?"
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

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    size="large"
                    onClick={handleAdd}
                    className="shadow-lg hover:shadow-xl transition-all"
                >
                    Add Customer
                </Button>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block page-paper overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-white/10">
                    <Input
                        placeholder="Search by name, phone, or location..."
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
                    pagination={{ pageSize: 15 }}
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
                            onClick={() => handleEdit(record)}
                            className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-white text-base">{record.NAME}</div>
                                    <div className="text-xs text-gray-400">{record.LOCATION || 'No Location'}</div>
                                </div>
                                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Button 
                                        size="small" 
                                        icon={<EditOutlined />} 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEdit(record);
                                        }} 
                                    />
                                    <Popconfirm title="Delete this customer?" onConfirm={() => handleDelete(record.CUSTOMER_ID)} okText="Yes" cancelText="No">
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
                                    <span className="text-gray-400 block text-[10px]">Phone</span>
                                    <span className="font-semibold text-white">{record.PHONE || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Outstanding</span>
                                    <span className={`font-bold font-mono ${(record.OUTSTANDING_BALANCE || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                        Rs. {parseFloat(record.OUTSTANDING_BALANCE || 0).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <Drawer
                title={editingCustomer ? "Edit Customer" : "Add New Customer"}
                placement="right"
                size="default"
                onClose={() => setDrawerVisible(false)}
                open={drawerVisible}
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
                        rules={[{ required: true, message: 'Please enter the name' }]}
                    >
                        <Input placeholder="Enter name" />
                    </Form.Item>

                    <Form.Item 
                        name="PHONE_NUMBER" 
                        label="Phone Number"
                    >
                        <Input placeholder="Enter phone number" />
                    </Form.Item>

                    <Form.Item 
                        name="ADDRESS" 
                        label="Address / Location"
                    >
                        <Input.TextArea placeholder="Enter address or location" rows={3} />
                    </Form.Item>

                    <div className="flex justify-end gap-3 mt-8">
                        <Button onClick={() => setDrawerVisible(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={submitting}>
                            {editingCustomer ? 'Update' : 'Save'}
                        </Button>
                    </div>
                </Form>
            </Drawer>
        </div>
    );
}
