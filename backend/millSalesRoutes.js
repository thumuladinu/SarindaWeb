const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');
const {
    MillError, toSLDateTime, toSLDate, withTransaction, resolveItemsOrThrow, slNow,
    generateInvoiceNo, findBill, sendError, getMillingContext, insertBillItems, revertBillItems
} = require('./millShared');

router.use(cors());
pool.query = util.promisify(pool.query);

const ensureBillColumns = (async () => {
    try { await pool.query("ALTER TABLE mill_bills ADD COLUMN DEVICE_ID VARCHAR(50) NULL"); } catch (e) {}
    try { await pool.query("ALTER TABLE mill_bills ADD COLUMN CREATED_BY_NAME VARCHAR(100) NULL"); } catch (e) {}
    // Lorry + driver written on the bill (sent by the desktop, previously dropped)
    try { await pool.query("ALTER TABLE mill_bills ADD COLUMN VEHICLE_NO VARCHAR(50) NULL"); } catch (e) {}
    try { await pool.query("ALTER TABLE mill_bills ADD COLUMN DRIVER_NAME VARCHAR(100) NULL"); } catch (e) {}
})();

async function resolveCustomerId(q, { CUSTOMER_CODE, CUSTOMER_ID }) {
    if (CUSTOMER_CODE) {
        const rows = await q('SELECT CUSTOMER_ID FROM mill_customers WHERE CODE = ? LIMIT 1', [CUSTOMER_CODE]);
        if (rows.length > 0) return rows[0].CUSTOMER_ID;
    }
    const numId = Number(CUSTOMER_ID);
    if (Number.isInteger(numId) && numId > 0 && numId <= 2147483647) {
        const rows = await q('SELECT CUSTOMER_ID FROM mill_customers WHERE CUSTOMER_ID = ? LIMIT 1', [numId]);
        if (rows.length > 0) return rows[0].CUSTOMER_ID;
    }
    return null;
}

const parseItems = (raw) => {
    let list = raw;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch (e) { list = []; }
    }
    return Array.isArray(list) ? list : [];
};

// ─── ADD SALE (BILLING) ──────────────────────────────────────
// Idempotent on INVOICE_NO: re-sending the same bill returns the existing one.
// Rs 0 bills (no items) are allowed on purpose (handwritten at delivery, settled later).
router.post('/api/mill/sales/add', async (req, res) => {
    try {
        await ensureBillColumns;
        const body = req.body || {};
        const result = await withTransaction(pool, async (q) => {
            if (body.INVOICE_NO) {
                const existing = await q('SELECT BILL_ID, INVOICE_NO FROM mill_bills WHERE INVOICE_NO = ? LIMIT 1', [body.INVOICE_NO]);
                if (existing.length > 0) {
                    return { billId: existing[0].BILL_ID, invoiceNo: existing[0].INVOICE_NO, existed: true };
                }
            }
            const invoiceNo = body.INVOICE_NO || await generateInvoiceNo(q, body.DEVICE_ID);
            const items = await resolveItemsOrThrow(q, parseItems(body.ITEMS));
            const customerId = await resolveCustomerId(q, body);
            const date = toSLDate(body.DATE);
            const createdById = (body.CREATED_BY && !isNaN(Number(body.CREATED_BY))) ? Number(body.CREATED_BY) : null;

            const billResult = await q('INSERT INTO mill_bills SET ?', {
                INVOICE_NO: invoiceNo,
                BATCH_NO: body.BATCH_NO || null,
                CUSTOMER_ID: customerId,
                TOTAL_AMOUNT: body.TOTAL_AMOUNT || 0,
                DISCOUNT: body.DISCOUNT || 0,
                NET_AMOUNT: body.NET_AMOUNT || 0,
                PRINTED_SUB_TOTAL: body.PRINTED_SUB_TOTAL || body.TOTAL_AMOUNT || 0,
                HANDWRITTEN_SUB_TOTAL: body.HANDWRITTEN_SUB_TOTAL || 0,
                FINAL_AMOUNT: body.FINAL_AMOUNT || body.NET_AMOUNT || body.TOTAL_AMOUNT || 0,
                IS_SETTLED: body.IS_SETTLED !== undefined ? body.IS_SETTLED : 0,
                DATE: date,
                CREATED_DATE: toSLDateTime(body.CREATED_DATE),
                PAYMENT_METHOD: body.PAYMENT_METHOD || 'cash',
                REMARK: body.REMARK || null,
                CREATED_BY: createdById,
                DEVICE_ID: body.DEVICE_ID || 'WEB',
                CREATED_BY_NAME: body.CREATED_BY_NAME || null,
                VEHICLE_NO: body.VEHICLE_NO || body.LORRY_NO || null,
                DRIVER_NAME: body.DRIVER_NAME || null
            });
            const billId = billResult.insertId;
            const ctx = await getMillingContext(q);
            await insertBillItems(q, ctx, {
                billId, items, date, invoiceNo, createdBy: body.CREATED_BY,
                isHandwritten: false, refType: 'sale', estRefType: 'sale_milling_est', notePrefix: 'Sale Invoice'
            });
            return { billId, invoiceNo, existed: false };
        });

        res.json({
            success: true,
            message: result.existed ? 'Invoice already exists in database' : 'Sale recorded successfully',
            invoiceNo: result.invoiceNo,
            billId: result.billId
        });
    } catch (error) {
        sendError(res, error, 'Error adding mill sale:');
    }
});

