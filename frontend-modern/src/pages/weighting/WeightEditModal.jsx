import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Select, InputNumber, Button, App } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import axios from 'axios';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const toEditItem = (item, idx) => {
    const gross = round2(item.grossWeight);
    const tare = round2(item.tareWeight);
    return {
        key: item.id || `${idx}-${Date.now()}`,
        id: item.id,
        productCode: (item.productCode || '').toUpperCase(),
        productName: item.productName || item.productCode || '',
        grossWeight: gross,
        tareWeight: tare,
        netWeight: round2(Math.max(0, gross - tare))
    };
};

/**
 * Owner edit of a Weighing Station record.
 * Saves through /api/weights/web-edit (same stock + sync logic as the Weighing Station app).
 */
const WeightEditModal = ({ open, record, currentUser, onClose, onSaved }) => {
    const { message, modal } = App.useApp();
    const [items, setItems] = useState([]);
    const [products, setProducts] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open || !record) return;
        setItems((record.items || []).map(toEditItem));
    }, [open, record]);

    // Same product list the Weighing Station uses (SHOW_IN_WEIGHING filter)
    useEffect(() => {
        if (!open || products.length > 0) return;
        axios.get('/api/items/store/2')
            .then(res => {
                const list = (res.data?.items || []).map(p => ({ code: (p.CODE || '').toUpperCase(), name: p.NAME || p.CODE }));
                const unique = list.filter((p, i) => p.code && list.findIndex(x => x.code === p.code) === i);
                setProducts(unique);
            })
            .catch(() => message.warning('Could not load product list'));
    }, [open]);

    const total = useMemo(() => round2(items.reduce((s, i) => s + i.netWeight, 0)), [items]);

    const productOptions = useMemo(() => {
        const opts = products.map(p => ({ value: p.code, label: `${p.code} - ${p.name}` }));
        // Keep codes that are no longer in the weighing list selectable
        items.forEach(i => {
            if (i.productCode && !opts.some(o => o.value === i.productCode)) {
                opts.unshift({ value: i.productCode, label: `${i.productCode} ${i.productName ? `(${i.productName})` : ''}` });
            }
        });
        return opts;
    }, [products, items]);

    const updateItem = (index, patch) => {
        setItems(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const next = { ...item, ...patch };
            return { ...next, netWeight: round2(Math.max(0, (next.grossWeight || 0) - (next.tareWeight || 0))) };
        }));
    };

    const handleProductChange = (index, code) => {
        const prod = products.find(p => p.code === code);
        updateItem(index, { productCode: code, productName: prod ? prod.name : code });
    };

    const handleAddItem = () => {
        const first = products[0] || { code: '', name: '' };
        setItems(prev => [...prev, toEditItem({ productCode: first.code, productName: first.name, grossWeight: 0, tareWeight: 0 }, prev.length)]);
    };

    const handleRemoveItem = (index) => {
        if (items.length <= 1) {
            message.warning('A bill needs at least one item. Set weights to 0 or delete the record instead.');
            return;
        }
        setItems(prev => prev.filter((_, i) => i !== index));
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await axios.post('/api/weights/web-edit', {
                code: record.code,
                items: items.map(({ id, productCode, productName, grossWeight, tareWeight }) => ({ id, productCode, productName, grossWeight, tareWeight })),
                userId: currentUser?.USER_ID,
                userRole: currentUser?.ROLE
            });
            if (!res.data?.success) throw new Error(res.data?.message || 'Update failed');
            message.success(`${record.code} updated. Weighing Station will sync it.`);
            onSaved?.();
            onClose();
        } catch (err) {
            message.error(err.response?.data?.message || err.message || 'Update failed');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = () => {
        if (items.some(i => !i.productCode)) {
            message.warning('Please select a product for all items.');
            return;
        }
        if (total === 0) {
            modal.confirm({
                title: 'Save as 0 kg?',
                content: `${record.code} will be saved with 0.00 kg. Use this for test or wrong bills. POS will not accept its QR.`,
                okText: 'Save 0 kg',
                onOk: save
            });
            return;
        }
        save();
    };

    return (
        <Modal
            title={<span className="text-lg font-bold">Edit Weighing: {record?.code}</span>}
            open={open}
            onCancel={onClose}
            width={720}
            destroyOnClose
            footer={[
                <Button key="cancel" onClick={onClose}>Cancel</Button>,
                <Button key="save" type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>Save</Button>
            ]}
        >
            <div className="flex flex-col gap-2">
                <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
                    <div className="col-span-5">Item</div>
                    <div className="col-span-2 text-center">Gross</div>
                    <div className="col-span-2 text-center">Tare</div>
                    <div className="col-span-2 text-right">Net</div>
                    <div className="col-span-1" />
                </div>

                {items.map((item, idx) => (
                    <div key={item.key} className="grid grid-cols-12 gap-2 items-center bg-gray-50 dark:bg-white/5 p-2 rounded-lg">
                        <Select
                            className="col-span-12 sm:col-span-5"
                            showSearch
                            optionFilterProp="label"
                            placeholder="Select item"
                            value={item.productCode || undefined}
                            options={productOptions}
                            onChange={(code) => handleProductChange(idx, code)}
                        />
                        <InputNumber
                            className="col-span-4 sm:col-span-2 w-full"
                            min={0}
                            step={0.01}
                            precision={2}
                            value={item.grossWeight}
                            onChange={(v) => updateItem(idx, { grossWeight: round2(v) })}
                        />
                        <InputNumber
                            className="col-span-4 sm:col-span-2 w-full"
                            min={0}
                            step={0.01}
                            precision={2}
                            value={item.tareWeight}
                            onChange={(v) => updateItem(idx, { tareWeight: round2(v) })}
                        />
                        <div className="col-span-3 sm:col-span-2 text-right font-bold text-emerald-600 font-mono">
                            {item.netWeight.toFixed(2)}
                        </div>
                        <Button
                            className="col-span-1"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleRemoveItem(idx)}
                            title="Remove item"
                        />
                    </div>
                ))}

                <div className="flex justify-between items-center mt-2">
                    <Button icon={<PlusOutlined />} onClick={handleAddItem}>Add Item</Button>
                    <div className="text-base">
                        Total: <span className={`font-bold font-mono ${total === 0 ? 'text-red-500' : 'text-emerald-600'}`}>{total.toFixed(2)} kg</span>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default WeightEditModal;
