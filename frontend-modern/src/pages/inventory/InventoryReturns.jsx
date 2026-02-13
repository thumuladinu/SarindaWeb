import React, { useState, useEffect } from 'react';
import { Table, Button, Card, Form, InputNumber, Input, Checkbox, Select, message, Tag, Space, Divider } from 'antd';
import { ReloadOutlined, ArrowLeftOutlined, SaveOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const InventoryReturns = ({ currentUser, storeNo = 1, itemId = null, embedded = false, onCancel, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [returnableOps, setReturnableOps] = useState([]);
    const [selectedOp, setSelectedOp] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [form] = Form.useForm();
    const [conversionEnabled, setConversionEnabled] = useState(false);
    const [products, setProducts] = useState([]);
    const [searchText, setSearchText] = useState('');

    // Fetch products for conversion
    useEffect(() => {
        fetchProducts();
        fetchReturnableOps();
    }, [itemId]); // Refetch if itemId changes

    const fetchProducts = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/products`);
            const result = await response.json();
            if (result.success) {
                setProducts(result.products.filter(p => p.IS_ACTIVE !== 0));
            }
        } catch (e) {
            console.error('Failed to fetch products', e);
        }
    };

    const fetchReturnableOps = async (searchVal = searchText) => {
        setLoading(true);
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/stock-ops/get-returnable`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storeNo, limit: 50, itemId, search: searchVal })
            });
            const result = await response.json();
            if (result.success) {
                setReturnableOps(result.operations);
            }
        } catch (e) {
            message.error('Failed to fetch returnable operations');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectOp = (op) => {
        setSelectedOp(op);
        setConversionEnabled(false);
        form.resetFields();
        // Set default return quantity? No, let user enter it.
    };

    const handleBack = () => {
        setSelectedOp(null);
        form.resetFields();
        fetchReturnableOps(); // Refresh list to get updated quantities
    };

    const onFinish = async (values) => {
        const { quantity, comments, conversions } = values;

        // Validation
        if (!quantity || quantity <= 0) {
            message.error('Please enter a valid return quantity');
            return;
        }
        if (quantity > selectedOp.RETURNABLE_QUANTITY) {
            message.error(`Cannot return more than ${selectedOp.RETURNABLE_QUANTITY}kg`);
            return;
        }

        if (conversionEnabled) {
            const totalConv = conversions?.reduce((sum, c) => sum + (c.qty || 0), 0) || 0;
            if (Math.abs(totalConv - quantity) > 0.01) {
                message.error(`Total converted quantity (${totalConv}kg) must match return quantity (${quantity}kg)`);
                return;
            }
        }

        setSubmitting(true);
        try {
            const payload = {
                REFERENCE_OP_ID: selectedOp.OP_ID,
                STORE_NO: storeNo,
                RETURN_QUANTITY: quantity,
                ITEM_ID: selectedOp.ITEM_ID,
                ITEM_CODE: selectedOp.ITEM_CODE,
                ITEM_NAME: selectedOp.ITEM_NAME,
                conversions: conversionEnabled && conversions ? conversions.map(c => {
                    const prod = products.find(p => p.id === c.itemId);
                    return {
                        DEST_ITEM_ID: c.itemId,
                        DEST_ITEM_CODE: prod?.code,
                        DEST_ITEM_NAME: prod?.name,
                        DEST_QUANTITY: c.qty
                    };
                }) : [],
                COMMENTS: comments,
                CREATED_BY: currentUser?.id || 1, // Ensure ID is available
                CREATED_BY_NAME: currentUser?.name || 'Admin',
                TERMINAL_CODE: 'WEB'
            };

            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/stock-ops/create-return`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.success) {
                message.success('Stock return processed successfully');
                if (embedded && onSuccess) {
                    onSuccess();
                } else {
                    handleBack();
                }
            } else {
                message.error('Error: ' + result.message);
            }
        } catch (e) {
            console.error(e);
            message.error('Failed to submit return');
        } finally {
            setSubmitting(false);
        }
    };

    // Columns for the selection table
    const columns = [
        { title: 'Op Code', dataIndex: 'OP_CODE', key: 'code', render: t => <span className="font-mono font-bold">{t}</span> },
        { title: 'Date', dataIndex: 'CREATED_DATE', key: 'date', render: d => dayjs(d).format('DD MMM, HH:mm') },
        { title: 'Type', dataIndex: 'OP_TYPE_NAME', key: 'type', render: t => <Tag color="blue">{t}</Tag> },
        { title: 'Item', dataIndex: 'ITEM_NAME', key: 'item' },
        { title: 'Bill', dataIndex: 'BILL_CODE', key: 'bill', render: t => t || '-' },
        { title: 'Customer', dataIndex: 'CUSTOMER_NAME', key: 'cust', render: t => t || '-' },
        { title: 'Sold Qty', dataIndex: 'SOLD_QUANTITY', key: 'sold', align: 'right', render: n => <span>{Number(n).toFixed(2)} kg</span> },
        { title: 'Available', dataIndex: 'RETURNABLE_QUANTITY', key: 'avail', align: 'right', render: n => <span className="font-bold text-emerald-600">{Number(n).toFixed(2)} kg</span> },
        {
            title: 'Action',
            key: 'action',
            render: (_, record) => (
                <Button type="primary" size="small" onClick={() => handleSelectOp(record)}>Return</Button>
            )
        }
    ];

    if (selectedOp) {
        return (
            <div className={embedded ? "" : "glass-card p-6"}>
                <div className="flex items-center gap-4 mb-6">
                    <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>Back</Button>
                    <h2 className="text-xl font-bold m-0">Process Return {embedded ? '' : `for ${selectedOp.ITEM_NAME}`}</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <Card size="small" title="Operation Details">
                        <p><strong>Code:</strong> {selectedOp.OP_CODE}</p>
                        <p><strong>Date:</strong> {dayjs(selectedOp.CREATED_DATE).format('DD MMM YYYY, HH:mm')}</p>
                        <p><strong>Original Sold:</strong> {selectedOp.SOLD_QUANTITY} kg</p>
                    </Card>
                    <Card size="small" title="Return Status">
                        <p><strong>Already Returned:</strong> {(selectedOp.SOLD_QUANTITY - selectedOp.RETURNABLE_QUANTITY).toFixed(2)} kg</p>
                        <p className="text-lg"><strong>Returnable Max:</strong> <span className="text-emerald-600 font-bold">{selectedOp.RETURNABLE_QUANTITY} kg</span></p>
                    </Card>
                </div>

                <Form form={form} layout="vertical" onFinish={onFinish} className="max-w-2xl">
                    <Form.Item label="Return Quantity (kg)" name="quantity" rules={[{ required: true, message: 'Please enter quantity' }]}>
                        <InputNumber
                            style={{ width: '100%' }}
                            size="large"
                            max={selectedOp.RETURNABLE_QUANTITY}
                            min={0.01}
                            step={0.01}
                            placeholder="Enter quantity to return"
                        />
                    </Form.Item>

                    <Form.Item>
                        <Checkbox checked={conversionEnabled} onChange={e => setConversionEnabled(e.target.checked)}>
                            Return as different items (Item Conversion)
                        </Checkbox>
                        <div className="text-gray-500 text-xs mt-1">
                            If checked, the returned stock will be added as different items instead of {selectedOp.ITEM_NAME}.
                        </div>
                    </Form.Item>

                    {conversionEnabled && (
                        <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-lg mb-6 border border-gray-200 dark:border-gray-700">
                            <h4 className="mb-4 font-bold">Conversion Targets</h4>
                            <Form.List name="conversions">
                                {(fields, { add, remove }) => (
                                    <>
                                        {fields.map(({ key, name, ...restField }) => (
                                            <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'itemId']}
                                                    rules={[{ required: true, message: 'Missing item' }]}
                                                    style={{ width: 250 }}
                                                >
                                                    <Select placeholder="Select Item" showSearch optionFilterProp="label"
                                                        options={products.map(p => ({ label: `${p.name} (${p.code})`, value: p.id }))}
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'qty']}
                                                    rules={[{ required: true, message: 'Missing qty' }]}
                                                >
                                                    <InputNumber placeholder="Qty" min={0.01} step={0.01} addonAfter="kg" />
                                                </Form.Item>
                                                <DeleteOutlined onClick={() => remove(name)} className="text-red-500 cursor-pointer" />
                                            </Space>
                                        ))}
                                        <Form.Item>
                                            <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                                                Add Item
                                            </Button>
                                        </Form.Item>
                                    </>
                                )}
                            </Form.List>
                        </div>
                    )}

                    <Form.Item label="Comments / Reason" name="comments">
                        <Input.TextArea rows={2} placeholder="Reason for return..." />
                    </Form.Item>

                    <Divider />

                    <Form.Item>
                        <Button type="primary" htmlType="submit" size="large" icon={<SaveOutlined />} loading={submitting} block>
                            Confirm Return
                        </Button>
                    </Form.Item>
                </Form>
            </div>
        );
    }

    return (
        <div className={embedded ? "" : "glass-card p-1"}>
            <div className="p-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-100 dark:border-gray-800">
                <h3 className="font-bold text-lg m-0">Returnable Operations {itemId && '(Filtered)'}</h3>
                <Space>
                    <Input.Search
                        placeholder="Search Op Code / Bill"
                        allowClear
                        onSearch={val => { setSearchText(val); fetchReturnableOps(val); }}
                        style={{ width: 200 }}
                    />
                    <Button icon={<ReloadOutlined />} onClick={() => fetchReturnableOps(searchText)} loading={loading}>Refresh</Button>
                </Space>
            </div>
            <Table
                columns={columns}
                dataSource={returnableOps}
                rowKey="OP_ID"
                loading={loading}
                pagination={{ pageSize: embedded ? 5 : 10 }}
                size="middle"
                scroll={{ x: 800 }}
            />
        </div>
    );
};

export default InventoryReturns;
