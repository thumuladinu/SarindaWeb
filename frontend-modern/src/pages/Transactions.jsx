import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Tooltip, Pagination, Spin, App, Modal } from 'antd';
import { EditOutlined, DeleteOutlined } from '@ant-design/icons';
import TransactionFilters from './transactions/TransactionFilters';
import TransactionForm from './transactions/TransactionForm';
import dayjs from 'dayjs';
import axios from 'axios';

export default function Transactions() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [users, setUsers] = useState({}); // Map ID -> Name
    const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });

    // Edit Drawer State
    const [editDrawerOpen, setEditDrawerOpen] = useState(false);
    const [selectedTransactionId, setSelectedTransactionId] = useState(null);

    const [filters, setFilters] = useState({
        code: '',
        store: null,
        type: null,
        minAmount: '',
        maxAmount: '',
        dateRange: null
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
                endDate: filters.dateRange ? filters.dateRange[1].format('YYYY-MM-DD') : null
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

    const columns = [
        // ... (other columns)
        {
            title: 'Code',
            dataIndex: 'CODE',
            key: 'CODE',
            className: 'text-gray-700 dark:text-gray-300 font-medium',
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
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{dayjs(date).format('YYYY-MM-DD')}</span>
                    <span className="text-gray-500">{dayjs(date).format('h:mm A')}</span>
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
            render: (id) => users[id] || id // Display Name or fallback to ID
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            render: (_, record) => (
                <div className="flex gap-2 justify-center">
                    <Tooltip title="Edit">
                        <Button onClick={() => handleEdit(record.TRANSACTION_ID)} type="text" shape="circle" icon={<EditOutlined />} className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10" />
                    </Tooltip>
                    <Tooltip title="Delete">
                        <Button onClick={() => handleDelete(record)} type="text" shape="circle" icon={<DeleteOutlined />} danger className="hover:bg-red-50 dark:hover:bg-red-500/10" />
                    </Tooltip>
                </div>
            )
        }
    ];

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8">
            {/* <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Transactions</h2> */}

            <TransactionFilters filters={filters} setFilters={setFilters} />

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
                                <span className="text-gray-800 dark:text-white font-semibold text-lg">{dayjs(item.CREATED_DATE).format('DD MMM, h:mm A')}</span>
                            </div>
                            <Tag color={item.TYPE === 'Selling' ? 'success' : item.TYPE === 'Buying' ? 'error' : 'warning'} className="capitalize m-0 font-bold">
                                {item.TYPE}
                            </Tag>
                        </div>

                        <div className="flex justify-between items-end border-t border-gray-200 dark:border-white/5 pt-3">
                            <div className="flex flex-col gap-1">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Store</span>
                                    <span className="text-sm dark:text-gray-300">{item.STORE_NO ? `Store ${item.STORE_NO}` : 'N/A'}</span>
                                </div>
                                <div className="flex flex-col mt-1">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Cashier</span>
                                    <span className="text-xs dark:text-gray-300">{users[item.CREATED_BY] || item.CREATED_BY}</span>
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
                            <Button onClick={() => handleEdit(item.TRANSACTION_ID)} size="small" icon={<EditOutlined />} className="dark:text-blue-400 border-blue-500/20 hover:border-blue-500/50 bg-blue-500/5">Edit</Button>
                            <Button onClick={() => handleDelete(item)} size="small" danger icon={<DeleteOutlined />} className="border-red-500/20 hover:border-red-500/50 bg-red-500/5">Delete</Button>
                        </div>
                    </div>
                ))}
                {!loading && data.length === 0 && (
                    <div className="text-center py-10 text-gray-500">No transactions found</div>
                )}
            </div>

            {/* Edit Drawer */}
            <TransactionForm
                open={editDrawerOpen}
                onClose={() => setEditDrawerOpen(false)}
                transactionId={selectedTransactionId}
                onSuccess={handleEditSuccess}
            />
        </div>
    );
}
