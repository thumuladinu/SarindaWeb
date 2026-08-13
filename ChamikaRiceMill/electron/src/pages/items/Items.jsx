import React, { useState, useEffect } from 'react';
import { 
    Card, Table, Tag, Button, Modal, Form, Input, InputNumber, 
    Select, message, Space, Switch, Popconfirm 
} from 'antd';
import {
    AppstoreOutlined, PlusOutlined, EditOutlined, SyncOutlined, DeleteOutlined, TagsOutlined
} from '@ant-design/icons';
import axios from 'axios';
import db from '../../services/db';
import syncService from '../../services/syncService';
import { ITEM_CATEGORIES, ALL_HARDCODED_ITEMS } from '../../utils/constants';
import VariationsManager from '../../components/items/VariationsManager';

export default function Items() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editModal, setEditModal] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [variationsItem, setVariationsItem] = useState(null);
    const [form] = Form.useForm();

    useEffect(() => {
        loadItems();
        const unsub = syncService.subscribe((event) => {
            if (event === 'referenceDataUpdated' || event === 'syncComplete') {
                // These events fire from pullReferenceData(), which this page's own
                // loadItems() triggered. Re-pulling here would loop forever
                // (pull -> notify -> pull -> ...). Just re-read the DB instead.
                loadItems(false);
            }
        });
        return unsub;
    }, []);

    const loadItems = async (pullFromServer = true) => {
        try {
            setLoading(true);
            if (pullFromServer && syncService.isOnline) {
                await syncService.pullReferenceData();
            }
            const list = await db.items.toArray();
            setItems(list || []);
        } catch (e) {
            console.error('Error loading items:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveItem = async (values) => {
        try {
            const updatePayload = {
                NAME: values.name,
                CODE: values.code,
                BUYING_PRICE: values.buyingPrice || 0,
                SELLING_PRICE: values.sellingPrice || 0,
                CATEGORY: values.category,
            };
            // Output items manage GS1 codes via weight variations — never overwrite
            // the item's legacy GS1_CODE (seeding maps it to the 25KG variation).
            if (!editingItem || (editingItem.CATEGORY || '').toLowerCase() !== 'output') {
                updatePayload.GS1_CODE = values.gs1Code || null;
            }
            if (editingItem) {
                // Update locally
                await db.items.update(editingItem.ITEM_ID, updatePayload);
                // Sync to backend if online
                if (syncService.isOnline) {
                    try {
                        await axios.post(`${syncService.apiBase}/api/MillupdateItem`, {
                            ITEM_ID: editingItem.ITEM_ID,
                            ...updatePayload,
                        });
                    } catch (syncErr) {
                        console.warn('Could not sync item update to backend:', syncErr.message);
                    }
                }
                message.success('Item updated');
            } else {
                const newItem = {
                    ITEM_ID: Date.now(),
                    IS_ACTIVE: 1,
                    ...updatePayload,
                };
                await db.items.add(newItem);
                message.success('New item added');
            }
            setEditModal(false);
            form.resetFields();
            loadItems();
        } catch (e) {
            console.error('Save item error:', e);
            message.error('Failed to save item');
        }
    };

    const handleDeleteItem = async (r) => {
        try {
            await db.items.update(r.ITEM_ID, { IS_ACTIVE: 0 });
            if (syncService.isOnline) {
                try {
                    await axios.post(`${syncService.apiBase}/api/MilldeactivateItem`, { ITEM_ID: r.ITEM_ID });
                } catch (syncErr) {
                    console.warn('Could not sync delete to backend:', syncErr.message);
                }
            }
            message.success(`${r.NAME} deactivated`);
            loadItems();
        } catch (e) {
            message.error('Failed to deactivate item');
        }
    };

    const columns = [
        {
            title: 'Code',
            dataIndex: 'CODE',
            key: 'CODE',
            render: val => <Tag color="blue" className="font-mono font-bold">{val}</Tag>
        },
        {
            title: 'Variations (GS1)',
            dataIndex: 'VARIATIONS',
            key: 'VARIATIONS',
            render: (variations, record) => {
                const isOutput = (record.CATEGORY || '').toLowerCase() === 'output';
                if (!isOutput || !Array.isArray(variations) || variations.length === 0) {
                    return <span className="text-slate-400 text-xs">-</span>;
                }
                return (
                    <div className="flex flex-wrap gap-1">
                        {variations.map(v => (
                            <span key={v.VARIATION_ID} className="font-mono text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                {Number(v.WEIGHT_KG)}kg·{v.GS1_CODE}
                            </span>
                        ))}
                    </div>
                );
            }
        },
        {
            title: 'Item Name',
            dataIndex: 'NAME',
            key: 'NAME',
            render: val => <strong className="text-slate-900">{val}</strong>
        },
        {
            title: 'Buying Price',
            dataIndex: 'BUYING_PRICE',
            key: 'BUYING_PRICE',
            align: 'right',
            render: val => <span className="font-mono text-slate-600">Rs. {Number(val || 0).toFixed(2)}</span>
        },
        {
            title: 'Selling Price',
            dataIndex: 'SELLING_PRICE',
            key: 'SELLING_PRICE',
            align: 'right',
            render: val => <span className="font-mono font-bold text-emerald-700">Rs. {Number(val || 0).toFixed(2)}</span>
        },
        {
            title: 'Category',
            dataIndex: 'CATEGORY',
            key: 'CATEGORY',
            render: val => <Tag color={val === 'PADDY' ? 'gold' : val === 'BYPRODUCT' ? 'purple' : 'green'}>{val}</Tag>
        },
        {
            title: 'Buying Price (Rs/KG)',
            dataIndex: 'BUYING_PRICE',
            key: 'BUYING_PRICE',
            align: 'right',
            render: val => <span className="font-mono text-slate-600">Rs. {Number(val || 0).toFixed(2)}</span>
        },
        {
            title: 'Selling Price (Rs/KG)',
            dataIndex: 'SELLING_PRICE',
            key: 'SELLING_PRICE',
            align: 'right',
            render: val => <span className="font-mono font-bold text-blue-900">Rs. {Number(val || 0).toFixed(2)}</span>
        },
        {
            title: 'Status',
            dataIndex: 'IS_ACTIVE',
            key: 'IS_ACTIVE',
            align: 'center',
            render: (isActive, r) => (
                <Switch
                    checkedChildren="ON"
                    unCheckedChildren="OFF"
                    checked={Number(isActive) === 1}
                    onChange={async (checked) => {
                        const updated = checked ? 1 : 0;
                        try {
                            await db.items.update(r.ITEM_ID, { IS_ACTIVE: updated });
                            message.success(`${r.NAME} is now ${checked ? 'ON' : 'OFF'}`);
                            loadItems();
                        } catch (e) {
                            message.error('Failed to update status');
                        }
                    }}
                />
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            render: (_, r) => (
                <div className="flex gap-1 justify-center">
                    <Button 
                        size="small" 
                        icon={<EditOutlined />} 
                        onClick={() => {
                            setEditingItem(r);
                            form.setFieldsValue({
                                name: r.NAME,
                                code: r.CODE,
                                category: r.CATEGORY,
                                buyingPrice: r.BUYING_PRICE,
                                sellingPrice: r.SELLING_PRICE,
                                gs1Code: r.GS1_CODE || ''
                            });
                            setEditModal(true);
                        }}
                    >
                        Edit
                    </Button>
                    {(r.CATEGORY || '').toLowerCase() === 'output' && (
                        <Button size="small" icon={<TagsOutlined />} onClick={() => setVariationsItem(r)}>
                            Variations
                        </Button>
                    )}
                    {!r.SYSTEM_CODE && (
                        <Popconfirm
                            title="Deactivate this item?"
                            onConfirm={() => handleDeleteItem(r)}
                            okText="Yes"
                            cancelText="No"
                        >
                            <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                    )}
                </div>
            )
        }
    ];

    return (
        <div className="space-y-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xl shadow-md">
                        <AppstoreOutlined />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 m-0">Mill Item Catalog</h2>
                        <p className="text-xs text-slate-500 m-0">View and update raw paddy, milled rice, and by-product rates</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button 
                        type="primary" 
                        icon={<PlusOutlined />} 
                        onClick={() => {
                            setEditingItem(null);
                            form.resetFields();
                            setEditModal(true);
                        }}
                        className="!bg-blue-600"
                    >
                        Add Item
                    </Button>
                    <Button icon={<SyncOutlined />} onClick={loadItems}>Refresh</Button>
                </div>
            </div>

            <Card className="officer-card">
                <Table
                    dataSource={items}
                    columns={columns}
                    rowKey="ITEM_ID"
                    loading={loading}
                    pagination={{ pageSize: 15 }}
                    size="small"
                />
            </Card>

            <Modal
                title={editingItem ? 'Edit Mill Item' : 'Add Mill Item'}
                open={editModal}
                onCancel={() => setEditModal(false)}
                footer={null}
            >
                <Form form={form} layout="vertical" onFinish={handleSaveItem}>
                    <Form.Item label="Item Code" name="code" rules={[{ required: true, message: 'Required' }]}>
                        <Input placeholder="e.g. SAMBA-1" disabled={!!editingItem} />
                    </Form.Item>
                    <Form.Item label="Item Name" name="name" rules={[{ required: true, message: 'Required' }]}>
                        <Input disabled={!!editingItem} placeholder="e.g. Samba Rice" />
                    </Form.Item>
                    <Form.Item label="Category" name="category" initialValue="RICE">
                        <Select disabled={!!editingItem}>
                            <Select.Option value="RICE">Rice (Milled)</Select.Option>
                            <Select.Option value="PADDY">Paddy (Raw Grain)</Select.Option>
                            <Select.Option value="BYPRODUCT">By-Product (Bran/Broken)</Select.Option>
                        </Select>
                    </Form.Item>
                    <Form.Item label="Buying Price / KG (Rs)" name="buyingPrice">
                        <InputNumber min={0} step={0.5} className="w-full" />
                    </Form.Item>
                    <Form.Item label="Selling Price / KG (Rs)" name="sellingPrice">
                        <InputNumber min={0} step={0.5} className="w-full" />
                    </Form.Item>
                    {(!editingItem || (editingItem.CATEGORY || '').toLowerCase() !== 'output') && (
                        <Form.Item
                            label="GS1 Product Code"
                            name="gs1Code"
                            tooltip="3-digit product code for sticker label printing (e.g. 001)"
                            rules={[
                                { pattern: /^\d{0,3}$/, message: 'GS1 code must be up to 3 digits only' },
                            ]}
                        >
                            <Input
                                placeholder="e.g. 001"
                                maxLength={3}
                                className="font-mono"
                                onKeyPress={(e) => {
                                    if (!/[0-9]/.test(e.key)) e.preventDefault();
                                }}
                                onBlur={(e) => {
                                    const raw = e.target.value.replace(/\D/g, '').slice(0, 3);
                                    if (raw) {
                                        const padded = raw.padStart(3, '0');
                                        form.setFieldValue('gs1Code', padded);
                                    }
                                }}
                            />
                        </Form.Item>
                    )}
                    <Button type="primary" htmlType="submit" className="w-full !bg-blue-600">
                        Save Item
                    </Button>
                </Form>
            </Modal>

            {/* Weight Variations Modal */}
            <VariationsManager
                item={variationsItem}
                open={!!variationsItem}
                onClose={() => setVariationsItem(null)}
                onSaved={loadItems}
            />
        </div>
    );
}
