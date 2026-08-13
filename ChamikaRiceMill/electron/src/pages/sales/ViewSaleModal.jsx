import React from 'react';
import { Modal, Descriptions, Table, Tag, Typography, Divider, Row, Col, Button } from 'antd';
import { PrinterOutlined, BarcodeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function ViewSaleModal({ visible, onClose, bill, onPrint }) {
    const navigate = useNavigate();
    
    if (!visible || !bill) return null;

    const items = bill.ITEMS || bill.ITEMS_JSON || [];
    const printedItems = items.filter(i => !i.IS_HANDWRITTEN);
    const handwrittenItems = items.filter(i => i.IS_HANDWRITTEN);
    const cheques = bill.CHEQUES || bill.CHEQUES_JSON || [];

    const itemColumns = [
        { title: 'Item', dataIndex: 'ITEM_NAME', key: 'ITEM_NAME', render: (val, r) => <strong>{val || r.NAME || 'Rice'}</strong> },
        { title: 'Code', key: 'CODE', render: (_, r) => <Tag color="blue">{r.CODE || r.SYSTEM_CODE || '-'}</Tag> },
        { title: 'Bag Size', dataIndex: 'BAG_WEIGHT', key: 'BAG_WEIGHT', render: val => val ? `${val} kg` : '-' },
        { title: 'Qty (Bags)', dataIndex: 'BAG_COUNT', key: 'BAG_COUNT', align: 'center' },
        { 
            title: 'Unit Price (Rs)', 
            dataIndex: 'UNIT_PRICE', 
            key: 'UNIT_PRICE', 
            align: 'right',
            render: val => Number(val || 0).toFixed(2)
        },
        { 
            title: 'Total (Rs)', 
            dataIndex: 'TOTAL_PRICE', 
            key: 'TOTAL_PRICE', 
            align: 'right',
            render: val => <strong className="font-mono">Rs. {Number(val || 0).toFixed(2)}</strong>
        }
    ];

    return (
        <Modal
            title={<span className="font-bold text-slate-900">Sale Details: #{bill.INVOICE_NO}</span>}
            open={visible}
            onCancel={onClose}
            width={850}
            footer={
                <div className="flex justify-between w-full">
                    <Button 
                        type="dashed" 
                        icon={<BarcodeOutlined />} 
                        onClick={() => {
                            onClose();
                            navigate(`/labels?billId=${bill.LOCAL_ID}`);
                        }}
                        disabled={!printedItems.length}
                    >
                        Print Bag Labels
                    </Button>
                    <div className="flex gap-2">
                        <Button onClick={onClose}>Close</Button>
                        <Button type="primary" icon={<PrinterOutlined />} onClick={() => onPrint && onPrint(bill)} className="!bg-blue-600">
                            Print Bill
                        </Button>
                    </div>
                </div>
            }
            destroyOnClose
        >
            <div className="space-y-4">
                <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                    <Descriptions.Item label="Invoice No"><strong className="font-mono text-blue-900">{bill.INVOICE_NO}</strong></Descriptions.Item>
                    <Descriptions.Item label="Batch No">{bill.BATCH_NO || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Date">{dayjs(bill.DATE).format('YYYY-MM-DD')}</Descriptions.Item>
                    <Descriptions.Item label="Customer">{bill.CUSTOMER_NAME || 'Walk-in Customer'}</Descriptions.Item>
                    <Descriptions.Item label="Phone">{bill.CUSTOMER_PHONE || '-'}</Descriptions.Item>
                    <Descriptions.Item label="Status">
                        {bill.IS_SETTLED === 1 ? (
                            <Tag color="success">SETTLED</Tag>
                        ) : bill.DISPATCH_ID ? (
                            <Tag color="processing">IN DISPATCH</Tag>
                        ) : (
                            <Tag color="warning">PENDING</Tag>
                        )}
                    </Descriptions.Item>
                </Descriptions>

                {/* Printed Items */}
                <div>
                    <div className="text-xs font-bold text-slate-700 uppercase mb-1">Printed Order Items</div>
                    <Table
                        dataSource={printedItems}
                        columns={itemColumns}
                        rowKey={(r, idx) => `pr-${idx}`}
                        pagination={false}
                        size="small"
                    />
                </div>

                {/* Handwritten Extras */}
                {handwrittenItems.length > 0 && (
                    <div>
                        <div className="text-xs font-bold text-emerald-800 uppercase mb-1">Handwritten Extra Items (Delivered)</div>
                        <Table
                            dataSource={handwrittenItems}
                            columns={itemColumns}
                            rowKey={(r, idx) => `hw-${idx}`}
                            pagination={false}
                            size="small"
                        />
                    </div>
                )}

                {/* Financial Summary */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
                    <div>
                        <div>Printed Sub-Total: <strong className="font-mono">Rs. {Number(bill.PRINTED_SUB_TOTAL || bill.TOTAL_AMOUNT || 0).toFixed(2)}</strong></div>
                        <div>Handwritten Sub-Total: <strong className="font-mono">Rs. {Number(bill.HANDWRITTEN_SUB_TOTAL || 0).toFixed(2)}</strong></div>
                        <div>Discount: <strong className="font-mono text-red-600">-Rs. {Number(bill.DISCOUNT || 0).toFixed(2)}</strong></div>
                    </div>
                    <div className="text-right">
                        <span className="text-slate-500 block">Final Net Total</span>
                        <span className="text-xl font-black font-mono text-blue-950">
                            Rs. {Number(bill.FINAL_AMOUNT || bill.NET_AMOUNT || bill.TOTAL_AMOUNT || 0).toFixed(2)}
                        </span>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
