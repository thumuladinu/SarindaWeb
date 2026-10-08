// Shared mill actions used by the Simple screens.
// They write exactly the same local records as the classic screens (sales_bills, dispatch_notes,
// settlement payload), so sync, reports and printing see no difference.
import dayjs from 'dayjs';
import db, { seedDefaultOfflineData } from './db';
import syncService from './syncService';
import printService from './printService';
import { FINISHED_ITEMS } from '../utils/constants';
import { getTerminalDeviceCode, getCurrentUserName } from '../utils/terminalHelper';

export const BAG_SIZES = [5, 10, 25];
export const TYPES = ['P', 'N'];

export const emptyRows = () => ({
    P: { 5: { qty: 0, price: 0 }, 10: { qty: 0, price: 0 }, 25: { qty: 0, price: 0 } },
    N: { 5: { qty: 0, price: 0 }, 10: { qty: 0, price: 0 }, 25: { qty: 0, price: 0 } }
});

export function parseItems(bill) {
    let items = bill?.ITEMS || bill?.ITEMS_JSON || [];
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch (e) { items = []; }
    }
    return Array.isArray(items) ? items : [];
}

const bagCountOf = (i) => {
    const w = Number(i.BAG_WEIGHT || 0);
    let n = Number(i.BAG_COUNT || 0);
    if (!n && w > 0 && i.QUANTITY) n = Number(i.QUANTITY) / w;
    return n || 0;
};

// Bags per size for one or many bills
export function bagSummary(billsOrItems) {
    const out = { 5: 0, 10: 0, 25: 0, total: 0 };
    const list = Array.isArray(billsOrItems) ? billsOrItems : [billsOrItems];
    list.forEach(entry => {
        const items = entry && (entry.ITEMS || entry.ITEMS_JSON) !== undefined ? parseItems(entry) : (Array.isArray(entry) ? entry : []);
        if (items.length === 0 && entry && Number(entry.TOTAL_BAGS) > 0) out.total += Number(entry.TOTAL_BAGS);
        items.forEach(i => {
            const w = Number(i.BAG_WEIGHT || 0);
            const n = bagCountOf(i);
            if (out[w] !== undefined) out[w] += n;
            out.total += n;
        });
    });
    return out;
}

export const billAmount = (b) => Number(b.FINAL_AMOUNT || b.NET_AMOUNT || b.TOTAL_AMOUNT || 0);
export const isBlankBill = (b) => parseItems(b).length === 0 && billAmount(b) === 0 && !(Number(b.TOTAL_BAGS) > 0);

// pending -> onLorry -> settled
export function billStatus(b) {
    if (Number(b.IS_SETTLED) === 1) return 'settled';
    if (b.DISPATCH_NO || b.DISPATCH_ID) return 'onLorry';
    return 'pending';
}

export const isToday = (d) => !!d && dayjs(d).isSame(dayjs(), 'day');

// Rice varieties that have both real items in the local catalog: [{ base, P, N }]
export async function getVarietyCatalog() {
    await seedDefaultOfflineData();
    const dbItems = await db.items.toArray();
    const map = {};
    FINISHED_ITEMS.forEach(def => {
        const item = dbItems.find(i => i.SYSTEM_CODE === def.SYSTEM_CODE);
        if (!item || Number(item.IS_ACTIVE) === 0) return;
        map[def.BASE] = { ...(map[def.BASE] || { base: def.BASE }), [def.VARIATION]: item };
    });
    return Object.values(map).filter(v => v.P || v.N);
}

export const kgPrice = (item, fallback = 0) => {
    const p = parseFloat(item?.SELLING_PRICE);
    return p > 0 ? p : fallback;
};

// Rows filled with the variety's per-kg price (bag price = kg price x bag weight)
export function rowsForVariety(variety, keep = null) {
    const rows = emptyRows();
    TYPES.forEach(t => BAG_SIZES.forEach(w => {
        rows[t][w] = { qty: keep?.[t]?.[w]?.qty || 0, price: kgPrice(variety?.[t]) * w };
    }));
    return rows;
}

