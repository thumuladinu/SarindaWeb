import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Form, Modal, Popconfirm, Tag, Select, App, Card, Row, Col, Tooltip, Space, Avatar, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UserOutlined, KeyOutlined, IdcardOutlined, LockOutlined, SafetyOutlined, CheckCircleOutlined, UploadOutlined, PictureOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';

const { Option } = Select;

const STAFF_ROLES = [
    { value: 'driver', label: 'Driver 🚛', color: 'blue' },
    { value: 'labor', label: 'Laborer 👷', color: 'orange' },
    { value: 'officer', label: 'Officer / Admin 👨‍💼', color: 'purple' },
];

export default function Staff() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [staffList, setStaffList] = useState([]);
    const [filteredStaff, setFilteredStaff] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    // Modal state for Add/Edit
    const [modalVisible, setModalVisible] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [selectedRole, setSelectedRole] = useState('labor');
    const [profileImageBase64, setProfileImageBase64] = useState(null);

    // Password & PIN Change Modal state
    const [passwordModalVisible, setPasswordModalVisible] = useState(false);
    const [selectedStaffForPassword, setSelectedStaffForPassword] = useState(null);
    const [passwordForm] = Form.useForm();
    const [passwordSubmitting, setPasswordSubmitting] = useState(false);

    const [form] = Form.useForm();

    useEffect(() => {
        fetchStaff();
    }, []);

    useEffect(() => {
        filterData();
    }, [searchText, roleFilter, staffList]);

    const fetchStaff = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/mill/staff/list', { withCredentials: true });
            if (res.data.success) {
                setStaffList(res.data.result || []);
            }
        } catch (e) {
            console.error('Error loading staff:', e);
            message.error('Failed to load staff list');
        } finally {
            setLoading(false);
        }
    };

    const filterData = () => {
        let temp = [...staffList];

        if (roleFilter !== 'all') {
            temp = temp.filter(s => (s.ROLE || '').toLowerCase() === roleFilter.toLowerCase());
        }

        if (searchText.trim()) {
            const query = searchText.toLowerCase();
            temp = temp.filter(s =>
                s.NAME?.toLowerCase().includes(query) ||
                s.PHONE_NUMBER?.toLowerCase().includes(query) ||
                s.USERNAME?.toLowerCase().includes(query) ||
                s.REMARK?.toLowerCase().includes(query)
            );
        }

        setFilteredStaff(temp);
    };

    // Calculate Counts
    const totalCount = staffList.length;
    const driversCount = staffList.filter(s => (s.ROLE || '').toLowerCase() === 'driver').length;
    const laborCount = staffList.filter(s => (s.ROLE || '').toLowerCase() === 'labor').length;
    const officerCount = staffList.filter(s => (s.ROLE || '').toLowerCase() === 'officer').length;

    // Read currently logged-in account from cookies
    const userCookie = Cookies.get('millUser') || Cookies.get('rememberedUser');
    const currentUser = (() => {
        try {
            return userCookie ? (typeof userCookie === 'string' ? JSON.parse(userCookie) : userCookie) : null;
        } catch (e) {
            return null;
        }
    })();

    // Active Logged-in Staff Member from list
    const activeStaffMember = staffList.find(s => 
        (s.USERNAME && currentUser?.USERNAME && s.USERNAME.toLowerCase() === currentUser.USERNAME.toLowerCase()) ||
        (s.NAME && currentUser?.NAME && s.NAME.toLowerCase() === currentUser.NAME.toLowerCase())
    );

    const handleImageUpload = (file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            setProfileImageBase64(e.target.result);
        };
        reader.readAsDataURL(file);
        return false; // Prevent automatic upload
    };

    const handleOpenAdd = () => {
        setEditingStaff(null);
        setSelectedRole('labor');
        setProfileImageBase64(null);
        form.resetFields();
        form.setFieldsValue({ ROLE: 'labor' });
        setModalVisible(true);
    };

    const handleOpenEdit = (record) => {
        setEditingStaff(record);
        setSelectedRole(record.ROLE || 'labor');
        setProfileImageBase64(record.PROFILE_IMAGE || null);
        form.setFieldsValue({
            NAME: record.NAME,
            PHONE_NUMBER: record.PHONE_NUMBER || '',
            ROLE: record.ROLE || 'labor',
            USERNAME: record.USERNAME || '',
            PASSWORD: record.PASSWORD || '',
            PIN: record.PIN || '',
            REMARK: record.REMARK || '',
            PROFILE_IMAGE: record.PROFILE_IMAGE || ''
        });
        setModalVisible(true);
    };

    const handleOpenPasswordModal = (record) => {
        setSelectedStaffForPassword(record);
        setProfileImageBase64(record.PROFILE_IMAGE || null);
        passwordForm.setFieldsValue({
            USERNAME: record.USERNAME || '',
            PASSWORD: record.PASSWORD || '',
            PIN: record.PIN || '',
            PROFILE_IMAGE: record.PROFILE_IMAGE || ''
        });
        setPasswordModalVisible(true);
    };

    const handleOpenMyPasswordModal = () => {
        if (!currentUser) {
            message.warning('No active logged-in user session found');
            return;
        }
        const matchingStaff = activeStaffMember || {
            STAFF_ID: currentUser.USER_ID || currentUser.ID,
            NAME: currentUser.NAME || 'Logged-in Officer',
            ROLE: currentUser.ROLE || 'officer',
            USERNAME: currentUser.USERNAME || 'admin',
            PROFILE_IMAGE: currentUser.PROFILE_IMAGE || null
        };
        handleOpenPasswordModal(matchingStaff);
    };

    const handleDelete = async (id) => {
        try {
            const res = await axios.post('/api/mill/staff/delete', { STAFF_ID: id }, { withCredentials: true });
            if (res.data.success) {
                message.success('Staff member deleted');
                fetchStaff();
            } else {
                message.error(res.data.message || 'Failed to delete');
            }
        } catch (e) {
            console.error(e);
            message.error('Error deleting staff');
        }
    };

    const handleSubmit = async (values) => {
        setSubmitting(true);
        try {
            const endpoint = editingStaff ? '/api/mill/staff/update' : '/api/mill/staff/add';
            const payload = {
                ...values,
                PROFILE_IMAGE: profileImageBase64 || values.PROFILE_IMAGE || null
            };
            if (editingStaff) payload.STAFF_ID = editingStaff.STAFF_ID;

            const res = await axios.post(endpoint, payload, { withCredentials: true });
            if (res.data.success) {
                message.success(editingStaff ? 'Staff member updated!' : 'Staff member added!');
                setModalVisible(false);
                fetchStaff();
            } else {
                message.error(res.data.message || 'Operation failed');
            }
        } catch (e) {
            console.error(e);
            message.error('Failed to save staff member');
        } finally {
            setSubmitting(false);
        }
    };

    const handlePasswordSubmit = async (values) => {
        setPasswordSubmitting(true);
        try {
            const payload = {
                ...selectedStaffForPassword,
                USERNAME: values.USERNAME,
                PASSWORD: values.PASSWORD,
                PIN: values.PIN,
                PROFILE_IMAGE: profileImageBase64 || values.PROFILE_IMAGE || null
            };

            const res = await axios.post('/api/mill/staff/update', payload, { withCredentials: true });
            if (res.data.success) {
                message.success('Credentials & Password updated successfully!');
                setPasswordModalVisible(false);
                fetchStaff();
            } else {
                message.error(res.data.message || 'Failed to update password');
            }
        } catch (e) {
            console.error(e);
            message.error('Failed to update credentials');
        } finally {
            setPasswordSubmitting(false);
        }
    };

    const UserAvatar = ({ src, name, size = "w-10 h-10 text-base" }) => {
        if (src && (typeof src === 'string') && (src.startsWith('http') || src.startsWith('data:') || src.startsWith('/'))) {
            return (
                <img 
                    src={src} 
                    alt={name} 
                    className={`${size} rounded-xl object-cover border border-purple-200 shadow-sm shrink-0`} 
                    onError={(e) => { e.target.style.display = 'none'; }}
                />
            );
        }
        return (
            <div className={`${size} rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-bold flex items-center justify-center shadow-md shrink-0`}>
                {name?.charAt(0)?.toUpperCase() || '👤'}
            </div>
        );
    };

    const columns = [
        {
            title: 'Personnel Profile',
            dataIndex: 'NAME',
            key: 'NAME',
            render: (text, record) => (
                <div className="flex items-center gap-3">
                    <UserAvatar src={record.PROFILE_IMAGE || record.PHOTO || record.AVATAR} name={record.NAME} size="w-11 h-11 text-lg" />
                    <div>
                        <div className="font-bold text-gray-800 dark:text-white text-base">{text}</div>
                        {record.USERNAME && (
                            <div className="text-xs text-purple-600 dark:text-purple-400 font-mono font-semibold">
                                User: @{record.USERNAME}
                            </div>
                        )}
                    </div>
                </div>
            )
        },
        {
            title: 'Role',
            dataIndex: 'ROLE',
            key: 'ROLE',
            render: role => {
                const roleObj = STAFF_ROLES.find(r => r.value === (role || '').toLowerCase());
                return (
                    <Tag color={roleObj?.color || 'default'} className="font-bold text-xs uppercase px-2.5 py-0.5">
                        {roleObj?.label || role}
                    </Tag>
                );
            }
        },
        {
            title: 'Phone Number',
            dataIndex: 'PHONE_NUMBER',
            key: 'PHONE_NUMBER',
            render: text => text || <span className="text-gray-400 text-xs">-</span>
        },
        {
            title: 'Quick PIN',
            dataIndex: 'PIN',
            key: 'PIN',
            render: pin => pin ? <Tag color="cyan" className="font-mono font-bold">PIN: ****</Tag> : <span className="text-gray-400 text-xs">No PIN</span>
        },
        {
            title: 'Remark / Notes',
            dataIndex: 'REMARK',
            key: 'REMARK',
            ellipsis: true,
            render: text => text || '-'
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'right',
            render: (_, record) => (
                <Space>
                    <Tooltip title="Change Photo, Password & Quick PIN">
                        <Button 
                            size="small" 
                            icon={<KeyOutlined />} 
                            className="!border-purple-300 !text-purple-600 hover:!bg-purple-50"
                            onClick={() => handleOpenPasswordModal(record)}
                        >
                            Credentials
                        </Button>
                    </Tooltip>
                    <Tooltip title="Edit Staff Details">
                        <Button size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)} />
                    </Tooltip>
                    <Popconfirm
                        title="Delete staff member?"
                        onConfirm={() => handleDelete(record.STAFF_ID)}
                        okText="Yes"
                        cancelText="No"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="Delete">
                            <Button size="small" danger icon={<DeleteOutlined />} />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    const loggedInPhoto = activeStaffMember?.PROFILE_IMAGE || 
                          activeStaffMember?.PHOTO || 
                          currentUser?.PROFILE_IMAGE || 
                          currentUser?.PHOTO || 
                          currentUser?.AVATAR || 
                          currentUser?.IMAGE || 
                          null;

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">
            {/* Header Action Row */}
            <div className="flex justify-end">
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    size="large"
                    onClick={handleOpenAdd}
                    className="rounded-xl h-11 shadow-md"
                >
                    Add Staff Member
                </Button>
            </div>

            {/* CURRENTLY LOGGED-IN ACCOUNT CARD */}
            <div className="glass-card p-5 rounded-2xl border border-purple-200 dark:border-purple-900/50 bg-gradient-to-r from-purple-50/60 via-indigo-50/40 to-white dark:from-zinc-900 dark:to-zinc-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <UserAvatar src={loggedInPhoto} name={currentUser?.NAME || 'Logged-In User'} size="w-14 h-14 text-2xl" />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                                Your Active Logged-In Account
                            </span>
                            <Tag color="purple" icon={<CheckCircleOutlined />} className="font-bold">ACTIVE SESSION</Tag>
                        </div>
                        <div className="text-xl font-bold text-gray-800 dark:text-white">
                            {currentUser?.NAME || 'Logged-In User'}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                            Role: <span className="font-semibold text-purple-700 dark:text-purple-300">{(currentUser?.ROLE || 'Officer').toUpperCase()}</span>
                            {currentUser?.USERNAME && <span> • Username: <span className="font-semibold">@{currentUser.USERNAME}</span></span>}
                        </div>
                    </div>
                </div>
                <div>
                    <Button 
                        type="primary" 
                        icon={<KeyOutlined />} 
                        onClick={handleOpenMyPasswordModal}
                        className="!bg-purple-600 hover:!bg-purple-700 h-10 rounded-xl font-medium shadow-md shadow-purple-600/20"
                    >
                        Change Photo, Password & PIN
                    </Button>
                </div>
            </div>

            {/* COUNTS SUMMARY CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card className="glass-card border border-blue-100 dark:border-gray-800 shadow-sm rounded-2xl">
                    <div className="text-gray-500 text-xs font-semibold uppercase">Total Personnel</div>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{totalCount}</div>
                </Card>
                <Card className="glass-card border border-blue-100 dark:border-gray-800 shadow-sm rounded-2xl">
                    <div className="text-gray-500 text-xs font-semibold uppercase">Drivers 🚛</div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{driversCount}</div>
                </Card>
                <Card className="glass-card border border-blue-100 dark:border-gray-800 shadow-sm rounded-2xl">
                    <div className="text-gray-500 text-xs font-semibold uppercase">Laborers 👷</div>
                    <div className="text-2xl font-bold text-orange-500 mt-1">{laborCount}</div>
                </Card>
                <Card className="glass-card border border-blue-100 dark:border-gray-800 shadow-sm rounded-2xl">
                    <div className="text-gray-500 text-xs font-semibold uppercase">Officers / Admins 👨‍💼</div>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{officerCount}</div>
                </Card>
            </div>

            {/* Filter Bar */}
            <Card className="glass-card border border-blue-100 dark:border-gray-800 shadow-sm rounded-2xl">
                <Row gutter={[16, 16]} align="middle">
                    <Col xs={24} sm={12} md={8}>
                        <Input
                            placeholder="Search Name, Phone, Username..."
                            prefix={<SearchOutlined className="text-gray-400" />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            allowClear
                            className="rounded-xl h-10"
                        />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        <Select
                            value={roleFilter}
                            onChange={setRoleFilter}
                            className="w-full h-10"
                            options={[
                                { label: 'All Roles', value: 'all' },
                                { label: 'Drivers 🚛', value: 'driver' },
                                { label: 'Laborers 👷', value: 'labor' },
                                { label: 'Officers / Admins 👨‍💼', value: 'officer' }
                            ]}
                        />
                    </Col>
                </Row>
            </Card>

            {/* Desktop Table View */}
            <div className="hidden md:block glass-card p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                <Table
                    columns={columns}
                    dataSource={filteredStaff}
                    rowKey="STAFF_ID"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                />
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3 pb-20">
                {filteredStaff.length === 0 ? (
                    <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                        No staff members found
                    </div>
                ) : (
                    filteredStaff.map((record) => (
                        <div 
                            key={record.STAFF_ID} 
                            onClick={() => handleOpenEdit(record)}
                            className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <UserAvatar src={record.PROFILE_IMAGE || record.PHOTO || record.AVATAR} name={record.NAME} size="w-10 h-10 text-base" />
                                    <div>
                                        <div className="font-bold text-white text-base">{record.NAME}</div>
                                        <div className="text-xs text-gray-400 font-mono">ID: #{record.STAFF_ID}</div>
                                    </div>
                                </div>
                                <div>
                                    <Tag color={record.ROLE === 'driver' ? 'blue' : record.ROLE === 'officer' ? 'purple' : 'orange'}>
                                        {record.ROLE?.toUpperCase()}
                                    </Tag>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-900/60 p-2.5 rounded-xl border border-white/5">
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Phone</span>
                                    <span className="font-semibold text-white">{record.PHONE_NUMBER || record.PHONE || record.TELEPHONE || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Daily Rate</span>
                                    <span className="font-bold text-emerald-400 font-mono">
                                        Rs. {parseFloat(record.DAILY_RATE || 0).toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            <div className="flex justify-end items-center gap-1.5 pt-2 border-t border-white/5" onClick={(e) => e.stopPropagation()}>
                                <Button 
                                    size="small" 
                                    icon={<KeyOutlined />} 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenPasswordModal(record);
                                    }} 
                                    className="rounded-lg !text-purple-400"
                                />
                                <Button 
                                    size="small" 
                                    icon={<EditOutlined />} 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEdit(record);
                                    }} 
                                    className="rounded-lg"
                                />
                                <Popconfirm title="Delete staff member?" onConfirm={() => handleDelete(record.STAFF_ID)} okText="Yes" cancelText="No" okButtonProps={{ danger: true }}>
                                    <Button 
                                        size="small" 
                                        danger 
                                        icon={<DeleteOutlined />} 
                                        onClick={(e) => e.stopPropagation()} 
                                        className="rounded-lg"
                                    />
                                </Popconfirm>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add / Edit Staff Modal */}
            <Modal
                title={editingStaff ? "Edit Staff Member" : "Add Staff Member"}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    className="mt-4 space-y-4"
                >
                    <div className="flex items-center gap-4 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-xl">
                        <UserAvatar src={profileImageBase64} name={form.getFieldValue('NAME') || 'New Staff'} size="w-16 h-16 text-2xl" />
                        <div>
                            <Upload beforeUpload={handleImageUpload} showUploadList={false} accept="image/*">
                                <Button icon={<UploadOutlined />} size="small">
                                    Upload Profile Photo
                                </Button>
                            </Upload>
                            <div className="text-xs text-gray-400 mt-1">Upload JPG/PNG photo</div>
                        </div>
                    </div>

                    <Form.Item
                        name="NAME"
                        label="Full Name"
                        rules={[{ required: true, message: 'Please enter staff name' }]}
                    >
                        <Input placeholder="e.g. Gamini Perera" className="h-10 rounded-xl" />
                    </Form.Item>

                    <Form.Item name="PHONE_NUMBER" label="Phone Number">
                        <Input placeholder="e.g. 0771234567" className="h-10 rounded-xl" />
                    </Form.Item>

                    <Form.Item name="ROLE" label="Staff Role" rules={[{ required: true }]}>
                        <Select onChange={val => setSelectedRole(val)} className="h-10">
                            {STAFF_ROLES.map(r => (
                                <Option key={r.value} value={r.value}>{r.label}</Option>
                            ))}
                        </Select>
                    </Form.Item>

                    {selectedRole === 'officer' && (
                        <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-xl border border-purple-200 dark:border-purple-900/50 space-y-3">
                            <div className="text-xs font-bold text-purple-700 dark:text-purple-300">
                                👨‍💼 Officer Login Credentials & Quick PIN Access
                            </div>
                            <Form.Item name="USERNAME" label="Username">
                                <Input placeholder="Username for app login" className="h-10 rounded-xl" />
                            </Form.Item>
                            <Form.Item name="PASSWORD" label="Password">
                                <Input.Password placeholder="Enter password" className="h-10 rounded-xl" />
                            </Form.Item>
                            <Form.Item name="PIN" label="4-Digit Quick PIN">
                                <Input maxLength={4} placeholder="e.g. 1234 for quick station login" className="h-10 rounded-xl font-mono" />
                            </Form.Item>
                        </div>
                    )}

                    <Form.Item name="REMARK" label="Remark / Notes">
                        <Input.TextArea rows={2} placeholder="Optional notes..." className="rounded-xl" />
                    </Form.Item>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button onClick={() => setModalVisible(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={submitting}>
                            {editingStaff ? "Save Changes" : "Create Staff"}
                        </Button>
                    </div>
                </Form>
            </Modal>

            {/* DEDICATED CHANGE PASSWORD & PIN MODAL */}
            <Modal
                title={
                    <div className="flex items-center gap-2 text-purple-700">
                        <KeyOutlined /> Change Photo, Password & Quick PIN ({selectedStaffForPassword?.NAME})
                    </div>
                }
                open={passwordModalVisible}
                onCancel={() => setPasswordModalVisible(false)}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={passwordForm}
                    layout="vertical"
                    onFinish={handlePasswordSubmit}
                    className="mt-4 space-y-4"
                >
                    <div className="flex items-center gap-4 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-xl">
                        <UserAvatar src={profileImageBase64} name={selectedStaffForPassword?.NAME || 'User'} size="w-16 h-16 text-2xl" />
                        <div>
                            <Upload beforeUpload={handleImageUpload} showUploadList={false} accept="image/*">
                                <Button icon={<UploadOutlined />} size="small">
                                    Change Profile Photo
                                </Button>
                            </Upload>
                            <div className="text-xs text-gray-400 mt-1">Upload JPG/PNG photo</div>
                        </div>
                    </div>

                    <Form.Item
                        name="USERNAME"
                        label="Username"
                        rules={[{ required: true, message: 'Please enter username' }]}
                    >
                        <Input prefix={<UserOutlined />} placeholder="Username" className="h-10 rounded-xl" />
                    </Form.Item>

                    <Form.Item
                        name="PASSWORD"
                        label="New Password"
                        rules={[{ required: true, message: 'Please enter new password' }]}
                    >
                        <Input.Password prefix={<LockOutlined />} placeholder="Enter new password" className="h-10 rounded-xl" />
                    </Form.Item>

                    <Form.Item
                        name="PIN"
                        label="4-Digit Quick Login PIN"
                        rules={[
                            { required: true, message: 'Please enter 4-digit PIN' },
                            { len: 4, message: 'PIN must be exactly 4 digits' }
                        ]}
                    >
                        <Input prefix={<SafetyOutlined />} maxLength={4} placeholder="e.g. 1234" className="h-10 rounded-xl font-mono" />
                    </Form.Item>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button onClick={() => setPasswordModalVisible(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={passwordSubmitting} className="!bg-purple-600 hover:!bg-purple-700">
                            Update Credentials
                        </Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
