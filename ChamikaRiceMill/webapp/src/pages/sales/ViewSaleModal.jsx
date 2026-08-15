import React, { useEffect, useState } from 'react';
import { Modal, Descriptions, Spin, Table, Tag, Typography, Divider, Row, Col, Button, Space } from 'antd';
import { PrinterOutlined, BarcodeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { formatSLDateTime } from '../../utils/helpers';

const { Title, Text } = Typography;

export default function ViewSaleModal({ visible, onClose, billId }) {
    const [loading, setLoading] = useState(false);
    const [bill, setBill] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (visible && billId) {
            fetchBillDetails();
        } else {
            setBill(null);
        }
    }, [visible, billId]);

    const fetchBillDetails = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/mill/sales/${billId}`, { withCredentials: true });
            if (res.data.success) {
                setBill(res.data.result);
            }
        } catch (e) {
            console.error('Failed to load bill details:', e);
        } finally {
            setLoading(false);
        }
    };

    if (!visible) return null;

    const itemColumns = [
        { title: 'Item', dataIndex: 'ITEM_NAME', key: 'ITEM_NAME' },
        { 
            title: 'Code', 
            key: 'ITEM_CODE',
            render: record => record.ITEM_CODE || record.SYSTEM_CODE || '-'
        },
        { 
            title: 'Bag Size (kg)', 
            dataIndex: 'BAG_WEIGHT', 
            key: 'BAG_WEIGHT',
            render: val => val ? `${val} kg` : '-'
        },
        { title: 'Qty (Bags)', dataIndex: 'BAG_COUNT', key: 'BAG_COUNT' },
        { 
            title: 'Unit Price (Rs)', 
            dataIndex: 'UNIT_PRICE', 
            key: 'UNIT_PRICE',
            align: 'right',
            render: val => parseFloat(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
        },
        { 
            title: 'Total Price (Rs)', 
            dataIndex: 'TOTAL_PRICE', 
            key: 'TOTAL_PRICE',
            align: 'right',
            render: val => parseFloat(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
        }
    ];

    const chequeColumns = [
        { title: 'Cheque No', dataIndex: 'CHEQUE_NUMBER', key: 'CHEQUE_NUMBER' },
        { title: 'Bank', dataIndex: 'BANK', key: 'BANK', render: val => val || '-' },
        { 
            title: 'Due Date', 
            dataIndex: 'DUE_DATE', 
            key: 'DUE_DATE',
            render: val => new Date(val).toLocaleDateString()
        },
        { 
            title: 'Amount (Rs)', 
            dataIndex: 'AMOUNT', 
            key: 'AMOUNT',
            align: 'right',
            render: val => parseFloat(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
        }
    ];

    const fmt = val => `Rs. ${parseFloat(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    const printedItems = bill?.ITEMS?.filter(i => !i.IS_HANDWRITTEN) || [];
    const handwrittenItems = bill?.ITEMS?.filter(i => i.IS_HANDWRITTEN) || [];

    return (
        <Modal
            title={<span className="font-bold text-lg text-slate-900 dark:text-white">Sale Details</span>}
            open={visible}
            onCancel={onClose}
            width="95vw"
            style={{ maxWidth: '900px', top: 20 }}
            destroyOnClose
            footer={
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 w-full">
                    <Button 
                        type="dashed" 
                        icon={<BarcodeOutlined />} 
                        onClick={() => {
                            onClose();
                            navigate(`/labels?billId=${billId}`);
                        }}
                        disabled={!bill || !printedItems.length}
                        className="w-full sm:w-auto"
                    >
                        Print Bag Labels
                    </Button>
                    <div className="flex items-center gap-2 justify-end">
                        <Button onClick={onClose} className="flex-1 sm:flex-none">Close</Button>
                        <Button 
                            type="primary" 
                            icon={<PrinterOutlined />} 
                            onClick={() => window.open(`/print-bill/${billId}`, '_blank', 'width=850,height=900,toolbar=0,menubar=0')}
                            className="flex-1 sm:flex-none"
                        >
                            Print Bill
                        </Button>
                    </div>
                </div>
            }
        >
            {loading ? (
                <div className="flex justify-center p-10"><Spin size="large" /></div>
            ) : bill ? (
                <div className="space-y-5">
                    {/* Header Info */}
                    <div className="bg-slate-50 dark:bg-zinc-900 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-white/10 mt-2">
                        <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
                            <Descriptions.Item label="Invoice No"><Text strong className="text-blue-500">{bill.INVOICE_NO}</Text></Descriptions.Item>
                            <Descriptions.Item label="Batch No">{bill.BATCH_NO || '-'}</Descriptions.Item>
                            <Descriptions.Item label="Date / Time">
                                {formatSLDateTime(bill.DATE, bill).dateStr} ({formatSLDateTime(bill.DATE, bill).timeStr})
                            </Descriptions.Item>
                            <Descriptions.Item label="Billed By">
                                {formatSLDateTime(bill.DATE, bill).addedBy || 'Cashier'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Status">
                                {bill.IS_SETTLED ? <Tag color="green">Settled</Tag> : <Tag color="orange">Pending</Tag>}
                            </Descriptions.Item>
                            <Descriptions.Item label="Customer">{bill.CUSTOMER_NAME || 'Walk-in'}</Descriptions.Item>
                            <Descriptions.Item label="Customer Phone">{bill.CUSTOMER_PHONE || '-'}</Descriptions.Item>
                        </Descriptions>
                    </div>

                    <Divider className="!my-3 text-xs uppercase tracking-wider font-semibold">Printed Order Items</Divider>
                    
                    <Table 
                        columns={itemColumns}
                        dataSource={printedItems}
                        rowKey="BILL_ITEM_ID"
                        pagination={false}
                        size="small"
                        bordered
                        scroll={{ x: 'max-content' }}
                    />

                    {handwrittenItems.length > 0 && (
                        <>
                            <Divider className="!my-3 text-xs uppercase tracking-wider font-semibold">Handwritten Extra Items</Divider>
                            <Table 
                                columns={itemColumns}
                                dataSource={handwrittenItems}
                                rowKey="BILL_ITEM_ID"
                                pagination={false}
                                size="small"
                                bordered
                                scroll={{ x: 'max-content' }}
                            />
                        </>
                    )}

                    <Divider className="!my-3 text-xs uppercase tracking-wider font-semibold">Payment & Totals</Divider>
                    
                    <Row gutter={[16, 16]}>
                        <Col xs={24} md={12}>
                            <Descriptions column={1} size="small" bordered>
                                <Descriptions.Item label="Payment Method">
                                    <Text className="uppercase font-semibold">
                                        {(!bill.IS_SETTLED && bill.CHEQUES && bill.CHEQUES.length > 0) ? 'CHEQUE' : bill.PAYMENT_METHOD}
                                    </Text>
                                </Descriptions.Item>
                                {((!bill.IS_SETTLED && (!bill.CHEQUES || bill.CHEQUES.length === 0)) || (bill.IS_SETTLED && bill.PAYMENT_METHOD === 'cash')) && (
                                    <Descriptions.Item label="Remark">{bill.REMARK || '-'}</Descriptions.Item>
                                )}
                            </Descriptions>

                            {bill.CHEQUES && bill.CHEQUES.length > 0 && (
                                <div className="mt-4">
                                    <Title level={5} className="!mb-2 dark:text-gray-200 text-xs">Cheque Details</Title>
                                    <Table 
                                        columns={chequeColumns}
                                        dataSource={bill.CHEQUES}
                                        rowKey="CHEQUE_ID"
                                        pagination={false}
                                        size="small"
                                        bordered
                                        scroll={{ x: 'max-content' }}
                                    />
                                </div>
                            )}
                        </Col>
                        <Col xs={24} md={12}>
                            <Descriptions column={1} size="small" bordered>
                                <Descriptions.Item label="Printed Sub Total">{fmt(bill.PRINTED_SUB_TOTAL)}</Descriptions.Item>
                                <Descriptions.Item label="Handwritten Sub Total">{fmt(bill.HANDWRITTEN_SUB_TOTAL)}</Descriptions.Item>
                                <Descriptions.Item label="Discount">{fmt(bill.DISCOUNT)}</Descriptions.Item>
                                <Descriptions.Item label={<Text strong>Final Amount</Text>}>
                                    <Text strong className="text-lg text-emerald-500 font-mono">{fmt(bill.FINAL_AMOUNT)}</Text>
                                </Descriptions.Item>
                            </Descriptions>
                        </Col>
                    </Row>
                </div>
            ) : (
                <div className="text-center p-10 text-red-500">Failed to load bill details.</div>
            )}
        </Modal>
    );
}