// Turn a bill's items back into rows + its variety
export function rowsFromItems(items, catalog) {
    const rows = emptyRows();
    let base = null;
    items.forEach(i => {
        const def = FINISHED_ITEMS.find(d => d.SYSTEM_CODE === i.SYSTEM_CODE)
            || catalog.flatMap(v => TYPES.map(t => v[t] && String(v[t].ITEM_ID) === String(i.ITEM_ID) ? { BASE: v.base, VARIATION: t } : null)).find(Boolean);
        const w = Number(i.BAG_WEIGHT || 0);
        if (!def || !rows[def.VARIATION]?.[w]) return;
        base = base || def.BASE;
        rows[def.VARIATION][w] = { qty: bagCountOf(i), price: parseFloat(i.UNIT_PRICE || 0) };
    });
    return { base, rows };
}

export const rowsTotal = (rows) => TYPES.reduce((sum, t) => sum + BAG_SIZES.reduce((s, w) => s + (Number(rows[t][w].qty) || 0) * (Number(rows[t][w].price) || 0), 0), 0);
export const rowsBags = (rows) => TYPES.reduce((sum, t) => sum + BAG_SIZES.reduce((s, w) => s + (Number(rows[t][w].qty) || 0), 0), 0);

// Rows -> bill items of real catalog items (same shape as the classic forms)
export function itemsFromRows(rows, variety, label = 'Bill') {
    const items = [];
    TYPES.forEach(t => BAG_SIZES.forEach(w => {
        const qty = Number(rows[t][w].qty) || 0;
        if (qty <= 0) return;
        const item = variety?.[t];
        if (!item) throw new Error(`${label}: no ${t} item for this rice variety`);
        const itemId = parseInt(item.ITEM_ID, 10);
        if (isNaN(itemId)) throw new Error(`${label}: item '${item.NAME}' is not in the catalog. Press Sync and try again.`);
        const price = Number(rows[t][w].price) || 0;
        items.push({
            SYSTEM_CODE: item.SYSTEM_CODE,
            ITEM_ID: itemId,
            ITEM_NAME: item.NAME,
            BAG_WEIGHT: w,
            BAG_COUNT: qty,
            QUANTITY: w * qty,
            UNIT_PRICE: price,
            TOTAL_PRICE: parseFloat((price * qty).toFixed(2))
        });
    }));
    return items;
}

// Customers / vehicles / drivers for pickers (same sources as the classic sale form)
export async function loadSaleRefs() {
    const [custList, vList, sList] = await Promise.all([
        db.customers.toArray().catch(() => []),
        db.vehicles.toArray().catch(() => []),
        db.staff.toArray().catch(() => [])
    ]);
    const customers = (custList || []).filter(c => Number(c.IS_ACTIVE ?? 1) !== 0).map((c, idx) => ({
        id: String(c.CUSTOMER_ID || c.ID || c.id || `CUST-${idx}`),
        name: (c.NAME || c.CUSTOMER_NAME || '').trim(),
        phone: c.PHONE || c.PHONE_NUMBER || c.phone || '',
        address: c.ADDRESS || c.LOCATION || c.address || c.location || ''
    })).filter(c => c.name);

    const vehicleMap = new Map();
    (vList || []).forEach(v => {
        const num = (v.VEHICLE_NO || v.LORRY_NO || v.NUMBER || '').trim();
        if (num && !vehicleMap.has(num.toUpperCase())) vehicleMap.set(num.toUpperCase(), { value: num, driver: v.DRIVER_NAME || '' });
    });
    const driverMap = new Map();
    (sList || []).forEach(s => {
        const name = (s.NAME || '').trim();
        if (name && String(s.ROLE || '').toUpperCase().includes('DRIVER')) driverMap.set(name.toLowerCase(), name);
    });
    (vList || []).forEach(v => { if (v.DRIVER_NAME) driverMap.set(v.DRIVER_NAME.trim().toLowerCase(), v.DRIVER_NAME.trim()); });
    const staff = (sList || []).map(s => (s.NAME || '').trim()).filter(Boolean);

    return { customers, vehicles: Array.from(vehicleMap.values()), drivers: Array.from(driverMap.values()), staff };
}

export const generateBatchNo = () => `B-${dayjs().format('YYYYMMDD')}-${Math.floor(100 + Math.random() * 900)}`;

