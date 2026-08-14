import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Form, Modal, Popconfirm, Tag, Select, App, Card, Tooltip, Space, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UserOutlined, KeyOutlined, LockOutlined, SafetyOutlined, CheckCircleOutlined, UploadOutlined, PhoneOutlined, TeamOutlined, IdcardOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';

const STAFF_ROLES = [
    { value: 'officer', label: 'Officer / Admin 👨‍💼', color: 'purple' },
    { value: 'driver', label: 'Driver 🚛', color: 'blue' },
    { value: 'labor', label: 'Laborer 👷', color: 'orange' },
];

export default function Staff() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [staffList, setStaffList] = useState([]);
    const [filteredStaff, setFilteredStaff] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    // Single Unified Modal State for Add & Edit
    const [modalVisible, setModalVisible] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [profileImageBase64, setProfileImageBase64] = useState(null);

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
        let result = [...staffList];
        if (roleFilter !== 'all') {
            result = result.filter(s => (s.ROLE || '').toLowerCase() === roleFilter.toLowerCase());
        }
        if (searchText.trim()) {
            const query = searchText.toLowerCase().trim();
            result = result.filter(s =>
                (s.NAME && s.NAME.toLowerCase().includes(query)) ||
                (s.PHONE_NUMBER && s.PHONE_NUMBER.toLowerCase().includes(query)) ||
                (s.USERNAME && s.USERNAME.toLowerCase().includes(query)) ||
                (s.ROLE && s.ROLE.toLowerCase().includes(query))
            );
        }
        setFilteredStaff(result);
    };

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
        (s.NAME && currentUser?.NAME && s.NAME.toLowerCase() === currentUser.NAME.toLowerCase()) ||
        (s.STAFF_ID && currentUser?.USER_ID && s.STAFF_ID === currentUser.USER_ID)
    );

    const loggedInPhoto = activeStaffMember?.PROFILE_IMAGE || 
                          activeStaffMember?.PHOTO || 
                          currentUser?.PROFILE_IMAGE || 
                          currentUser?.PHOTO || 
                          currentUser?.AVATAR || 
                          null;

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
        setProfileImageBase64(null);
        form.resetFields();
        form.setFieldsValue({ ROLE: 'officer' });
        setModalVisible(true);
    };

    const handleOpenEdit = (record) => {
        setEditingStaff(record);
        setProfileImageBase64(record.PROFILE_IMAGE || null);
        form.setFieldsValue({
            NAME: record.NAME || '',
            PHONE_NUMBER: record.PHONE_NUMBER || '',
            ROLE: (record.ROLE || 'officer').toLowerCase(),
            USERNAME: record.USERNAME || '',
            PASSWORD: '',
            PIN: record.PIN || '',
            REMARK: record.REMARK || ''
        });
        setModalVisible(true);
    };

    const handleEditMyProfile = () => {
        if (activeStaffMember) {
            handleOpenEdit(activeStaffMember);
        } else if (currentUser) {
            const fallbackStaff = {
                STAFF_ID: currentUser.USER_ID || currentUser.ID,
                NAME: currentUser.NAME || 'Logged-in Officer',
                ROLE: currentUser.ROLE || 'officer',
                USERNAME: currentUser.USERNAME || '',
                PIN: currentUser.PIN || '',
                PROFILE_IMAGE: currentUser.PROFILE_IMAGE || null
            };
            handleOpenEdit(fallbackStaff);
        } else {
            message.warning('No active session found');
        }
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
            message.error('Error deleting staff member');
        }
    };

    const handleSubmit = async (values) => {
        setSubmitting(true);
        try {
            const isEdit = !!editingStaff;
            const endpoint = isEdit ? '/api/mill/staff/update' : '/api/mill/staff/add';

            const payload = {
                ...values,
                USERNAME: values.USERNAME?.trim() || null,
                PASSWORD: values.PASSWORD ? values.PASSWORD.trim() : (editingStaff?.PASSWORD || null),
                PIN: values.PIN?.trim() || null,
                PROFILE_IMAGE: profileImageBase64 || editingStaff?.PROFILE_IMAGE || null
            };
            if (isEdit) payload.STAFF_ID = editingStaff.STAFF_ID;

            const res = await axios.post(endpoint, payload, { withCredentials: true });
            if (res.data.success) {
                message.success(isEdit ? 'Staff profile updated!' : 'New staff member added!');
                setModalVisible(false);
                fetchStaff();
            } else {
                message.error(res.data.message || 'Operation failed');
            }
        } catch (e) {
            console.error('Submit error:', e);
            message.error('Failed to save staff information');
        } finally {
            setSubmitting(false);
        }
    };

    const UserAvatar = ({ src, name, size = "w-11 h-11 text-lg" }) => {
        if (src && (typeof src === 'string') && (src.startsWith('http') || src.startsWith('data:') || src.startsWith('/'))) {
            return <img src={src} alt={name} className={`${size} rounded-xl object-cover border border-purple-200 dark:border-purple-800 shadow-sm shrink-0`} />;
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
                        {record.USERNAME ? (
                            <div className="text-xs text-purple-600 dark:text-purple-400 font-mono font-semibold">
                                @{record.USERNAME}
                            </div>
                        ) : (
                            <div className="text-xs text-gray-400 font-mono italic">No Username</div>
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
                    <Tag color={roleObj?.color || 'default'} className="font-bold text-xs uppercase px-2.5 py-0.5 rounded-lg">
                        {roleObj?.label || role}
                    </Tag>
                );
            }
        },
        {
            title: 'Phone Number',
            dataIndex: 'PHONE_NUMBER',
            key: 'PHONE_NUMBER',
            render: text => text ? (
                <span className="font-mono text-gray-700 dark:text-gray-300 font-medium">{text}</span>
            ) : <span className="text-gray-400 text-xs">-</span>
        },
        {
            title: 'Quick PIN',
            dataIndex: 'PIN',
            key: 'PIN',
            render: text => text ? (
                <span className="font-mono bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 font-bold px-2.5 py-1 rounded-lg text-xs border border-purple-200/60 dark:border-purple-800/40">
                    🔒 {text}
                </span>
            ) : <span className="text-gray-400 text-xs italic">Not Set</span>
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'right',
            render: (_, record) => (
                <Space>
                    <Tooltip title="Edit Staff & Credentials">
                        <Button 
                            size="small" 
                            icon={<EditOutlined />} 
                            onClick={() => handleOpenEdit(record)} 
                            className="rounded-lg text-purple-600 border-purple-200 hover:border-purple-400 hover:text-purple-700"
                        >
                            Edit
                        </Button>
                    </Tooltip>
                    <Popconfirm
                        title="Delete staff member?"
                        onConfirm={() => handleDelete(record.STAFF_ID)}
                        okText="Yes"
                        cancelText="No"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="Delete">
                            <Button size="small" danger icon={<DeleteOutlined />} className="rounded-lg" />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
            {/* Header Title Card */}
            <div className="glass-card p-6 rounded-3xl border border-purple-100 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <TeamOutlined className="text-purple-600" /> Mill Staff & Officers
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Manage mill personnel profiles, access credentials, and Quick login PINs
                    </p>
                </div>
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    onClick={handleOpenAdd}
                    className="!bg-purple-600 hover:!bg-purple-700 rounded-xl h-11 font-bold shadow-md shadow-purple-500/20 px-6"
                >
                    Add Staff Member
                </Button>
            </div>

            {/* Currently Logged-In User Profile Card */}
            <div className="p-5 rounded-3xl border border-purple-200 dark:border-purple-900/40 bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-white dark:from-zinc-900 dark:to-zinc-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <UserAvatar src={loggedInPhoto} name={currentUser?.NAME || 'Logged-In User'} size="w-14 h-14 text-xl" />
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                                Active Logged-In Officer
                            </span>
                            <Tag color="purple" icon={<CheckCircleOutlined />} className="font-bold border-none">ACTIVE SESSION</Tag>
                        </div>
                        <div className="text-lg font-bold text-gray-800 dark:text-white">
                            {currentUser?.NAME || 'Logged-In User'}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                            Role: <span className="font-semibold text-purple-700 dark:text-purple-300 uppercase">{currentUser?.ROLE || 'officer'}</span>
                            {currentUser?.USERNAME && <span className="ml-2">(@{currentUser.USERNAME})</span>}
                        </div>
                    </div>
                </div>
                <Button 
                    icon={<KeyOutlined />} 
                    onClick={handleEditMyProfile}
                    className="rounded-xl h-10 font-semibold border-purple-300 text-purple-700 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800 shrink-0"
                >
                    Edit My Credentials & Photo
                </Button>
            </div>

            {/* Filter & Search Bar */}
            <Card className="rounded-3xl shadow-sm border border-purple-100 dark:border-white/5 p-2">
                <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <Input 
                        prefix={<SearchOutlined className="text-gray-400" />}
                        placeholder="Search Name, Phone, Username..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="rounded-xl h-10 max-w-md"
                        allowClear
                    />
                    <Select
                        value={roleFilter}
                        onChange={setRoleFilter}
                        className="w-full sm:w-48 h-10"
                        options={[
                            { value: 'all', label: 'All Roles' },
                            ...STAFF_ROLES
                        ]}
                    />
                </div>
            </Card>

            {/* Staff Table */}
            <Card className="rounded-3xl shadow-sm border border-purple-100 dark:border-white/5 overflow-hidden">
                <Table 
                    columns={columns} 
                    dataSource={filteredStaff} 
                    rowKey="STAFF_ID" 
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            {/* UNIFIED SINGLE STAFF MODAL */}
            <Modal
                title={
                    <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 text-lg font-bold">
                        <IdcardOutlined /> {editingStaff ? `Edit Staff Profile: ${editingStaff.NAME}` : "Add New Staff Member"}
                    </div>
                }
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                footer={null}
                destroyOnClose
                width={560}
                className="rounded-2xl"
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    className="mt-4 space-y-4"
                >
                    {/* SECTION 1: PROFILE PHOTO */}
                    <div className="p-4 bg-purple-50/70 dark:bg-purple-950/30 rounded-2xl flex items-center gap-4 border border-purple-100 dark:border-purple-900/40">
                        <UserAvatar 
                            src={profileImageBase64 || form.getFieldValue('PROFILE_IMAGE')} 
                            name={form.getFieldValue('NAME') || 'User'} 
                            size="w-16 h-16 text-2xl" 
                        />
                        <div>
                            <Upload beforeUpload={handleImageUpload} showUploadList={false} accept="image/*">
                                <Button icon={<UploadOutlined />} size="small" className="rounded-lg">
                                    Change Profile Photo
                                </Button>
                            </Upload>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Upload JPG/PNG profile picture
                            </div>
                        </div>
                    </div>

                    {/* SECTION 2: BASIC STAFF INFORMATION */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Form.Item
                            name="NAME"
                            label={<span className="font-semibold text-gray-700 dark:text-gray-200">Full Name</span>}
                            rules={[{ required: true, message: 'Please enter staff name' }]}
                        >
                            <Input prefix={<UserOutlined />} placeholder="e.g. Thumula Rajakaruna" className="h-10 rounded-xl" />
                        </Form.Item>

                        <Form.Item
                            name="ROLE"
                            label={<span className="font-semibold text-gray-700 dark:text-gray-200">Role / Position</span>}
                            rules={[{ required: true, message: 'Please select a role' }]}
                        >
                            <Select options={STAFF_ROLES} placeholder="Select role" className="h-10 rounded-xl" />
                        </Form.Item>
                    </div>

                    <Form.Item
                        name="PHONE_NUMBER"
                        label={<span className="font-semibold text-gray-700 dark:text-gray-200">Phone Number</span>}
                    >
                        <Input prefix={<PhoneOutlined />} placeholder="07X XXXXXXX" className="h-10 rounded-xl" />
                    </Form.Item>

                    {/* SECTION 3: ACCESS CREDENTIALS & PIN */}
                    <div className="p-4 bg-gray-50 dark:bg-zinc-900/60 rounded-2xl border border-gray-200/80 dark:border-zinc-800 space-y-4">
                        <div className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                            <KeyOutlined /> System Access & Quick Login Credentials
                        </div>

                        <Form.Item
                            name="USERNAME"
                            label={<span className="font-semibold text-gray-700 dark:text-gray-200">Username</span>}
                            className="!mb-3"
                        >
                            <Input prefix={<UserOutlined />} placeholder="Username (optional for quick login)" className="h-10 rounded-xl" />
                        </Form.Item>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Form.Item
                                name="PASSWORD"
                                label={<span className="font-semibold text-gray-700 dark:text-gray-200">New Password</span>}
                                className="!mb-0"
                            >
                                <Input.Password prefix={<LockOutlined />} placeholder="Leave blank to keep current" className="h-10 rounded-xl" />
                            </Form.Item>

                            <Form.Item
                                name="PIN"
                                label={<span className="font-semibold text-gray-700 dark:text-gray-200">4-Digit Quick Login PIN</span>}
                                rules={[{ len: 4, message: 'PIN must be 4 digits' }]}
                                className="!mb-0"
                            >
                                <Input prefix={<SafetyOutlined />} maxLength={4} placeholder="e.g. 1234" className="h-10 rounded-xl font-mono" />
                            </Form.Item>
                        </div>
                    </div>

                    <Form.Item
                        name="REMARK"
                        label={<span className="font-semibold text-gray-700 dark:text-gray-200">Remark / Notes</span>}
                    >
                        <Input.TextArea placeholder="Additional notes or comments..." className="rounded-xl" rows={2} />
                    </Form.Item>

                    {/* MODAL FOOTER ACTIONS */}
                    <div className="flex justify-end gap-2 pt-2 border-t dark:border-zinc-800">
                        <Button onClick={() => setModalVisible(false)} className="rounded-xl h-10 px-5">
                            Cancel
                        </Button>
                        <Button 
                            type="primary" 
                            htmlType="submit" 
                            loading={submitting} 
                            className="!bg-purple-600 hover:!bg-purple-700 rounded-xl h-10 px-6 font-bold"
                        >
                            {editingStaff ? "Save Profile Changes" : "Create Staff Profile"}
                        </Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