// ─── SETTLE BILL (HANDWRITTEN) ───────────────────────────────
// Safe to repeat: an already-settled bill is returned unchanged (no duplicate items / stock / cheques).
router.post('/api/mill/sales/settle', async (req, res) => {
    try {
        const body = req.body || {};
        const result = await withTransaction(pool, async (q) => {
            const bill = await findBill(q, body);
            if (!bill) throw new MillError(404, 'Bill not found on server');
            if (!bill.IS_ACTIVE) throw new MillError(409, `Bill ${bill.INVOICE_NO} was deleted`);
            if (bill.IS_SETTLED) return { alreadySettled: true, billId: bill.BILL_ID };

            const hwItems = await resolveItemsOrThrow(q, parseItems(body.ITEMS), 'Handwritten item');
            await q(
                `UPDATE mill_bills SET HANDWRITTEN_SUB_TOTAL = ?, DISCOUNT = ?, FINAL_AMOUNT = ?, PAYMENT_METHOD = ?, REMARK = ?, IS_SETTLED = 1
                 WHERE BILL_ID = ?`,
                [body.HANDWRITTEN_SUB_TOTAL || 0, body.DISCOUNT || 0, body.FINAL_AMOUNT || 0, body.PAYMENT_METHOD || 'cash', body.REMARK || null, bill.BILL_ID]
            );
            if ((body.PAYMENT_METHOD === 'cheque' || body.PAYMENT_METHOD === 'mixed') && Array.isArray(body.CHEQUES)) {
                for (const chq of body.CHEQUES) {
                    await q('INSERT INTO mill_cheques SET ?', {
                        BILL_ID: bill.BILL_ID,
                        CHEQUE_NUMBER: chq.CHEQUE_NUMBER,
                        BANK: chq.BANK || null,
                        DUE_DATE: chq.DUE_DATE,
                        AMOUNT: chq.AMOUNT,
                        STATUS: 'PENDING',
                        CREATED_DATE: slNow()
                    });
                }
            }
            if (hwItems.length > 0) {
                const ctx = await getMillingContext(q);
                await insertBillItems(q, ctx, {
                    billId: bill.BILL_ID, items: hwItems, date: bill.DATE, invoiceNo: bill.INVOICE_NO, createdBy: body.CREATED_BY,
                    isHandwritten: true, refType: 'sale', estRefType: 'sale_milling_est', notePrefix: 'HW Sale Invoice'
                });
            }
            return { alreadySettled: false, billId: bill.BILL_ID };
        });

        res.json({
            success: true,
            alreadySettled: result.alreadySettled,
            billId: result.billId,
            message: result.alreadySettled ? 'Bill was already settled' : 'Bill settled successfully'
        });
    } catch (error) {
        sendError(res, error, 'Error settling mill sale:');
    }
});

