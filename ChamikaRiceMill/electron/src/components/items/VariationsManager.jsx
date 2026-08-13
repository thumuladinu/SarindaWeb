import React, { useState, useEffect } from 'react';
import {
    Modal, Table, Button, Form, InputNumber, Input,
    Popconfirm, App, Empty, Divider, Tag,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CloseOutlined } from '@ant-design/icons';
import axios from 'axios';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { DEFAULT_WEIGHT_VARIATIONS } from '../../utils/constants';

/**
 * Weight Variation manager for a mill item (Electron / offline-first).
 * Each variation = weight (kg) + globally-unique 3-digit GS1 product code +
 * its own buying/selling price.
 *
 * Online: mutations go through the backend routes, then reference data is
 * re-pulled so the Dexie item carries fresh VARIATIONS.
 * Offline: the Dexie item's VARIATIONS array is mutated directly (local-only).
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
            const vars = item.VARIATIONS || [];
            setVariations(vars);
            setEditingId(null);
            form.resetFields();
            if (syncService.isOnline) fetchNextCode();
            else setNextCode(computeLocalNextCode(vars));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, item]);

    const computeLocalNextCode = (list) => {
        const nums = (list || []).map(v => parseInt(v.GS1_CODE, 10) || 0);
        const max = nums.length ? Math.max(...nums) : 0;
        if (max >= 999) return '';
        return String(max + 1).padStart(3, '0');
    };

    const fetchNextCode = async () => {
        try {
            const res = await axios.post(`${syncService.apiBase}/api/MillgetNextGs1Code`);
            if (res.data.success) setNextCode(res.data.nextCode);
        } catch (e) { /* fall through — manual code still accepted */ }
    };

    const refreshFromBackend = async () => {
        if (!syncService.isOnline) return;
        try {
            await syncService.pullReferenceData();
        } catch (e) { /* ignore */ }
        try {
            const fresh = await db.items.get(item.ITEM_ID);
            if (fresh) setVariations(fresh.VARIATIONS || []);
        } catch (e) { /* ignore */ }
    };

    const handleSubmit = async (values) => {
        setSaving(true);
        try {
            if (syncService.isOnline) {
                let res;
                if (editingId) {
                    res = await axios.post(`${syncService.apiBase}/api/MillupdateVariation`, {
                        VARIATION_ID: editingId,
                        WEIGHT_KG: values.WEIGHT_KG,
                        GS1_CODE: values.GS1_CODE,
                        BUYING_PRICE: values.BUYING_PRICE || 0,
                        SELLING_PRICE: values.SELLING_PRICE || 0,
                    });
                } else {
                    res = await axios.post(`${syncService.apiBase}/api/MilladdVariation`, {
                        ITEM_ID: item.ITEM_ID,
                        WEIGHT_KG: values.WEIGHT_KG,
                        GS1_CODE: values.GS1_CODE || undefined,
                        BUYING_PRICE: values.BUYING_PRICE || 0,
                        SELLING_PRICE: values.SELLING_PRICE || 0,
                    });
                }
                if (!res.data.success) {
                    message.error(res.data.message || 'Failed to save variation');
                    return;
                }
                await refreshFromBackend();
            } else {
                // Offline: mutate the local Dexie item's VARIATIONS array
                const current = [...variations];
                if (editingId) {
                    const idx = current.findIndex(v => v.VARIATION_ID === editingId);
                    if (idx >= 0) {
                        current[idx] = {
                            ...current[idx],
                            WEIGHT_KG: values.WEIGHT_KG,
                            GS1_CODE: values.GS1_CODE,
                            BUYING_PRICE: values.BUYING_PRICE || 0,
                            SELLING_PRICE: values.SELLING_PRICE || 0,
                        };
                    }
                } else {
                    current.push({
                        VARIATION_ID: `local-${Date.now()}`,
                        ITEM_ID: item.ITEM_ID,
                        WEIGHT_KG: values.WEIGHT_KG,
                        GS1_CODE: values.GS1_CODE || computeLocalNextCode(current) || '099',
                        BUYING_PRICE: values.BUYING_PRICE || 0,
                        SELLING_PRICE: values.SELLING_PRICE || 0,
                        IS_ACTIVE: 1,
                    });
                }
                await db.items.update(item.ITEM_ID, { VARIATIONS: current });
                setVariations(current);
                setNextCode(computeLocalNextCode(current));
            }

            message.success(editingId ? 'Variation updated' : 'Variation added');
            setEditingId(null);
            form.resetFields();
            if (onSaved) onSaved();
        } catch (e) {
            console.error('Variation save error:', e);
            message.error('Failed to save variation');
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async (variationId) => {
        try {
            if (syncService.isOnline) {
                const res = await axios.post(`${syncService.apiBase}/api/MilldeactivateVariation`, { VARIATION_ID: variationId });
                if (!res.data.success) {
                    message.error(res.data.message || 'Failed to remove variation');
                    return;
                }
                await refreshFromBackend();
            } else {
                const current = variations.filter(v => v.VARIATION_ID !== variationId);
                await db.items.update(item.ITEM_ID, { VARIATIONS: current });
                setVariations(current);
                setNextCode(computeLocalNextCode(current));
            }
            message.success('Variation removed');
            if (onSaved) onSaved();
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
            render: (v) => <Tag color="blue" className="font-mono font-bold border-0">{v}</Tag>,
        },
        {
            title: 'Buying',
            dataIndex: 'BUYING_PRICE',
            key: 'BUYING_PRICE',
            align: 'right',
            render: (v) => <span className="font-mono text-slate-600">Rs. {Number(v || 0).toFixed(2)}</span>,
        },
        {
            title: 'Selling',
            dataIndex: 'SELLING_PRICE',
            key: 'SELLING_PRICE',
            align: 'right',
            render: (v) => <span className="font-mono font-bold text-emerald-700">Rs. {Number(v || 0).toFixed(2)}</span>,
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
        <Modal
            title={
                <div>
                    <span className="font-bold">Weight Variations</span>
                    <div className="text-xs font-normal text-slate-500">{item?.NAME}</div>
                </div>
            }
            open={open}
            onCancel={onClose}
            footer={null}
            width={620}
        >
            <div className="space-y-4 pt-2">
                {/* Add / Edit form */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-700">
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
                            <Form.Item name="WEIGHT_KG" label="Weight (kg)" rules={[{ required: true, message: 'Required' }]}>
                                <InputNumber className="w-full" min={0.1} step={0.5} placeholder="e.g. 5, 10, 25, 50" />
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
                        <Button type="primary" htmlType="submit" loading={saving} icon={<PlusOutlined />} className="w-full">
                            {editingId ? 'Save Changes' : 'Add Variation'}
                        </Button>
                    </Form>
                    <div className="text-[11px] text-slate-500">
                        Quick weights: {DEFAULT_WEIGHT_VARIATIONS.map((w) => `${w} kg`).join(' · ')}
                        {nextCode ? ` — next free GS1 code: ${nextCode}` : ''}
                        {!syncService.isOnline && ' (offline — saved locally only)'}
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
        </Modal>
    );
}
