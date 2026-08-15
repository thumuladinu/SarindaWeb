import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Modal, Form, Typography, Space, message, Popconfirm, Tooltip, Drawer, Select, DatePicker, Tag, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import moment from 'moment';
import dayjs from 'dayjs';
import { formatSLDateTime } from '../../utils/helpers';

const { Title, Text } = Typography;
const { Option } = Select;

export default function Cheques() {
    const [cheques, setCheques] = useState([]);
    const [bills, setBills] = useState([]);
    const [filteredCheques, setFilteredCheques] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [dueDateRange, setDueDateRange] = useState(null);
    
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [editingCheque, setEditingCheque] = useState(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchCheques();
        fetchBills();
    }, []);

    useEffect(() => {
        filterCheques();
    }, [searchText, statusFilter, dueDateRange, cheques]);

    const filterCheques = () => {
        let filtered = cheques;
        if (searchText) {
            const lower = searchText.toLowerCase();
            filtered = filtered.filter(c => 
                (c.CHEQUE_NUMBER && c.CHEQUE_NUMBER.toLowerCase().includes(lower)) ||
                (c.BANK && c.BANK.toLowerCase().includes(lower)) ||
                (c.INVOICE_NO && c.INVOICE_NO.toLowerCase().includes(lower)) ||
                (c.CUSTOMER_NAME && c.CUSTOMER_NAME.toLowerCase().includes(lower))
            );
        }
        if (statusFilter && statusFilter !== 'ALL') {
            filtered = filtered.filter(c => (c.STATUS || '').toLowerCase() === statusFilter.toLowerCase());
        }
        if (dueDateRange && dueDateRange[0] && dueDateRange[1]) {
            filtered = filtered.filter(c => {
                if (!c.DUE_DATE) return false;
                const dDate = moment(c.DUE_DATE);
                return dDate.isAfter(dueDateRange[0].startOf('day')) && dDate.isBefore(dueDateRange[1].endOf('day'));
            });
        }
        setFilteredCheques(filtered);
    };

    const resetFilters = () => {
        setSearchText('');
        setStatusFilter('ALL');
        setDueDateRange(null);
    };

    const fetchCheques = async () => {
        setLoading(true);
        try {
            const res = await axios.get('/api/mill/cheques/list', { withCredentials: true });
            if (res.data.success) {
                setCheques(res.data.result || []);
            }
        } catch (e) {
            console.error('Failed to load cheques:', e);
            message.error('Failed to load cheques');
        } finally {
            setLoading(false);
        }
    };

    const fetchBills = async () => {
        try {
            const res = await axios.get('/api/mill/sales/list', { withCredentials: true });
            if (res.data.success) {
                setBills(res.data.result || []);
            }
        } catch (e) {
            console.error('Failed to load bills:', e);
        }
    };

    const handleAdd = () => {
        setEditingCheque(null);
        form.resetFields();
        setDrawerVisible(true);
    };

    const handleEdit = (record) => {
        setEditingCheque(record);
        form.setFieldsValue({
            ...record,
            DUE_DATE: moment(record.DUE_DATE)
        });
        setDrawerVisible(true);
    };

    const handleDelete = async (id) => {
        try {
            const res = await axios.post('/api/mill/cheques/delete', { CHEQUE_ID: id }, { withCredentials: true });
            if (res.data.success) {
                message.success('Cheque deleted successfully');
                fetchCheques();
            } else {
                message.error('Failed to delete cheque');
            }
        } catch (e) {
            console.error(e);
            message.error('Failed to delete cheque');
        }
    };

    const handleFinish = async (values) => {
        setSubmitting(true);
        try {
            const payload = {
                ...values,
                DUE_DATE: values.DUE_DATE.format('YYYY-MM-DD')
            };

            if (editingCheque) {
                payload.CHEQUE_ID = editingCheque.CHEQUE_ID;
                const res = await axios.post('/api/mill/cheques/update', payload, { withCredentials: true });
                if (res.data.success) {
                    message.success('Cheque updated successfully');
                    setDrawerVisible(false);
                    fetchCheques();
                } else {
                    message.error('Failed to update cheque');
                }
            } else {
                // Add new
                const res = await axios.post('/api/mill/cheques/add', payload, { withCredentials: true });
                if (res.data.success) {
                    message.success('Cheque added successfully');
                    setDrawerVisible(false);
                    fetchCheques();
                } else {
                    message.error('Failed to add cheque');
                }
            }
        } catch (e) {
            console.error(e);
            message.error('An error occurred');
        } finally {
            setSubmitting(false);
        }
    };

    const handleStatusChange = async (id, status) => {
        try {
            const res = await axios.post('/api/mill/cheques/update-status', { CHEQUE_ID: id, STATUS: status }, { withCredentials: true });
            if (res.data.success) {
                message.success(`Cheque status marked as ${status}`);
                fetchCheques();
            }
        } catch (e) {
            console.error(e);
            message.error('Failed to update status');
        }
    };

    const columns = [
        {
            title: 'Cheque Number',
            dataIndex: 'CHEQUE_NUMBER',
            key: 'CHEQUE_NUMBER',
            render: text => <Text strong>{text}</Text>
        },
        {
            title: 'Bank',
            dataIndex: 'BANK',
            key: 'BANK',
        },
        {
            title: 'Invoice / Customer',
            key: 'INVOICE_NO',
            render: (_, record) => (
                <div className="flex flex-col">
                    <Text strong className="text-blue-600">{record.INVOICE_NO}</Text>
                    <Text type="secondary" className="text-xs">{record.CUSTOMER_NAME || 'Walk-in'}</Text>
                </div>
            )
        },
        {
            title: 'Due Date',
            dataIndex: 'DUE_DATE',
            key: 'DUE_DATE',
            render: (text, record) => {
                const { dateStr } = formatSLDateTime(text, record);
                const isOverdue = dayjs(text).isBefore(dayjs(), 'day');
                return (
                    <Text type={isOverdue ? "danger" : undefined}>
                        {dateStr}
                    </Text>
                );
            }
        },
        {
            title: 'Amount (Rs)',
            dataIndex: 'AMOUNT',
            key: 'AMOUNT',
            align: 'right',
            render: val => <Text strong>Rs. {parseFloat(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
        },
        {
            title: 'Status',
            dataIndex: 'STATUS',
            key: 'STATUS',
            align: 'center',
            render: (status, record) => {
                if (status === 'CLEARED') return <Tag color="success" icon={<CheckCircleOutlined />}>Cleared</Tag>;
                if (status === 'RETURNED') return <Tag color="error" icon={<CloseCircleOutlined />}>Returned</Tag>;
                return <Tag color="warning" icon={<ClockCircleOutlined />}>Pending</Tag>;
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            width: 220,
            render: (_, record) => (
                <Space>
                    {/* Quick Status Action Buttons (Only when PENDING) */}
                    {record.STATUS === 'PENDING' && (
                        <>
                            <Tooltip title="Mark as Cleared / Collected">
                                <Button 
                                    type="primary" 
                                    size="small"
                                    className="!bg-emerald-600 hover:!bg-emerald-700 !border-none"
                                    icon={<CheckCircleOutlined />} 
                                    onClick={() => handleStatusChange(record.CHEQUE_ID, 'CLEARED')}
                                >
                                    Cleared
                                </Button>
                            </Tooltip>
                            <Tooltip title="Mark as Returned / Bounced">
                                <Button 
                                    danger 
                                    size="small"
                                    icon={<CloseCircleOutlined />} 
                                    onClick={() => handleStatusChange(record.CHEQUE_ID, 'RETURNED')}
                                >
                                    Returned
                                </Button>
                            </Tooltip>
                        </>
                    )}

                    <Tooltip title="Edit">
                        <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                    </Tooltip>

                    <Popconfirm
                        title="Are you sure you want to delete this cheque?"
                        onConfirm={() => handleDelete(record.CHEQUE_ID)}
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
                <div>
                    <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 m-0 flex items-center gap-2">
                        📜 Cheque Reminders & Management
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
                        Track customer cheques, due dates, cleared payments, and returned cheques
                    </p>
                </div>
                <Button 
                    type="primary" 
                    icon={<PlusOutlined />} 
                    size="large"
                    onClick={handleAdd}
                    className="w-full sm:w-auto shadow-md hover:shadow-lg transition-all font-bold"
                >
                    Add Cheque
                </Button>
            </div>

            {/* ADVANCED FILTER BAR */}
            <div className="glass-card p-4 rounded-2xl border border-blue-100 dark:border-gray-800 bg-white/50 dark:bg-zinc-900/50">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <Input
                        placeholder="Search Cheque No, Bank, Customer, Invoice..."
                        prefix={<SearchOutlined className="text-gray-400" />}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                        className="rounded-xl h-10"
                    />
                    <Select
                        value={statusFilter}
                        onChange={setStatusFilter}
                        className="w-full h-10"
                        options={[
                            { label: 'All Cheque Statuses', value: 'ALL' },
                            { label: 'Pending', value: 'PENDING' },
                            { label: 'Cleared / Collected', value: 'CLEARED' },
                            { label: 'Returned', value: 'RETURNED' }
                        ]}
                    />
                    {/* Desktop RangePicker */}
                    <div className="hidden md:block">
                        <DatePicker.RangePicker
                            value={dueDateRange}
                            onChange={setDueDateRange}
                            placeholder={['Due From', 'Due To']}
                            className="w-full h-10 rounded-xl"
                        />
                    </div>
                    {/* Mobile Separate Start & End DatePickers */}
                    <div className="grid grid-cols-2 gap-2 md:hidden">
                        <DatePicker
                            placeholder="Due From"
                            value={dueDateRange ? dueDateRange[0] : null}
                            onChange={(val) => setDueDateRange(val ? [val, dueDateRange ? dueDateRange[1] : null] : null)}
                            className="w-full h-10 rounded-xl text-xs"
                            format="YYYY-MM-DD"
                        />
                        <DatePicker
                            placeholder="Due To"
                            value={dueDateRange ? dueDateRange[1] : null}
                            onChange={(val) => setDueDateRange(val ? [dueDateRange ? dueDateRange[0] : null, val] : null)}
                            className="w-full h-10 rounded-xl text-xs"
                            format="YYYY-MM-DD"
                        />
                    </div>
                    <Button onClick={resetFilters} className="rounded-xl h-10 font-medium">
                        Reset Filters
                    </Button>
                </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block page-paper overflow-hidden">
                <Table
                    columns={columns}
                    dataSource={filteredCheques}
                    rowKey="CHEQUE_ID"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    scroll={{ x: 'max-content' }}
                />
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3 pb-20">
                {filteredCheques.length === 0 ? (
                    <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                        No cheques found
                    </div>
                ) : (
                    filteredCheques.map((record) => {
                        const isOverdue = (record.STATUS || '').toUpperCase() === 'PENDING' && dayjs(record.DUE_DATE).isBefore(dayjs(), 'day');
                        return (
                            <div 
                                key={record.CHEQUE_ID} 
                                onClick={() => handleEdit(record)}
                                className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="font-mono font-bold text-white text-base truncate">Cheque #{record.CHEQUE_NUMBER}</div>
                                        <div className="text-xs text-gray-400 truncate">{record.BANK || record.BANK_NAME || 'Unknown Bank'}</div>
                                    </div>
                                    <div className="shrink-0">
                                        {record.STATUS === 'CLEARED' ? (
                                            <Tag color="success" icon={<CheckCircleOutlined />} className="m-0 font-bold">Cleared</Tag>
                                        ) : record.STATUS === 'RETURNED' ? (
                                            <Tag color="error" icon={<CloseCircleOutlined />} className="m-0 font-bold">Returned</Tag>
                                        ) : (
                                            <Tag color={isOverdue ? "error" : "warning"} icon={<ClockCircleOutlined />} className="m-0 font-bold">
                                                {isOverdue ? "Overdue" : "Pending"}
                                            </Tag>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-zinc-900/60 p-2.5 rounded-xl border border-white/5 space-y-1 text-xs">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">Customer:</span>
                                        <span className="font-semibold text-white truncate max-w-[180px]">{record.CUSTOMER_NAME || 'Walk-in'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">Invoice Ref:</span>
                                        <span className="font-mono text-blue-400 font-bold">{record.INVOICE_NO || '-'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">Due Date:</span>
                                        <span className={`font-mono font-bold ${isOverdue ? 'text-red-400' : 'text-gray-200'}`}>
                                            {formatSLDateTime(record.DUE_DATE, record).dateStr}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex justify-between items-center pt-2 border-t border-white/5 gap-2 flex-wrap sm:flex-nowrap">
                                    <span className="text-base font-bold text-emerald-400 font-mono">
                                        Rs. {parseFloat(record.AMOUNT || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                    <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                                        {record.STATUS === 'PENDING' && (
                                            <>
                                                <Button 
                                                    type="primary" 
                                                    size="small" 
                                                    className="!bg-emerald-600 hover:!bg-emerald-700 !border-none text-xs rounded-lg font-bold"
                                                    icon={<CheckCircleOutlined />} 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleStatusChange(record.CHEQUE_ID, 'CLEARED');
                                                    }}
                                                >
                                                    Cleared
                                                </Button>
                                                <Button 
                                                    danger 
                                                    size="small" 
                                                    icon={<CloseCircleOutlined />} 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleStatusChange(record.CHEQUE_ID, 'RETURNED');
                                                    }}
                                                    className="text-xs rounded-lg font-bold"
                                                >
                                                    Returned
                                                </Button>
                                            </>
                                        )}
                                        <Button 
                                            size="small" 
                                            icon={<EditOutlined />} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleEdit(record);
                                            }} 
                                            className="!text-amber-500 rounded-lg"
                                        />
                                        <Popconfirm title="Delete cheque?" onConfirm={() => handleDelete(record.CHEQUE_ID)} okText="Yes" cancelText="No">
                                            <Button size="small" icon={<DeleteOutlined />} danger onClick={(e) => e.stopPropagation()} className="rounded-lg" />
                                        </Popconfirm>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <Drawer
                title={editingCheque ? "Edit Cheque" : "Add New Cheque"}
                placement="right"
                width={typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : 480}
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
                        name="BILL_ID" 
                        label="Related Invoice"
                        rules={[{ required: true, message: 'Please select the invoice' }]}
                    >
                        <Select
                            showSearch
                            placeholder="Search invoice number"
                            optionFilterProp="children"
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            options={bills.map(b => ({
                                value: b.BILL_ID,
                                label: `${b.INVOICE_NO} - ${b.CUSTOMER_NAME || 'Walk-in'} (Total: ${b.FINAL_AMOUNT || b.TOTAL_AMOUNT})`
                            }))}
                        />
                    </Form.Item>

                    <Form.Item 
                        name="CHEQUE_NUMBER" 
                        label="Cheque Number"
                        rules={[{ required: true, message: 'Please enter cheque number' }]}
                    >
                        <Input placeholder="Enter cheque number" />
                    </Form.Item>

                    <Form.Item 
                        name="BANK" 
                        label="Bank Name"
                    >
                        <Input placeholder="Enter bank name" />
                    </Form.Item>

                    <Form.Item 
                        name="DUE_DATE" 
                        label="Due Date"
                        rules={[{ required: true, message: 'Please select due date' }]}
                    >
                        <DatePicker className="w-full" format="YYYY-MM-DD" />
                    </Form.Item>

                    <Form.Item 
                        name="AMOUNT" 
                        label="Amount (Rs)"
                        rules={[{ required: true, message: 'Please enter amount' }]}
                    >
                        <InputNumber 
                            className="w-full" 
                            formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                            parser={value => value.replace(/\$\s?|(,*)/g, '')}
                            step={0.01}
                        />
                    </Form.Item>

                    <Form.Item 
                        name="STATUS" 
                        label="Status"
                        initialValue="PENDING"
                    >
                        <Select>
                            <Option value="PENDING">Pending</Option>
                            <Option value="CLEARED">Cleared</Option>
                            <Option value="RETURNED">Returned</Option>
                        </Select>
                    </Form.Item>

                    <div className="flex justify-end gap-3 mt-8">
                        <Button onClick={() => setDrawerVisible(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={submitting}>
                            {editingCheque ? 'Update' : 'Save'}
                        </Button>
                    </div>
                </Form>
            </Drawer>
        </div>
    );
}
