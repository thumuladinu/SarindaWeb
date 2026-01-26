import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Input, Modal, App, Tag, Tooltip, Row, Col, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';
import CustomerForm from './CustomerForm';

const Customers = () => {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [customers, setCustomers] = useState([]);
    const [filteredCustomers, setFilteredCustomers] = useState([]);
    const [searchText, setSearchText] = useState('');

    // Modal states
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formMode, setFormMode] = useState('add');
    const [selectedCustomer, setSelectedCustomer] = useState(null);

    // Current User Logic
    const currentUser = JSON.parse(Cookies.get('rememberedUser') || '{}');

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/api/getAllCustomers');
            if (response.data.success) {
                const data = response.data.result || [];
                setCustomers(data);
                setFilteredCustomers(data);
                // Re-apply search if exists
                if (searchText) {
                    handleSearch(searchText, data);
                }
            }
        } catch (error) {
            console.error('Error fetching customers:', error);
            message.error('Failed to load customers');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const handleSearch = (value, dataToFilter = customers) => {
        setSearchText(value);
        if (!value) {
            setFilteredCustomers(dataToFilter);
            return;
        }
        const lowerVal = value.toLowerCase();
        const filtered = dataToFilter.filter(item =>
            (item.NAME && item.NAME.toLowerCase().includes(lowerVal)) ||
            (item.PHONE_NUMBER && item.PHONE_NUMBER.includes(lowerVal)) ||
            (String(item.CUSTOMER_ID).includes(lowerVal))
        );
        setFilteredCustomers(filtered);
    };

    const handleAdd = () => {
        setFormMode('add');
        setSelectedCustomer(null);
        setIsFormOpen(true);
    };

    const handleEdit = (record) => {
        setFormMode('edit');
        setSelectedCustomer(record);
        setIsFormOpen(true);
    };

    const handleDelete = async (id) => {
        try {
            const response = await axios.post('/api/deactivateCustomer', {
                CUSTOMER_ID: id
            });

            if (response.data.success) {
                message.success('Customer deleted successfully');
                fetchCustomers();
            } else {
                message.error('Failed to delete customer');
            }
        } catch (error) {
            console.error('Delete error:', error);
            message.error('Delete failed');
        }
    };

    const columns = [
        {
            title: 'Code',
            dataIndex: 'CUSTOMER_ID',
            key: 'CUSTOMER_ID',
            width: 100,
            className: 'text-gray-700 dark:text-gray-300 font-medium font-mono',
            render: (text) => <span className="text-blue-600 dark:text-blue-400 font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md text-xs">CUS{String(text).padStart(3, '0')}</span>
        },
        {
            title: 'Name',
            dataIndex: 'NAME',
            key: 'NAME',
            className: 'text-gray-800 dark:text-gray-200 font-semibold',
            render: (text) => <span className="text-base">{text}</span>
        },
        {
            title: 'Phone',
            dataIndex: 'PHONE_NUMBER',
            key: 'PHONE_NUMBER',
            className: 'text-gray-600 dark:text-gray-400',
        },
        {
            title: 'NIC',
            dataIndex: 'NIC',
            key: 'NIC',
            responsive: ['md'],
            className: 'text-gray-500 dark:text-gray-500 font-mono text-xs'
        },
        {
            title: 'Company',
            dataIndex: 'COMPANY',
            key: 'COMPANY',
            responsive: ['lg'],
            className: 'text-gray-600 dark:text-gray-400'
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            align: 'center',
            render: (_, record) => (
                <div className="flex gap-2 justify-center">
                    <Tooltip title="Edit">
                        <Button
                            onClick={() => handleEdit(record)}
                            type="text"
                            shape="circle"
                            icon={<EditOutlined />}
                            className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                        />
                    </Tooltip>
                    <Popconfirm
                        title="Delete customer?"
                        description="Are you sure you want to delete this customer?"
                        onConfirm={() => handleDelete(record.CUSTOMER_ID)}
                        okText="Yes"
                        cancelText="No"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="Delete">
                            <Button
                                type="text"
                                shape="circle"
                                icon={<DeleteOutlined />}
                                danger
                                className="hover:bg-red-50 dark:hover:bg-red-500/10"
                            />
                        </Tooltip>
                    </Popconfirm>
                </div>
            )
        }
    ].filter(col => {
        if (currentUser?.ROLE === 'MONITOR' && col.key === 'actions') return false;
        return true;
    });

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="hidden md:block">
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white m-0">Customers</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage your customer database</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <Input
                        placeholder="Search customers..."
                        allowClear
                        value={searchText}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="w-full md:w-64"
                        prefix={<SearchOutlined className="text-gray-400" />}
                    />
                    {currentUser?.ROLE !== 'MONITOR' && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} className="bg-blue-600 hover:bg-blue-500 border-none shadow-lg shadow-blue-500/30">
                            Add Customer
                        </Button>
                    )}
                </div>
            </div>

            {/* Desktop View */}
            <div className="hidden md:block glass-card rounded-2xl overflow-hidden p-1 border border-gray-100 dark:border-white/5 shadow-sm">
                <Table
                    columns={columns}
                    dataSource={filteredCustomers}
                    rowKey="CUSTOMER_ID"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                    size="middle"
                    rowClassName="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    onRow={(record) => ({
                        onClick: (e) => {
                            if (e.target.closest('button')) return;
                            handleEdit(record);
                        },
                    })}
                />
            </div>

            {/* Mobile View */}
            <div className="md:hidden flex flex-col gap-3">
                {loading ? (
                    <div className="flex justify-center p-8"><div className="loading-spinner"></div></div>
                ) : (
                    filteredCustomers.map(record => (
                        <div key={record.CUSTOMER_ID} className="glass-card p-4 rounded-xl flex flex-col gap-3 relative border border-gray-100 dark:border-white/5">
                            {currentUser?.ROLE !== 'MONITOR' && (
                                <div className="absolute top-2 right-2 flex gap-1 z-10">
                                    <Button onClick={(e) => { e.stopPropagation(); handleEdit(record); }} size="small" type="text" shape="circle" icon={<EditOutlined />} className="text-blue-500 hover:text-blue-600 bg-transparent border-none shadow-none" />
                                </div>
                            )}

                            <div className="flex justify-between items-start pr-8">
                                <div className="flex flex-col">
                                    <span className="text-xs text-blue-500 font-mono font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md w-fit mb-1">CUS{String(record.CUSTOMER_ID).padStart(3, '0')}</span>
                                    <div className="font-bold text-lg text-gray-800 dark:text-gray-100">{record.NAME}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {record.PHONE_NUMBER && <div className="flex items-center gap-1"><span className="text-xs opacity-70">Phone:</span> {record.PHONE_NUMBER}</div>}
                                {record.NIC && <div className="flex items-center gap-1"><span className="text-xs opacity-70">NIC:</span> {record.NIC}</div>}
                                {record.COMPANY && <div className="col-span-2 flex items-center gap-1"><span className="text-xs opacity-70">Company:</span> {record.COMPANY}</div>}
                            </div>

                            {record.ADDRESS && <div className="text-xs text-gray-500 dark:text-gray-500 border-t border-gray-100 dark:border-white/5 pt-2 mt-1">{record.ADDRESS}</div>}

                            {currentUser?.ROLE !== 'MONITOR' && (
                                <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-100 dark:border-white/5">
                                    <span className="text-xs text-gray-400">Manage Customer</span>
                                    <Popconfirm
                                        title="Delete?"
                                        onConfirm={() => handleDelete(record.CUSTOMER_ID)}
                                        okButtonProps={{ danger: true }}
                                    >
                                        <Button size="small" danger icon={<DeleteOutlined />} className="border-red-500/20 hover:border-red-500/50 bg-red-500/5">Delete</Button>
                                    </Popconfirm>
                                </div>
                            )}
                        </div>
                    ))
                )}
                {!loading && filteredCustomers.length === 0 && (
                    <div className="text-center py-10 text-gray-500 bg-white/50 dark:bg-white/5 rounded-xl">No customers found</div>
                )}
            </div>

            <CustomerForm
                open={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSuccess={fetchCustomers}
                mode={formMode}
                initialValues={selectedCustomer}
            />
        </div>
    );
};

export default Customers;