// ─── LIST BILLS ──────────────────────────────────────────────
router.get('/api/mill/sales/list', async (req, res) => {
    try {
        const bills = await pool.query(`
            SELECT b.*, c.NAME as CUSTOMER_NAME, c.ADDRESS as CUSTOMER_ADDRESS, c.PHONE_NUMBER as CUSTOMER_PHONE,
                   (SELECT COALESCE(SUM(bi.BAG_COUNT), 0) FROM mill_bill_items bi WHERE bi.BILL_ID = b.BILL_ID AND bi.IS_ARCHIVED = 0) as TOTAL_BAGS,
                   (SELECT DISPATCH_ID FROM mill_dispatch_notes dn WHERE dn.DISPATCH_NO = b.DISPATCH_NO LIMIT 1) as DISPATCH_ID
            FROM mill_bills b
            LEFT JOIN mill_customers c ON b.CUSTOMER_ID = c.CUSTOMER_ID
            WHERE b.IS_ACTIVE = 1
            ORDER BY b.CREATED_DATE DESC, b.BILL_ID DESC
        `);
        // Bag lines for every bill, so each PC can show per-size bags, settle and print bills made elsewhere
        const lines = bills.length === 0 ? [] : await pool.query(`
            SELECT bi.BILL_ID, bi.ITEM_ID, i.SYSTEM_CODE, i.NAME as ITEM_NAME, bi.BAG_WEIGHT, bi.BAG_COUNT, bi.QUANTITY,
                   bi.UNIT_PRICE, bi.TOTAL_PRICE, bi.IS_HANDWRITTEN
            FROM mill_bill_items bi
            JOIN mill_items i ON i.ITEM_ID = bi.ITEM_ID
            JOIN mill_bills b ON b.BILL_ID = bi.BILL_ID AND b.IS_ACTIVE = 1
            WHERE IFNULL(bi.IS_ARCHIVED, 0) = 0
        `);
        const byBill = {};
        lines.forEach(l => {
            const { BILL_ID, ...line } = l;
            (byBill[BILL_ID] = byBill[BILL_ID] || []).push({
                ...line,
                BAG_WEIGHT: line.BAG_WEIGHT != null ? Number(line.BAG_WEIGHT) : null,
                BAG_COUNT: line.BAG_COUNT != null ? Number(line.BAG_COUNT) : null,
                QUANTITY: Number(line.QUANTITY || 0),
                UNIT_PRICE: Number(line.UNIT_PRICE || 0),
                TOTAL_PRICE: Number(line.TOTAL_PRICE || 0)
            });
        });
        bills.forEach(b => {
            b.ITEMS_JSON = byBill[b.BILL_ID] || [];
            if (b.VEHICLE_NO && !b.LORRY_NO) b.LORRY_NO = b.VEHICLE_NO;
        });
        res.json({ success: true, result: bills });
    } catch (error) {
        console.error('Error fetching mill sales:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── GET BILL DETAILS ─────────────────────────────────────────
router.get('/api/mill/sales/:id', async (req, res) => {
    try {
        const billRes = await pool.query(`
            SELECT b.*, c.NAME as CUSTOMER_NAME, c.ADDRESS as CUSTOMER_ADDRESS, c.PHONE_NUMBER as CUSTOMER_PHONE
            FROM mill_bills b
            LEFT JOIN mill_customers c ON b.CUSTOMER_ID = c.CUSTOMER_ID
            WHERE b.BILL_ID = ?
        `, [req.params.id]);

        if (!billRes || billRes.length === 0) {
            return res.status(404).json({ success: false, message: 'Bill not found' });
        }

        const bill = billRes[0];
        bill.ITEMS = await pool.query(`
            SELECT bi.*, i.NAME as ITEM_NAME, i.SYSTEM_CODE, i.CODE as ITEM_CODE
            FROM mill_bill_items bi
            JOIN mill_items i ON bi.ITEM_ID = i.ITEM_ID
            WHERE bi.BILL_ID = ? AND bi.IS_ARCHIVED = 0
        `, [req.params.id]);
        bill.CHEQUES = await pool.query('SELECT * FROM mill_cheques WHERE BILL_ID = ?', [req.params.id]);

        res.json({ success: true, result: bill });
    } catch (error) {
        console.error('Error fetching bill:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── DELETE BILL (Unsettled, not on a dispatch note) ─────────
// Safe to repeat: deleting an already-deleted bill returns success.
router.post('/api/mill/sales/delete', async (req, res) => {
    try {
        const body = req.body || {};
        const result = await withTransaction(pool, async (q) => {
            const bill = await findBill(q, body);
            if (!bill || !bill.IS_ACTIVE) return { alreadyDeleted: true };
            if (bill.IS_SETTLED) throw new MillError(409, `Bill ${bill.INVOICE_NO} is settled. Unlock it first.`);
            if (bill.DISPATCH_NO) throw new MillError(409, `Bill ${bill.INVOICE_NO} is on dispatch note ${bill.DISPATCH_NO}. Remove it from the dispatch note first.`);

            const ctx = await getMillingContext(q);
            await revertBillItems(q, ctx, {
                billId: bill.BILL_ID, where: 'IS_ARCHIVED = 0', refType: 'sale_revert', estRefType: 'sale_milling_est_revert',
                notePrefix: 'Revert Sale', invoiceNo: bill.INVOICE_NO, createdBy: body.CREATED_BY || 1
            });
            await q('UPDATE mill_bills SET IS_ACTIVE = 0 WHERE BILL_ID = ?', [bill.BILL_ID]);
            return { alreadyDeleted: false };
        });
        res.json({ success: true, alreadyDeleted: result.alreadyDeleted, message: result.alreadyDeleted ? 'Bill was already deleted' : 'Sale deleted and inventory reverted' });
    } catch (error) {
        sendError(res, error, 'Error deleting mill sale:');
    }
});

// ─── UNLOCK BILL (Revert Settle) ──────────────────────────────
router.post('/api/mill/sales/unlock', async (req, res) => {
    try {
        const body = req.body || {};
        await withTransaction(pool, async (q) => {
            const bill = await findBill(q, body);
            if (!bill) throw new MillError(404, 'Bill not found');
            const ctx = await getMillingContext(q);
            await revertBillItems(q, ctx, {
                billId: bill.BILL_ID, where: 'IS_HANDWRITTEN = 1 AND IS_ARCHIVED = 0', refType: 'sale_revert', estRefType: 'sale_milling_est_revert',
                notePrefix: 'Revert HW Sale', invoiceNo: bill.INVOICE_NO, createdBy: 1
            });
            await q('DELETE FROM mill_bill_items WHERE BILL_ID = ? AND IS_HANDWRITTEN = 1', [bill.BILL_ID]);
            await q('DELETE FROM mill_cheques WHERE BILL_ID = ?', [bill.BILL_ID]);
            await q(
                `UPDATE mill_bills SET IS_SETTLED = 0, HANDWRITTEN_SUB_TOTAL = 0, DISCOUNT = 0, FINAL_AMOUNT = 0, PAYMENT_METHOD = 'cash', REMARK = NULL
                 WHERE BILL_ID = ?`,
                [bill.BILL_ID]
            );
        });
        res.json({ success: true, message: 'Bill unlocked successfully' });
    } catch (error) {
        sendError(res, error, 'Error unlocking mill sale:');
    }
});

// ─── EDIT BILL (Unsettled) ────────────────────────────────────
router.post('/api/mill/sales/edit', async (req, res) => {
    try {
        const body = req.body || {};
        await withTransaction(pool, async (q) => {
            const bill = await findBill(q, body);
            if (!bill) throw new MillError(404, 'Bill not found on server');
            if (!bill.IS_ACTIVE) throw new MillError(409, `Bill ${bill.INVOICE_NO} was deleted`);
            if (bill.IS_SETTLED) throw new MillError(409, `Bill ${bill.INVOICE_NO} is settled. Unlock it first, then edit.`);

            const items = await resolveItemsOrThrow(q, parseItems(body.ITEMS));
            const customerId = await resolveCustomerId(q, body);
            const date = toSLDate(body.DATE || bill.DATE);
            const finalAmt = body.FINAL_AMOUNT !== undefined ? Number(body.FINAL_AMOUNT) : (body.NET_AMOUNT || body.TOTAL_AMOUNT || 0);
            const ctx = await getMillingContext(q);

            await revertBillItems(q, ctx, {
                billId: bill.BILL_ID, where: 'IS_ARCHIVED = 0 AND (IS_HANDWRITTEN IS NULL OR IS_HANDWRITTEN = 0)',
                refType: 'sale_edit_revert', estRefType: 'sale_edit_est_revert', notePrefix: 'Edit Revert', invoiceNo: bill.INVOICE_NO, createdBy: body.CREATED_BY
            });
            await q('DELETE FROM mill_bill_items WHERE BILL_ID = ? AND IS_ARCHIVED = 0 AND (IS_HANDWRITTEN IS NULL OR IS_HANDWRITTEN = 0)', [bill.BILL_ID]);
            await q(
                `UPDATE mill_bills SET BATCH_NO = ?, CUSTOMER_ID = ?, TOTAL_AMOUNT = ?, DISCOUNT = ?,
                    NET_AMOUNT = ?, PRINTED_SUB_TOTAL = ?, FINAL_AMOUNT = ?, DATE = ?, VEHICLE_NO = ?, DRIVER_NAME = ?
                 WHERE BILL_ID = ?`,
                [body.BATCH_NO || null, customerId, body.TOTAL_AMOUNT || 0, body.DISCOUNT || 0, body.NET_AMOUNT || 0, body.TOTAL_AMOUNT || 0, finalAmt, date,
                    body.VEHICLE_NO !== undefined ? (body.VEHICLE_NO || body.LORRY_NO || null) : bill.VEHICLE_NO,
                    body.DRIVER_NAME !== undefined ? (body.DRIVER_NAME || null) : bill.DRIVER_NAME, bill.BILL_ID]
            );
            await insertBillItems(q, ctx, {
                billId: bill.BILL_ID, items, date, invoiceNo: bill.INVOICE_NO, createdBy: body.CREATED_BY,
                isHandwritten: false, refType: 'sale_edit', estRefType: 'sale_edit_est', notePrefix: 'Edit Sale'
            });
        });
        res.json({ success: true, message: 'Sale updated successfully' });
    } catch (error) {
        sendError(res, error, 'Error editing mill sale:');
    }
});

module.exports = router;
