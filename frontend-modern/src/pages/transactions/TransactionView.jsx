import React, { useEffect, useState } from 'react';
import { Modal, Table, Spin, Divider, Tag, Descriptions, Button } from 'antd';
import { CloseOutlined, PrinterOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import { generateReceiptHTML } from '../../utils/receiptGenerator';

/**
 * TransactionView - Read-only modal to view transaction details
 * Similar to TransactionForm but display-only (no editing)
 */
const TransactionView = ({ open, onClose, transactionId }) => {
    const [loading, setLoading] = useState(false);
    const [transaction, setTransaction] = useState(null);
    const [items, setItems] = useState([]);
    const [deductionItems, setDeductionItems] = useState([]);
    const [receiptData, setReceiptData] = useState(null);
    const [showReceipt, setShowReceipt] = useState(false);

    // Helper to identify deduction items
    const isDeduction = (item) => {
        const code = (item.ITEM_CODE || item.code || '').toUpperCase();
        const name = (item.ITEM_NAME || item.name || '').toLowerCase();
        return code === 'CONTAINER' || code === 'RETURN' || name.includes('container') || name.includes('return');
    };

    // Fetch transaction details when opened
    useEffect(() => {
        if (open && transactionId) {
            fetchTransactionDetails(transactionId);
        } else {
            // Reset state when closed
            setTransaction(null);
            setItems([]);
            setDeductionItems([]);
            setReceiptData(null);
        }
    }, [open, transactionId]);

    const fetchTransactionDetails = async (id) => {
        setLoading(true);
        try {
            const response = await axios.get(`/api/getTransactionDetails/${id}`);
            if (response.data.success) {
                const tx = response.data.transaction;
                const allItems = response.data.items || [];

                setTransaction(tx);

                // Parse BILL_DATA for receipt view
                if (tx.BILL_DATA) {
                    try {
                        const parsedBillData = typeof tx.BILL_DATA === 'string'
                            ? JSON.parse(tx.BILL_DATA)
                            : tx.BILL_DATA;
                        setReceiptData(parsedBillData);
                    } catch (e) {
                        console.error("Error parsing BILL_DATA", e);
                        setReceiptData(null);
                    }
                }

                // Map items
                const mappedItems = allItems.map((item, index) => ({
                    key: index,
                    ITEM_ID: item.ITEM_ID || item.productId,
                    ITEM_CODE: item.ITEM_CODE || item.productCode,
                    ITEM_NAME: item.ITEM_NAME || item.name || item.productName || 'Unknown Item',
                    PRICE: item.PRICE || item.price || 0,
                    QUANTITY: item.QUANTITY || item.quantity || 0,
                    TOTAL: item.TOTAL || item.total || 0,
                    lotEntries: item.lotEntries || []
                }));

                // Split into Regular Items and Deductions
                setItems(mappedItems.filter(i => !isDeduction(i)));
                setDeductionItems(mappedItems.filter(i => isDeduction(i)));
            }
        } catch (error) {
            console.error("Error fetching transaction details:", error);
        } finally {
            setLoading(false);
        }
    };

    // Format currency
    const formatCurrency = (value) => `Rs. ${(parseFloat(value) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    // Get type color
    const getTypeColor = (type) => {
        switch (type) {
            case 'Selling': return 'green';
            case 'Buying': return 'blue';
            case 'Expenses': return 'red';
            default: return 'default';
        }
    };

    // Get method color
    const getMethodColor = (method) => {
        switch (method) {
            case 'Cash': return 'green';
            case 'Card': return 'purple';
            case 'Bank': return 'blue';
            case 'Cheque': return 'orange';
            case 'Credit': return 'red';
            default: return 'default';
        }
    };

    // Items table columns
    const itemColumns = [
        {
            title: 'Item',
            dataIndex: 'ITEM_NAME',
            key: 'name',
            render: (text, record) => (
                <div>
                    <div className="font-medium text-gray-800 dark:text-gray-200">{text}</div>
                    {record.ITEM_CODE && (
                        <div className="text-xs text-gray-400">{record.ITEM_CODE}</div>
                    )}
                </div>
            )
        },
        {
            title: 'Price',
            dataIndex: 'PRICE',
            key: 'price',
            align: 'right',
            render: (value) => <span className="text-gray-600 dark:text-gray-300">{formatCurrency(value)}</span>
        },
        {
            title: 'Qty',
            dataIndex: 'QUANTITY',
            key: 'qty',
            align: 'center',
            render: (value) => <span className="font-medium">{parseFloat(value || 0).toFixed(2)}</span>
        },
        {
            title: 'Total',
            dataIndex: 'TOTAL',
            key: 'total',
            align: 'right',
            render: (value) => <span className="font-bold text-gray-800 dark:text-gray-200">{formatCurrency(value)}</span>
        }
    ];

    return (
        <>
            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <EyeOutlined className="text-blue-500" />
                        <span>Transaction Details</span>
                        {transaction?.CODE && (
                            <Tag color="blue" className="ml-2">#{transaction.CODE}</Tag>
                        )}
                    </div>
                }
                open={open}
                onCancel={onClose}
                footer={[
                    receiptData && (
                        <Button
                            key="receipt"
                            type="primary"
                            icon={<PrinterOutlined />}
                            onClick={() => setShowReceipt(true)}
                            className="bg-blue-500 hover:bg-blue-600"
                        >
                            View Receipt
                        </Button>
                    ),
                    <Button key="close" onClick={onClose}>Close</Button>
                ].filter(Boolean)}
                width={700}
                className="transaction-view-modal"
            >
                {loading ? (
                    <div className="flex justify-center items-center h-64">
                        <Spin size="large" />
                    </div>
                ) : transaction ? (
                    <div className="flex flex-col gap-4">
                        {/* Header Info */}
                        <div className="flex flex-wrap gap-2 items-center justify-between p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg">
                            <div className="flex gap-2 items-center">
                                <Tag color={getTypeColor(transaction.TYPE)} className="text-sm">
                                    {transaction.TYPE}
                                </Tag>
                                <Tag color={getMethodColor(transaction.METHOD)}>
                                    {transaction.METHOD}
                                </Tag>
                            </div>
                            <div className="text-gray-500 text-sm">
                                {dayjs(transaction.DATE || transaction.CREATED_DATE).format('DD MMM YYYY, hh:mm A')}
                            </div>
                        </div>

                        {/* Transaction Details */}
                        <Descriptions
                            size="small"
                            column={{ xs: 1, sm: 2 }}
                            className="bg-white dark:bg-zinc-800 rounded-lg p-2"
                        >
                            {transaction.CUSTOMER_NAME && (
                                <Descriptions.Item label="Customer">
                                    <span className="font-medium">{transaction.CUSTOMER_NAME}</span>
                                </Descriptions.Item>
                            )}
                            <Descriptions.Item label="Store">
                                Store {transaction.STORE_NO || 1}
                            </Descriptions.Item>
                            {transaction.CREATED_BY_NAME && (
                                <Descriptions.Item label="Cashier">
                                    {transaction.CREATED_BY_NAME}
                                </Descriptions.Item>
                            )}
                        </Descriptions>

                        {/* Items Table */}
                        {(items.length > 0 || deductionItems.length > 0) && (
                            <>
                                <Divider orientation="left" className="!my-2 !text-gray-400 !text-xs">
                                    ITEMS
                                </Divider>

                                {/* Desktop Table */}
                                <div className="hidden md:block">
                                    <Table
                                        dataSource={items}
                                        columns={itemColumns}
                                        pagination={false}
                                        size="small"
                                        className="rounded-lg overflow-hidden"
                                        expandable={{
                                            expandedRowRender: (record) => record.lotEntries?.length > 0 && (
                                                <div className="p-3 bg-gray-50 dark:bg-black/30 rounded-lg mx-2 mb-2">
                                                    <span className="text-xs font-bold text-gray-500 uppercase mb-2 block">Bag Details</span>
                                                    <div className="flex flex-wrap gap-2">
                                                        {record.lotEntries.map((entry, idx) => (
                                                            <Tag key={idx} className="!bg-blue-50 !border-blue-200 !text-blue-700">
                                                                {entry.bags || 0} bags • {(entry.kilos || 0).toFixed(2)} kg
                                                            </Tag>
                                                        ))}
                                                    </div>
                                                </div>
                                            ),
                                            rowExpandable: (record) => record.lotEntries?.length > 0
                                        }}
                                    />
                                </div>

                                {/* Mobile Card List */}
                                <div className="md:hidden flex flex-col gap-2">
                                    {items.map((item) => (
                                        <div key={item.key} className="glass-card p-3 rounded-lg border border-gray-100 dark:border-white/10">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <div className="font-medium text-gray-800 dark:text-gray-200">{item.ITEM_NAME}</div>
                                                    {item.ITEM_CODE && <div className="text-xs text-gray-400">{item.ITEM_CODE}</div>}
                                                </div>
                                                <span className="font-bold text-gray-800 dark:text-gray-200">{formatCurrency(item.TOTAL)}</span>
                                            </div>
                                            <div className="flex gap-4 text-sm text-gray-500">
                                                <span>{formatCurrency(item.PRICE)} × {parseFloat(item.QUANTITY || 0).toFixed(2)}</span>
                                            </div>
                                            {item.lotEntries?.length > 0 && (
                                                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-white/10">
                                                    <div className="flex flex-wrap gap-1">
                                                        {item.lotEntries.map((entry, idx) => (
                                                            <Tag key={idx} size="small" className="!text-xs">
                                                                {entry.bags || 0}b • {(entry.kilos || 0).toFixed(1)}kg
                                                            </Tag>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Deductions */}
                                {deductionItems.length > 0 && (
                                    <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-lg">
                                        <span className="text-xs font-bold text-red-500 uppercase block mb-2">
                                            Containers & Returns
                                        </span>
                                        <div className="flex flex-col gap-1">
                                            {deductionItems.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-center text-sm">
                                                    <span className="text-gray-700 dark:text-gray-300">
                                                        {item.ITEM_NAME}
                                                        <span className="text-gray-400 text-xs ml-2">
                                                            ({parseFloat(item.QUANTITY || 0).toFixed(2)} kg @ {formatCurrency(item.PRICE)})
                                                        </span>
                                                    </span>
                                                    <span className="font-mono font-medium text-red-600">
                                                        - {formatCurrency(Math.abs(item.TOTAL || 0))}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Comments */}
                        {transaction.COMMENTS && (
                            <>
                                <Divider orientation="left" className="!my-2 !text-gray-400 !text-xs">
                                    COMMENTS
                                </Divider>
                                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/20 rounded-lg text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                    {transaction.COMMENTS}
                                </div>
                            </>
                        )}

                        {/* Financials Summary */}
                        <Divider orientation="left" className="!my-2 !text-gray-400 !text-xs">
                            SUMMARY
                        </Divider>
                        <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-zinc-900 dark:to-zinc-800 rounded-lg">
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                    <span>Sub Total</span>
                                    <span>{formatCurrency(transaction.SUB_TOTAL)}</span>
                                </div>
                                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                    <span>Amount Paid</span>
                                    <span className="text-green-600">{formatCurrency(transaction.AMOUNT_SETTLED)}</span>
                                </div>
                                {(transaction.DUE_AMOUNT > 0) && (
                                    <div className="flex justify-between text-sm font-medium text-red-600">
                                        <span>Due Amount</span>
                                        <span>{formatCurrency(transaction.DUE_AMOUNT)}</span>
                                    </div>
                                )}
                                <Divider className="!my-2" />
                                <div className="flex justify-between text-lg font-bold text-gray-800 dark:text-gray-200">
                                    <span>Total</span>
                                    <span>{formatCurrency(transaction.SUB_TOTAL)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-400">
                        Transaction not found
                    </div>
                )}
            </Modal>

            {/* Receipt Preview Modal */}
            <Modal
                title={
                    <div className="flex justify-between items-center pr-8">
                        <span>Original Receipt</span>
                        <Tag color="blue">Bill #{receiptData?.billId || receiptData?.code}</Tag>
                    </div>
                }
                open={showReceipt}
                onCancel={() => setShowReceipt(false)}
                footer={[
                    <Button key="close" onClick={() => setShowReceipt(false)}>Close</Button>
                ]}
                width={400}
            >
                {receiptData && (
                    <div className="h-[500px] w-full bg-gray-50 overflow-hidden border border-gray-200 rounded">
                        <iframe
                            srcDoc={generateReceiptHTML(receiptData)}
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="Receipt Preview"
                        />
                    </div>
                )}
            </Modal>
        </>
    );
};

export default TransactionView;