export async function nextInvoiceNo() {
    const prefix = `MIV-${dayjs().format('YYYYMMDD')}-${getTerminalDeviceCode()}-`;
    let max = 0;
    (await db.sales_bills.toArray()).forEach(b => {
        if (b.INVOICE_NO && b.INVOICE_NO.startsWith(prefix)) {
            const n = parseInt(b.INVOICE_NO.slice(prefix.length), 10);
            if (!isNaN(n) && n > max) max = n;
        }
    });
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export async function nextDispatchNo() {
    const prefix = `MDN-${dayjs().format('YYYYMMDD')}-${getTerminalDeviceCode()}-`;
    let max = 0;
    (await db.dispatch_notes.toArray()).forEach(n => {
        if (n.DISPATCH_NO && n.DISPATCH_NO.startsWith(prefix)) {
            const v = parseInt(n.DISPATCH_NO.slice(prefix.length), 10);
            if (!isNaN(v) && v > max) max = v;
        }
    });
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// ─── Build a sales bill record (used for the preview AND the saved bill, so they always match) ──
export function buildSaleBill({ invoiceNo, customer = null, vehicleNo = '', driverName = '', date = dayjs(), items = [], batchNo = null }) {
    const total = parseFloat(items.reduce((s, i) => s + Number(i.TOTAL_PRICE || 0), 0).toFixed(2));
    const now = dayjs();
    const chosen = dayjs(date || now);
    const fullDate = chosen.hour(now.hour()).minute(now.minute()).second(now.second());
    const terminalCode = getTerminalDeviceCode();
    const userName = getCurrentUserName();

    return {
        INVOICE_NO: invoiceNo,
        BATCH_NO: batchNo || generateBatchNo(),
        VEHICLE_NO: vehicleNo || '',
        LORRY_NO: vehicleNo || '',
        DRIVER_NAME: driverName || '',
        CUSTOMER_ID: customer?.id || null,
        CUSTOMER_NAME: customer?.name || 'Walk-in Customer',
        CUSTOMER_PHONE: customer?.phone || null,
        CUSTOMER_ADDRESS: customer?.address || null,
        DATE: fullDate.toISOString(),
        CREATED_DATE: now.format('YYYY-MM-DD HH:mm:ss'),
        TOTAL_AMOUNT: total,
        PRINTED_SUB_TOTAL: total,
        NET_AMOUNT: total,
        FINAL_AMOUNT: total,
        DISCOUNT: 0,
        IS_SETTLED: 0,
        PAYMENT_METHOD: 'cash',
        DEVICE_ID: terminalCode,
        ADDED_BY: userName,
        CREATED_BY_NAME: userName,
        ITEMS_JSON: items,
        IS_SYNCED: 0
    };
}

// ─── Create a sales bill (Rs 0 blank bill when there are no bags) ─────────
export async function createSaleBill(params) {
    const payload = buildSaleBill({ ...params, invoiceNo: await nextInvoiceNo() });
    const localId = await db.sales_bills.add(payload);
    return { ...payload, LOCAL_ID: localId, ITEMS: payload.ITEMS_JSON };
}

// Exact print HTML (same generator the printer uses)
export const billPrintHtml = (bill) => printService.generateBillHtml({ ...bill, ITEMS: bill.ITEMS || parseItems(bill) });
export const gatePassHtml = (note, bills) => printService.generateDispatchNoteHtml(note, bills);

export function syncSoon() {
    if (syncService.isOnline) syncService.syncAll();
    syncService.updatePendingCount();
}

// Print a bill with the existing bill format. Returns { success, message }
export async function printBill(bill) {
    try {
        const res = await printService.printBill(bill, { forceSilent: printService.isAutoPrintEnabled() });
        return { success: res?.success !== false, message: res?.success === false ? (res.failureReason || 'Printer did not respond') : null };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

export async function printDispatch(note, bills) {
    try {
        const res = await printService.printDispatchNote(note, bills, { forceSilent: printService.isAutoPrintEnabled() });
        return { success: res?.success !== false, message: res?.success === false ? (res.failureReason || 'Printer did not respond') : null };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

// ─── Dispatch note record (preview + save share this) ──
// bagTotals: bags actually loaded on the lorry ({5,10,25}); may include extra bags not on any bill
export function buildDispatch({ dispatchNo, bills, date = dayjs(), lorryNo, driverName, staffName, bagTotals = null }) {
    const fromBills = bagSummary(bills);
    const bags = bagTotals
        ? { 5: Number(bagTotals[5]) || 0, 10: Number(bagTotals[10]) || 0, 25: Number(bagTotals[25]) || 0 }
        : fromBills;
    if (bagTotals) bags.total = bags[5] + bags[10] + bags[25];
    const userName = getCurrentUserName();
    return {
        DISPATCH_NO: dispatchNo,
        BILL_IDS_JSON: bills.map(b => b.BILL_ID).filter(Boolean),
        INVOICE_NOS_JSON: bills.map(b => b.INVOICE_NO).filter(Boolean),
        DATE: dayjs(date).format('YYYY-MM-DD'),
        CREATED_DATE: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        DRIVER_NAME: driverName || 'Main Driver',
        LORRY_NO: lorryNo,
        STAFF_NAME: staffName || 'Officer',
        TOTAL_5KG: bags[5],
        TOTAL_10KG: bags[10],
        TOTAL_25KG: bags[25],
        TOTAL_BAGS: bags.total,
        STATUS: 'PENDING',
        BILLS_COUNT: bills.length,
        DEVICE_ID: getTerminalDeviceCode(),
        ADDED_BY: userName,
        CREATED_BY_NAME: userName,
        NEEDS_PUSH: true,
        IS_SYNCED: 0
    };
}

export async function createDispatch({ bills, date = dayjs(), lorryNo, driverName, staffName, bagTotals = null }) {
    if (!bills || bills.length === 0) throw new Error('Choose at least one bill');
    const taken = bills.find(b => b.DISPATCH_NO);
    if (taken) throw new Error(`Bill ${taken.INVOICE_NO} is already on dispatch ${taken.DISPATCH_NO}`);
    const dispatchNo = await nextDispatchNo();
    const payload = buildDispatch({ dispatchNo, bills, date, lorryNo, driverName, staffName, bagTotals });
    const localId = await db.dispatch_notes.add(payload);
    for (const b of bills) await db.sales_bills.update(b.LOCAL_ID, { DISPATCH_NO: dispatchNo });
    syncSoon();
    return { ...payload, LOCAL_ID: localId };
}

// Bills of a dispatch note (by its invoice list, else by DISPATCH_NO)
export async function billsOfNote(note) {
    const all = await db.sales_bills.toArray();
    let invNos = note.INVOICE_NOS_JSON || note.INVOICE_NOS || [];
    if (typeof invNos === 'string') {
        try { invNos = JSON.parse(invNos); } catch (e) { invNos = invNos.split(','); }
    }
    const list = (Array.isArray(invNos) ? invNos : []).map(s => String(s).trim()).filter(Boolean);
    let bills = list.length > 0 ? all.filter(b => b.INVOICE_NO && list.includes(String(b.INVOICE_NO).trim())) : [];
    if (bills.length === 0 && note.DISPATCH_NO) bills = all.filter(b => b.DISPATCH_NO === note.DISPATCH_NO);
    return bills;
}

async function nextExtraInvoiceNos(count) {
    const prefix = `MIV-${dayjs().format('YYYYMMDD')}-${getTerminalDeviceCode()}-E`;
    const used = new Set((await db.sales_bills.toArray()).map(b => b.INVOICE_NO).filter(Boolean));
    (await db.dispatch_notes.toArray()).forEach(n => (n.SETTLE_PAYLOAD?.EXTRA_BILLS || []).forEach(e => e.INVOICE_NO && used.add(e.INVOICE_NO)));
    let max = 0;
    used.forEach(inv => {
        if (inv.startsWith(prefix)) {
            const n = parseInt(inv.slice(prefix.length), 10);
            if (!isNaN(n) && n > max) max = n;
        }
    });
    return Array.from({ length: count }, (_, i) => `${prefix}${String(max + 1 + i).padStart(4, '0')}`);
}

const formatCheques = (chqs) => (chqs || []).filter(c => c && (c.CHEQUE_NUMBER || c.AMOUNT)).map(c => ({
    ...c,
    DUE_DATE: c.DUE_DATE ? (typeof c.DUE_DATE.format === 'function' ? c.DUE_DATE.format('YYYY-MM-DD') : String(c.DUE_DATE).slice(0, 10)) : null
}));

// ─── Save a lorry settlement (same payload as the classic Settle Dispatch) ──
// billEntries: [{ bill, variety, rows, paymentMethod, remark, cheques }]
// extraEntries: [{ variety, rows, paymentMethod, remark, cheques }]
export async function saveDispatchSettlement(note, billEntries, extraEntries = []) {
    const formattedBills = [];
    const localUpdates = [];
    for (const e of billEntries) {
        const items = itemsFromRows(e.rows, e.variety, `Bill ${e.bill.INVOICE_NO}`);
        const finalAmount = rowsTotal(e.rows) || billAmount(e.bill);
        formattedBills.push({
            INVOICE_NO: e.bill.INVOICE_NO,
            BILL_ID: e.bill.BILL_ID || undefined,
            FINAL_AMOUNT: finalAmount,
            PAYMENT_METHOD: e.paymentMethod || 'cash',
            REMARK: e.remark || '',
            CHEQUES: formatCheques(e.cheques),
            ITEMS: items
        });
        localUpdates.push({ localId: e.bill.LOCAL_ID, changes: {
            FINAL_AMOUNT: finalAmount,
            PAYMENT_METHOD: e.paymentMethod || 'cash',
            REMARK: e.remark || '',
            CHEQUES: formatCheques(e.cheques),
            ...(items.length > 0 ? { ITEMS_JSON: items } : {}),
            IS_SETTLED: 1
        } });
    }
    const builtExtras = extraEntries
        .map((x, idx) => ({ x, items: itemsFromRows(x.rows, x.variety, `Extra bill ${idx + 1}`) }))
        .filter(e => e.items.length > 0);
    const extraNos = await nextExtraInvoiceNos(builtExtras.length);
    const formattedExtra = builtExtras.map((e, i) => ({
        INVOICE_NO: extraNos[i],
        FINAL_AMOUNT: rowsTotal(e.x.rows),
        PAYMENT_METHOD: e.x.paymentMethod || 'cash',
        REMARK: e.x.remark || '',
        CHEQUES: formatCheques(e.x.cheques),
        ITEMS: e.items
    }));

    for (const u of localUpdates) if (u.localId) await db.sales_bills.update(u.localId, u.changes);
    let noteLocal = note.LOCAL_ID ? await db.dispatch_notes.get(note.LOCAL_ID) : null;
    if (!noteLocal && note.DISPATCH_NO) noteLocal = await db.dispatch_notes.where('DISPATCH_NO').equals(note.DISPATCH_NO).first();
    if (!noteLocal) throw new Error('Dispatch note not found on this PC. Press Sync and try again.');

    await db.dispatch_notes.update(noteLocal.LOCAL_ID, {
        STATUS: 'SETTLED',
        SETTLED_BILLS_JSON: formattedBills,
        EXTRA_BILLS_JSON: formattedExtra,
        SETTLE_PENDING: true,
        SETTLE_PAYLOAD: { BILLS: formattedBills, EXTRA_BILLS: formattedExtra },
        SYNC_ERROR: null,
        IS_SYNCED: 0
    });
    syncSoon();
    const cash = [...formattedBills, ...formattedExtra].filter(b => b.PAYMENT_METHOD !== 'cheque').reduce((s, b) => s + Number(b.FINAL_AMOUNT || 0), 0);
    const cheque = [...formattedBills, ...formattedExtra].filter(b => b.PAYMENT_METHOD === 'cheque').reduce((s, b) => s + Number(b.FINAL_AMOUNT || 0), 0);
    return { cash, cheque, bills: formattedBills.length, extras: formattedExtra.length };
}

// Remember small choices between bills (variety, vehicle, driver...)
export const memory = {
    get(key, fallback = null) {
        try { const v = localStorage.getItem(`simple_${key}`); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(`simple_${key}`, JSON.stringify(value)); } catch (e) { /* ignore */ }
    }
};

export const money = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
