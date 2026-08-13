import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Card, Select, Input, InputNumber, DatePicker, Checkbox, Button, message,
    Tag, Badge, Empty, Table, Modal
} from 'antd';
import {
    PrinterOutlined, PlusOutlined, DeleteOutlined, HistoryOutlined,
    InfoCircleOutlined, CheckCircleOutlined,
    EyeOutlined, ShoppingCartOutlined, FileTextOutlined, CalendarOutlined,
    TableOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import MiniBagLabel from '../../components/labels/MiniBagLabel';
import {
    buildBatchEAN13,
    calculateEAN13CheckDigit,
    generateStandardBatchNo,
    GS1_SL_PREFIX,
    batchToUniqueCode
} from '../../utils/labelUtils';

const { Option } = Select;

function getBillTotalBags(b) {
    if (!b) return 0;
    const directTotal = Number(b.TOTAL_BAGS ?? b.TOTAL_QTY ?? b.TOTAL_BAG_COUNT ?? b.total_bags ?? b.BAG_COUNT);
    if (!isNaN(directTotal) && directTotal > 0) {
        return directTotal;
    }
    let items = b.ITEMS || b.ITEMS_JSON || b.items;
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (e) { items = []; }
    }
    if (!Array.isArray(items)) return 0;
    return items.reduce((s, i) => {
        const count = Number(i.BAG_COUNT || i.BAG_QTY || i.QUANTITY || i.quantity || i.count || i.BAGS) || 0;
        return s + count;
    }, 0);
}

function buildGroupsFromBill(bill, itemsList) {
    let items = bill?.ITEMS || bill?.ITEMS_JSON || bill?.items || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (e) { items = []; }
    }
    if (!Array.isArray(items)) return [];
    return items
        .filter(i => Number(i.BAG_COUNT || i.BAG_QTY || i.QUANTITY || i.quantity || i.count) > 0)
        .map(i => {
            const dbItem = itemsList.find(x =>
                x.ITEM_ID === i.ITEM_ID ||
                (x.SYSTEM_CODE && x.SYSTEM_CODE === i.SYSTEM_CODE) ||
                (x.name || x.NAME) === (i.ITEM_NAME || i.itemName)
            );
            let gs1Code = null;
            if (dbItem && Array.isArray(dbItem.VARIATIONS)) {
                const v = dbItem.VARIATIONS.find(v => Number(v.WEIGHT_KG) === Number(i.BAG_WEIGHT || i.bagWeight));
                if (v && v.GS1_CODE) gs1Code = v.GS1_CODE;
            }
            if (!gs1Code && dbItem) {
                gs1Code = dbItem.GS1_CODE || dbItem.SYSTEM_CODE;
            }
            if (!gs1Code) gs1Code = '001';
            return {
                key: `${i.ITEM_ID || i.id || i.itemName}-${i.BAG_WEIGHT || i.bagWeight || 5}`,
                itemName: String(i.ITEM_NAME || i.itemName || dbItem?.NAME || dbItem?.name || 'RICE').toUpperCase(),
                bagWeight: Number(i.BAG_WEIGHT || i.bagWeight) || 5,
                count: Math.max(1, Number(i.BAG_COUNT || i.BAG_QTY || i.QUANTITY || i.quantity || i.count) || 1),
                unitPrice: i.UNIT_PRICE ?? i.unitPrice ?? dbItem?.SELLING_PRICE ?? null,
                gs1Code,
            };
        });
}

