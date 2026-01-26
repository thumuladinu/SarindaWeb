import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Input, App, Tooltip, Popconfirm, Tag } from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, UserOutlined, UnlockOutlined, LockOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';
import UserForm from './UserForm';

const Users = () => {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [searchText, setSearchText] = useState('');

    // Modal states
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [formMode, setFormMode] = useState('add');
    const [selectedUser, setSelectedUser] = useState(null);

    // Current User Logic
    const getCurrentUser = () => {
        const userStr = Cookies.get('rememberedUser');
        return userStr ? JSON.parse(userStr) : null;
    };
    const currentUser = getCurrentUser();
    // const isDev = currentUser?.ROLE === 'DEV'; // Removed per request

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/api/getAllUsers');
            if (response.data.users) {
                let data = response.data.users || [];

                // Filter out DEV users if current user is not DEV
                if (currentUser?.ROLE !== 'DEV') {
                    data = data.filter(u => u.ROLE !== 'DEV');
                }

                setUsers(data);
                setFilteredUsers(data);
                // Re-apply search if exists
                if (searchText) {
                    handleSearch(searchText, data);
                }
            }
        } catch (error) {
            console.error('Error fetching users:', error);
            // Don't show error if 404 (No users found)
            if (error.response && error.response.status !== 404) {
                message.error('Failed to load users');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSearch = (value, dataToFilter = users) => {
        setSearchText(value);
        if (!value) {
            setFilteredUsers(dataToFilter);
            return;
        }
        const lowerVal = value.toLowerCase();
        const filtered = dataToFilter.filter(item =>
            (item.NAME && item.NAME.toLowerCase().includes(lowerVal)) ||
            (item.USERNAME && item.USERNAME.toLowerCase().includes(lowerVal)) ||
            (item.ROLE && item.ROLE.toLowerCase().includes(lowerVal))
        );
        setFilteredUsers(filtered);
    };

    const handleAdd = () => {
        setFormMode('add');
        setSelectedUser(null);
        setIsFormOpen(true);
    };

    const handleEdit = (record) => {
        setFormMode('edit');
        setSelectedUser(record);
        setIsFormOpen(true);
    };

    const handleToggleStatus = async (record) => {
        try {
            const newStatus = record.IS_ACTIVE ? 0 : 1;
            const response = await axios.post('/api/updateUser', {
                USER_ID: record.USER_ID,
                IS_ACTIVE: newStatus
            });

            if (response.data.success) {
                message.success(`User ${newStatus ? 'activated' : 'deactivated'} successfully`);
                fetchUsers();
            } else {
                message.error('Failed to update status');
            }
        } catch (error) {
            console.error('Status update error:', error);
            message.error('Failed to update status');
        }
    };

    const columns = [
        {
            title: 'Name',
            dataIndex: 'NAME',
            key: 'NAME',
            className: 'text-gray-800 dark:text-gray-200 font-semibold',
            render: (text, record) => (
                <div className="flex items-center gap-3">
                    {/* Profile Image */}
                    {record.PHOTO ? (
                        <img
                            src={record.PHOTO}
                            alt={text}
                            className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-zinc-700 shadow"
                        />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold shadow">
                            {text?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                    )}
                    <div className="flex flex-col">
                        <span className="text-base">{text}</span>
                        <span className="text-xs text-gray-400 font-normal">@{record.USERNAME}</span>
                    </div>
                </div>
            )
        },
        {
            title: 'Role',
            dataIndex: 'ROLE',
            key: 'ROLE',
            render: (role) => {
                let color = 'default';
                if (role === 'ADMIN') color = 'gold';
                if (role === 'DEV') color = 'purple';
                if (role === 'USER') color = 'blue';
                return <Tag color={color}>{role}</Tag>;
            }
        },
        {
            title: 'Status',
            dataIndex: 'IS_ACTIVE',
            key: 'IS_ACTIVE',
            align: 'center',
            width: 100,
            render: (isActive) => (
                <Tag color={isActive ? 'success' : 'error'}>
                    {isActive ? 'ACTIVE' : 'INACTIVE'}
                </Tag>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 120,
            align: 'center',
            render: (_, record) => (
                <div className="flex gap-2 justify-center">
                    <Tooltip title="Edit Details">
                        <Button
                            onClick={() => handleEdit(record)}
                            type="text"
                            shape="circle"
                            icon={<EditOutlined />}
                            className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                        />
                    </Tooltip>

                    {/* Don't allow deactivating self */}
                    {record.USER_ID !== currentUser?.USER_ID && (
                        <Popconfirm
                            title={record.IS_ACTIVE ? "Deactivate User?" : "Activate User?"}
                            description={`Are you sure you want to ${record.IS_ACTIVE ? 'deactivate' : 'activate'} this user?`}
                            onConfirm={() => handleToggleStatus(record)}
                            okText="Yes"
                            cancelText="No"
                            okButtonProps={{ danger: record.IS_ACTIVE }}
                        >
                            <Tooltip title={record.IS_ACTIVE ? "Deactivate" : "Activate"}>
                                <Button
                                    type="text"
                                    shape="circle"
                                    icon={record.IS_ACTIVE ? <LockOutlined /> : <UnlockOutlined />}
                                    className={record.IS_ACTIVE ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" : "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"}
                                />
                            </Tooltip>
                        </Popconfirm>
                    )}
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
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white m-0">Users</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage system access and roles</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <Input
                        placeholder="Search users..."
                        allowClear
                        value={searchText}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="w-full md:w-64"
                        prefix={<SearchOutlined className="text-gray-400" />}
                    />
                    {currentUser?.ROLE !== 'MONITOR' && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} className="bg-blue-600 hover:bg-blue-500 border-none shadow-lg shadow-blue-500/30">
                            Add User
                        </Button>
                    )}
                </div>
            </div>

            {/* Desktop View */}
            <div className="hidden md:block glass-card rounded-2xl overflow-hidden p-1 border border-gray-100 dark:border-white/5 shadow-sm">
                <Table
                    columns={columns}
                    dataSource={filteredUsers}
                    rowKey="USER_ID"
                    loading={loading}
                    pagination={{ pageSize: 12 }}
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
                    filteredUsers.map(record => (
                        <div key={record.USER_ID} className={`glass-card p-4 rounded-xl flex flex-col gap-3 relative border ${!record.IS_ACTIVE ? 'opacity-75 grayscale' : 'border-gray-100 dark:border-white/5'}`}>
                            {currentUser?.ROLE !== 'MONITOR' && (
                                <div className="absolute top-2 right-2 flex gap-1 z-10">
                                    <Button onClick={(e) => { e.stopPropagation(); handleEdit(record); }} size="small" type="text" shape="circle" icon={<EditOutlined />} className="text-blue-500 hover:text-blue-600 bg-transparent border-none shadow-none" />
                                </div>
                            )}

                            <div className="flex items-start gap-3 pr-8">
                                {/* Profile Image */}
                                {record.PHOTO ? (
                                    <img
                                        src={record.PHOTO}
                                        alt={record.NAME}
                                        className="w-12 h-12 rounded-full object-cover border-2 border-white dark:border-zinc-700 shadow"
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-lg shadow">
                                        {record.NAME?.charAt(0)?.toUpperCase() || 'U'}
                                    </div>
                                )}
                                <div className="flex flex-col">
                                    <div className="font-bold text-lg text-gray-800 dark:text-gray-100">{record.NAME}</div>
                                    <span className="text-xs text-gray-400 font-mono">@{record.USERNAME}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mt-1">
                                <Tag color={record.ROLE === 'ADMIN' ? 'gold' : record.ROLE === 'DEV' ? 'purple' : 'blue'} className="m-0">
                                    {record.ROLE}
                                </Tag>
                                <Tag color={record.IS_ACTIVE ? 'success' : 'error'} className="m-0">
                                    {record.IS_ACTIVE ? 'ACTIVE' : 'INACTIVE'}
                                </Tag>
                            </div>

                            {currentUser?.ROLE !== 'MONITOR' && (
                                <div className="flex justify-between items-center pt-2 mt-1 border-t border-gray-100 dark:border-white/5">
                                    <span className="text-xs text-gray-400">Manage Status</span>
                                    {record.USER_ID !== currentUser?.USER_ID && (
                                        <Popconfirm
                                            title={record.IS_ACTIVE ? "Deactivate User?" : "Activate User?"}
                                            onConfirm={() => handleToggleStatus(record)}
                                            okButtonProps={{ danger: record.IS_ACTIVE }}
                                        >
                                            <Button
                                                size="small"
                                                danger={record.IS_ACTIVE}
                                                className={!record.IS_ACTIVE ? "text-emerald-500 border-emerald-500/20 hover:border-emerald-500" : ""}
                                                icon={record.IS_ACTIVE ? <LockOutlined /> : <UnlockOutlined />}
                                            >
                                                {record.IS_ACTIVE ? "Deactivate" : "Activate"}
                                            </Button>
                                        </Popconfirm>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
                {!loading && filteredUsers.length === 0 && (
                    <div className="text-center py-10 text-gray-500 bg-white/50 dark:bg-white/5 rounded-xl">No users found</div>
                )}
            </div>

            <UserForm
                open={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                onSuccess={fetchUsers}
                mode={formMode}
                initialValues={selectedUser}
            />
        </div>
    );
};

export default Users;
