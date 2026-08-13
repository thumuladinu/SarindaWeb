import React, { useState, useEffect } from 'react';
import { Table, Button, Input, App, Form, Popconfirm, Drawer, Spin, Tag, Select, Switch } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, PlusOutlined, TagsOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';
import { canModify, toSLDateDisplay } from '../../utils/helpers';
import { ITEM_CATEGORIES, ALL_HARDCODED_ITEMS } from '../../utils/constants';
import VariationsManager from '../../components/items/VariationsManager';

const CATEGORIES = [
    { value: 'raw_input', label: 'Raw Material', color: 'gold' },
    { value: 'output', label: 'Finished Output', color: 'green' },
    { value: 'by_product', label: 'By-Product', color: 'purple' },
    { value: 'seasonal', label: 'Seasonal', color: 'orange' },
];

const categoryColorMap = {
    raw_input: 'gold',
    output: 'green',
    by_product: 'purple',
    seasonal: 'orange',
};

export default function Items() {
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    const currentUser = JSON.parse(Cookies.get('millUser') || '{}');
    const userCanModify = canModify(currentUser.ROLE);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [variationsItem, setVariationsItem] = useState(null);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/api/MillgetAllItems');
            if (response.data.success) {
                const dynamicItems = response.data.result || [];
                setData(dynamicItems);
                applyFilters(dynamicItems, searchText, categoryFilter);
            }
        } catch (error) {
            console.error("Error fetching items:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchItems(); }, []);

    const applyFilters = (items, search, category) => {
        let filtered = items;
        if (search) {
            const s = search.toLowerCase();
            filtered = filtered.filter(item =>
                (item.CODE && item.CODE.toLowerCase().includes(s)) ||
                (item.NAME && item.NAME.toLowerCase().includes(s))
            );
        }
        if (category && category !== 'all') {
            filtered = filtered.filter(item => item.CATEGORY === category);
        }
        setFilteredData(filtered);
    };

    const handleSearch = (e) => {
        const value = e.target.value;
        setSearchText(value);
        applyFilters(data, value, categoryFilter);
    };

    const handleCategoryFilter = (value) => {
        setCategoryFilter(value);
        applyFilters(data, searchText, value);
    };

    const handleAddNew = () => {
        setEditingItem(null);
        setSelectedCategory('seasonal');
        form.resetFields();
        form.setFieldsValue({ 
            IS_ACTIVE: 1,
            CATEGORY: 'seasonal'
        });
        setDrawerOpen(true);
    };

    const handleEdit = (record) => {
        setEditingItem(record);
        setSelectedCategory(record.CATEGORY);
        form.setFieldsValue({
            CODE: record.CODE,
            NAME: record.NAME,
            CATEGORY: record.CATEGORY,
            UNIT: record.UNIT || 'kg',
            BUYING_PRICE: record.BUYING_PRICE,
            SELLING_PRICE: record.SELLING_PRICE,
            GS1_CODE: record.GS1_CODE || '',
            DESCRIPTION: record.DESCRIPTION,
        });
        setDrawerOpen(true);
    };

    const handleDelete = async (record) => {
        try {
            const res = await axios.post('/api/MilldeactivateItem', { ITEM_ID: record.ITEM_ID });
            if (res.data.success) {
                message.success('Item deactivated');
                fetchItems();
            } else {
                message.error('Failed to deactivate');
            }
        } catch {
            message.error('Error deactivating item');
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            setSubmitting(true);

            if (editingItem) {
                // Check duplicate code
                const dupRes = await axios.post('/api/MillcheckForDuplicateNameUpdate', {
                    CODE: values.CODE,
                    ITEM_ID: editingItem.ITEM_ID,
                });
                if (dupRes.data.duplicate) {
                    message.error('Item code already exists');
                    return;
                }

                const res = await axios.post('/api/MillupdateItem', {
                    ITEM_ID: editingItem.ITEM_ID,
                    ...values,
                });
                if (res.data.success) {
                    message.success('Item updated');
                    setDrawerOpen(false);
                    fetchItems();
                }
            } else {
                // Check duplicate code
                const dupRes = await axios.post('/api/MillcheckForDuplicateName', { CODE: values.CODE });
                if (dupRes.data.duplicate) {
                    message.error('Item code already exists');
                    return;
                }

                const res = await axios.post('/api/MilladdItem', values);
                if (res.data.success) {
                    message.success('Item added');
                    setDrawerOpen(false);
                    fetchItems();
                }
            }
        } catch (error) {
            console.error('Submit error:', error);
            message.error('Failed to save item');
        } finally {
            setSubmitting(false);
        }
    };

    const columns = [
        {
            title: 'Code',
            dataIndex: 'CODE',
            key: 'CODE',
            width: 100,
            render: (text) => <span className="font-mono font-semibold text-blue-500">{text}</span>,
        },
        {
            title: 'Variations (GS1)',
            dataIndex: 'VARIATIONS',
            key: 'VARIATIONS',
            width: 200,
            render: (variations, record) => {
                const isOutput = (record.CATEGORY || '').toLowerCase() === 'output';
                if (!isOutput || !Array.isArray(variations) || variations.length === 0) {
                    return <span className="text-gray-400">-</span>;
                }
                return (
                    <div className="flex flex-wrap gap-1">
                        {variations.map((v) => (
                            <Tag key={v.VARIATION_ID} color="blue" className="font-mono text-[10px] border-0">
                                {Number(v.WEIGHT_KG)}kg·{v.GS1_CODE}
                            </Tag>
                        ))}
                    </div>
                );
            },
        },
        {
            title: 'Name',
            dataIndex: 'NAME',
            key: 'NAME',
            ellipsis: true,
        },
        {
            title: 'Buying Price',
            dataIndex: 'BUYING_PRICE',
            key: 'BUYING_PRICE',
            width: 120,
            align: 'right',
            render: (val) => <span className="font-mono text-gray-700 dark:text-gray-300">Rs. {Number(val || 0).toFixed(2)}</span>,
        },
        {
            title: 'Selling Price',
            dataIndex: 'SELLING_PRICE',
            key: 'SELLING_PRICE',
            width: 120,
            align: 'right',
            render: (val) => <span className="font-mono font-semibold text-emerald-600">Rs. {Number(val || 0).toFixed(2)}</span>,
        },
        {
            title: 'Category',
            dataIndex: 'CATEGORY',
            key: 'CATEGORY',
            width: 120,
            render: (cat) => {
                const c = CATEGORIES.find(c => c.value === cat);
                return <Tag color={categoryColorMap[cat] || 'default'}>{c?.label || cat || '-'}</Tag>;
            },
        },
        {
            title: 'Unit',
            dataIndex: 'UNIT',
            key: 'UNIT',
            width: 60,
            render: (text) => text || 'kg',
        },
        {
            title: 'Stock',
            dataIndex: 'STOCK',
            key: 'STOCK',
            width: 100,
            render: (val, record) => {
                const cat = (record.CATEGORY || '').toLowerCase();
                const isTracked = cat === 'raw_input' || cat === 'seasonal' || cat === 'raw_item' || cat === 'raw';
                if (!isTracked) {
                    return <Tag color="default" className="!text-xs font-semibold">N/A</Tag>;
                }
                return (
                    <span className={`font-semibold ${(val || 0) <= 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {(val || 0).toLocaleString()} {record.UNIT || 'kg'}
                    </span>
                );
            },
        },
        {
            title: 'Status',
            dataIndex: 'IS_ACTIVE',
            key: 'IS_ACTIVE',
            width: 110,
            render: (isActive, record) => (
                <Switch
                    checkedChildren="ON"
                    unCheckedChildren="OFF"
                    checked={Number(isActive) === 1}
                    onChange={async (checked) => {
                        const updated = checked ? 1 : 0;
                        try {
                            const res = await axios.post('/api/MillupdateItem', {
                                ...record,
                                IS_ACTIVE: updated
                            });
                            if (res.data.success) {
                                message.success(`${record.NAME} is now ${checked ? 'ON' : 'OFF'}`);
                                fetchItems();
                            }
                        } catch (e) {
                            message.error('Failed to update status');
                        }
                    }}
                />
            )
        },
        ...(userCanModify ? [{
            title: 'Actions',
            key: 'actions',
            width: 190,
            render: (_, record) => {
                const isOutput = (record.CATEGORY || '').toLowerCase() === 'output';
                return (
                    <div className="flex gap-2">
                        <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} className="!text-blue-500 hover:!text-blue-400" />
                        {isOutput && (
                            <Button
                                size="small"
                                icon={<TagsOutlined />}
                                onClick={() => setVariationsItem(record)}
                                className="!text-violet-500 hover:!text-violet-400"
                            >
                                Variations
                            </Button>
                        )}
                        {!record.SYSTEM_CODE && (
                            <Popconfirm title="Are you sure?" onConfirm={() => handleDelete(record)} okText="Yes" cancelText="No">
                                <Button size="small" icon={<DeleteOutlined />} danger />
                            </Popconfirm>
                        )}
                    </div>
                );
            },
        }] : []),
    ];

    return (
        <div className="page-paper">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Mill Items</h2>
                <div className="flex flex-col sm:flex-row gap-3">
                    <Select
                        value={categoryFilter}
                        onChange={handleCategoryFilter}
                        className="!w-full sm:!w-40"
                        options={[{ value: 'all', label: 'All Categories' }, ...CATEGORIES]}
                    />
                    <Input
                        placeholder="Search items..."
                        prefix={<SearchOutlined />}
                        value={searchText}
                        onChange={handleSearch}
                        allowClear
                        className="!w-full sm:!w-60"
                    />
                    {userCanModify && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNew}>
                            Add Item
                        </Button>
                    )}
                </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block">
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    loading={loading}
                    rowKey="ITEM_ID"
                    pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (total) => `${total} items` }}
                    scroll={{ x: 600 }}
                    size="small"
                />
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden space-y-3 pb-20">
                {filteredData.length === 0 ? (
                    <div className="p-8 text-center glass-card rounded-2xl text-gray-400">
                        No mill items found
                    </div>
                ) : (
                    filteredData.map((record) => (
                        <div 
                            key={record.ITEM_ID} 
                            onClick={() => handleEdit(record)}
                            className="p-4 rounded-2xl glass-card border border-white/10 space-y-3 shadow-md cursor-pointer hover:border-blue-500/40 active:scale-[0.99] transition-all"
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-white text-base">{record.NAME}</div>
                                    <div className="text-xs text-gray-400 font-mono">Code: {record.CODE}</div>
                                </div>
                                <div>
                                    <Tag color={categoryColorMap[record.CATEGORY] || 'default'}>
                                        {record.CATEGORY || '-'}
                                    </Tag>
                                </div>
                            </div>

                            <div className="flex justify-between items-center text-xs bg-zinc-900/60 p-2.5 rounded-xl border border-white/5">
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Selling Price</span>
                                    <span className="font-bold text-emerald-400 font-mono">
                                        Rs. {parseFloat(record.SELLING_PRICE || 0).toFixed(2)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-[10px]">Current Stock</span>
                                    <span className={`font-bold font-mono ${(record.STOCK || 0) <= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                        {(record.STOCK || 0).toLocaleString()} {record.UNIT || 'kg'}
                                    </span>
                                </div>
                            </div>

                            {(record.CATEGORY || '').toLowerCase() === 'output' && Array.isArray(record.VARIATIONS) && record.VARIATIONS.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {record.VARIATIONS.map((v) => (
                                        <span key={v.VARIATION_ID} className="inline-flex items-center rounded-md text-[10px] font-mono px-1.5 py-0.5 bg-blue-500/15 text-blue-300 ring-1 ring-inset ring-blue-500/25">
                                            {Number(v.WEIGHT_KG)}kg·{v.GS1_CODE}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {userCanModify && (
                                <div className="flex justify-end gap-2 pt-2 border-t border-white/5" onClick={(e) => e.stopPropagation()}>
                                    <Button 
                                        size="small" 
                                        icon={<EditOutlined />} 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleEdit(record);
                                        }}
                                    >
                                        Edit
                                    </Button>
                                    {(record.CATEGORY || '').toLowerCase() === 'output' && (
                                        <Button 
                                            size="small" 
                                            icon={<TagsOutlined />} 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setVariationsItem(record);
                                            }}
                                        >
                                            Variations
                                        </Button>
                                    )}
                                    <Button 
                                        size="small" 
                                        danger 
                                        icon={<DeleteOutlined />} 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(record);
                                        }}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Add/Edit Drawer */}
            <Drawer
                title={editingItem ? 'Edit Item' : 'Add New Item'}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                width={400}
                extra={
                    <Button type="primary" loading={submitting} onClick={handleSubmit}>
                        {editingItem ? 'Update' : 'Save'}
                    </Button>
                }
            >
                <Form form={form} layout="vertical" size="large">
                    <Form.Item name="CODE" label="Item Code" rules={[{ required: true }]}>
                        <Input placeholder="e.g., WEE-AMU" disabled={!!editingItem} />
                    </Form.Item>
                    <Form.Item name="NAME" label="Item Name" rules={[{ required: true }]}>
                        <Input disabled={!!editingItem} placeholder="e.g., Amu Wee" />
                    </Form.Item>
                    <Form.Item name="CATEGORY" label="Category" rules={[{ required: true }]}>
                        <Select
                            disabled={!!editingItem}
                            options={CATEGORIES}
                            placeholder="Select category"
                            onChange={(val) => {
                                setSelectedCategory(val);
                            }}
                        />
                    </Form.Item>
                    <Form.Item name="UNIT" label="Unit" initialValue="kg">
                        <Select disabled={!!editingItem} options={[
                            { value: 'kg', label: 'Kilograms (kg)' },
                            { value: 'bags', label: 'Bags' },
                            { value: 'pcs', label: 'Pieces' },
                            { value: 'litre', label: 'Litres' },
                        ]} />
                    </Form.Item>
                    <Form.Item name="BUYING_PRICE" label="Buying Price">
                        <Input type="number" prefix="Rs." placeholder="0.00" />
                    </Form.Item>
                    <Form.Item name="SELLING_PRICE" label="Selling Price">
                        <Input type="number" prefix="Rs." placeholder="0.00" />
                    </Form.Item>
                    {selectedCategory !== 'output' && editingItem?.CATEGORY !== 'output' && (
                        <Form.Item
                            name="GS1_CODE"
                            label="GS1 Product Code"
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
                                        form.setFieldValue('GS1_CODE', padded);
                                    }
                                }}
                            />
                        </Form.Item>
                    )}
                    {(selectedCategory === 'output' || editingItem?.CATEGORY === 'output') && (
                        <div className="text-xs text-gray-500 bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-3">
                            📦 Output items use <b>weight variations</b> for GS1 codes — each weight (5/10/25/50 kg) gets its own unique 3-digit code. Manage them via the <b>Variations</b> button on the item row.
                        </div>
                    )}
                </Form>
            </Drawer>

            {/* Weight Variations Drawer */}
            <VariationsManager
                item={variationsItem}
                open={!!variationsItem}
                onClose={() => setVariationsItem(null)}
                onSaved={fetchItems}
            />
        </div>
    );
}
