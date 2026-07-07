import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Tooltip, App, Form, Popconfirm, Drawer, Spin, Switch, Tag } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, PlusOutlined } from '@ant-design/icons';
import axios from 'axios';
import Cookies from 'js-cookie';
import { useStores } from '../../contexts/StoresContext';

export default function Items() {
    const { message } = App.useApp();
    const { stores, getAntTag } = useStores();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [searchText, setSearchText] = useState('');

    // Form / Drawer State
    // Current User Logic
    const currentUser = JSON.parse(Cookies.get('rememberedUser') || '{}');

    // Form / Drawer State
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    // Fetch Items
    const fetchItems = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/api/getAllItems', { STORE_NO: '1' });
            if (response.data.success) {
                // Filter out special items (CONTAINER, RETURN)
                const filtered = (response.data.result || []).filter(item =>
                    item.CODE !== 'CONTAINER' && item.CODE !== 'RETURN' && item.isSpecialItem !== true
                );
                setData(filtered);
                setFilteredData(filtered);
            }
        } catch (error) {
            console.error("Error fetching items:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchItems();
    }, []);

    // Search Handler
    const handleSearch = (e) => {
        const value = e.target.value.toLowerCase();
        setSearchText(value);
        if (!value) {
            setFilteredData(data);
            return;
        }
        const filtered = data.filter(item =>
            (item.CODE && item.CODE.toLowerCase().includes(value)) ||
            (item.NAME && item.NAME.toLowerCase().includes(value))
        );
        setFilteredData(filtered);
    };

    // Actions
    const handleAddNew = () => {
        setEditingItem(null);
        form.resetFields();
        setDrawerOpen(true);
    };

    const handleEdit = (record) => {
        setEditingItem(record);
        const vis = (() => {
            try { return typeof record.STORE_VISIBILITY === 'string' ? JSON.parse(record.STORE_VISIBILITY) : (record.STORE_VISIBILITY || {}); }
            catch { return {}; }
        })();
        const prices = (() => {
            try { return typeof record.STORE_PRICES === 'string' ? JSON.parse(record.STORE_PRICES) : (record.STORE_PRICES || {}); }
            catch { return {}; }
        })();
        const storeFields = {};
        stores.forEach(s => {
            const key = String(s.STORE_NO);
            storeFields[`store_vis_form_${s.STORE_NO}`] = vis[key] !== 0;
            storeFields[`store_price_buying_${s.STORE_NO}`] = prices[key]?.buying ?? null;
            storeFields[`store_price_selling_${s.STORE_NO}`] = prices[key]?.selling ?? null;
        });
        form.setFieldsValue({
            ...record,
            BUYING_PRICE: parseFloat(record.BUYING_PRICE || 0),
            SELLING_PRICE: parseFloat(record.SELLING_PRICE || 0),
            ...storeFields,
        });
        setDrawerOpen(true);
    };



    const handleDelete = async (record) => {
        try {
            const response = await axios.post('/api/deactivateItem', { ITEM_ID: record.ITEM_ID });
            if (response.data.success) {
                message.success('Item deleted successfully');
                fetchItems();
            } else {
                message.error('Failed to delete item');
            }
        } catch (error) {
            console.error("Error deleting item:", error);
            message.error("Failed to delete item");
        }
    };


    const handleFormSubmit = async (values) => {
        setSubmitting(true);
        try {
            if (editingItem) {
                const sv = {};
                const sp = {};
                stores.forEach(s => {
                    const key = String(s.STORE_NO);
                    sv[key] = values[`store_vis_form_${s.STORE_NO}`] !== false ? 1 : 0;
                    const buying = values[`store_price_buying_${s.STORE_NO}`];
                    const selling = values[`store_price_selling_${s.STORE_NO}`];
                    const hasBuying = buying !== null && buying !== '' && buying !== undefined;
                    const hasSelling = selling !== null && selling !== '' && selling !== undefined;
                    if (hasBuying || hasSelling) {
                        sp[key] = {
                            buying: hasBuying ? parseFloat(buying) : null,
                            selling: hasSelling ? parseFloat(selling) : null,
                        };
                    }
                });
                const payload = {
                    ITEM_ID: editingItem.ITEM_ID,
                    CODE: values.CODE,
                    NAME: values.NAME,
                    BUYING_PRICE: values.BUYING_PRICE,
                    SELLING_PRICE: values.SELLING_PRICE,
                    SHOW_IN_WEIGHING: sv['2'] !== 0 ? 1 : 0,
                    STORE_VISIBILITY: sv,
                    STORE_PRICES: sp,
                };
                const checkDup = await axios.post('/api/checkForDuplicateNameUpdate', { CODE: values.CODE, ITEM_ID: editingItem.ITEM_ID });
                if (checkDup.data.duplicate) {
                    message.error('Item Code already exists');
                    return;
                }
                const response = await axios.post('/api/updateItem', payload);
                if (response.data.success) {
                    message.success('Item updated successfully');
                    setDrawerOpen(false);
                    fetchItems();
                } else {
                    message.error('Failed to update item');
                }
            } else {
                const checkDup = await axios.post('/api/checkForDuplicateName', { CODE: values.CODE });
                if (checkDup.data.duplicate) {
                    message.error('Item Code already exists');
                    return;
                }
                const sv = {};
                const sp = {};
                stores.forEach(s => {
                    const key = String(s.STORE_NO);
                    sv[key] = values[`store_vis_form_${s.STORE_NO}`] !== false ? 1 : 0;
                    const buying = values[`store_price_buying_${s.STORE_NO}`];
                    const selling = values[`store_price_selling_${s.STORE_NO}`];
                    const hasBuying = buying !== null && buying !== '' && buying !== undefined;
                    const hasSelling = selling !== null && selling !== '' && selling !== undefined;
                    if (hasBuying || hasSelling) {
                        sp[key] = {
                            buying: hasBuying ? parseFloat(buying) : null,
                            selling: hasSelling ? parseFloat(selling) : null,
                        };
                    }
                });
                const payload = {
                    CODE: values.CODE,
                    NAME: values.NAME,
                    BUYING_PRICE: values.BUYING_PRICE,
                    SELLING_PRICE: values.SELLING_PRICE,
                    STOCK: JSON.stringify(Object.fromEntries(stores.map(s => [String(s.STORE_NO), 0]))),
                    IS_ACTIVE: 1,
                    SHOW_IN_WEIGHING: sv['2'] !== 0 ? 1 : 0,
                    STORE_VISIBILITY: sv,
                    STORE_PRICES: sp,
                };
                const response = await axios.post('/api/addItem', payload);
                if (response.data.success) {
                    message.success('Item added successfully');
                    setDrawerOpen(false);
                    fetchItems();
                } else {
                    message.error('Failed to add item');
                }
            }
        } catch (error) {
            console.error("Error saving item:", error);
            message.error("Error saving item");
        } finally {
            setSubmitting(false);
        }
    };



    const columns = [
        {
            title: 'Code',
            dataIndex: 'CODE',
            key: 'CODE',
            className: 'text-gray-700 dark:text-gray-300 font-medium font-mono',
            width: 100,
        },
        {
            title: 'Item Name',
            dataIndex: 'NAME',
            key: 'NAME',
            className: 'text-gray-800 dark:text-gray-200 font-semibold',
            render: (text) => <span className="text-base">{text}</span>
        },
        {
            title: 'Buying Price',
            dataIndex: 'BUYING_PRICE',
            key: 'BUYING_PRICE',
            align: 'right',
            width: 150,
            render: (price) => (
                <span className="text-gray-600 dark:text-gray-400">
                    Rs. {parseFloat(price || 0).toFixed(2)}
                </span>
            )
        },
        {
            title: 'Selling Price',
            dataIndex: 'SELLING_PRICE',
            key: 'SELLING_PRICE',
            align: 'right',
            width: 150,
            render: (price) => (
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    Rs. {parseFloat(price || 0).toFixed(2)}
                </span>
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            align: 'center',
            width: 100,
            render: (_, record) => (
                <div className="flex gap-2 justify-center">

                    <Tooltip title="Edit">
                        <Button onClick={() => handleEdit(record)} type="text" shape="circle" icon={<EditOutlined />} className="text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10" />
                    </Tooltip>
                    <Tooltip title="Delete">
                        <Popconfirm
                            title="Delete Item"
                            description={`Are you sure you want to delete ${record.NAME}?`}
                            onConfirm={() => handleDelete(record)}
                            okText="Yes"
                            cancelText="No"
                            okButtonProps={{ danger: true }}
                        >
                            <Button type="text" shape="circle" icon={<DeleteOutlined />} danger className="hover:bg-red-50 dark:hover:bg-red-500/10" />
                        </Popconfirm>
                    </Tooltip>
                </div>
            )
        }
    ].filter(col => {
        if (currentUser?.ROLE === 'MONITOR' && col.key === 'actions') return false;
        return true;
    });

    return (
        <div className="animate-fade-in p-4 pb-24 md:pb-8 max-w-[1600px] mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="hidden md:block">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Items</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Manage item catalog</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <Input
                        placeholder="Search by Code or Name..."
                        prefix={<SearchOutlined className="text-gray-400" />}
                        value={searchText}
                        onChange={handleSearch}
                        className="w-full md:w-64"
                        allowClear
                    />
                    {currentUser?.ROLE !== 'MONITOR' && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNew} className="bg-blue-600">
                            Add Item
                        </Button>
                    )}
                </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block glass-card rounded-2xl overflow-hidden p-1 border border-gray-100 dark:border-white/5 shadow-sm">
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="ITEM_ID"
                    loading={loading}
                    pagination={{ pageSize: 12 }}
                    rowClassName="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    onRow={(record) => ({
                        onClick: (e) => {
                            // Prevent row click if button clicked
                            if (e.target.closest('button')) return;
                            handleEdit(record);
                        },
                    })}
                />
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden flex flex-col gap-3">
                {loading ? (
                    <div className="flex justify-center p-8"><Spin /></div>
                ) : filteredData.length > 0 ? (
                    filteredData.map(item => {
                        let s1 = 0, s2 = 0;
                        try {
                            const stockObj = typeof item.STOCK === 'string' ? JSON.parse(item.STOCK) : item.STOCK;
                            s1 = stockObj ? parseFloat(stockObj['1'] || 0) : 0;
                            s2 = stockObj ? parseFloat(stockObj['2'] || 0) : 0;
                        } catch (e) { }

                        return (
                            <div key={item.ITEM_ID} className="glass-card p-4 rounded-xl flex flex-col gap-3 relative">
                                {currentUser?.ROLE !== 'MONITOR' && (
                                    <div className="absolute top-2 right-2 flex gap-1 z-10">
                                        <Button onClick={(e) => { e.stopPropagation(); handleEdit(item); }} size="small" type="text" shape="circle" icon={<EditOutlined />} className="text-blue-500 hover:text-blue-600 bg-transparent border-none shadow-none" />
                                    </div>
                                )}

                                <div className="flex justify-between items-start pr-12">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-blue-500 font-mono font-bold bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md w-fit mb-1">{item.CODE}</span>
                                        <span className="text-gray-800 dark:text-gray-100 font-bold text-lg">{item.NAME}</span>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Selling</span>
                                            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-base">Rs.{parseFloat(item.SELLING_PRICE).toFixed(2)}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Buying</span>
                                            <span className="text-red-500 dark:text-red-400 font-bold text-base">Rs.{parseFloat(item.BUYING_PRICE).toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>



                                <div className="flex justify-end items-center pt-2 mt-1 border-t border-gray-100 dark:border-white/5">
                                    {currentUser?.ROLE !== 'MONITOR' && (
                                        <div className="flex gap-2">
                                            <Popconfirm
                                                title="Delete Item"
                                                description={`Delete ${item.NAME}?`}
                                                onConfirm={(e) => { e.stopPropagation(); handleDelete(item); }}
                                                onCancel={(e) => e.stopPropagation()}
                                                okText="Yes"
                                                cancelText="No"
                                                okButtonProps={{ danger: true }}
                                            >
                                                <Button onClick={(e) => e.stopPropagation()} size="small" danger icon={<DeleteOutlined />} className="border-red-500/20 hover:border-red-500/50 bg-red-500/5">Delete</Button>
                                            </Popconfirm>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="text-center py-10 text-gray-500 bg-white/50 rounded-xl">No items found</div>
                )}
            </div>

            {/* Add/Edit Drawer */}
            <Drawer
                title={editingItem ? 'Edit Item' : 'Add New Item'}
                width={520}
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
                styles={{ body: { paddingBottom: 80 } }}
                className="glass-drawer"
                closeIcon={<span className="text-gray-500 text-lg">×</span>}
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleFormSubmit}
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.target.type === 'number') e.preventDefault(); }}
                    className="flex flex-col gap-4"
                    hideRequiredMark
                >
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Form.Item
                            name="CODE"
                            label="Item Code"
                            rules={[{ required: true, message: 'Please enter item code' }]}
                            normalize={(value) => value ? value.toUpperCase() : value}
                            className="md:col-span-1"
                        >
                            <Input placeholder="E.g. ITEM001" className="font-mono uppercase" />
                        </Form.Item>
                        <Form.Item
                            name="NAME"
                            label="Item Name"
                            rules={[{ required: true, message: 'Please enter item name' }]}
                            className="md:col-span-2"
                        >
                            <Input placeholder="Product Name" />
                        </Form.Item>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Form.Item
                            name="BUYING_PRICE"
                            label="Buying Price"
                        >
                            <Input type="number" step="0.01" prefix="Rs." className="w-full" placeholder="0.00" />
                        </Form.Item>
                        <Form.Item
                            name="SELLING_PRICE"
                            label="Selling Price"
                        >
                            <Input type="number" step="0.01" prefix="Rs." className="w-full" placeholder="0.00" />
                        </Form.Item>
                    </div>

                    {stores.length > 0 && (
                        <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                Per-Store Settings
                            </div>
                            <div className="flex flex-col gap-2">
                                {stores.map(s => {
                                    const globalBuying = form.getFieldValue('BUYING_PRICE');
                                    const globalSelling = form.getFieldValue('SELLING_PRICE');
                                    return (
                                        <div key={s.STORE_NO} className="border border-gray-100 dark:border-white/10 rounded-xl p-3 bg-gray-50/50 dark:bg-white/3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Form.Item
                                                    name={`store_vis_form_${s.STORE_NO}`}
                                                    valuePropName="checked"
                                                    initialValue={true}
                                                    noStyle
                                                >
                                                    <Switch size="small" checkedChildren="On" unCheckedChildren="Off" />
                                                </Form.Item>
                                                {s.STORE_NO === 2
                                                    ? <Tag color="purple" className="m-0">⚖️ Weighing Station</Tag>
                                                    : <Tag color={getAntTag(s.STORE_NO)} className="m-0">{`S${s.STORE_NO} · ${s.NAME}`}</Tag>
                                                }
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Form.Item
                                                    name={`store_price_buying_${s.STORE_NO}`}
                                                    label={<span className="text-xs text-gray-400">Buy Price</span>}
                                                    className="mb-0"
                                                >
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        prefix="Rs."
                                                        size="small"
                                                        placeholder={globalBuying ? `${parseFloat(globalBuying).toFixed(2)} (global)` : 'Use global'}
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    name={`store_price_selling_${s.STORE_NO}`}
                                                    label={<span className="text-xs text-gray-400">Sell Price</span>}
                                                    className="mb-0"
                                                >
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        prefix="Rs."
                                                        size="small"
                                                        placeholder={globalSelling ? `${parseFloat(globalSelling).toFixed(2)} (global)` : 'Use global'}
                                                    />
                                                </Form.Item>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}


                    <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-100 dark:border-white/10">
                        <Button onClick={() => setDrawerOpen(false)} size="large" className="rounded-xl">
                            Cancel
                        </Button>
                        {currentUser?.ROLE !== 'MONITOR' && (
                            <Button
                                type="primary"
                                htmlType="submit"
                                loading={submitting}
                                size="large"
                                className="rounded-xl px-8 bg-emerald-500 hover:bg-emerald-600 border-none shadow-lg shadow-emerald-500/30"
                            >
                                {editingItem ? 'Update Item' : 'Create Item'}
                            </Button>
                        )}
                    </div>
                </Form>
            </Drawer>


        </div >
    );
}
