import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Tooltip, Pagination, Spin, App, Modal, Form, DatePicker, InputNumber, Input } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
import TransactionFilters from './transactions/TransactionFilters';
import TransactionForm from './transactions/TransactionForm';
import TransactionView from './transactions/TransactionView';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import axios from 'axios';
import { generateReceiptHTML } from '../utils/receiptGenerator';

dayjs.extend(utc);

export default function Transactions() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [users, setUsers] = useState({}); // Map ID -> Name
    const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });

    // Current User Logic
    const [currentUser, setCurrentUser] = useState(null);
    useEffect(() => {
        const importCookies = async () => {
            const Cookies = (await import('js-cookie')).default;
            const userStr = Cookies.get('rememberedUser');
            if (userStr) {
                setCurrentUser(JSON.parse(userStr));
            }
        };
        importCookies();
    }, []);

    // Edit Drawer State
    const [editDrawerOpen, setEditDrawerOpen] = useState(false);
    const [selectedTransactionId, setSelectedTransactionId] = useState(null);

    // View Modal State
    const [viewModalOpen, setViewModalOpen] = useState(false);
    const [viewTransactionId, setViewTransactionId] = useState(null);

    // Receipt View Modal State (like 'View Original Bill' in edit form)
    const [receiptModalOpen, setReceiptModalOpen] = useState(false);
    const [receiptData, setReceiptData] = useState(null);
    const [receiptLoading, setReceiptLoading] = useState(false);

    // Add Expense Modal State
    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [expenseLoading, setExpenseLoading] = useState(false);
    const [expenseForm] = Form.useForm();

    const [filters, setFilters] = useState({
        code: '',
        store: null,
        type: null,
        minAmount: '',
        maxAmount: '',
        dateRange: null,
        item: null
    });

    // Fetch Users Mapping
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.post('/api/getAllUsers');
                if (response.data.users) {
                    const userMap = {};
                    response.data.users.forEach(u => {
                        userMap[u.USER_ID] = u.NAME;
                    });
                    setUsers(userMap);
                }
            } catch (error) {
                console.error("Error fetching users", error);
            }
        };
        fetchUsers();
    }, []);

    const fetchData = async () => {
        // ... (existing fetch logic remains)
        setLoading(true);
        try {
            const payload = {
                page: pagination.current,
                limit: pagination.pageSize,
                search: filters.code || null,
                STORE_NO: filters.store || null,
                type: filters.type ? (filters.type === 'buy' ? 'Buying' : filters.type === 'sell' ? 'Selling' : 'Expenses') : null,
                minAmount: filters.minAmount || null,
                maxAmount: filters.maxAmount || null,
                startDate: filters.dateRange ? filters.dateRange[0].format('YYYY-MM-DD') : null,
                endDate: filters.dateRange ? filters.dateRange[1].format('YYYY-MM-DD') : null,
                itemIds: filters.item || []
            };

            const response = await axios.post('/api/getAllTransactionsCashBook', payload);

            if (response.data.success) {
                setData(response.data.result);
                // Ensure pagination handles if total is returned or calculate roughly
                setPagination(prev => ({
                    ...prev,
                    total: response.data.pagination ? response.data.pagination.total : 0
                }));
            }
        } catch (error) {
            console.error("Error fetching transactions:", error);
            // message.error("Failed to load transactions");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [pagination.current, filters]); // Re-fetch on page or filter change

    // ... (handlers remain)

    const handleEdit = (id) => {
        setSelectedTransactionId(id);
        setEditDrawerOpen(true);
    };

    const handleDelete = (record) => {
        Modal.confirm({
            title: 'Are you sure you want to delete this transaction?',
            content: `Code: ${record.CODE} | Type: ${record.TYPE}`,
            okText: 'Yes, Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            onOk: async () => {
                try {
                    const response = await axios.post('/api/deactivateTransaction', {
                        TRANSACTION_ID: record.TRANSACTION_ID,
                        ITEM_DEL: true,
                        TYPE: record.TYPE
                    });

                    if (response.data.success) {
                        message.success('Transaction deleted successfully');
                        fetchData();
                    } else {
                        message.error('Failed to delete transaction');
                    }
                } catch (error) {
                    console.error("Error deleting transaction:", error);
                    message.error("Failed to delete transaction");
                }
            }
        });
    };

    const handleEditSuccess = () => {
        fetchData(); // Refresh list on update
    };

    // Add Expense Handler
    const handleAddExpense = async (values) => {
        setExpenseLoading(true);
        try {
            // Get current user from cookie (set during login)
            const Cookies = (await import('js-cookie')).default;
            const userStr = Cookies.get('rememberedUser');
            const user = userStr ? JSON.parse(userStr) : null;
            const createdBy = user?.USER_ID || 1;

            // Generate expense code: WEB-EXP-YYMMDD-NNN
            const expenseDate = values.DATE || dayjs();
            const dateStr = expenseDate.format('YYMMDD');
            // Get a random 3-digit suffix (backend will ensure uniqueness if needed)
            const randomSuffix = String(Math.floor(Math.random() * 900) + 100);
            const expenseCode = `WEB-EXP-${dateStr}-${randomSuffix}`;

            const payload = {
                CODE: expenseCode,
                TYPE: 'Expenses',
                STORE_NO: 1, // Default store
                SUB_TOTAL: values.SUB_TOTAL,
                AMOUNT_SETTLED: values.SUB_TOTAL,
                DUE_AMOUNT: 0,
                COMMENTS: values.COMMENTS || '',
                CREATED_BY: createdBy,
                CREATED_DATE: expenseDate.format('YYYY-MM-DD HH:mm:ss'),
                ITEMS: [] // Expenses don't have items
            };

            const response = await axios.post('/api/addTransaction', payload);

            if (response.data.success) {
                message.success('Expense added successfully');
                setExpenseModalOpen(false);
                expenseForm.resetFields();
                fetchData(); // Refresh list
            } else {
                message.error(response.data.message || 'Failed to add expense');
            }
        } catch (error) {
            console.error('Error adding expense:', error);
            message.error('Failed to add expense');
        } finally {
            setExpenseLoading(false);
        }
    };

    // Open Add Expense Modal
    const openExpenseModal = () => {
        expenseForm.setFieldsValue({
            DATE: dayjs(),
            SUB_TOTAL: null,
            COMMENTS: ''
        });
        setExpenseModalOpen(true);
    };

    // View Bill Handler - Opens receipt in modal popup (exactly like 'View Original Bill' button in edit form)
    const handleViewBill = async (record) => {
        // For expenses, use the TransactionView modal
        if (record.TYPE === 'Expenses') {
            setViewTransactionId(record.TRANSACTION_ID);
            setViewModalOpen(true);
            return;
        }

        setReceiptLoading(true);
        setReceiptModalOpen(true);
        try {
            // Check if BILL_DATA exists on record, otherwise fetch it
            // Check if BILL_DATA exists on record, otherwise fetch it
            let billData = record.BILL_DATA;
            let transactionItems = [];

            if (!billData) {
                // Fetch full transaction details if BILL_DATA not in list
                const response = await axios.get(`/api/getTransactionDetails/${record.TRANSACTION_ID}`);
                if (response.data.success) {
                    if (response.data.transaction) {
                        billData = response.data.transaction.BILL_DATA;
                    }
                    if (response.data.items) {
                        transactionItems = response.data.items;
                    }
                }
            }

            if (billData) {
                const parsedData = typeof billData === 'string' ? JSON.parse(billData) : billData;
                setReceiptData(parsedData);
            } else {
                // FALLBACK: Construct view from available record data
                console.warn('Bill data missing, using fallback view');
                const fallbackData = {
                    billId: record.CODE,
                    date: dayjs(record.CREATED_DATE).format('MM/DD/YYYY'),
                    time: dayjs(record.CREATED_DATE).format('h:mm A'),
                    mode: record.TYPE === 'Buying' ? 'buy' : 'sell',
                    items: transactionItems.map(item => ({
                        id: item.ITEM_ID,
                        name: item.ITEM_NAME || 'Unknown Item',
                        quantity: item.QUANTITY,
                        price: item.PRICE,
                        total: item.TOTAL || (item.PRICE * item.QUANTITY)
                    })),
                    total: record.SUB_TOTAL,
                    isFallback: true
                };
                setReceiptData(fallbackData);
                message.warning('Displaying reconstructed bill (Original data missing)');
            }
        } catch (error) {
            console.error('Error loading bill:', error);
            message.error('Failed to load bill');
            setReceiptModalOpen(false);
        } finally {
            setReceiptLoading(false);
        }
    };

    const columns = [
        // ... (other columns)
        {
            title: 'Code',
            dataIndex: 'CODE',
            key: 'CODE',
            className: 'text-gray-700 dark:text-gray-300 font-medium',
            render: (code, record) => {
                let isLate = false;
                if (record.BILL_DATA) {
                    try {
                        const bd = typeof record.BILL_DATA === 'string' ? JSON.parse(record.BILL_DATA) : record.BILL_DATA;
                        isLate = !!bd.isLate;
                    } catch (e) { }
                }
                return (
                    <div className="flex items-center gap-2">
                        <span>{code}</span>
                        {isLate && (
                            <Tooltip title="Late Entry">
                                <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded border border-orange-200 cursor-help">🕒 Late</span>
                            </Tooltip>
                        )}
                    </div>
                );
            }
        },
        {
            title: 'Store',
            dataIndex: 'STORE_NO',
            key: 'STORE_NO',
            render: (storeNo) => (
                <span className="text-gray-600 dark:text-gray-400">
                    {storeNo ? `Store ${storeNo}` : 'N/A'}
                </span>
            )
        },
        {
            title: 'Date & Time',
            dataIndex: 'CREATED_DATE',
            key: 'CREATED_DATE',
            render: (date) => (
                <div className="flex flex-col text-xs">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{dayjs(date).utcOffset(330).format('YYYY-MM-DD')}</span>
                    <span className="text-gray-500">{dayjs(date).utcOffset(330).format('h:mm A')}</span>
                </div>
            )
        },
        {
            title: 'Type',
            dataIndex: 'TYPE',
            key: 'TYPE',
            render: (type) => {
                let color = 'default';
                let label = type;

                if (type === 'Selling') { color = 'success'; }
                else if (type === 'Buying') { color = 'error'; }
                else if (type === 'Expenses') { color = 'warning'; }

                return (
                    <Tag color={color} className="capitalize font-bold border-none px-2 py-0.5 rounded-md">
                        {label}
                    </Tag>
                );
            }
        },
        {
            title: 'Amount',
            dataIndex: 'SUB_TOTAL',
            key: 'SUB_TOTAL',
            align: 'right',
            render: (amount, record) => {
                const isPositive = record.TYPE === 'Selling';
                const color = isPositive ? 'text-emerald-500' : 'text-red-500';
                const sign = isPositive ? '+' : '-';
                return (
                    <span className={`font-bold text-base ${color}`}>
                        {sign} Rs.{Number(amount || 0).toFixed(2)}
                    </span>
                );
            }
        },
        {
            title: 'Cashier',
            dataIndex: 'CREATED_BY',
            key: 'CREATED_BY',
            className: 'text-gray-600 dark:text-gray-400 text-xs',
            render: (id, record) => (
                <div className="flex flex-col">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{users[id] || id}</span>
                    <span className="text-[10px] text-gray-400">at {dayjs(record.EDITED_DATE).utcOffset(330).format('YYYY-MM-DD h:mmA')}</span>
                </div>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            render: (_, record) => (
                <div className="flex gap-2 justify-center">
                    <Tooltip title="View Bill">
                        <Button onClick={() => handleViewBill(record)} type="text" shape="circle" icon={<EyeOutlined />} className="text-green-500 hover:bg-green-50 dark:hover:bg-green-500/10" />
                    </Tooltip>
                    {currentUser?.ROLE !== 'MONITOR' && (
                        <>
                            <Tooltip title="Edit">
                                <Button onClick={() => handleEdit(record.TRANSACTION_ID)} type="text" shape="circle" icon={<EditOutlined />} className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10" />
                            </Tooltip>
                            <Tooltip title="Delete">
                                <Button onClick={() => handleDelete(record)} type="text" shape="circle" icon={<DeleteOutlined />} danger className="hover:bg-red-50 dark:hover:bg-red-500/10" />
                            </Tooltip>
                        </>
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8">
            {/* <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Transactions</h2> */}

            <TransactionFilters filters={filters} setFilters={setFilters} />

            {/* Add Expense Button */}
            {currentUser?.ROLE !== 'MONITOR' && (
                <div className="flex justify-end mb-4">
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={openExpenseModal}
                        className="bg-orange-500 hover:bg-orange-600 border-orange-500"
                    >
                        Add Expense
                    </Button>
                </div>
            )}

            {/* Desktop Table */}
            <div className="hidden md:block glass-card rounded-2xl overflow-hidden p-1">
                <Table
                    columns={columns}
                    dataSource={data}
                    rowKey="TRANSACTION_ID"
                    loading={loading}
                    pagination={{
                        current: pagination.current,
                        pageSize: pagination.pageSize,
                        total: pagination.total,
                        onChange: (page) => setPagination(prev => ({ ...prev, current: page }))
                    }}
                    rowClassName="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors"
                />
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden flex flex-col gap-4">
                {loading ? <div className="flex justify-center p-8"><Spin /></div> : data.map(item => (
                    <div key={item.TRANSACTION_ID} className="glass-card p-4 rounded-xl flex flex-col gap-3 relative">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-500 font-mono">{item.CODE}</span>
                                <span className="text-gray-800 dark:text-white font-semibold text-lg">
                                    {dayjs(item.CREATED_DATE).utcOffset(330).format('DD MMM, h:mm A')}
                                </span>
                            </div>
                            <div className="flex gap-1 items-center">
                                {/* Late Tag */}
                                {(() => {
                                    let isLate = false;
                                    if (item.BILL_DATA) {
                                        try {
                                            const bd = typeof item.BILL_DATA === 'string' ? JSON.parse(item.BILL_DATA) : item.BILL_DATA;
                                            isLate = !!bd.isLate;
                                        } catch (e) { }
                                    }
                                    return isLate ? (
                                        <Tag color="warning" className="m-0 font-bold border-yellow-200 text-yellow-600 bg-yellow-50">
                                            Late
                                        </Tag>
                                    ) : null;
                                })()}
                                <Tag color={item.TYPE === 'Selling' ? 'success' : item.TYPE === 'Buying' ? 'error' : 'warning'} className="capitalize m-0 font-bold">
                                    {item.TYPE}
                                </Tag>
                            </div>
                        </div>

                        <div className="flex justify-between items-end border-t border-gray-200 dark:border-white/5 pt-3">
                            <div className="flex flex-col gap-1">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Store</span>
                                    <span className="text-sm dark:text-gray-300">{item.STORE_NO ? `Store ${item.STORE_NO}` : 'N/A'}</span>
                                </div>
                                <div className="flex flex-col mt-1">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Cashier</span>
                                    <span className="text-[10px] dark:text-gray-300">{users[item.CREATED_BY] || item.CREATED_BY}</span>
                                    <span className="text-[8px] text-gray-500">at {dayjs(item.EDITED_DATE).utcOffset(330).format('YYYY-MM-DD h:mmA')}</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-xs text-gray-500">Amount</span>
                                <span className={`text-xl font-bold ${item.TYPE === 'Selling' ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {item.TYPE === 'Selling' ? '+' : '-'} Rs.{Number(item.SUB_TOTAL || 0).toFixed(2)}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 flex justify-end gap-3 pt-2 border-t border-white/5">
                            <Button onClick={() => handleViewBill(item)} size="small" icon={<EyeOutlined />} className="dark:text-green-400 border-green-500/20 hover:border-green-500/50 bg-green-500/5">View</Button>
                            {currentUser?.ROLE !== 'MONITOR' && (
                                <>
                                    <Button onClick={() => handleEdit(item.TRANSACTION_ID)} size="small" icon={<EditOutlined />} className="dark:text-blue-400 border-blue-500/20 hover:border-blue-500/50 bg-blue-500/5">Edit</Button>
                                    <Button onClick={() => handleDelete(item)} size="small" danger icon={<DeleteOutlined />} className="border-red-500/20 hover:border-red-500/50 bg-red-500/5">Delete</Button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
                {!loading && data.length === 0 && (
                    <div className="text-center py-10 text-gray-500">No transactions found</div>
                )}
            </div>

            {/* Receipt View Modal - Exactly like 'View Original Bill' in edit form */}
            <Modal
                title={
                    <div className="flex justify-between items-center pr-8">
                        <span>Original Receipt View</span>
                        {receiptData && <Tag color="blue">Bill #{receiptData?.billId || receiptData?.code}</Tag>}
                    </div>
                }
                open={receiptModalOpen}
                onCancel={() => { setReceiptModalOpen(false); setReceiptData(null); }}
                footer={[
                    <Button key="close" onClick={() => { setReceiptModalOpen(false); setReceiptData(null); }}>Close</Button>
                ]}
                width={400}
                className="receipt-modal"
            >
                {receiptLoading ? (
                    <div className="flex justify-center items-center h-[500px]">
                        <Spin size="large" />
                    </div>
                ) : receiptData ? (
                    <div className="h-[500px] w-full bg-gray-50 overflow-hidden border border-gray-200">
                        <iframe
                            srcDoc={generateReceiptHTML(receiptData)}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="Receipt Preview"
                        />
                    </div>
                ) : (
                    <div className="text-center py-10 text-gray-400">No receipt data</div>
                )}
            </Modal>

            {/* Edit Drawer */}
            <TransactionForm
                open={editDrawerOpen}
                onClose={() => setEditDrawerOpen(false)}
                transactionId={selectedTransactionId}
                onSuccess={handleEditSuccess}
            />

            {/* View Transaction Modal */}
            <TransactionView
                open={viewModalOpen}
                onClose={() => setViewModalOpen(false)}
                transactionId={viewTransactionId}
            />

            {/* Add Expense Modal */}
            <Modal
                title="Add Expense"
                open={expenseModalOpen}
                onCancel={() => setExpenseModalOpen(false)}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={expenseForm}
                    layout="vertical"
                    onFinish={handleAddExpense}
                    className="mt-4"
                >
                    <Form.Item
                        name="DATE"
                        label="Date & Time"
                        rules={[{ required: true, message: 'Please select date and time' }]}
                    >
                        <DatePicker
                            showTime
                            format="YYYY-MM-DD HH:mm"
                            className="w-full"
                        />
                    </Form.Item>

                    <Form.Item
                        name="SUB_TOTAL"
                        label="Amount (Rs.)"
                        rules={[{ required: true, message: 'Please enter amount' }]}
                    >
                        <InputNumber
                            min={0}
                            step={0.01}
                            className="w-full"
                            placeholder="Enter expense amount"
                        />
                    </Form.Item>

                    <Form.Item
                        name="COMMENTS"
                        label="Comments"
                    >
                        <Input.TextArea
                            rows={3}
                            placeholder="Enter expense description or notes"
                        />
                    </Form.Item>

                    <div className="flex justify-end gap-2 mt-4">
                        <Button onClick={() => setExpenseModalOpen(false)}>Cancel</Button>
                        <Button type="primary" htmlType="submit" loading={expenseLoading}>
                            Add Expense
                        </Button>
                    </div>
                </Form>
            </Modal>
        </div>
    );
}
