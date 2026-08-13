import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Typography, message, Popconfirm, Tooltip, Modal, Form, Input, DatePicker, Select, Card, Row, Col } from 'antd';
import { PrinterOutlined, CheckCircleOutlined, DeleteOutlined, SyncOutlined, EditOutlined, LockOutlined, UnlockOutlined, EyeOutlined, SearchOutlined, FilterOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';
import dayjs from 'dayjs';
import PrintableDispatchNote from './PrintableDispatchNote';
import SettleDispatchForm from './SettleDispatchForm';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function DispatchNotes() {
    const [notes, setNotes] = useState([]);
    const [vehiclesList, setVehiclesList] = useState([]);
    const [driversList, setDriversList] = useState([]);
    const [staffList, setStaffList] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Search & Filter State
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [vehicleFilter, setVehicleFilter] = useState('ALL');
    const [dateRange, setDateRange] = useState(null);
    
    // Settlement Modal state
    const [settleDrawerVisible, setSettleDrawerVisible] = useState(false);
    const [selectedNote, setSelectedNote] = useState(null);

    // Edit Modal state
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingNote, setEditingNote] = useState(null);
    const [editForm] = Form.useForm();
    const [updating, setUpdating] = useState(false);

    // Auth check
    const userCookie = Cookies.get('millUser');
    const currentUser = userCookie ? JSON.parse(userCookie) : {};
    const isAdmin = ['admin', 'dev'].includes(currentUser.ROLE?.toLowerCase());

    useEffect(() => {
        fetchNotes();
        fetchDropdowns();
    }, []);

    const fetchDropdowns = async () => {
        try {
            const [vRes, sRes] = await Promise.all([
                axios.get('/api/mill/vehicles/list', { withCredentials: true }),
                axios.get('/api/mill/staff/list', { withCredentials: true })
            ]);
            if (vRes.data.success) setVehiclesList(vRes.data.result || []);
            if (sRes.data.success) {
                const allStaff = sRes.data.result || [];
                setStaffList(allStaff);
                setDriversList(allStaff.filter(s => (s.ROLE || '').toLowerCase() === 'driver'));
            }
        } catch (e) {
            console.error('Error fetching dropdowns:', e);
        }
    };

    const fetchNotes = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/mill/dispatch/list', { withCredentials: true });
            if (res.data.success) {
                setNotes(res.data.result);
            }
        } catch (e) {
            console.error('Failed to fetch dispatch notes', e);
            message.error('Failed to load dispatch notes');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            const res = await axios.post('/api/mill/dispatch/delete', { DISPATCH_ID: id }, { withCredentials: true });
            if (res.data.success) {
                message.success('Dispatch note deleted');
                fetchNotes();
            } else {
                message.error(res.data.message || 'Failed to delete');
            }
        } catch (e) {
            console.error(e);
            message.error('Error deleting dispatch note');
        }
    };

    const handleUnlock = async (id) => {
        try {
            const res = await axios.post('/api/mill/dispatch/unlock', { 
                DISPATCH_ID: id,
                UNLOCKED_BY: currentUser.USER_ID 
            }, { withCredentials: true });

            if (res.data.success) {
                message.success('Dispatch note unlocked successfully');
                fetchNotes();
            } else {
                message.error(res.data.message || 'Failed to unlock dispatch note');
            }
        } catch (e) {
            console.error(e);
            message.error('Failed to unlock dispatch note');
        }
    };

    const handlePrintClick = (record) => {
        const printUrl = `/print-dispatch/${record.DISPATCH_ID}`;
        window.open(printUrl, '_blank', 'width=850,height=900,toolbar=0,menubar=0');
    };

    const handleSettleClick = (record) => {
        setSelectedNote(record);
        setSettleDrawerVisible(true);
    };

    const handleViewClick = (record) => {
        setSelectedNote(record);
        setSettleDrawerVisible(true);
    };

    const handleEditClick = (record) => {
        setEditingNote(record);
        editForm.setFieldsValue({
            DRIVER_NAME: record.DRIVER_NAME || '',
            LORRY_NO: record.LORRY_NO || '',
            STAFF_NAME: record.STAFF_NAME || '',
            DATE: record.DATE ? dayjs(record.DATE) : dayjs()
        });
        setEditModalVisible(true);
    };

    const handleUpdateDispatchNote = async (values) => {
        setUpdating(true);
        try {
            const payload = {
                DISPATCH_ID: editingNote.DISPATCH_ID,
                DRIVER_NAME: values.DRIVER_NAME,
                LORRY_NO: values.LORRY_NO,
                STAFF_NAME: values.STAFF_NAME,
                DATE: values.DATE ? values.DATE.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')
            };
            const res = await axios.post('/api/mill/dispatch/update', payload, { withCredentials: true });
            if (res.data.success) {
                message.success('Dispatch note updated successfully');
                setEditModalVisible(false);
                setEditingNote(null);
                fetchNotes();
            } else {
                message.error(res.data.message || 'Failed to update dispatch note');
            }
        } catch (e) {
            console.error(e);
            message.error('Error updating dispatch note');
        } finally {
            setUpdating(false);
        }
    };

    const columns = [
        {
            title: 'Dispatch No',
            dataIndex: 'DISPATCH_NO',
            key: 'DISPATCH_NO',
            render: (text) => <Text strong>{text}</Text>
        },
        {
            title: 'Date',
            dataIndex: 'DATE',
            key: 'DATE',
            render: (text) => new Date(text).toLocaleDateString(),
        },
        {
            title: 'Driver',
            dataIndex: 'DRIVER_NAME',
            key: 'DRIVER_NAME',
            render: (text) => text || '-'
        },
        {
            title: 'Lorry No',
            dataIndex: 'LORRY_NO',
            key: 'LORRY_NO',
            render: (text) => text || '-'
        },
        {
            title: 'Bills',
            dataIndex: 'BILL_COUNT',
            key: 'BILL_COUNT',
            render: (count) => <Tag color="blue">{count} Bills</Tag>
        },
        {
            title: 'Status',
            key: 'STATUS',
            dataIndex: 'STATUS',
            render: (status) => {
                if (status === 'SETTLED') {
                    return <Tag color="green" icon={<LockOutlined />}>Settled (Locked)</Tag>;
                }
                return <Tag color="orange" icon={<SyncOutlined spin />}>Pending</Tag>;
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            render: (_, record) => (
                <Space>
                    <Tooltip title="Print A4 Dispatch Note">
                        <Button 
                            icon={<PrinterOutlined />} 
                            onClick={() => handlePrintClick(record)} 
                        />
                    </Tooltip>
                    
                    {record.STATUS === 'SETTLED' ? (
                        <>
                            <Tooltip title="View Record Details">
                                <Button 
                                    icon={<EyeOutlined />} 
                                    onClick={() => handleViewClick(record)} 
                                />
                            </Tooltip>
                            {/* Unlock button visible ONLY to Admin/Dev users */}
                            {isAdmin && (
                                <Popconfirm
                                    title="Unlock this Dispatch Note?"
                                    description="Unlocking will revert the final settlement and allow editing again."
                                    onConfirm={() => handleUnlock(record.DISPATCH_ID)}
                                    okText="Yes, Unlock"
                                    cancelText="Cancel"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Tooltip title="Admin Unlock Dispatch Note">
                                        <Button icon={<UnlockOutlined />} type="dashed" danger>
                                            Unlock
                                        </Button>
                                    </Tooltip>
                                </Popconfirm>
                            )}
                        </>
                    ) : (
                        <>
                            <Tooltip title="Edit Dispatch Details">
                                <Button 
                                    icon={<EditOutlined />} 
                                    onClick={() => handleEditClick(record)}
                                />
                            </Tooltip>
                            <Tooltip title="Settle Dispatch Note">
                                <Button 
                                    type="primary" 
                                    icon={<CheckCircleOutlined />} 
                                    onClick={() => handleSettleClick(record)}
                                >
                                    Settle
                                </Button>
                            </Tooltip>
                            <Popconfirm
                                title="Delete this dispatch note?"
                                description="The bills will remain, but the dispatch grouping will be removed."
                                onConfirm={() => handleDelete(record.DISPATCH_ID)}
                                okText="Yes, delete"
                                cancelText="No"
                                okButtonProps={{ danger: true }}
                            >
                                <Tooltip title="Delete">
                                    <Button danger icon={<DeleteOutlined />} />
                                </Tooltip>
                            </Popconfirm>
                        </>
                    )}
                </Space>
            )
        }
    ];

    // Filter Logic
    const filteredNotes = notes.filter(n => {
        // Search text match
        const query = searchText.toLowerCase().trim();
        const matchesSearch = !query || 
            (n.DISPATCH_NO || '').toLowerCase().includes(query) ||
            (n.VEHICLE_NO || '').toLowerCase().includes(query) ||
            (n.DRIVER_NAME || '').toLowerCase().includes(query) ||
            (n.REMARKS || '').toLowerCase().includes(query);

        // Status match
        const matchesStatus = statusFilter === 'ALL' || n.STATUS === statusFilter;

        // Vehicle match
        const matchesVehicle = vehicleFilter === 'ALL' || n.VEHICLE_NO === vehicleFilter;

        // Date range match
        let matchesDate = true;
        if (dateRange && dateRange[0] && dateRange[1]) {
            const noteDate = dayjs(n.CREATED_DATE || n.DATE);
            matchesDate = noteDate.isAfter(dateRange[0].startOf('day')) && noteDate.isBefore(dateRange[1].endOf('day'));
        }

        return matchesSearch && matchesStatus && matchesVehicle && matchesDate;
    });

    const resetFilters = () => {
        setSearchText('');
        setStatusFilter('ALL');
        setVehicleFilter('ALL');
        setDateRange(null);
    };

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-6">

            {/* ADVANCED FILTER & SEARCH BAR */}
            <Card className="glass-card border border-blue-100 dark:border-gray-800 shadow-sm rounded-2xl">
                <Row gutter={[16, 16]} align="middle">
                    <Col xs={24} sm={12} md={6}>
                        <Input
                            placeholder="Search Dispatch No, Vehicle, Driver..."
                            prefix={<SearchOutlined className="text-gray-400" />}
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            allowClear
                            className="rounded-xl h-10"
                        />
                    </Col>
                    <Col xs={12} sm={6} md={4}>
                        <Select
                            value={statusFilter}
                            onChange={setStatusFilter}
                            className="w-full h-10"
                            options={[
                                { label: 'All Statuses', value: 'ALL' },
                                { label: 'Settled', value: 'SETTLED' },
                                { label: 'Pending', value: 'PENDING' }
                            ]}
                        />
                    </Col>
                    <Col xs={12} sm={6} md={5}>
                        <Select
                            value={vehicleFilter}
                            onChange={setVehicleFilter}
                            className="w-full h-10"
                            options={[
                                { label: 'All Vehicles', value: 'ALL' },
                                ...vehiclesList.map(v => ({ label: `${v.VEHICLE_NO} (${v.VEHICLE_TYPE})`, value: v.VEHICLE_NO }))
                            ]}
                        />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                        {/* Desktop RangePicker */}
                        <div className="hidden md:block">
                            <RangePicker
                                value={dateRange}
                                onChange={setDateRange}
                                className="w-full h-10 rounded-xl"
                            />
                        </div>
                        {/* Mobile Separate Start & End DatePickers */}
                        <div className="grid grid-cols-2 gap-2 md:hidden">
                            <DatePicker
                                placeholder="Start Date"
                                value={dateRange ? dateRange[0] : null}
                                onChange={(val) => setDateRange(val ? [val, dateRange ? dateRange[1] : null] : null)}
                                className="w-full h-10 rounded-xl text-xs"
                                format="YYYY-MM-DD"
                            />
                            <DatePicker
                                placeholder="End Date"
                                value={dateRange ? dateRange[1] : null}
                                onChange={(val) => setDateRange(val ? [dateRange ? dateRange[0] : null, val] : null)}
                                className="w-full h-10 rounded-xl text-xs"
                                format="YYYY-MM-DD"
                            />
                        </div>
                    </Col>
                    <Col xs={24} sm={12} md={3} className="text-right">
                        <Button onClick={resetFilters} icon={<ReloadOutlined />} className="rounded-xl h-10 w-full">
                            Reset
                        </Button>
                    </Col>
                </Row>
            </Card>

            {/* Desktop Table View */}
            <div className="hidden md:block glass-card p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
                <Table
                    columns={columns}
                    dataSource={filteredNotes}
                    rowKey="DISPATCH_ID"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    scroll={{ x: 'max-content' }}
                    className="w-full"
                />
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3 pb-20">
                {filteredNotes.length === 0 ? (
                    <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                        No dispatch notes found
                    </div>
                ) : (
                    filteredNotes.map((record) => (
                        <div 
                            key={record.DISPATCH_ID} 
                            onClick={() => handlePrintNote(record)}
                            className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-mono font-bold text-blue-400 text-base">{record.DISPATCH_NO}</div>
                                    <div className="text-xs text-gray-400">{record.DATE ? dayjs(record.DATE).format('YYYY-MM-DD') : '-'}</div>
                                </div>
                                <div>
                                    {record.STATUS === 'settled' || record.IS_SETTLED === 1 ? (
                                        <Tag color="success" icon={<CheckCircleOutlined />}>Settled</Tag>
                                    ) : (
                                        <Tag color="warning" icon={<SyncOutlined spin />}>In Dispatch</Tag>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-900/60 p-2.5 rounded-xl border border-white/5">
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Vehicle</span>
                                    <span className="font-semibold text-white">{record.VEHICLE_NO || '-'}</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Driver</span>
                                    <span className="font-semibold text-white">{record.DRIVER_NAME || '-'}</span>
                                </div>
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-white/5">
                                <div className="text-xs text-gray-400">
                                    Bills: <span className="font-bold text-white">{record.BILL_COUNT || 0}</span>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap justify-end ml-auto" onClick={(e) => e.stopPropagation()}>
                                    <Tooltip title="Print A4 Dispatch Note">
                                        <Button 
                                            size="small"
                                            icon={<PrinterOutlined />} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handlePrintClick(record);
                                            }} 
                                            className="rounded-xl"
                                        />
                                    </Tooltip>
                                    {record.STATUS === 'SETTLED' ? (
                                        <>
                                            {isAdmin && (
                                                <Popconfirm
                                                    title="Unlock this Dispatch Note?"
                                                    description="Unlocking will revert the final settlement."
                                                    onConfirm={() => handleUnlock(record.DISPATCH_ID)}
                                                    okText="Unlock"
                                                    cancelText="No"
                                                    okButtonProps={{ danger: true }}
                                                >
                                                    <Button 
                                                        size="small" 
                                                        icon={<UnlockOutlined />} 
                                                        type="dashed" 
                                                        danger 
                                                        onClick={(e) => e.stopPropagation()} 
                                                        className="rounded-xl text-xs"
                                                    >
                                                        Unlock
                                                    </Button>
                                                </Popconfirm>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <Button 
                                                size="small"
                                                type="primary" 
                                                icon={<CheckCircleOutlined />} 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSettleClick(record);
                                                }}
                                                className="rounded-xl text-xs"
                                            >
                                                Settle
                                            </Button>
                                            <Button 
                                                size="small"
                                                icon={<EditOutlined />} 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEditClick(record);
                                                }}
                                                className="rounded-xl !text-amber-500"
                                            />
                                            <Popconfirm
                                                title="Delete this dispatch note?"
                                                description="Grouping will be removed."
                                                onConfirm={() => handleDelete(record.DISPATCH_ID)}
                                                okText="Delete"
                                                cancelText="No"
                                                okButtonProps={{ danger: true }}
                                            >
                                                <Button 
                                                    size="small" 
                                                    icon={<DeleteOutlined />} 
                                                    danger 
                                                    onClick={(e) => e.stopPropagation()} 
                                                    className="rounded-xl"
                                                />
                                            </Popconfirm>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Settle Modal */}
            <Modal
                title={`Settle Dispatch Note: ${selectedNote?.DISPATCH_NO}`}
                open={settleDrawerVisible}
                onCancel={() => setSettleDrawerVisible(false)}
                footer={null}
                width="96vw"
                style={{ top: 15 }}
                destroyOnClose
            >
                {selectedNote && (
                    <SettleDispatchForm 
                        dispatchId={selectedNote.DISPATCH_ID}
                        onSuccess={() => {
                            setSettleDrawerVisible(false);
                            fetchNotes();
                        }}
                        onCancel={() => setSettleDrawerVisible(false)}
                    />
                )}
            </Modal>

            {/* Edit Dispatch Note Modal */}
            <Modal
                title={`Edit Dispatch Details: ${editingNote?.DISPATCH_NO}`}
                open={editModalVisible}
                onCancel={() => setEditModalVisible(false)}
                onOk={() => editForm.submit()}
                confirmLoading={updating}
                okText="Save Changes"
                destroyOnClose
            >
                <Form form={editForm} layout="vertical" onFinish={handleUpdateDispatchNote} className="mt-4">
                    <Form.Item name="DATE" label="Dispatch Date" rules={[{ required: true }]}>
                        <DatePicker className="w-full" format="YYYY-MM-DD" />
                    </Form.Item>
                    <Form.Item name="DRIVER_NAME" label="Driver Name">
                        <Select showSearch placeholder="Select Driver or Type..." allowClear optionFilterProp="children">
                            {driversList.map(d => (
                                <Select.Option key={d.STAFF_ID} value={d.NAME}>
                                    {d.NAME} {d.PHONE_NUMBER ? `(${d.PHONE_NUMBER})` : ''}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="LORRY_NO" label="Lorry / Vehicle Number">
                        <Select showSearch placeholder="Select Vehicle Number or Type..." allowClear optionFilterProp="children">
                            {vehiclesList.map(v => (
                                <Select.Option key={v.VEHICLE_ID} value={v.VEHICLE_NO}>
                                    {v.VEHICLE_NO} ({v.VEHICLE_TYPE}) {v.DRIVER_NAME ? `- Driver: ${v.DRIVER_NAME}` : ''}
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="STAFF_NAME" label="Helper / Staff Name">
                        <Select showSearch placeholder="Select Staff Member or Type..." allowClear optionFilterProp="children">
                            {staffList.map(s => (
                                <Select.Option key={s.STAFF_ID} value={s.NAME}>
                                    {s.NAME} ({s.ROLE})
                                </Select.Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
