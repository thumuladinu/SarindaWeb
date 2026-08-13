import React, { useState, useEffect } from 'react';
import {
    Drawer, Table, Button, Form, InputNumber, Input,
    Popconfirm, App, Empty, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CloseOutlined } from '@ant-design/icons';
import axios from 'axios';
import { DEFAULT_WEIGHT_VARIATIONS } from '../../utils/constants';

/**
 * Weight Variation manager for a mill item.
 * Each variation = weight (kg) + globally-unique 3-digit GS1 product code +
 * its own buying/selling price. Renders inside a Drawer, driven by the item's
 * VARIATIONS array (attached by MillgetAllItems).
 */
export default function VariationsManager({ item, open, onClose, onSaved }) {
    const { message } = App.useApp();
    const [form] = Form.useForm();
    const [variations, setVariations] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [nextCode, setNextCode] = useState('');

    useEffect(() => {
        if (open && item) {
            setVariations(item.VARIATIONS || []);
            setEditingId(null);
            form.resetFields();
            fetchNextCode();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, item]);

    const fetchNextCode = async () => {
        try {
            const res = await axios.post('/api/MillgetNextGs1Code');
            if (res.data.success) setNextCode(res.data.nextCode);
        } catch (e) { /* offline / unavailable — form still accepts manual code */ }
    };

    const refreshVariations = async () => {
        try {
            const res = await axios.post('/api/MillgetAllItems');
            if (res.data.success && Array.isArray(res.data.result)) {
                const fresh = res.data.result.find((i) => i.ITEM_ID === item.ITEM_ID);
                if (fresh) setVariations(fresh.VARIATIONS || []);
            }
        } catch (e) { /* ignore */ }
    };

    const handleSubmit = async (values) => {
        setSaving(true);
        try {
            let res;
            if (editingId) {
                res = await axios.post('/api/MillupdateVariation', {
                    VARIATION_ID: editingId,
                    WEIGHT_KG: values.WEIGHT_KG,
                    GS1_CODE: values.GS1_CODE,
                    BUYING_PRICE: values.BUYING_PRICE || 0,
                    SELLING_PRICE: values.SELLING_PRICE || 0,
                });
            } else {
                res = await axios.post('/api/MilladdVariation', {
                    ITEM_ID: item.ITEM_ID,
                    WEIGHT_KG: values.WEIGHT_KG,
                    GS1_CODE: values.GS1_CODE || undefined, // empty → server assigns next free
                    BUYING_PRICE: values.BUYING_PRICE || 0,
                    SELLING_PRICE: values.SELLING_PRICE || 0,
                });
            }

            if (res.data.success) {
                message.success(editingId ? 'Variation updated' : 'Variation added');
                setEditingId(null);
                form.resetFields();
                fetchNextCode();
                await refreshVariations();
                if (onSaved) onSaved();
            } else {
                message.error(res.data.message || 'Failed to save variation');
            }
        } catch (e) {
            message.error('Failed to save variation');
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async (variationId) => {
        try {
            const res = await axios.post('/api/MilldeactivateVariation', { VARIATION_ID: variationId });
            if (res.data.success) {
                message.success('Variation removed');
                await refreshVariations();
                if (onSaved) onSaved();
            } else {
                message.error(res.data.message || 'Failed to remove variation');
            }
        } catch (e) {
            message.error('Failed to remove variation');
        }
    };

    const startEdit = (r) => {
        setEditingId(r.VARIATION_ID);
        form.setFieldsValue({
            WEIGHT_KG: Number(r.WEIGHT_KG),
            GS1_CODE: r.GS1_CODE,
            BUYING_PRICE: Number(r.BUYING_PRICE || 0),
            SELLING_PRICE: Number(r.SELLING_PRICE || 0),
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        form.resetFields();
    };

    const columns = [
        {
            title: 'Weight (kg)',
            dataIndex: 'WEIGHT_KG',
            key: 'WEIGHT_KG',
            width: 110,
            render: (v) => <span className="font-semibold">{Number(v)} kg</span>,
        },
        {
            title: 'GS1 Product Code',
            dataIndex: 'GS1_CODE',
            key: 'GS1_CODE',
            width: 140,
            render: (v) => <span className="font-mono font-bold text-blue-600">{v}</span>,
        },
        {
            title: 'Buying Price',
            dataIndex: 'BUYING_PRICE',
            key: 'BUYING_PRICE',
            align: 'right',
            render: (v) => <span className="font-mono text-gray-600 dark:text-gray-300">Rs. {Number(v || 0).toFixed(2)}</span>,
        },
        {
            title: 'Selling Price',
            dataIndex: 'SELLING_PRICE',
            key: 'SELLING_PRICE',
            align: 'right',
            render: (v) => <span className="font-mono font-semibold text-emerald-600">Rs. {Number(v || 0).toFixed(2)}</span>,
        },
        {
            title: '',
            key: 'actions',
            width: 90,
            render: (_, r) => (
                <div className="flex gap-1 justify-end">
                    <Button size="small" icon={<EditOutlined />} onClick={() => startEdit(r)} />
                    <Popconfirm title="Remove this variation?" onConfirm={() => handleDeactivate(r.VARIATION_ID)}>
                        <Button size="small" icon={<DeleteOutlined />} danger />
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <Drawer
            title={
                <div>
                    <span className="font-bold">Weight Variations</span>
                    <div className="text-xs font-normal text-gray-500">
                        {item?.NAME} — each weight gets its own unique GS1 code
                    </div>
                </div>
            }
            open={open}
            onClose={onClose}
            width={560}
        >
            <div className="space-y-5">
                {/* Add / Edit form */}
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-700 dark:text-slate-200">
                            {editingId ? 'Edit Variation' : 'Add Variation'}
                        </span>
                        {editingId && (
                            <Button size="small" type="text" icon={<CloseOutlined />} onClick={cancelEdit}>
                                Cancel
                            </Button>
                        )}
                    </div>
                    <Form form={form} layout="vertical" onFinish={handleSubmit}>
                        <div className="grid grid-cols-2 gap-3">
                            <Form.Item
                                name="WEIGHT_KG"
                                label="Weight (kg)"
                                rules={[{ required: true, message: 'Required' }]}
                            >
                                <InputNumber
                                    className="w-full"
                                    min={0.1}
                                    step={0.5}
                                    placeholder="e.g. 5, 10, 25, 50"
                                />
                            </Form.Item>
                            <Form.Item
                                name="GS1_CODE"
                                label="GS1 Product Code (3 digits)"
                                tooltip="Leave empty to auto-assign the next free code"
                                rules={[{ pattern: /^\d{0,3}$/, message: 'Up to 3 digits only' }]}
                            >
                                <Input
                                    className="font-mono"
                                    placeholder={nextCode || 'auto'}
                                    maxLength={3}
                                    onKeyPress={(e) => { if (!/[0-9]/.test(e.key)) e.preventDefault(); }}
                                />
                            </Form.Item>
                            <Form.Item name="BUYING_PRICE" label="Buying Price (Rs)">
                                <InputNumber className="w-full" min={0} step={0.5} prefix="Rs." />
                            </Form.Item>
                            <Form.Item name="SELLING_PRICE" label="Selling Price (Rs)">
                                <InputNumber className="w-full" min={0} step={0.5} prefix="Rs." />
                            </Form.Item>
                        </div>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={saving}
                            icon={<PlusOutlined />}
                            className="w-full"
                        >
                            {editingId ? 'Save Changes' : 'Add Variation'}
                        </Button>
                    </Form>
                    <div className="text-[11px] text-gray-500">
                        Quick weights: {DEFAULT_WEIGHT_VARIATIONS.map((w) => `${w} kg`).join(' · ')}
                        {nextCode ? ` — next free GS1 code: ${nextCode}` : ''}
                    </div>
                </div>

                <Divider style={{ margin: '0 0 12px' }} />

                {variations.length === 0 ? (
                    <Empty description="No variations yet — add one above" />
                ) : (
                    <Table
                        dataSource={variations}
                        columns={columns}
                        rowKey="VARIATION_ID"
                        size="small"
                        pagination={false}
                    />
                )}
            </div>
        </Drawer>
    );
}
