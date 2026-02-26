import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Input, Modal, App, Tag, Tooltip, Row, Col, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, EnvironmentOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';
import DestinationForm from './DestinationForm';

const Destinations = () => {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [destinations, setDestinations] = useState([]);
    const [filteredDestinations, setFilteredDestinations] = useState([]);
    const [searchText, setSearchText] = useState('');

    // Modal states
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formMode, setFormMode] = useState('add');
    const [selectedDestination, setSelectedDestination] = useState(null);

    // Current User Logic
    const currentUser = JSON.parse(Cookies.get('rememberedUser') || '{}');

    const fetchDestinations = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/api/getAllDestinations');
            if (response.data.success) {
                const data = response.data.result || [];
                setDestinations(data);
                setFilteredDestinations(data);

                if (searchText) {
                    handleSearch(searchText, data);
                }
            }
        } catch (error) {
            console.error('Error fetching destinations:', error);
            message.error('Failed to load destinations');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDestinations();
    }, []);

    const handleSearch = (value, dataToFilter = destinations) => {
        setSearchText(value);
        if (!value) {
            setFilteredDestinations(dataToFilter);
            return;
        }
        const lowerVal = value.toLowerCase();
        const filtered = dataToFilter.filter(item =>
            (item.NAME && item.NAME.toLowerCase().includes(lowerVal)) ||
            (item.CODE && item.CODE.toLowerCase().includes(lowerVal))
        );
        setFilteredDestinations(filtered);
    };

    const handleAdd = () => {
        setFormMode('add');
        setSelectedDestination(null);
        setIsFormOpen(true);
    };

    const handleEdit = (record) => {
        setFormMode('edit');
        setSelectedDestination(record);
        setIsFormOpen(true);
    };

    const handleDelete = async (id) => {
        try {
            const response = await axios.post('/api/deactivateDestination', {
                DESTINATION_ID: id
            });

            if (response.data.success) {
                message.success('Destination deleted successfully');
                fetchDestinations();
            } else {
                message.error('Failed to delete destination');
            }
        } catch (error) {
            console.error('Delete error:', error);
            message.error('Delete failed');
        }
    };

    const columns = [
        {
            title: 'Code',
            dataIndex: 'CODE',
            key: 'CODE',
            width: 150,
            className: 'text-gray-700 dark:text-gray-300 font-medium font-mono',
            render: (text) => <span className="text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-md text-xs">{text}</span>
        },
        {
            title: 'Destination Name',
            dataIndex: 'NAME',
            key: 'NAME',
            className: 'text-gray-800 dark:text-gray-200 font-semibold',
            render: (text) => <span className="text-base">{text}</span>
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
                        title="Delete destination?"
                        description="Are you sure you want to delete this destination?"
                        onConfirm={() => handleDelete(record.DESTINATION_ID)}
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
        <div className="animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 mt-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white m-0">Delivery Destinations</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Manage predefined delivery locations</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <Input
                        placeholder="Search destinations..."
                        allowClear
                        value={searchText}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="w-full md:w-64"
                        prefix={<SearchOutlined className="text-gray-400" />}
                    />
                    {currentUser?.ROLE !== 'MONITOR' && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-500 border-none shadow-lg shadow-emerald-500/30">
                            Add Destination
                        </Button>
                    )}
                </div>
            </div>

            {/* Desktop View */}
            <div className="hidden md:block glass-card rounded-2xl overflow-hidden p-1 border border-gray-100 dark:border-white/5 shadow-sm">
                <Table
                    columns={columns}
                    dataSource={filteredDestinations}
                    rowKey="DESTINATION_ID"
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
                    filteredDestinations.map(record => (
                        <div key={record.DESTINATION_ID} className="glass-card p-4 rounded-xl flex flex-col gap-3 relative border border-gray-100 dark:border-white/5">
                            {currentUser?.ROLE !== 'MONITOR' && (
                                <div className="absolute top-2 right-2 flex gap-1 z-10">
                                    <Button onClick={(e) => { e.stopPropagation(); handleEdit(record); }} size="small" type="text" shape="circle" icon={<EditOutlined />} className="text-blue-500 hover:text-blue-600 bg-transparent border-none shadow-none" />
                                </div>
                            )}

                            <div className="flex justify-between items-start pr-8">
                                <div className="flex flex-col">
                                    <span className="text-xs text-emerald-500 font-mono font-bold bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-md w-fit mb-1">{record.CODE}</span>
                                    <div className="font-bold text-lg text-gray-800 dark:text-gray-100">{record.NAME}</div>
                                </div>
                            </div>

                            {currentUser?.ROLE !== 'MONITOR' && (
                                <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-100 dark:border-white/5">
                                    <span className="text-xs text-gray-400">Manage Location</span>
                                    <Popconfirm
                                        title="Delete?"
                                        onConfirm={() => handleDelete(record.DESTINATION_ID)}
                                        okButtonProps={{ danger: true }}
                                    >
                                        <Button size="small" danger icon={<DeleteOutlined />} className="border-red-500/20 hover:border-red-500/50 bg-red-500/5">Delete</Button>
                                    </Popconfirm>
                                </div>
                            )}
                        </div>
                    ))
                )}
                {!loading && filteredDestinations.length === 0 && (
                    <div className="text-center py-10 text-gray-500 bg-white/50 dark:bg-white/5 rounded-xl">No destinations found</div>
                )}
            </div>

            <DestinationForm
                open={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSuccess={fetchDestinations}
                mode={formMode}
                initialValues={selectedDestination}
            />
        </div>
    );
};

export default Destinations;
