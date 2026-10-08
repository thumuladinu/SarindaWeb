// Shared helpers for mill sales / dispatch routes.
// - withTransaction: all-or-nothing writes (a failed request leaves no half-saved bill / stock)
// - resolveItemIdStrict: exact item match only (never guesses a "first item")
// - SL time: server clock is UTC, mill records are stored in Sri Lankan wall time
//   (same as the desktop app sends), so every server-side stamp goes through slNow().
const util = require('util');
const { toSLMySQLDateTime } = require('./dateTimeUtils');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const SL_WALL = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/;

class MillError extends Error {
    // permanent: retrying the same request will never succeed (client should stop + show it)
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

const slNow = () => toSLMySQLDateTime(new Date());

// Client timestamp -> SL wall time string. Plain "YYYY-MM-DD HH:mm:ss" is already SL (desktop);
// ISO / Date values are converted. Invalid -> fallback (default: now).
function toSLDateTime(input, fallback = slNow()) {
    if (!input) return fallback;
    if (typeof input === 'string' && SL_WALL.test(input.trim())) return input.trim();
    return toSLMySQLDateTime(input) || fallback;
}

// Business date (DATE column). Keep "YYYY-MM-DD" as-is, convert anything else to the SL date.
function toSLDate(input) {
    if (typeof input === 'string' && DATE_ONLY.test(input.trim())) return input.trim();
    const sl = toSLDateTime(input, null);
    return sl ? sl.slice(0, 10) : slNow().slice(0, 10);
}

const slDateCode = () => slNow().slice(0, 10).replace(/-/g, '');

async function withTransaction(pool, fn) {
    const conn = await util.promisify(pool.getConnection).call(pool);
    const q = util.promisify(conn.query).bind(conn);
    try {
        await q('START TRANSACTION');
        const result = await fn(q);
        await q('COMMIT');
        return result;
    } catch (err) {
        try { await q('ROLLBACK'); } catch (e) { /* connection already broken */ }
        throw err;
    } finally {
        conn.release();
    }
}

// Exact item lookup. Numeric IDs must exist; codes / system codes / GS1 / exact name next.
async function resolveItemIdStrict(q, { itemId, systemCode, code, gs1Code, name } = {}) {
    const numeric = Number(itemId);
    if (Number.isInteger(numeric) && numeric > 0 && String(numeric) === String(itemId).trim()) {
        const rows = await q('SELECT ITEM_ID FROM mill_items WHERE ITEM_ID = ? LIMIT 1', [numeric]);
        if (rows.length > 0) return rows[0].ITEM_ID;
    }
    const codes = [systemCode, code, gs1Code, (itemId && isNaN(Number(itemId))) ? itemId : null]
        .map(c => (c == null ? '' : String(c).trim()))
        .filter(Boolean);
    for (const c of codes) {
        const rows = await q('SELECT ITEM_ID FROM mill_items WHERE SYSTEM_CODE = ? OR CODE = ? OR GS1_CODE = ? LIMIT 1', [c, c, c]);
        if (rows.length > 0) return rows[0].ITEM_ID;
    }
    if (name && String(name).trim()) {
        const rows = await q('SELECT ITEM_ID FROM mill_items WHERE NAME = ? LIMIT 2', [String(name).trim()]);
        if (rows.length === 1) return rows[0].ITEM_ID;
    }
    return null;
}

// Resolve every item of a request up front; reject the whole request if any line is unknown.
async function resolveItemsOrThrow(q, items, label = 'item') {
    const resolved = [];
    for (const [idx, item] of (items || []).entries()) {
        const itemId = await resolveItemIdStrict(q, {
            itemId: item.ITEM_ID,
            systemCode: item.SYSTEM_CODE,
            code: item.ITEM_CODE || item.CODE,
            gs1Code: item.GS1_CODE || item.gs1Code,
            name: item.ITEM_NAME || item.itemName
        });
        if (!itemId) {
            throw new MillError(422, `${label} ${idx + 1} (${item.ITEM_NAME || item.SYSTEM_CODE || item.ITEM_ID || 'unknown'}) is not in the mill items list`);
        }
        resolved.push({ ...item, ITEM_ID: itemId });
    }
    return resolved;
}

async function updateInventoryLedger(q, itemId, placeId, quantity, type, refType, refId, date, notes, createdBy) {
    const balanceRows = await q(
        `SELECT COALESCE(SUM(CASE
            WHEN TYPE IN ('IN','ADJ_IN') THEN QUANTITY
            WHEN TYPE IN ('OUT','ADJ_OUT') THEN -QUANTITY
            ELSE 0 END), 0) as balance
        FROM mill_inventory_ledger
        WHERE ITEM_ID = ? AND (PLACE_ID = ? OR (? IS NULL AND PLACE_ID IS NULL)) AND IS_ACTIVE = 1`,
        [itemId, placeId, placeId]
    );
    const current = parseFloat(balanceRows[0]?.balance || 0);
    const qty = parseFloat(quantity) || 0;
    const isIn = type === 'IN' || type === 'ADJ_IN';

    await q('INSERT INTO mill_inventory_ledger SET ?', {
        ITEM_ID: itemId,
        PLACE_ID: placeId || null,
        TYPE: type,
        QUANTITY: qty,
        BALANCE_AFTER: isIn ? current + qty : current - qty,
        REFERENCE_TYPE: refType,
        REFERENCE_ID: refId,
        DATE: date ? toSLDate(date) : slNow().slice(0, 10),
        NOTES: notes || null,
        CREATED_BY: (createdBy && !isNaN(Number(createdBy))) ? Number(createdBy) : null,
        CREATED_DATE: slNow()
    });
    await q(`UPDATE mill_items SET STOCK = COALESCE(STOCK, 0) ${isIn ? '+' : '-'} ? WHERE ITEM_ID = ?`, [qty, itemId]);
}

async function getMillingContext(q) {
    const yieldRows = await q('SELECT * FROM mill_yield_configs LIMIT 1');
    const sysRows = await q('SELECT ITEM_ID, SYSTEM_CODE FROM mill_items WHERE SYSTEM_CODE IS NOT NULL');
    const sys = {};
    sysRows.forEach(r => { sys[r.SYSTEM_CODE] = r.ITEM_ID; });
    return {
        yieldConfig: yieldRows.length > 0 ? yieldRows[0] : null,
        dryWeeId: sys['RAW_WEE_DRY'],
        riceIds: [sys['OUT_HAL'], sys['OUT_SAMBA'], sys['OUT_NADU']].filter(Boolean)
    };
}

// Insert bill lines + stock OUT (and estimated paddy used for rice). Items must already be resolved.
async function insertBillItems(q, ctx, { billId, items, date, invoiceNo, createdBy, isHandwritten, refType, estRefType, notePrefix }) {
    for (const item of items) {
        let estimatedInputUsed = 0, estimatedKudu = 0, estimatedHunsal = 0;
        const halFactor = ctx.yieldConfig ? parseFloat(ctx.yieldConfig.HAL_YIELD) / 100 : 0;
        if (ctx.riceIds.includes(item.ITEM_ID) && halFactor > 0) {
            estimatedInputUsed = parseFloat(item.QUANTITY) / halFactor;
            estimatedKudu = estimatedInputUsed * (parseFloat(ctx.yieldConfig.KUDU_YIELD) / 100);
            estimatedHunsal = estimatedInputUsed * (parseFloat(ctx.yieldConfig.HUNSAL_YIELD) / 100);
            if (ctx.dryWeeId) {
                await updateInventoryLedger(q, ctx.dryWeeId, null, estimatedInputUsed, 'OUT', estRefType, billId, date, `Estimated milled for ${notePrefix} ${invoiceNo}`, createdBy);
            }
        }
        await q('INSERT INTO mill_bill_items SET ?', {
            BILL_ID: billId,
            ITEM_ID: item.ITEM_ID,
            BAG_WEIGHT: item.BAG_WEIGHT || null,
            BAG_COUNT: item.BAG_COUNT || null,
            QUANTITY: item.QUANTITY,
            UNIT_PRICE: item.UNIT_PRICE,
            TOTAL_PRICE: item.TOTAL_PRICE,
            IS_HANDWRITTEN: isHandwritten ? 1 : 0,
            ESTIMATED_INPUT_USED: estimatedInputUsed,
            ESTIMATED_KUDU_GENERATED: estimatedKudu,
            ESTIMATED_HUNSAL_GENERATED: estimatedHunsal
        });
        await updateInventoryLedger(q, item.ITEM_ID, null, item.QUANTITY, 'OUT', refType, billId, date, `${notePrefix} ${invoiceNo}`, createdBy);
    }
}

// Put stock back for active lines matching `where` (used by edit / delete / unlock)
async function revertBillItems(q, ctx, { billId, where, refType, estRefType, notePrefix, invoiceNo, createdBy }) {
    const lines = await q(`SELECT * FROM mill_bill_items WHERE BILL_ID = ? AND ${where}`, [billId]);
    for (const item of lines) {
        await updateInventoryLedger(q, item.ITEM_ID, null, item.QUANTITY, 'IN', refType, billId, slNow(), `${notePrefix} ${invoiceNo}`, createdBy);
        if (item.ESTIMATED_INPUT_USED > 0 && ctx.dryWeeId) {
            await updateInventoryLedger(q, ctx.dryWeeId, null, item.ESTIMATED_INPUT_USED, 'IN', estRefType, billId, slNow(), `${notePrefix} est ${invoiceNo}`, createdBy);
        }
    }
    return lines.length;
}

// MIV-YYYYMMDD-DEVICE-NNNN (SL date), unique per device+day
async function generateInvoiceNo(q, deviceId = 'WEB', suffix = '') {
    const prefix = `MIV-${slDateCode()}-${String(deviceId || 'WEB').trim().toUpperCase()}-${suffix}`;
    const rows = await q('SELECT INVOICE_NO FROM mill_bills WHERE INVOICE_NO LIKE ?', [`${prefix}%`]);
    let max = 0;
    rows.forEach(r => {
        const n = parseInt(String(r.INVOICE_NO).slice(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
    });
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

async function generateDispatchNo(q, deviceId = 'WEB') {
    const prefix = `MDN-${slDateCode()}-${String(deviceId || 'WEB').trim().toUpperCase()}-`;
    const rows = await q('SELECT DISPATCH_NO FROM mill_dispatch_notes WHERE DISPATCH_NO LIKE ?', [`${prefix}%`]);
    let max = 0;
    rows.forEach(r => {
        const n = parseInt(String(r.DISPATCH_NO).slice(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
    });
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

// Find a bill by its permanent code first, server id second. FOR UPDATE inside transactions.
async function findBill(q, { INVOICE_NO, BILL_ID }, lock = true) {
    const suffix = lock ? ' FOR UPDATE' : '';
    if (INVOICE_NO && String(INVOICE_NO).trim()) {
        const rows = await q(`SELECT * FROM mill_bills WHERE INVOICE_NO = ? LIMIT 1${suffix}`, [String(INVOICE_NO).trim()]);
        if (rows.length > 0) return rows[0];
    }
    const id = Number(BILL_ID);
    if (Number.isInteger(id) && id > 0) {
        const rows = await q(`SELECT * FROM mill_bills WHERE BILL_ID = ? LIMIT 1${suffix}`, [id]);
        if (rows.length > 0) return rows[0];
    }
    return null;
}

async function findDispatchNote(q, { DISPATCH_NO, DISPATCH_ID }, lock = true) {
    const suffix = lock ? ' FOR UPDATE' : '';
    if (DISPATCH_NO && String(DISPATCH_NO).trim()) {
        const rows = await q(`SELECT * FROM mill_dispatch_notes WHERE DISPATCH_NO = ? LIMIT 1${suffix}`, [String(DISPATCH_NO).trim()]);
        if (rows.length > 0) return rows[0];
    }
    const id = Number(DISPATCH_ID);
    if (Number.isInteger(id) && id > 0) {
        const rows = await q(`SELECT * FROM mill_dispatch_notes WHERE DISPATCH_ID = ? LIMIT 1${suffix}`, [id]);
        if (rows.length > 0) return rows[0];
    }
    return null;
}

// Uniform error response. permanent=true tells the desktop to stop retrying and show the reason.
function sendError(res, err, logLabel) {
    if (err instanceof MillError) {
        return res.status(err.status).json({ success: false, permanent: err.status !== 409 || !err.extra.retryable, message: err.message, ...err.extra });
    }
    console.error(logLabel, err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
}

module.exports = {
    MillError,
    slNow,
    toSLDateTime,
    toSLDate,
    withTransaction,
    resolveItemIdStrict,
    resolveItemsOrThrow,
    updateInventoryLedger,
    generateInvoiceNo,
    generateDispatchNo,
    findBill,
    findDispatchNote,
    sendError,
    getMillingContext,
    insertBillItems,
    revertBillItems
};
