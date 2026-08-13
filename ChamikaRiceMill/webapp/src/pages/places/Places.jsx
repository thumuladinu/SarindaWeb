import React, { useState, useEffect } from 'react';
import { Table, Button, Input, App, Form, Popconfirm, Drawer } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, PlusOutlined, EnvironmentOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';
import { canModify, toSLDateDisplay } from '../../utils/helpers';

export default function Places() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [searchText, setSearchText] = useState('');

    const currentUser = JSON.parse(Cookies.get('millUser') || '{}');
    const userCanModify = canModify(currentUser.ROLE);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingPlace, setEditingPlace] = useState(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    const fetchPlaces = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/api/mill/places');
            if (response.data.success) {
                setData(response.data.result || []);
                setFilteredData(response.data.result || []);
            }
        } catch (error) {
            console.error("Error fetching places:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPlaces(); }, []);

    const handleSearch = (e) => {
        const value = e.target.value.toLowerCase();
        setSearchText(value);
        if (!value) {
            setFilteredData(data);
            return;
        }
        setFilteredData(data.filter(p =>
            (p.NAME && p.NAME.toLowerCase().includes(value)) ||
            (p.DISTRICT && p.DISTRICT.toLowerCase().includes(value))
        ));
    };

    const handleAddNew = () => {
        setEditingPlace(null);
        form.resetFields();
        setDrawerOpen(true);
    };

    const handleEdit = (record) => {
        setEditingPlace(record);
        form.setFieldsValue({
            NAME: record.NAME,
            DISTRICT: record.DISTRICT,
            DESCRIPTION: record.DESCRIPTION,
        });
        setDrawerOpen(true);
    };

    const handleDelete = async (record) => {
        try {
            const res = await axios.post('/api/mill/places/deactivate', { PLACE_ID: record.PLACE_ID });
            if (res.data.success) {
                message.success('Place deactivated');
                fetchPlaces();
            }
        } catch {
            message.error('Error deactivating place');
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);

            if (editingPlace) {
                const res = await axios.post('/api/mill/places/update', {
                    PLACE_ID: editingPlace.PLACE_ID,
                    ...values,
                });
                if (res.data.success) {
                    message.success('Place updated');
                    setDrawerOpen(false);
                    fetchPlaces();
                } else {
                    message.error(res.data.message || 'Failed to update');
                }
            } else {
                const res = await axios.post('/api/mill/places/add', values);
                if (res.data.success) {
                    message.success('Place added');
                    setDrawerOpen(false);
                    fetchPlaces();
                } else {
                    message.error(res.data.message || 'Failed to add');
                }
            }
        } catch (error) {
            console.error('Submit error:', error);
            message.error('Failed to save place');
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'NAME',
            key: 'NAME',
            render: (text) => (
                <div className="flex items-center gap-2">
                    <EnvironmentOutlined className="text-blue-500" />
                    <span className="font-semibold">{text}</span>
                </div>
            ),
        },
        {
            title: 'District',
            dataIndex: 'DISTRICT',
            key: 'DISTRICT',
            render: (text) => text || '-',
        },
        {
            title: 'Description',
            dataIndex: 'DESCRIPTION',
            key: 'DESCRIPTION',
            responsive: ['md'],
            ellipsis: true,
            render: (text) => text || '-',
        },
        {
            title: 'Last Updated',
            dataIndex: 'EDITED_DATE',
            key: 'EDITED_DATE',
            width: 140,
            responsive: ['lg'],
            render: (text) => toSLDateDisplay(text),
        },
        ...(userCanModify ? [{
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_, record) => (
                <div className="flex gap-2">
                    <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} className="!text-blue-500 hover:!text-blue-400" />
                    <Popconfirm title="Are you sure?" onConfirm={() => handleDelete(record)} okText="Yes" cancelText="No">
                        <Button size="small" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                </div>
            ),
        }] : []),
    ];

    return (
        <div className="space-y-4">
            {/* Header Action Row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <Input
                    placeholder="Search places..."
                    prefix={<SearchOutlined className="text-gray-400" />}
                    value={searchText}
                    onChange={handleSearch}
                    allowClear
                    className="w-full sm:w-64 h-10 rounded-xl"
                />
                {userCanModify && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNew} className="h-10 rounded-xl font-bold shadow-md">
                        Add Place
                    </Button>
                )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    loading={loading}
                    rowKey="PLACE_ID"
                    pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (total) => `${total} places` }}
                    scroll={{ x: 500 }}
                    size="small"
                />
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3 pb-20">
                {filteredData.length === 0 ? (
                    <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                        No places found
                    </div>
                ) : (
                    filteredData.map((record) => (
                        <div 
                            key={record.PLACE_ID} 
                            onClick={() => userCanModify && handleEdit(record)}
                            className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-white text-base">{record.NAME}</div>
                                    <div className="text-xs text-gray-400 font-mono">Code: {record.CODE}</div>
                                </div>
                                {userCanModify && (
                                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Button 
                                            size="small" 
                                            icon={<EditOutlined />} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleEdit(record);
                                            }} 
                                        />
                                        <Popconfirm title="Are you sure?" onConfirm={() => handleDelete(record)} okText="Yes" cancelText="No">
                                            <Button 
                                                size="small" 
                                                danger 
                                                icon={<DeleteOutlined />} 
                                                onClick={(e) => e.stopPropagation()} 
                                            />
                                        </Popconfirm>
                                    </div>
                                )}
                            </div>

                            {record.DESCRIPTION && (
                                <div className="text-xs text-gray-400 bg-zinc-900/50 p-2 rounded-lg">
                                    {record.DESCRIPTION}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Add/Edit Drawer */}
            <Drawer
                title={editingPlace ? 'Edit Place' : 'Add New Place'}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                width={400}
                extra={
                    <Button type="primary" loading={submitting} onClick={handleSubmit}>
                        {editingPlace ? 'Update' : 'Save'}
                    </Button>
                }
            >
                <Form form={form} layout="vertical" size="large">
                    <Form.Item name="NAME" label="Place Name" rules={[{ required: true, message: 'Name is required' }]}>
                        <Input placeholder="e.g., Anuradhapura" />
                    </Form.Item>
                    <Form.Item name="DISTRICT" label="District">
                        <Input placeholder="e.g., North Central" />
                    </Form.Item>
                    <Form.Item name="DESCRIPTION" label="Description">
                        <Input.TextArea rows={3} placeholder="Additional details about this location..." />
                    </Form.Item>
                </Form>
            </Drawer>
        </div>
    );
}
