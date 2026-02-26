import React, { useState, useEffect } from 'react';
import {
    Modal, Button, Select, InputNumber, Input, App, Spin, Divider, Tag
} from 'antd';
import { PlusOutlined, DeleteOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import Cookies from 'js-cookie';

const { Option } = Select;
const { TextArea } = Input;

// Items that should never appear in transaction selectors
const EXCLUDED_ITEM_CODES = ['CONTAINER', 'RETURN'];

const AddTransactionModal = ({ open, onClose, onSuccess }) => {
    const { message } = App.useApp();

    const [loading, setLoading] = useState(false);
    const [itemsData, setItemsData] = useState([]);
    const [fetchingItems, setFetchingItems] = useState(false);

    // Form state
    const [storeNo, setStoreNo] = useState(1);
    const [mode, setMode] = useState('Selling'); // 'Buying' | 'Selling'
    const [txItems, setTxItems] = useState([]);
    const [comments, setComments] = useState('');
    const [codePreview, setCodePreview] = useState('');

    // Fetch available items on open
    useEffect(() => {
        if (open) {
            fetchItems();
            resetForm();
        }
    }, [open]);

    // Regenerate code preview whenever store or date changes
    useEffect(() => {
        if (open) {
            generateCodePreview();
        }
    }, [storeNo, open]);

    const resetForm = () => {
        setStoreNo(1);
        setMode('Selling');
        setTxItems([]);
        setComments('');
    };

    const fetchItems = async () => {
        setFetchingItems(true);
        try {
            const res = await axios.post('/api/getAllItems');
            if (res.data.success) {
                // Filter out CONTAINER and RETURN items
                const filtered = res.data.result.filter(item => {
                    const code = (item.CODE || '').toUpperCase();
                    const name = (item.NAME || '').toUpperCase();
                    return !EXCLUDED_ITEM_CODES.includes(code) &&
                        !EXCLUDED_ITEM_CODES.some(ex => name.includes(ex));
                });
                setItemsData(filtered);
            }
        } catch (err) {
            console.error('Error fetching items:', err);
        } finally {
            setFetchingItems(false);
        }
    };

    const generateCodePreview = async () => {
        const dateStr = dayjs().format('DDMMYY');
        // Try to determine today's WEB counter for this store
        try {
            const searchPrefix = `S${storeNo}-${dateStr}-WEB-`;
            const res = await axios.post('/api/getAllTransactionsCashBook', {
                page: 1,
                limit: 200,
                search: searchPrefix,
                STORE_NO: storeNo,
            });
            let count = 0;
            if (res.data.success && Array.isArray(res.data.result)) {
                count = res.data.result.filter(t =>
                    t.CODE && t.CODE.startsWith(searchPrefix)
                ).length;
            }
            const counter = String(count + 1).padStart(3, '0');
            setCodePreview(`S${storeNo}-${dateStr}-WEB-${counter}`);
        } catch {
            // Fallback if query fails
            const counter = '001';
            setCodePreview(`S${storeNo}-${dateStr}-WEB-${counter}`);
        }
    };

    // --- Item Row Management ---
    const addItemRow = () => {
        setTxItems(prev => [
            ...prev,
            { key: Date.now(), ITEM_ID: null, ITEM_NAME: '', PRICE: 0, QUANTITY: 1, TOTAL: 0 }
        ]);
    };

    const removeItemRow = (key) => {
        setTxItems(prev => prev.filter(i => i.key !== key));
    };

    const updateItemRow = (key, field, value) => {
        setTxItems(prev => prev.map(item => {
            if (item.key !== key) return item;
            const updated = { ...item, [field]: value };

            if (field === 'ITEM_ID') {
                const selectedItem = itemsData.find(i => i.ITEM_ID === value);
                if (selectedItem) {
                    updated.ITEM_NAME = selectedItem.NAME;
                    // Auto-fill price based on mode
                    updated.PRICE = mode === 'Selling'
                        ? (selectedItem.SELLING_PRICE || 0)
                        : (selectedItem.BUYING_PRICE || 0);
                    updated.TOTAL = (updated.PRICE || 0) * (updated.QUANTITY || 0);
                }
            }

            if (field === 'PRICE' || field === 'QUANTITY') {
                updated.TOTAL = (Number(updated.PRICE) || 0) * (Number(updated.QUANTITY) || 0);
            }

            return updated;
        }));
    };

    // When mode changes, re-price all existing items
    const handleModeChange = (newMode) => {
        setMode(newMode);
        setTxItems(prev => prev.map(item => {
            if (!item.ITEM_ID) return item;
            const found = itemsData.find(i => i.ITEM_ID === item.ITEM_ID);
            if (!found) return item;
            const newPrice = newMode === 'Selling'
                ? (found.SELLING_PRICE || 0)
                : (found.BUYING_PRICE || 0);
            return {
                ...item,
                PRICE: newPrice,
                TOTAL: newPrice * (Number(item.QUANTITY) || 0)
            };
        }));
    };

    const grandTotal = txItems.reduce((sum, i) => sum + (Number(i.TOTAL) || 0), 0);

    // --- Submit ---
    const handleSubmit = async () => {
        if (txItems.length === 0) {
            message.warning('Please add at least one item');
            return;
        }
        const invalidItem = txItems.find(i => !i.ITEM_ID);
        if (invalidItem) {
            message.warning('Please select an item for all rows');
            return;
        }

        setLoading(true);
        try {
            const Cookies = (await import('js-cookie')).default;
            const userStr = Cookies.get('rememberedUser');
            const user = userStr ? JSON.parse(userStr) : null;
            const createdBy = user?.USER_ID || 1;

            // Recalculate final code at submit time (in case counter changed)
            const dateStr = dayjs().format('DDMMYY');
            const searchPrefix = `S${storeNo}-${dateStr}-WEB-`;

            let counter = 1;
            try {
                const res = await axios.post('/api/getAllTransactionsCashBook', {
                    page: 1, limit: 200, search: searchPrefix, STORE_NO: storeNo,
                });
                if (res.data.success && Array.isArray(res.data.result)) {
                    counter = res.data.result.filter(t =>
                        t.CODE && t.CODE.startsWith(searchPrefix)
                    ).length + 1;
                }
            } catch { /* use 1 */ }

            const code = `S${storeNo}-${dateStr}-WEB-${String(counter).padStart(3, '0')}`;
            const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

            const billData = {
                billId: code,
                date: dayjs().format('MM/DD/YYYY'),
                time: dayjs().format('h:mm A'),
                mode: mode === 'Buying' ? 'buy' : 'sell',
                storeNo: storeNo,
                items: txItems.map(i => ({
                    id: i.ITEM_ID,
                    name: i.ITEM_NAME,
                    price: i.PRICE,
                    quantity: i.QUANTITY,
                    total: i.TOTAL,
                    lotEntries: []
                })),
                total: grandTotal,
                comments: comments,
            };

            const payload = {
                CODE: code,
                TYPE: mode,
                STORE_NO: storeNo,
                SUB_TOTAL: grandTotal,
                AMOUNT_SETTLED: grandTotal,
                DUE_AMOUNT: 0,
                COMMENTS: comments || '',
                CREATED_BY: createdBy,
                DATE: now,
                CREATED_DATE: now,
                BILL_DATA: JSON.stringify(billData),
                ITEMS: txItems.map(i => ({
                    ITEM_ID: i.ITEM_ID,
                    PRICE: i.PRICE,
                    QUANTITY: i.QUANTITY,
                    TOTAL: i.TOTAL,
                    STORE_NO: storeNo,
                })),
            };

            const response = await axios.post('/api/addTransaction', payload);

            if (response.data.success) {
                message.success(`Transaction ${response.data.code || code} added successfully!`);
                onSuccess();
                onClose();
            } else {
                message.error(response.data.message || 'Failed to add transaction');
            }
        } catch (error) {
            console.error('Error adding transaction:', error);
            message.error('Failed to add transaction');
        } finally {
            setLoading(false);
        }
    };

    // SegmentedButton helper (reusable toggle)
    const ToggleGroup = ({ label, value, onChange, options }) => (
        <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium">{label}</span>
            <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-white/10">
                {options.map(opt => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={`flex-1 py-2 px-3 text-sm font-semibold transition-all duration-200 ${value === opt.value
                                ? `${opt.activeClass} text-white`
                                : 'bg-white dark:bg-zinc-900 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800'
                            }`}
                    >
                        {opt.icon} {opt.label}
                    </button>
                ))}
            </div>
        </div>
    );

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <ShoppingCartOutlined className="text-green-500" />
                    <span>Add Transaction</span>
                    {codePreview && (
                        <Tag color="green" className="ml-2 font-mono text-xs">
                            {codePreview}
                        </Tag>
                    )}
                </div>
            }
            open={open}
            onCancel={onClose}
            footer={null}
            width={680}
            destroyOnClose
            className="add-transaction-modal"
        >
            {fetchingItems ? (
                <div className="flex justify-center py-12">
                    <Spin size="large" />
                </div>
            ) : (
                <div className="flex flex-col gap-5 pt-2">

                    {/* Store + Mode selectors */}
                    <div className="grid grid-cols-2 gap-4">
                        <ToggleGroup
                            label="Store"
                            value={storeNo}
                            onChange={(v) => {
                                setStoreNo(v);
                            }}
                            options={[
                                { value: 1, label: 'Store 1', icon: '🏪', activeClass: 'bg-blue-500' },
                                { value: 2, label: 'Store 2', icon: '🏬', activeClass: 'bg-purple-500' }
                            ]}
                        />
                        <ToggleGroup
                            label="Transaction Mode"
                            value={mode}
                            onChange={handleModeChange}
                            options={[
                                { value: 'Selling', label: 'Selling', icon: '📤', activeClass: 'bg-emerald-500' },
                                { value: 'Buying', label: 'Buying', icon: '📥', activeClass: 'bg-red-500' }
                            ]}
                        />
                    </div>

                    <Divider className="my-0" />

                    {/* Items Section */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <span className="font-semibold text-gray-700 dark:text-gray-300 text-sm uppercase tracking-wider">
                                Items
                            </span>
                            <Button
                                type="dashed"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={addItemRow}
                                className="text-green-600 border-green-400 hover:border-green-500"
                            >
                                Add Item
                            </Button>
                        </div>

                        {/* Desktop layout: table-like row */}
                        <div className="hidden md:block">
                            {txItems.length > 0 && (
                                <div className="grid grid-cols-12 gap-2 mb-2 px-1">
                                    <span className="col-span-5 text-[10px] text-gray-400 uppercase tracking-wider">Item</span>
                                    <span className="col-span-3 text-[10px] text-gray-400 uppercase tracking-wider">Price (Rs.)</span>
                                    <span className="col-span-2 text-[10px] text-gray-400 uppercase tracking-wider">Qty</span>
                                    <span className="col-span-2 text-[10px] text-gray-400 uppercase tracking-wider">Total</span>
                                </div>
                            )}
                            {txItems.map(item => (
                                <div key={item.key} className="grid grid-cols-12 gap-2 mb-2 items-center">
                                    <div className="col-span-5">
                                        <Select
                                            showSearch
                                            placeholder="Select item"
                                            value={item.ITEM_ID}
                                            onChange={val => updateItemRow(item.key, 'ITEM_ID', val)}
                                            className="w-full"
                                            filterOption={(input, option) =>
                                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                            }
                                            options={itemsData.map(i => ({
                                                value: i.ITEM_ID,
                                                label: `${i.CODE} - ${i.NAME}`
                                            }))}
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <InputNumber
                                            min={0}
                                            value={item.PRICE}
                                            onChange={val => updateItemRow(item.key, 'PRICE', val)}
                                            className="w-full"
                                            prefix="Rs."
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <InputNumber
                                            min={0}
                                            value={item.QUANTITY}
                                            onChange={val => updateItemRow(item.key, 'QUANTITY', val)}
                                            className="w-full"
                                        />
                                    </div>
                                    <div className="col-span-1 text-sm font-semibold text-gray-700 dark:text-gray-300 text-right">
                                        {Number(item.TOTAL).toFixed(0)}
                                    </div>
                                    <div className="col-span-1 flex justify-end">
                                        <Button
                                            type="text"
                                            danger
                                            size="small"
                                            icon={<DeleteOutlined />}
                                            onClick={() => removeItemRow(item.key)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Mobile layout: cards */}
                        <div className="md:hidden flex flex-col gap-3">
                            {txItems.map(item => (
                                <div key={item.key} className="p-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-zinc-900 flex flex-col gap-3 relative">
                                    <Button
                                        type="text"
                                        danger
                                        size="small"
                                        icon={<DeleteOutlined />}
                                        className="absolute top-2 right-2"
                                        onClick={() => removeItemRow(item.key)}
                                    />
                                    <div>
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Item</span>
                                        <Select
                                            showSearch
                                            placeholder="Select item"
                                            value={item.ITEM_ID}
                                            onChange={val => updateItemRow(item.key, 'ITEM_ID', val)}
                                            className="w-full"
                                            size="large"
                                            filterOption={(input, option) =>
                                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                                            }
                                            options={itemsData.map(i => ({
                                                value: i.ITEM_ID,
                                                label: `${i.CODE} - ${i.NAME}`
                                            }))}
                                        />
                                    </div>
                                    <div className="flex gap-3">
                                        <div className="flex-1">
                                            <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Price</span>
                                            <InputNumber
                                                min={0}
                                                value={item.PRICE}
                                                onChange={val => updateItemRow(item.key, 'PRICE', val)}
                                                className="w-full"
                                                prefix="Rs."
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-1">Qty (Kg)</span>
                                            <InputNumber
                                                min={0}
                                                value={item.QUANTITY}
                                                onChange={val => updateItemRow(item.key, 'QUANTITY', val)}
                                                className="w-full"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-white/5">
                                        <span className="text-xs text-gray-400">Line Total</span>
                                        <span className="font-bold text-gray-800 dark:text-white text-lg">
                                            Rs.{Number(item.TOTAL).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {txItems.length === 0 && (
                            <div
                                className="flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/10 cursor-pointer hover:border-green-400 hover:bg-green-50/30 dark:hover:bg-green-900/10 transition-all"
                                onClick={addItemRow}
                            >
                                <PlusOutlined className="text-2xl text-gray-300 dark:text-gray-600 mb-2" />
                                <span className="text-sm text-gray-400">Click to add an item</span>
                            </div>
                        )}
                    </div>

                    {/* Grand Total */}
                    {txItems.length > 0 && (
                        <div className={`rounded-xl p-4 flex justify-between items-center ${mode === 'Selling'
                                ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/30'
                                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/30'
                            }`}>
                            <span className={`font-semibold text-sm ${mode === 'Selling' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                                Grand Total ({mode})
                            </span>
                            <span className={`font-bold text-2xl ${mode === 'Selling' ? 'text-emerald-600' : 'text-red-600'}`}>
                                Rs.{grandTotal.toFixed(2)}
                            </span>
                        </div>
                    )}

                    {/* Comments */}
                    <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium block mb-1">
                            Comments (optional)
                        </span>
                        <TextArea
                            rows={2}
                            placeholder="Add notes or comments..."
                            value={comments}
                            onChange={e => setComments(e.target.value)}
                            className="resize-none"
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-white/5">
                        <Button onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            loading={loading}
                            onClick={handleSubmit}
                            className={mode === 'Selling' ? 'bg-emerald-500 hover:bg-emerald-600 border-emerald-500' : 'bg-red-500 hover:bg-red-600 border-red-500'}
                            icon={<ShoppingCartOutlined />}
                            size="large"
                        >
                            Save {mode} Transaction
                        </Button>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default AddTransactionModal;