export default function BagLabels() {
    const location = useLocation();

    // ─── Data sources ────────────────────────────────────────────
    const [bills, setBills] = useState([]);
    const [itemsList, setItemsList] = useState([]);
    const [dataLoaded, setDataLoaded] = useState(false);

    // ─── Workflow mode ───────────────────────────────────────────
    const [mode, setMode] = useState('manual');
    const [selectedBillId, setSelectedBillId] = useState(null);
    const [groups, setGroups] = useState([]);
    const [previewKey, setPreviewKey] = useState('manual');
    const [priceOverrides, setPriceOverrides] = useState({});

    // ─── Global label fields ─────────────────────────────────────
    const [brandName, setBrandName] = useState('CHAMIKA RICE MILLS');
    const [packedBy, setPackedBy] = useState('Chamika Rice Mills, Sooriyawewa, SL');
    const [mfgDate, setMfgDate] = useState(dayjs().format('DD/MM/YYYY'));
    const [expDate, setExpDate] = useState(dayjs().add(2, 'month').format('DD/MM/YYYY'));
    const [leavePriceEmpty, setLeavePriceEmpty] = useState(false);
    const [batchNo, setBatchNo] = useState(() => generateStandardBatchNo(Math.floor(1 + Math.random() * 99)));
    const [printLayout, setPrintLayout] = useState('thermal60x40');

    // ─── Manual Modal & History state ────────────────────────────
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [printedHistory, setPrintedHistory] = useState([]);

    // ─── Manual multi-label state ─────────────────────────────────
    const [manualInput, setManualInput] = useState({
        itemId: null,
        itemName: 'SAMBA RICE',
        bagWeight: 5,
        gs1Code: '001',
        count: 1,
        unitPrice: null,
        variations: [],
        varId: null,
    });
    const [manualGroups, setManualGroups] = useState([]);
    const patchManualInput = (patch) => setManualInput(prev => ({ ...prev, ...patch }));

    // Finished/Output items filter only
    const outputItems = useMemo(() => {
        if (!itemsList || itemsList.length === 0) return [];
        const filtered = itemsList.filter(item => {
            const cat = String(item.CATEGORY || item.category || '').toLowerCase();
            const hasVars = Array.isArray(item.VARIATIONS) && item.VARIATIONS.length > 0;
            return cat === 'output' || cat === 'finished' || cat === 'rice' || hasVars;
        });
        return filtered.length > 0 ? filtered : itemsList;
    }, [itemsList]);

    // Load history from localStorage
    const loadHistory = () => {
        try {
            const raw = localStorage.getItem('printed_barcode_history');
            if (raw) setPrintedHistory(JSON.parse(raw));
        } catch (e) {
            console.error('Error reading barcode history:', e);
        }
    };

    useEffect(() => {
        loadHistory();
        (async () => {
            try {
                const [salesRes, itemsRes] = await Promise.all([
                    axios.get('/api/mill/sales/list', { withCredentials: true })
                        .catch(() => axios.get('/api/sales'))
                        .catch(() => ({ data: [] })),
                    axios.post('/api/MillgetAllItems')
                        .catch(() => axios.get('/api/mill/items'))
                        .catch(() => ({ data: [] })),
                ]);

                const allBills = salesRes.data?.result || salesRes.data?.data || (Array.isArray(salesRes.data) ? salesRes.data : []);
                const allItems = itemsRes.data?.result || itemsRes.data?.data || (Array.isArray(itemsRes.data) ? itemsRes.data : []);

                setBills(allBills || []);
                setItemsList(allItems || []);
            } catch (e) {
                console.error('Error loading webapp data for labels:', e);
            } finally {
                setDataLoaded(true);
            }
        })();
    }, []);

    // Initialize default manual product group once outputItems load
    useEffect(() => {
        if (outputItems.length > 0 && manualGroups.length === 0) {
            const first = outputItems[0];
            const vars = Array.isArray(first.VARIATIONS) ? first.VARIATIONS : [];
            let initialGroup;
            if (vars.length > 0) {
                const pref = vars[0];
                initialGroup = {
                    key: `manual-init-0`,
                    itemName: String(first.NAME || first.name || 'RICE').toUpperCase(),
                    bagWeight: Number(pref.WEIGHT_KG || 5),
                    count: 1,
                    unitPrice: pref.SELLING_PRICE ?? first.SELLING_PRICE ?? null,
                    gs1Code: pref.GS1_CODE || '001',
                };
                setManualInput({
                    itemId: first.ITEM_ID || first.id,
                    itemName: String(first.NAME || first.name || 'RICE').toUpperCase(),
                    variations: vars,
                    varId: pref.VARIATION_ID,
                    bagWeight: Number(pref.WEIGHT_KG || 5),
                    gs1Code: pref.GS1_CODE || '001',
                    count: 1,
                    unitPrice: pref.SELLING_PRICE ?? first.SELLING_PRICE ?? null,
                });
            } else {
                initialGroup = {
                    key: `manual-init-0`,
                    itemName: String(first.NAME || first.name || 'RICE').toUpperCase(),
                    bagWeight: Number(first.BAG_WEIGHT || 5),
                    count: 1,
                    unitPrice: first.SELLING_PRICE ?? null,
                    gs1Code: first.GS1_CODE || first.SYSTEM_CODE || '001',
                };
                setManualInput({
                    itemId: first.ITEM_ID || first.id,
                    itemName: String(first.NAME || first.name || 'RICE').toUpperCase(),
                    variations: [],
                    varId: null,
                    bagWeight: Number(first.BAG_WEIGHT || 5),
                    gs1Code: first.GS1_CODE || first.SYSTEM_CODE || '001',
                    count: 1,
                    unitPrice: first.SELLING_PRICE ?? null,
                });
            }
            setManualGroups([initialGroup]);
            setPreviewKey(initialGroup.key);
        }
    }, [outputItems]);

    useEffect(() => {
        if (!dataLoaded) return;
        const queryParams = new URLSearchParams(location.search);
        const billIdFromUrl = queryParams.get('billId');
        if (billIdFromUrl) {
            selectBillById(billIdFromUrl);
        }
    }, [dataLoaded, location.search]);

    const selectBillById = async (id) => {
        let bill = bills.find(b => String(b.LOCAL_ID) === String(id) || String(b.BILL_ID) === String(id) || String(b.ID) === String(id));
        try {
            const res = await axios.get(`/api/mill/sales/${id}`, { withCredentials: true });
            if (res.data && (res.data.result || res.data.success)) {
                bill = res.data.result || res.data;
            }
        } catch (e) {
            console.error('Failed to fetch full bill details by ID', e);
        }
        if (!bill) {
            message.warning('Bill not found for label printing');
            return;
        }
        setMode('bill');
        setSelectedBillId(bill.LOCAL_ID || bill.BILL_ID || id);
        setPriceOverrides({});
        if (bill.BATCH_NO) setBatchNo(bill.BATCH_NO);
        const built = buildGroupsFromBill(bill, itemsList);
        setGroups(built);
        if (built.length > 0) setPreviewKey(built[0].key);
        const total = built.reduce((s, g) => s + g.count, 0);
        message.success(
            `Loaded ${built.length} product group(s) — ${total} label(s) from bill #${bill.INVOICE_NO || bill.BILL_ID || id}`
        );
    };

    const handleBillSelect = (val) => {
        if (val === 'manual') {
            setMode('manual');
            setSelectedBillId(null);
            setPriceOverrides({});
            if (manualGroups.length > 0) setPreviewKey(manualGroups[0].key);
            setBatchNo(generateStandardBatchNo(Math.floor(1 + Math.random() * 99)));
            return;
        }
        selectBillById(val);
    };

    const handleManualItemSelect = (val) => {
        const dbItem = itemsList.find(i => String(i.ITEM_ID || i.id) === String(val) || i.SYSTEM_CODE === val);
        if (!dbItem) return;
        const vars = Array.isArray(dbItem.VARIATIONS) ? dbItem.VARIATIONS : [];
        if (vars.length > 0) {
            const preferred = vars[0];
            patchManualInput({
                itemId: dbItem.ITEM_ID || dbItem.id,
                itemName: String(dbItem.NAME || dbItem.name || '').toUpperCase(),
                variations: vars,
                varId: preferred.VARIATION_ID,
                bagWeight: Number(preferred.WEIGHT_KG || 5),
                gs1Code: preferred.GS1_CODE || '001',
                unitPrice: preferred.SELLING_PRICE ?? dbItem.SELLING_PRICE ?? null,
            });
        } else {
            const w = Number(dbItem.BAG_WEIGHT) || 5;
            patchManualInput({
                itemId: dbItem.ITEM_ID || dbItem.id,
                itemName: String(dbItem.NAME || dbItem.name || '').toUpperCase(),
                bagWeight: w,
                gs1Code: dbItem.GS1_CODE || dbItem.SYSTEM_CODE || '001',
                unitPrice: dbItem.SELLING_PRICE ?? null,
                variations: [],
                varId: null,
            });
        }
    };

    const handleManualVarSelect = (varId) => {
        const v = manualInput.variations.find(x => x.VARIATION_ID === varId);
        if (v) patchManualInput({
            varId,
            bagWeight: Number(v.WEIGHT_KG || 5),
            gs1Code: v.GS1_CODE || '001',
            unitPrice: v.SELLING_PRICE ?? manualInput.unitPrice,
        });
    };

    const handleAddManualRow = () => {
        const newRow = {
            key: `manual-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            itemName: manualInput.itemName || 'RICE',
            bagWeight: Number(manualInput.bagWeight) || 5,
            count: Math.max(1, Number(manualInput.count) || 1),
            unitPrice: manualInput.unitPrice ?? null,
            gs1Code: manualInput.gs1Code || '001',
        };
        setManualGroups(prev => [...prev, newRow]);
        setPreviewKey(newRow.key);
        message.success(`Added ${newRow.itemName} (${newRow.bagWeight}kg × ${newRow.count}) to print list`);
    };

    const handleRemoveManualRow = (key) => {
        setManualGroups(prev => {
            const updated = prev.filter(g => g.key !== key);
            if (updated.length > 0 && previewKey === key) {
                setPreviewKey(updated[0].key);
            }
            return updated;
        });
    };

    const effectiveGroups = useMemo(() => {
        if (mode === 'manual') return manualGroups;
        return groups;
    }, [mode, manualGroups, groups]);

    const getPrice = (g) => {
        if (leavePriceEmpty) return null;
        const o = priceOverrides[g.key];
        if (o === null || o === '') return null;
        if (o !== undefined) return o;
        if (g.unitPrice !== null && g.unitPrice !== undefined) return g.unitPrice;
        return null;
    };
    const setGroupPrice = (key, val) => setPriceOverrides(prev => ({ ...prev, [key]: val }));

    const setGroupCount = (key, count) => {
        const val = Math.max(1, parseInt(count, 10) || 1);
        if (mode === 'manual') {
            setManualGroups(prev => prev.map(g => g.key === key ? { ...g, count: val } : g));
        } else {
            setGroups(prev => prev.map(g => g.key === key ? { ...g, count: val } : g));
        }
    };

    const printLabels = useMemo(() => {
        const out = [];
        effectiveGroups.forEach(g => {
            for (let i = 0; i < g.count; i++) out.push({ key: `${g.key}-${i}`, group: g });
        });
        return out;
    }, [effectiveGroups]);
    const totalLabels = printLabels.length;

    const previewGroup = effectiveGroups.find(g => g.key === previewKey) || effectiveGroups[0] || null;
    const previewEan = previewGroup ? buildBatchEAN13(batchNo, previewGroup.gs1Code) : buildBatchEAN13(batchNo, '001');
    const batchCode = batchToUniqueCode(batchNo);
    const first12Digits = `${GS1_SL_PREFIX}${batchCode}${(previewGroup?.gs1Code || '001').padStart(3, '0')}`;
    const checkDigit = calculateEAN13CheckDigit(first12Digits);

    const handleMfgDateChange = (date) => {
        if (!date) return;
        setMfgDate(date.format('DD/MM/YYYY'));
        setExpDate(date.add(2, 'month').format('DD/MM/YYYY'));
    };

    const handleGenerateNewBatch = () => {
        const nb = generateStandardBatchNo(Math.floor(1 + Math.random() * 99));
        setBatchNo(nb);
        message.success(`Generated Batch: ${nb}`);
    };

    const selectedBill = bills.find(b => String(b.LOCAL_ID) === String(selectedBillId) || String(b.BILL_ID) === String(selectedBillId)) || null;

    // ─── Barcode History Audit Logger ─────────────────────────────
    const recordBarcodeHistory = (wasAddedAsSale, invNo) => {
        const historyRecord = {
            id: `HIST-${Date.now()}`,
            BATCH_NO: batchNo,
            INVOICE_NO: invNo || (mode === 'manual' ? 'MANUAL_PRINT' : (selectedBill?.INVOICE_NO || 'BILL_PRINT')),
            WAS_ADDED_AS_SALE: wasAddedAsSale,
            TOTAL_STICKERS: totalLabels,
            PRINTED_DATE: dayjs().format('YYYY-MM-DD HH:mm:ss'),
            BRAND_NAME: brandName,
            ITEMS: effectiveGroups.map(g => ({
                itemName: g.itemName,
                bagWeight: g.bagWeight,
                count: g.count,
                unitPrice: getPrice(g),
                gs1Code: g.gs1Code,
                ean13: buildBatchEAN13(batchNo, g.gs1Code)
            }))
        };

        try {
            const raw = localStorage.getItem('printed_barcode_history');
            const list = raw ? JSON.parse(raw) : [];
            const updated = [historyRecord, ...list];
            localStorage.setItem('printed_barcode_history', JSON.stringify(updated));
            setPrintedHistory(updated);
        } catch (e) {
            console.error('Error saving barcode history:', e);
        }
    };

    // ─── Print Action Handler ──────────────────────────────────────
    const handleTriggerPrint = () => {
        if (effectiveGroups.length === 0) {
            message.warning('No items configured for printing');
            return;
        }
        if (mode === 'manual') {
            setConfirmModalOpen(true);
        } else {
            recordBarcodeHistory(false, selectedBill?.INVOICE_NO);
            window.print();
        }
    };

    const handleSaveManualAsSaleAndPrint = async () => {
        setConfirmModalOpen(false);
        const genInvoiceNo = `INV-M${Date.now().toString().slice(-6)}`;
        const totalAmount = effectiveGroups.reduce((s, g) => s + (g.count * (getPrice(g) || 0)), 0);

        try {
            const payload = {
                INVOICE_NO: genInvoiceNo,
                BATCH_NO: batchNo,
                CUSTOMER_NAME: 'Walk-in Customer (Manual Print)',
                TOTAL_AMOUNT: totalAmount,
                NET_AMOUNT: totalAmount,
                FINAL_AMOUNT: totalAmount,
                DATE: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                PAYMENT_METHOD: 'cash',
                IS_SETTLED: 1,
                ITEMS: effectiveGroups.map(g => ({
                    ITEM_NAME: g.itemName,
                    BAG_WEIGHT: g.bagWeight,
                    BAG_COUNT: g.count,
                    UNIT_PRICE: getPrice(g) || 0,
                    GS1_CODE: g.gs1Code
                }))
            };

            await axios.post('/api/mill/sales/add', payload, { withCredentials: true }).catch(() => {});
            message.success(`Recorded Sales Bill #${genInvoiceNo} in system!`);
            recordBarcodeHistory(true, genInvoiceNo);
        } catch (e) {
            console.error('Failed to save manual sales bill', e);
            recordBarcodeHistory(false, genInvoiceNo);
        } finally {
            window.print();
        }
    };

    const handleJustPrint = () => {
        setConfirmModalOpen(false);
        recordBarcodeHistory(false, 'MANUAL_PRINT');
        window.print();
    };

    const printCss = printLayout === 'thermal60x40'
        ? `
            @media print {
                @page {
                    size: 60mm 40mm !important;
                    margin: 0mm !important;
                }
                html, body {
                    width: 60mm !important;
                    height: 40mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                    color: #000000 !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                body * {
                    visibility: hidden !important;
                }
                .print-area, .print-area * {
                    visibility: visible !important;
                }
                .print-area {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 60mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .print-labels-container {
                    display: block !important;
                    width: 60mm !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .print-label-item {
                    width: 60mm !important;
                    height: 40mm !important;
                    min-width: 60mm !important;
                    min-height: 40mm !important;
                    max-width: 60mm !important;
                    max-height: 40mm !important;
                    box-sizing: border-box !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    overflow: hidden !important;
                    page-break-after: always !important;
                    break-after: page !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                }
                .print-label-item:last-child {
                    page-break-after: avoid !important;
                    break-after: avoid !important;
                }
            }
        `
        : `
            @media print {
                @page {
                    size: A4 portrait !important;
                    margin: 5mm !important;
                }
                html, body {
                    background: white !important;
                    color: black !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                    height: auto !important;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                body * {
                    visibility: hidden !important;
                }
                .print-area, .print-area * {
                    visibility: visible !important;
                }
                .print-area {
                    position: absolute !important;
                    left: 0 !important;
                    top: 0 !important;
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                .print-labels-container {
                    display: grid !important;
                    grid-template-columns: repeat(${printLayout === 'a4-2x4' ? 2 : 3}, 60mm) !important;
                    justify-content: center !important;
                    gap: 4mm !important;
                }
                .print-label-item {
                    width: 60mm !important;
                    height: 40mm !important;
                    box-sizing: border-box !important;
                    overflow: hidden !important;
                    break-inside: avoid !important;
                    page-break-inside: avoid !important;
                }
            }
        `;

    const groupColumns = [
        { title: '#', width: 36, render: (_, __, i) => <span className="text-slate-400 font-semibold">{i + 1}</span> },
        {
            title: 'Product', dataIndex: 'itemName',
            render: v => <strong className="text-slate-900 dark:text-slate-100">{v}</strong>
        },
        {
            title: 'Size', width: 75, align: 'center',
            render: (_, g) => <Tag color="blue" className="m-0 font-bold">{g.bagWeight} kg</Tag>
        },
        {
            title: 'Stickers Count', width: 110, align: 'center',
            render: (_, g) => (
                <InputNumber
                    size="small"
                    min={1}
                    max={500}
                    value={g.count}
                    onChange={v => setGroupCount(g.key, v)}
                    style={{ width: '100%' }}
                />
            )
        },
        {
            title: 'Price (Rs.)', width: 125,
            render: (_, g) => (
                <InputNumber
                    size="small"
                    min={0}
                    step={0.5}
                    disabled={leavePriceEmpty}
                    value={getPrice(g)}
                    placeholder={leavePriceEmpty ? '________ (pen)' : '0.00'}
                    onChange={v => setGroupPrice(g.key, v)}
                    style={{ width: '100%' }}
                />
            )
        },
        {
            title: 'Barcode', width: 140,
            render: (_, g) => (
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300 font-bold">
                    {buildBatchEAN13(batchNo, g.gs1Code)}
                </span>
            )
        },
        {
            title: '', width: 80, align: 'center',
            render: (_, g) => (
                <div className="flex items-center justify-center gap-1">
                    <Button
                        size="small"
                        type={previewKey === g.key ? 'primary' : 'default'}
                        icon={<EyeOutlined />}
                        onClick={() => setPreviewKey(g.key)}
                        title="Preview Sticker"
                    />
                    {mode === 'manual' && (
                        <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handleRemoveManualRow(g.key)}
                            title="Remove Product"
                        />
                    )}
                </div>
            )
        },
    ];

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12 p-2 sm:p-4">
            <style>{printCss}</style>

            {/* ── Print-Only Bulk Layout ───────────────────────── */}
            <div className="hidden print:block print:w-full print:m-0 print:p-0">
                <div className="print-area print-labels-container">
                    {printLabels.map(({ key, group }) => (
                        <div key={key} className="print-label-item">
                            <MiniBagLabel
                                brandName={brandName}
                                productName={group.itemName}
                                weight={`${group.bagWeight} kg`}
                                mrp={getPrice(group)}
                                leavePriceEmpty={leavePriceEmpty}
                                batchNo={batchNo}
                                packedBy={packedBy}
                                mfgDate={mfgDate}
                                expDate={expDate}
                                productCode={group.gs1Code}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Main Editor & Preview Grid ────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
                {/* Left Column */}
                <div className="lg:col-span-7 space-y-6">
                    {/* Section 1: Bill selection */}
                    <Card
                        title={<span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><ShoppingCartOutlined className="text-blue-600 dark:text-blue-400" /> Select Bill or Product</span>}
                        className="shadow-sm"
                    >
                        <Select
                            showSearch
                            size="large"
                            value={selectedBillId}
                            onChange={handleBillSelect}
                            optionFilterProp="label"
                            placeholder={dataLoaded ? 'Search or choose a bill…' : 'Loading bills…'}
                            loading={!dataLoaded}
                            className="w-full"
                        >
                            <Option value="manual" label="Manual / Custom Print — Multi Product Builder">
                                🎯 Manual / Custom Print — Add Custom Products
                            </Option>
                            <Select.OptGroup label={`Bills & Batch Numbers (${bills.length})`}>
                                {bills.map(b => {
                                    const totalBags = getBillTotalBags(b);
                                    return (
                                        <Option
                                            key={b.LOCAL_ID || b.BILL_ID || b.ID}
                                            value={b.LOCAL_ID || b.BILL_ID || b.ID}
                                            label={`${b.INVOICE_NO || b.BILL_ID || ''} · ${b.BATCH_NO || ''} · ${b.CUSTOMER_NAME || 'Walk-in'} · ${b.DATE || ''}`}
                                        >
                                            <div className="flex justify-between gap-2">
                                                <span className="font-semibold">{b.INVOICE_NO || b.BILL_ID}</span>
                                                <span className="font-mono text-xs text-blue-600 dark:text-blue-400 font-bold">{b.BATCH_NO || '—'}</span>
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                {b.CUSTOMER_NAME || 'Walk-in Customer'} · {b.DATE || ''} · {totalBags} bags
                                            </div>
                                        </Option>
                                    );
                                })}
                            </Select.OptGroup>
                        </Select>

                        {mode === 'bill' && selectedBill && (
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Tag color="geekblue" className="font-bold"><FileTextOutlined /> Bill # {selectedBill.INVOICE_NO || selectedBill.BILL_ID}</Tag>
                                <Tag color="purple" className="font-mono font-bold"><ShoppingCartOutlined /> Batch: {selectedBill.BATCH_NO || '—'}</Tag>
                                <Tag>{selectedBill.CUSTOMER_NAME || 'Walk-in Customer'}</Tag>
                                <Tag>{selectedBill.DATE || ''}</Tag>
                            </div>
                        )}
                        {mode === 'bill' && !selectedBill && (
                            <Empty
                                className="mt-4"
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={<span className="text-xs text-slate-400">Pick a bill above — products, bag sizes & sticker counts auto-load</span>}
                            />
                        )}
                    </Card>

                    {/* Section 2: Label details */}
                    <Card
                        title={<span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><CalendarOutlined className="text-blue-600 dark:text-blue-400" /> Label Details</span>}
                        className="shadow-sm"
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Brand Name</label>
                                <Input value={brandName} onChange={e => setBrandName(e.target.value.toUpperCase())} maxLength={40} />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Packed By / Producer</label>
                                <Input value={packedBy} onChange={e => setPackedBy(e.target.value)} placeholder="Chamika Rice Mills, Sooriyawewa, SL" />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">MFG Date</label>
                                <DatePicker format="DD/MM/YYYY" className="w-full" value={dayjs(mfgDate, 'DD/MM/YYYY')} onChange={handleMfgDateChange} />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">EXP Date (Auto 12 Months)</label>
                                <DatePicker format="DD/MM/YYYY" className="w-full" value={dayjs(expDate, 'DD/MM/YYYY')} onChange={d => d && setExpDate(d.format('DD/MM/YYYY'))} />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Batch Number</label>
                                <div className="flex gap-2">
                                    <Input
                                        value={batchNo}
                                        disabled={mode === 'bill'}
                                        onChange={e => setBatchNo(e.target.value)}
                                        className="font-mono uppercase font-bold"
                                    />
                                    {mode === 'manual' && (
                                        <Button type="dashed" icon={<PlusOutlined />} onClick={handleGenerateNewBatch} title="Generate new batch">New</Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">Price Mode</div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">Leave blank to write the price with a pen on the sticker</div>
                            </div>
                            <Checkbox checked={leavePriceEmpty} onChange={e => setLeavePriceEmpty(e.target.checked)} className="font-semibold text-slate-700 dark:text-slate-200">
                                Blank all prices (<code className="font-mono">__________</code>)
                            </Checkbox>
                        </div>
                    </Card>

                    {/* Section 3: Products → stickers (Multi-product Manual Builder) */}
                    <Card
                        title={
                            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                                <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><TableOutlined className="text-blue-600 dark:text-blue-400" /> Products & Bag Sizes — Sticker Count</span>
                                {effectiveGroups.length > 0 && (
                                    <Tag color="green" className="font-bold text-xs">
                                        {totalLabels} sticker{totalLabels !== 1 ? 's' : ''} total
                                    </Tag>
                                )}
                            </div>
                        }
                        className="shadow-sm"
                    >
                        {mode === 'manual' && (
                            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-800 mb-4">
                                <div className="text-xs font-bold text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-1.5">
                                    <PlusOutlined /> Add Custom Product Row to Print List
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Product</label>
                                        <Select
                                            showSearch
                                            size="medium"
                                            placeholder="Choose product"
                                            value={manualInput.itemId}
                                            onChange={handleManualItemSelect}
                                            optionFilterProp="label"
                                            className="w-full"
                                        >
                                            {outputItems.map(item => {
                                                const vars = Array.isArray(item.VARIATIONS) ? item.VARIATIONS : [];
                                                const name = String(item.NAME || item.name || item.ITEM_NAME || 'Product').toUpperCase();
                                                return (
                                                    <Option key={item.ITEM_ID || item.id} value={item.ITEM_ID || item.id} label={`${name}`}>
                                                        🌾 {name} {vars.length ? `(${vars.map(v => `${v.WEIGHT_KG}kg`).join('/')})` : `(${item.BAG_WEIGHT || 5}kg)`}
                                                    </Option>
                                                );
                                            })}
                                        </Select>
                                    </div>
                                    {manualInput.variations.length > 0 && (
                                        <div>
                                            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Weight / Size</label>
                                            <Select size="medium" value={manualInput.varId} onChange={handleManualVarSelect} className="w-full">
                                                {manualInput.variations.map(v => (
                                                    <Option key={v.VARIATION_ID} value={v.VARIATION_ID}>
                                                        {Number(v.WEIGHT_KG)} kg — Code: {v.GS1_CODE}
                                                    </Option>
                                                ))}
                                            </Select>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Stickers Count</label>
                                        <InputNumber min={1} max={500} value={manualInput.count} onChange={v => patchManualInput({ count: v || 1 })} className="w-full" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Price (Rs.)</label>
                                        <InputNumber min={0} step={0.5} value={manualInput.unitPrice} disabled={leavePriceEmpty} onChange={v => patchManualInput({ unitPrice: v ?? null })} className="w-full" placeholder="0.00" />
                                    </div>
                                </div>
                                <div className="mt-3 flex justify-end">
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        onClick={handleAddManualRow}
                                        className="!bg-blue-600 font-bold"
                                    >
                                        Add Product to Print List
                                    </Button>
                                </div>
                            </div>
                        )}

                        {effectiveGroups.length === 0 ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={mode === 'manual'
                                    ? 'Add products above to build your custom sticker print list'
                                    : 'Select a bill to auto-load product/bag-size groups'}
                            />
                        ) : (
                            <>
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {effectiveGroups.map(g => (
                                        <Tag key={g.key} color={previewKey === g.key ? 'blue' : 'default'} className="font-bold cursor-pointer select-none"
                                            onClick={() => setPreviewKey(g.key)}>
                                            {g.itemName.split(' ').slice(0, 2).join(' ')} · {g.bagWeight}kg × {g.count}
                                        </Tag>
                                    ))}
                                </div>
                                <Table
                                    dataSource={effectiveGroups}
                                    columns={groupColumns}
                                    rowKey="key"
                                    pagination={false}
                                    size="small"
                                    className="items-table w-full"
                                />
                            </>
                        )}
                    </Card>
                </div>

                {/* Right: Print Setup + Live Preview */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Print Setup Card */}
                    <Card
                        title={
                            <div className="flex justify-between items-center w-full">
                                <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                    <PrinterOutlined className="text-blue-600 dark:text-blue-400" /> Print Setup
                                </span>
                                <Button
                                    size="small"
                                    icon={<HistoryOutlined />}
                                    onClick={() => setHistoryModalOpen(true)}
                                >
                                    Audit History ({printedHistory.length})
                                </Button>
                            </div>
                        }
                        className="shadow-sm"
                    >
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Sticker / Sheet Layout</label>
                                <Select value={printLayout} onChange={setPrintLayout} className="w-full" size="large">
                                    <Option value="thermal60x40">60×40mm Thermal Roll (1 per sticker)</Option>
                                    <Option value="a4-2x4">A4 Sticker Sheet (2×4 = 8 labels)</Option>
                                    <Option value="a4-3x4">A4 Sticker Sheet (3×4 = 12 labels)</Option>
                                </Select>
                            </div>
                            <Button
                                type="primary"
                                size="large"
                                icon={<PrinterOutlined />}
                                onClick={handleTriggerPrint}
                                disabled={effectiveGroups.length === 0}
                                className="!bg-blue-600 font-bold shadow-md w-full h-12 text-base"
                            >
                                Print All {totalLabels} Label{totalLabels !== 1 ? 's' : ''} Now
                            </Button>
                        </div>
                    </Card>

                    {/* Live Sticker Preview Card */}
                    <Card
                        title={
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2"><EyeOutlined className="text-blue-600 dark:text-blue-400" /> Live Sticker Preview (60×40mm)</span>
                                <Badge status="processing" text="LIVE AUTO" className="text-xs text-slate-500 dark:text-slate-400" />
                            </div>
                        }
                        className="shadow-sm"
                    >
                        {previewGroup ? (
                            <>
                                <div className="flex items-center justify-center bg-slate-100 dark:bg-slate-800/90 rounded-xl border border-slate-200 dark:border-slate-700 p-4 overflow-hidden">
                                    <div style={{ width: 340, height: 227, overflow: 'hidden' }}>
                                        <div style={{ transform: 'scale(1.5)', transformOrigin: 'top left', width: '60mm', height: '40mm' }}>
                                            <MiniBagLabel
                                                brandName={brandName}
                                                productName={previewGroup.itemName}
                                                weight={`${previewGroup.bagWeight} kg`}
                                                mrp={getPrice(previewGroup)}
                                                leavePriceEmpty={leavePriceEmpty}
                                                batchNo={batchNo}
                                                packedBy={packedBy}
                                                mfgDate={mfgDate}
                                                expDate={expDate}
                                                productCode={previewGroup.gs1Code}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <Tag color="blue" className="font-bold">{previewGroup.bagWeight} kg</Tag>
                                    <Tag color="orange" className="font-bold">{previewGroup.count} sticker{previewGroup.count > 1 ? 's' : ''}</Tag>
                                    <Tag color="geekblue" className="font-mono font-bold">{previewEan}</Tag>
                                    {getPrice(previewGroup) === null && <Tag color="gold">Price blank (pen)</Tag>}
                                </div>

                                <div className="mt-3 p-3 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 text-xs space-y-2">
                                    <div className="font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                                        <InfoCircleOutlined /> EAN-13 Barcode Structure
                                    </div>
                                    <div className="font-mono text-center text-sm font-black bg-white dark:bg-slate-900 py-1.5 px-3 rounded border border-blue-300 dark:border-blue-700 tracking-widest text-slate-900 dark:text-slate-100">
                                        <span className="text-emerald-600 dark:text-emerald-400">[ {GS1_SL_PREFIX} ]</span>
                                        <span className="text-blue-600 dark:text-blue-400"> [ {batchCode} ]</span>
                                        <span className="text-purple-600 dark:text-purple-400"> [ {(previewGroup?.gs1Code || '001').padStart(3, '0')} ]</span>
                                        <span className="text-rose-600 dark:text-rose-400"> [ {checkDigit} ]</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-1 text-[10.5px] text-slate-600 dark:text-slate-300">
                                        <div><span className="font-bold text-emerald-600 dark:text-emerald-400">479</span>: Prefix</div>
                                        <div><span className="font-bold text-blue-600 dark:text-blue-400">{batchCode}</span>: Batch Code</div>
                                        <div><span className="font-bold text-purple-600 dark:text-purple-400">{previewGroup?.gs1Code || '001'}</span>: Item Code</div>
                                        <div><span className="font-bold text-rose-600 dark:text-rose-400">{checkDigit}</span>: Check Digit</div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Select a bill to see the live 60×40mm sticker preview" />
                        )}
                    </Card>
                </div>
            </div>

            {/* ── Confirm Manual Save as Sale Modal ────────────────── */}
            <Modal
                title={<span className="font-bold text-base flex items-center gap-2"><ShoppingCartOutlined className="text-emerald-600" /> Record Manual Print as Sales Bill?</span>}
                open={confirmModalOpen}
                onCancel={() => setConfirmModalOpen(false)}
                width={620}
                footer={
                    <div className="flex items-center justify-end gap-2 pt-2">
                        <Button key="cancel" onClick={() => setConfirmModalOpen(false)}>Cancel</Button>
                        <Button key="justPrint" onClick={handleJustPrint}>No, Just Print Stickers</Button>
                        <Button key="saveAndPrint" type="primary" icon={<CheckCircleOutlined />} onClick={handleSaveManualAsSaleAndPrint} className="!bg-emerald-600 font-bold">
                            Yes, Save as Sales Bill & Print
                        </Button>
                    </div>
                }
            >
                <div className="space-y-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                    <p>You are printing <strong className="text-blue-600">{totalLabels} sticker(s)</strong> for custom products (Batch: <code className="font-mono font-bold text-purple-600">{batchNo}</code>).</p>
                    <p>Would you like to record this batch as a new <strong>Sales Bill</strong> in your system?</p>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border text-xs space-y-1">
                        <div>• <strong>Save as Sales Bill</strong>: Records invoice & sales numbers into sales reports.</div>
                        <div>• <strong>Barcode History</strong>: Always logged into history for audit tracking regardless of choice.</div>
                    </div>
                </div>
            </Modal>

            {/* ── Printed Barcode History Audit Modal ─────────────── */}
            <Modal
                title={<span className="font-bold text-base flex items-center gap-2"><HistoryOutlined className="text-blue-600" /> Printed Barcode Sticker Audit History</span>}
                open={historyModalOpen}
                onCancel={() => setHistoryModalOpen(false)}
                footer={[<Button key="close" onClick={() => setHistoryModalOpen(false)}>Close</Button>]}
                width={750}
            >
                <Table
                    dataSource={printedHistory}
                    rowKey="id"
                    pagination={{ pageSize: 5 }}
                    size="small"
                    columns={[
                        { title: 'Date', dataIndex: 'PRINTED_DATE', width: 140, render: d => <span className="text-xs">{d}</span> },
                        { title: 'Batch No', dataIndex: 'BATCH_NO', width: 130, render: b => <Tag color="purple" className="font-mono font-bold">{b}</Tag> },
                        { title: 'Invoice Ref', dataIndex: 'INVOICE_NO', render: i => <span className="font-mono text-blue-600 font-bold">{i}</span> },
                        { title: 'Stickers', dataIndex: 'TOTAL_STICKERS', align: 'center', width: 80, render: n => <Tag color="orange" className="font-bold">{n}</Tag> },
                        { title: 'Type', dataIndex: 'WAS_ADDED_AS_SALE', width: 120, render: s => s ? <Tag color="green">Sales Bill</Tag> : <Tag color="default">Sticker Print Only</Tag> },
                    ]}
                />
            </Modal>
        </div>
    );
}
