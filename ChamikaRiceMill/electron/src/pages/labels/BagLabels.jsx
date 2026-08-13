import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Card, Select, Input, InputNumber, DatePicker, Checkbox, Button, message,
    Tag, Badge, Empty, Table, Modal
} from 'antd';
import {
    PrinterOutlined, BarcodeOutlined, PlusOutlined, DeleteOutlined, HistoryOutlined,
    InfoCircleOutlined, WifiOutlined, DisconnectOutlined, CheckCircleOutlined,
    EyeOutlined, ShoppingCartOutlined, FileTextOutlined, CalendarOutlined,
    TableOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import axios from 'axios';
import db from '../../services/db';
import syncService from '../../services/syncService';
import printService from '../../services/printService';
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
    let items = bill?.ITEMS || bill?.ITEMS_JSON || bill?.items || bill?.bill_items || bill?.billItems || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (e) { items = []; }
    }
    if (!Array.isArray(items) && items && typeof items === 'object') {
        items = [items];
    }
    if (!Array.isArray(items) || items.length === 0) return [];

    return items.map((i, index) => {
        const countRaw = i.BAG_COUNT ?? i.BAG_QTY ?? i.QUANTITY ?? i.quantity ?? i.count ?? i.BAGS ?? i.qty ?? 1;
        const count = Math.max(1, Number(countRaw) || 1);
        const weightRaw = i.BAG_WEIGHT ?? i.bagWeight ?? i.WEIGHT ?? i.weight ?? 5;
        const bagWeight = Number(weightRaw) || 5;

        const dbItem = (itemsList || []).find(x =>
            String(x.ITEM_ID) === String(i.ITEM_ID) ||
            (x.SYSTEM_CODE && x.SYSTEM_CODE === i.SYSTEM_CODE) ||
            (x.NAME || x.name) === (i.ITEM_NAME || i.itemName)
        );

        let gs1Code = i.GS1_CODE || i.gs1Code || null;
        if (!gs1Code && dbItem && Array.isArray(dbItem.VARIATIONS)) {
            const v = dbItem.VARIATIONS.find(v => Number(v.WEIGHT_KG) === Number(bagWeight));
            if (v && v.GS1_CODE) gs1Code = v.GS1_CODE;
        }
        if (!gs1Code && dbItem) {
            gs1Code = dbItem.GS1_CODE || dbItem.SYSTEM_CODE;
        }
        if (!gs1Code) gs1Code = '001';

        const itemName = String(i.ITEM_NAME || i.itemName || dbItem?.NAME || dbItem?.name || 'RICE').toUpperCase();

        return {
            key: `${i.ITEM_ID || i.id || itemName}-${bagWeight}-${index}-${Math.random().toString(36).substr(2, 4)}`,
            itemName,
            bagWeight,
            count,
            unitPrice: i.UNIT_PRICE ?? i.unitPrice ?? i.price ?? dbItem?.SELLING_PRICE ?? null,
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
    const [isOnline, setIsOnline] = useState(syncService.isOnline);

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

    // Load history from Dexie DB
    const loadHistory = async () => {
        try {
            const list = await db.barcode_history.orderBy('PRINTED_DATE').reverse().toArray();
            setPrintedHistory(list || []);
        } catch (e) {
            console.error('Error reading barcode history from DB:', e);
        }
    };

    useEffect(() => {
        loadHistory();
        (async () => {
            try {
                const [allBills, allItems] = await Promise.all([
                    db.sales_bills.toArray().catch(() => []),
                    db.items.toArray().catch(() => []),
                ]);
                (allBills || []).sort((a, b) => new Date(b.DATE || b.CREATED_DATE || 0) - new Date(a.DATE || a.CREATED_DATE || 0));
                setBills(allBills || []);
                setItemsList(allItems || []);
            } catch (e) {
                console.error('Error loading offline data for labels:', e);
            } finally {
                setDataLoaded(true);
            }
        })();

        const unsub = syncService.subscribe((event, data) => {
            if (event === 'connectionStatus') setIsOnline(data.online);
        });
        return unsub;
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
                    itemName: String(first.NAME || 'RICE').toUpperCase(),
                    bagWeight: Number(pref.WEIGHT_KG || 5),
                    count: 1,
                    unitPrice: pref.SELLING_PRICE ?? first.SELLING_PRICE ?? null,
                    gs1Code: pref.GS1_CODE || '001',
                };
                setManualInput({
                    itemId: first.ITEM_ID,
                    itemName: String(first.NAME || 'RICE').toUpperCase(),
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
                    itemName: String(first.NAME || 'RICE').toUpperCase(),
                    bagWeight: Number(first.BAG_WEIGHT || 5),
                    count: 1,
                    unitPrice: first.SELLING_PRICE ?? null,
                    gs1Code: first.GS1_CODE || first.SYSTEM_CODE || '001',
                };
                setManualInput({
                    itemId: first.ITEM_ID,
                    itemName: String(first.NAME || 'RICE').toUpperCase(),
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
        if (!id) return;
        const numId = Number(id);
        let bill = (bills || []).find(b =>
            (!isNaN(numId) && numId > 0 && (b.LOCAL_ID === numId || b.BILL_ID === numId)) ||
            String(b.LOCAL_ID) === String(id) ||
            String(b.BILL_ID) === String(id) ||
            String(b.INVOICE_NO) === String(id)
        );

        if (!bill) {
            if (!isNaN(numId) && numId > 0) {
                bill = await db.sales_bills.get(numId).catch(() => null);
            }
            if (!bill) {
                bill = (await db.sales_bills.where('BILL_ID').equals(id).first().catch(() => null))
                    || (await db.sales_bills.where('LOCAL_ID').equals(numId || id).first().catch(() => null))
                    || (await db.sales_bills.where('INVOICE_NO').equals(id).first().catch(() => null));
            }
            if (bill) setBills(prev => [bill, ...prev.filter(b => String(b.LOCAL_ID) !== String(bill.LOCAL_ID))]);
        }

        // If bill found but items array is missing or empty, attempt server fetch if online
        let rawItems = bill?.ITEMS || bill?.ITEMS_JSON || bill?.items || bill?.bill_items;
        if (typeof rawItems === 'string') {
            try { rawItems = JSON.parse(rawItems); } catch (e) { rawItems = []; }
        }

        if ((!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) && syncService.isOnline) {
            try {
                const baseUrl = syncService.apiBase || 'http://localhost:3001';
                const billIdToFetch = bill?.BILL_ID || bill?.LOCAL_ID || id;
                const res = await axios.get(`${baseUrl}/api/mill/sales/${billIdToFetch}`, { timeout: 5000 });
                if (res.data?.success && res.data.result) {
                    bill = res.data.result;
                    if (bill && bill.LOCAL_ID) {
                        await db.sales_bills.update(bill.LOCAL_ID, bill).catch(() => {});
                    }
                }
            } catch (e) {
                console.error('Offline / Server fetch failed for bill details:', e);
            }
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
        const dbItem = itemsList.find(i => String(i.ITEM_ID) === String(val) || i.SYSTEM_CODE === val);
        if (!dbItem) return;
        const vars = Array.isArray(dbItem.VARIATIONS) ? dbItem.VARIATIONS : [];
        if (vars.length > 0) {
            const preferred = vars[0];
            patchManualInput({
                itemId: dbItem.ITEM_ID,
                itemName: String(dbItem.NAME || '').toUpperCase(),
                variations: vars,
                varId: preferred.VARIATION_ID,
                bagWeight: Number(preferred.WEIGHT_KG || 5),
                gs1Code: preferred.GS1_CODE || '001',
                unitPrice: preferred.SELLING_PRICE ?? dbItem.SELLING_PRICE ?? null,
            });
        } else {
            const w = Number(dbItem.BAG_WEIGHT) || 5;
            patchManualInput({
                itemId: dbItem.ITEM_ID,
                itemName: String(dbItem.NAME || '').toUpperCase(),
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
    const recordBarcodeHistory = async (wasAddedAsSale, invNo) => {
        const historyRecord = {
            BATCH_NO: batchNo,
            INVOICE_NO: invNo || (mode === 'manual' ? 'MANUAL_PRINT' : (selectedBill?.INVOICE_NO || 'BILL_PRINT')),
            WAS_ADDED_AS_SALE: wasAddedAsSale ? 1 : 0,
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
            await db.barcode_history.add(historyRecord);
            loadHistory();
        } catch (e) {
            console.error('Error saving barcode history to DB:', e);
        }
    };

    // ─── Print Action Handler ──────────────────────────────────────
    const executePrint = async () => {
        if (printService.isAutoPrintEnabled() && window.electron) {
            const printAreaEl = document.querySelector('.print-area');
            if (printAreaEl) {
                const fullHtml = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <style>
                            @page { size: ${printLayout === 'thermal60x40' ? '60mm 40mm' : 'A4'}; margin: 0; }
                            body { margin: 0; padding: 0; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                            .print-labels-container { display: block; width: 60mm; height: auto; margin: 0; padding: 0; }
                            .print-label-item { width: 60mm; height: 40mm; max-height: 40mm; box-sizing: border-box; margin: 0; padding: 0; overflow: hidden; page-break-after: always; break-after: page; }
                            .print-label-item:last-child { page-break-after: avoid; break-after: avoid; }
                        </style>
                    </head>
                    <body>
                        <div class="print-area print-labels-container">
                            ${printAreaEl.innerHTML}
                        </div>
                    </body>
                    </html>
                `;
                const res = await printService.printHtml(fullHtml, {
                    isLabel: true,
                    forceSilent: true,
                    pageSize: printLayout === 'thermal60x40' ? '60mm 40mm' : 'A4',
                    margin: '0mm'
                });
                if (res && res.success) {
                    message.success(`Auto-printed ${totalLabels} barcode sticker label(s) to ${res.printer || printService.getLabelPrinter() || 'Default Barcode Printer'}`);
                    return;
                }
            }
        }
        window.print();
    };

    const handleTriggerPrint = () => {
        if (effectiveGroups.length === 0) {
            message.warning('No items configured for printing');
            return;
        }
        if (mode === 'manual') {
            setConfirmModalOpen(true);
        } else {
            recordBarcodeHistory(false, selectedBill?.INVOICE_NO);
            executePrint();
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
                CREATED_DATE: dayjs().format('YYYY-MM-DD HH:mm:ss'),
                PAYMENT_METHOD: 'cash',
                IS_SETTLED: 1,
                IS_SYNCED: 0,
                ITEMS: effectiveGroups.map(g => ({
                    ITEM_NAME: g.itemName,
                    BAG_WEIGHT: g.bagWeight,
                    BAG_COUNT: g.count,
                    UNIT_PRICE: getPrice(g) || 0,
                    GS1_CODE: g.gs1Code
                }))
            };

            await db.sales_bills.add(payload);
            message.success(`Recorded Sales Bill #${genInvoiceNo} in offline database!`);
            await recordBarcodeHistory(true, genInvoiceNo);

            if (syncService.isOnline) {
                syncService.syncAll();
            }
        } catch (e) {
            console.error('Failed to save manual sales bill offline', e);
            await recordBarcodeHistory(false, genInvoiceNo);
        } finally {
            executePrint();
        }
    };

    const handleJustPrint = async () => {
        setConfirmModalOpen(false);
        await recordBarcodeHistory(false, 'MANUAL_PRINT');
        executePrint();
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
        <div className="space-y-6 max-w-7xl mx-auto pb-12 p-4">
            <style>{printCss}</style>

            {/* ── Print-Only Bulk Layout ───────────────────────── */}
            <div className="print-only-container hidden print:block print:w-full print:m-0 print:p-0">
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
                                            key={b.LOCAL_ID || b.BILL_ID}
                                            value={b.LOCAL_ID || b.BILL_ID}
                                            label={`${b.INVOICE_NO || b.BILL_ID} · ${b.BATCH_NO || ''} · ${b.CUSTOMER_NAME || 'Walk-in'} · ${b.DATE || ''}`}
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
                                                const name = String(item.NAME || item.ITEM_NAME || 'Product').toUpperCase();
                                                return (
                                                    <Option key={item.ITEM_ID} value={item.ITEM_ID} label={`${name}`}>
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
                    <p>Would you like to record this batch as a new <strong>Sales Bill</strong> in your offline system?</p>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border text-xs space-y-1">
                        <div>• <strong>Save as Sales Bill</strong>: Records invoice & sales numbers into offline DB and syncs online when connected.</div>
                        <div>• <strong>Barcode History</strong>: Always logged into offline audit history regardless of choice.</div>
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
