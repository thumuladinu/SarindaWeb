const express = require('express');
const router = express.Router();
const pool = require('./index');
const util = require('util');
const {
    MillError, slNow, toSLDateTime, toSLDate, withTransaction, resolveItemsOrThrow,
    generateInvoiceNo, generateDispatchNo, findBill, findDispatchNote, sendError,
    getMillingContext, insertBillItems, revertBillItems, updateInventoryLedger
} = require('./millShared');

const queryAsync = util.promisify(pool.query).bind(pool);

const ensureDispatchColumns = (async () => {
    for (const col of ['TOTAL_5KG', 'TOTAL_10KG', 'TOTAL_25KG', 'TOTAL_BAGS']) {
        try { await queryAsync(`ALTER TABLE mill_dispatch_notes ADD COLUMN ${col} INT DEFAULT 0`); } catch (e) {}
    }
})();

const toList = (value) => {
    let list = value;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch (e) { list = list.split(','); }
    }
    return Array.isArray(list) ? list.map(v => String(v).trim()).filter(Boolean) : [];
};

// Bills to link. Desktop sends INVOICE_NOS (permanent codes) -> link ONLY by those.
// Web sends BILL_IDS (real server ids) -> link by id. Local row numbers are never trusted.
async function resolveDispatchBills(q, body) {
    const invoiceNos = toList(body.INVOICE_NOS);
    const bills = [];
    if (invoiceNos.length > 0) {
        for (const inv of invoiceNos) {
            const bill = await findBill(q, { INVOICE_NO: inv });
            if (!bill) {
                throw new MillError(409, `Bill ${inv} is not on the server yet`, { retryable: true });
            }
            bills.push(bill);
        }
    } else {
        for (const id of toList(body.BILL_IDS)) {
            const bill = await findBill(q, { BILL_ID: id });
            if (!bill) throw new MillError(404, `Bill #${id} not found`);
            bills.push(bill);
        }
    }
    if (bills.length === 0) throw new MillError(400, 'No bills selected');
    return bills;
}

async function linkBills(q, bills, dispatchNo) {
    for (const bill of bills) {
        if (!bill.IS_ACTIVE) throw new MillError(409, `Bill ${bill.INVOICE_NO} was deleted`);
        if (bill.DISPATCH_NO && bill.DISPATCH_NO !== dispatchNo) {
            // retryable: the other note's edit (removing this bill) may simply not have synced yet
            throw new MillError(409, `Bill ${bill.INVOICE_NO} is already on dispatch note ${bill.DISPATCH_NO}`, { retryable: true });
        }
    }
    await q('UPDATE mill_bills SET DISPATCH_NO = NULL WHERE DISPATCH_NO = ?', [dispatchNo]);
    for (const bill of bills) {
        await q('UPDATE mill_bills SET DISPATCH_NO = ? WHERE BILL_ID = ?', [dispatchNo, bill.BILL_ID]);
    }
}

const bagTotals = (body) => {
    const out = {};
    ['TOTAL_5KG', 'TOTAL_10KG', 'TOTAL_25KG', 'TOTAL_BAGS'].forEach(k => {
        if (body[k] !== undefined && body[k] !== null && body[k] !== '') out[k] = Number(body[k]) || 0;
    });
    return out;
};

// ─── LIST DISPATCH NOTES ───────────────────────────────────────
router.get('/api/mill/dispatch/list', async (req, res) => {
    try {
        const notes = await queryAsync(`
            SELECT d.*,
                   COUNT(b.BILL_ID) as BILL_COUNT,
                   JSON_ARRAYAGG(b.BILL_ID) as BILL_IDS_JSON,
                   JSON_ARRAYAGG(b.INVOICE_NO) as INVOICE_NOS_JSON
            FROM mill_dispatch_notes d
            LEFT JOIN mill_bills b ON d.DISPATCH_NO = b.DISPATCH_NO AND b.IS_ACTIVE = 1
            GROUP BY d.DISPATCH_ID
            ORDER BY d.CREATED_DATE DESC
        `);
        for (const note of notes) {
            for (const key of ['INVOICE_NOS_JSON', 'BILL_IDS_JSON']) {
                let val = note[key];
                if (typeof val === 'string') {
                    try { val = JSON.parse(val); } catch (e) { val = []; }
                }
                note[key] = Array.isArray(val) ? val.filter(Boolean) : [];
            }
        }
        res.json({ success: true, result: notes });
    } catch (error) {
        console.error('Error fetching dispatch notes:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── GET DISPATCH NOTE DETAILS ──────────────────────────────────
router.get('/api/mill/dispatch/:id', async (req, res) => {
    try {
        const noteRes = await queryAsync('SELECT * FROM mill_dispatch_notes WHERE DISPATCH_ID = ?', [req.params.id]);
        if (noteRes.length === 0) return res.status(404).json({ success: false, message: 'Not found' });

        const note = noteRes[0];
        const bills = await queryAsync(`
            SELECT b.*, c.NAME as CUSTOMER_NAME, c.ADDRESS as CUSTOMER_ADDRESS
            FROM mill_bills b
            LEFT JOIN mill_customers c ON b.CUSTOMER_ID = c.CUSTOMER_ID
            WHERE b.DISPATCH_NO = ? AND b.IS_ACTIVE = 1
        `, [note.DISPATCH_NO]);

        for (const b of bills) {
            b.ITEMS = await queryAsync(`
                SELECT bi.ITEM_ID, bi.BAG_WEIGHT, bi.BAG_COUNT, bi.QUANTITY, bi.UNIT_PRICE, bi.TOTAL_PRICE,
                       i.NAME as ITEM_NAME, i.SYSTEM_CODE, i.CODE as ITEM_CODE
                FROM mill_bill_items bi
                JOIN mill_items i ON bi.ITEM_ID = i.ITEM_ID
                WHERE bi.BILL_ID = ? AND IFNULL(bi.IS_ARCHIVED, 0) = 0
            `, [b.BILL_ID]);
            b.CHEQUES = await queryAsync('SELECT * FROM mill_cheques WHERE BILL_ID = ?', [b.BILL_ID]);
        }

        note.BILLS = bills;
        res.json({ success: true, result: note });
    } catch (error) {
        console.error('Error fetching dispatch details:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── CREATE / RE-SYNC DISPATCH NOTE ────────────────────────────
// Idempotent on DISPATCH_NO: re-sending updates the same note (never a second note).
router.post('/api/mill/dispatch/create', async (req, res) => {
    try {
        await ensureDispatchColumns;
        const body = req.body || {};
        const result = await withTransaction(pool, async (q) => {
            const existing = body.DISPATCH_NO ? await findDispatchNote(q, { DISPATCH_NO: body.DISPATCH_NO }) : null;

            if (existing) {
                // Settled notes are final - a late re-send must not relink or change them
                if (existing.STATUS === 'SETTLED') {
                    return { dispatchId: existing.DISPATCH_ID, dispatchNo: existing.DISPATCH_NO, updated: false, settled: true };
                }
                const bills = await resolveDispatchBills(q, body);
                await q('UPDATE mill_dispatch_notes SET ? WHERE DISPATCH_ID = ?', [{
                    DATE: toSLDate(body.DATE || existing.DATE),
                    DRIVER_NAME: body.DRIVER_NAME,
                    LORRY_NO: body.LORRY_NO,
                    STAFF_NAME: body.STAFF_NAME,
                    ...bagTotals(body)
                }, existing.DISPATCH_ID]);
                await linkBills(q, bills, existing.DISPATCH_NO);
                return { dispatchId: existing.DISPATCH_ID, dispatchNo: existing.DISPATCH_NO, updated: true };
            }

            const bills = await resolveDispatchBills(q, body);
            const dispatchNo = body.DISPATCH_NO || await generateDispatchNo(q, body.DEVICE_ID);
            const insertRes = await q('INSERT INTO mill_dispatch_notes SET ?', {
                DISPATCH_NO: dispatchNo,
                DATE: toSLDate(body.DATE),
                DRIVER_NAME: body.DRIVER_NAME,
                LORRY_NO: body.LORRY_NO,
                STAFF_NAME: body.STAFF_NAME,
                CREATED_BY: Number(body.CREATED_BY) || null,
                CREATED_DATE: toSLDateTime(body.CREATED_DATE),
                DEVICE_ID: body.DEVICE_ID || null,
                CREATED_BY_NAME: body.CREATED_BY_NAME || null,
                ...bagTotals(body)
            });
            await linkBills(q, bills, dispatchNo);
            return { dispatchId: insertRes.insertId, dispatchNo, updated: false };
        });

        res.json({
            success: true,
            message: result.updated ? 'Dispatch note updated successfully in database' : 'Dispatch note created successfully',
            dispatchNo: result.dispatchNo,
            dispatchId: result.dispatchId,
            settled: !!result.settled
        });
    } catch (error) {
        sendError(res, error, 'Error creating dispatch note:');
    }
});

// ─── DELETE DISPATCH NOTE ──────────────────────────────────────
router.post('/api/mill/dispatch/delete', async (req, res) => {
    try {
        const body = req.body || {};
        const result = await withTransaction(pool, async (q) => {
            const note = await findDispatchNote(q, body);
            if (!note) return { alreadyDeleted: true };
            if (note.STATUS === 'SETTLED') throw new MillError(409, 'Cannot delete a settled dispatch note');
            await q('UPDATE mill_bills SET DISPATCH_NO = NULL WHERE DISPATCH_NO = ?', [note.DISPATCH_NO]);
            await q('DELETE FROM mill_dispatch_notes WHERE DISPATCH_ID = ?', [note.DISPATCH_ID]);
            return { alreadyDeleted: false };
        });
        res.json({ success: true, alreadyDeleted: result.alreadyDeleted, message: 'Dispatch note deleted successfully' });
    } catch (error) {
        sendError(res, error, 'Error deleting dispatch note:');
    }
});

// ─── SETTLE DISPATCH NOTE ──────────────────────────────────────
// Safe to repeat: a settled note is returned unchanged. Bills must belong to this note.
router.post('/api/mill/dispatch/settle', async (req, res) => {
    try {
        const body = req.body || {};
        if (!Array.isArray(body.BILLS)) {
            return res.status(400).json({ success: false, permanent: true, message: 'Invalid payload' });
        }
        const result = await withTransaction(pool, async (q) => {
            const note = await findDispatchNote(q, body);
            if (!note) throw new MillError(404, 'Dispatch Note not found on server');
            if (note.STATUS === 'SETTLED') return { alreadySettled: true };

            const dispatchDate = note.DATE || slNow().slice(0, 10);
            const ctx = await getMillingContext(q);

            // 1. Settle the printed bills of this note
            for (const billData of body.BILLS) {
                const bill = await findBill(q, billData);
                if (!bill) throw new MillError(404, `Bill ${billData.INVOICE_NO || billData.BILL_ID} not found on server`);
                if (bill.DISPATCH_NO !== note.DISPATCH_NO) {
                    throw new MillError(409, `Bill ${bill.INVOICE_NO} is not on dispatch note ${note.DISPATCH_NO}`);
                }
                if (bill.IS_SETTLED) continue; // settled separately before - keep as is

                const items = (Array.isArray(billData.ITEMS) ? billData.ITEMS : []).filter(i => Number(i.QUANTITY) > 0);
                const resolved = await resolveItemsOrThrow(q, items, `Bill ${bill.INVOICE_NO} item`);

                await q(
                    `UPDATE mill_bills SET HANDWRITTEN_SUB_TOTAL = ?, DISCOUNT = ?, FINAL_AMOUNT = ?, PAYMENT_METHOD = ?, REMARK = ?, IS_SETTLED = 1
                     WHERE BILL_ID = ?`,
                    [billData.HANDWRITTEN_SUB_TOTAL || 0, billData.DISCOUNT || 0, billData.FINAL_AMOUNT || 0, billData.PAYMENT_METHOD || 'cash', billData.REMARK || null, bill.BILL_ID]
                );

                if ((billData.PAYMENT_METHOD === 'cheque' || billData.PAYMENT_METHOD === 'mixed') && Array.isArray(billData.CHEQUES)) {
                    for (const chq of billData.CHEQUES) {
                        if (chq.CHEQUE_ID) continue;
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

                // Final delivered items replace the printed ones (printed lines archived, stock reverted)
                if (resolved.length > 0) {
                    await revertBillItems(q, ctx, {
                        billId: bill.BILL_ID, where: 'IS_ARCHIVED = 0 AND (IS_HANDWRITTEN IS NULL OR IS_HANDWRITTEN = 0)',
                        refType: 'sale_settle_revert', estRefType: 'sale_milling_revert', notePrefix: 'Settle Revert',
                        invoiceNo: bill.INVOICE_NO, createdBy: body.CREATED_BY
                    });
                    await q('UPDATE mill_bill_items SET IS_ARCHIVED = 1 WHERE BILL_ID = ? AND IS_ARCHIVED = 0 AND (IS_HANDWRITTEN IS NULL OR IS_HANDWRITTEN = 0)', [bill.BILL_ID]);
                    await insertBillItems(q, ctx, {
                        billId: bill.BILL_ID, items: resolved, date: dispatchDate, invoiceNo: bill.INVOICE_NO, createdBy: body.CREATED_BY,
                        isHandwritten: false, refType: 'sale', estRefType: 'sale_milling_est', notePrefix: 'Settle Invoice'
                    });
                }
            }

            // 2. Extra handwritten bills written during the trip (deduplicated by INVOICE_NO)
            for (const extra of (Array.isArray(body.EXTRA_BILLS) ? body.EXTRA_BILLS : [])) {
                const items = (Array.isArray(extra.ITEMS) ? extra.ITEMS : []).filter(i => Number(i.QUANTITY) > 0);
                if (items.length === 0) continue;
                if (extra.INVOICE_NO) {
                    const dup = await q('SELECT BILL_ID FROM mill_bills WHERE INVOICE_NO = ? LIMIT 1', [extra.INVOICE_NO]);
                    if (dup.length > 0) continue;
                }
                const resolved = await resolveItemsOrThrow(q, items, 'Extra bill item');
                const invoiceNo = extra.INVOICE_NO || await generateInvoiceNo(q, note.DEVICE_ID || 'WEB', 'E');

                const billRes = await q('INSERT INTO mill_bills SET ?', {
                    INVOICE_NO: invoiceNo,
                    TOTAL_AMOUNT: extra.FINAL_AMOUNT || 0,
                    DISCOUNT: 0,
                    NET_AMOUNT: extra.FINAL_AMOUNT || 0,
                    PRINTED_SUB_TOTAL: 0,
                    HANDWRITTEN_SUB_TOTAL: extra.FINAL_AMOUNT || 0,
                    FINAL_AMOUNT: extra.FINAL_AMOUNT || 0,
                    IS_SETTLED: 1,
                    DATE: toSLDate(dispatchDate),
                    CREATED_DATE: slNow(),
                    PAYMENT_METHOD: extra.PAYMENT_METHOD || 'cash',
                    REMARK: extra.REMARK || 'Handwritten Bill added during Dispatch Settle',
                    CREATED_BY: Number(body.CREATED_BY) || null,
                    DEVICE_ID: note.DEVICE_ID || null,
                    DISPATCH_NO: note.DISPATCH_NO
                });
                const billId = billRes.insertId;

                if ((extra.PAYMENT_METHOD === 'cheque' || extra.PAYMENT_METHOD === 'mixed') && Array.isArray(extra.CHEQUES)) {
                    for (const chq of extra.CHEQUES) {
                        await q('INSERT INTO mill_cheques SET ?', {
                            BILL_ID: billId,
                            CHEQUE_NUMBER: chq.CHEQUE_NUMBER,
                            BANK: chq.BANK || null,
                            DUE_DATE: chq.DUE_DATE,
                            AMOUNT: chq.AMOUNT,
                            STATUS: 'PENDING',
                            CREATED_DATE: slNow()
                        });
                    }
                }
                await insertBillItems(q, ctx, {
                    billId, items: resolved, date: dispatchDate, invoiceNo, createdBy: body.CREATED_BY,
                    isHandwritten: true, refType: 'sale', estRefType: 'sale_milling_est', notePrefix: 'Extra Sale Invoice'
                });
            }

            await q('UPDATE mill_dispatch_notes SET STATUS = "SETTLED" WHERE DISPATCH_ID = ?', [note.DISPATCH_ID]);
            return { alreadySettled: false };
        });

        res.json({
            success: true,
            alreadySettled: result.alreadySettled,
            message: result.alreadySettled ? 'Dispatch note was already settled' : 'Dispatch note and all related bills settled successfully'
        });
    } catch (error) {
        sendError(res, error, 'Error settling dispatch note:');
    }
});

// ─── UPDATE DISPATCH NOTE (BEFORE SETTLE) ──────────────────────
router.post('/api/mill/dispatch/update', async (req, res) => {
    try {
        const body = req.body || {};
        await withTransaction(pool, async (q) => {
            const note = await findDispatchNote(q, body);
            if (!note) throw new MillError(404, 'Dispatch note not found');
            if (note.STATUS === 'SETTLED') throw new MillError(409, 'Cannot edit a settled dispatch note');
            await q(
                'UPDATE mill_dispatch_notes SET DRIVER_NAME = ?, LORRY_NO = ?, STAFF_NAME = ?, DATE = ? WHERE DISPATCH_ID = ?',
                [body.DRIVER_NAME || null, body.LORRY_NO || null, body.STAFF_NAME || null, toSLDate(body.DATE || note.DATE), note.DISPATCH_ID]
            );
        });
        res.json({ success: true, message: 'Dispatch note updated successfully' });
    } catch (error) {
        sendError(res, error, 'Error updating dispatch note:');
    }
});

// ─── UNLOCK SETTLED DISPATCH NOTE (ADMIN ONLY) ──────────────────
router.post('/api/mill/dispatch/unlock', async (req, res) => {
    try {
        const body = req.body || {};
        await withTransaction(pool, async (q) => {
            const note = await findDispatchNote(q, body);
            if (!note) throw new MillError(404, 'Dispatch note not found');
            if (note.STATUS !== 'SETTLED') throw new MillError(409, 'Dispatch note is not settled');

            const ctx = await getMillingContext(q);
            const bills = await q('SELECT BILL_ID, INVOICE_NO FROM mill_bills WHERE DISPATCH_NO = ? FOR UPDATE', [note.DISPATCH_NO]);
            for (const b of bills) {
                // 1. Revert stock for settled active lines, then remove them
                await revertBillItems(q, ctx, {
                    billId: b.BILL_ID, where: 'IS_ARCHIVED = 0', refType: 'sale_unlock_revert', estRefType: 'sale_unlock_est_revert',
                    notePrefix: 'Unlock Revert', invoiceNo: b.INVOICE_NO, createdBy: body.UNLOCKED_BY
                });
                await q('DELETE FROM mill_bill_items WHERE BILL_ID = ? AND IS_ARCHIVED = 0', [b.BILL_ID]);
                // 2. Restore archived printed lines and deduct their stock again
                await q('UPDATE mill_bill_items SET IS_ARCHIVED = 0 WHERE BILL_ID = ? AND IS_ARCHIVED = 1', [b.BILL_ID]);
                const restored = await q('SELECT * FROM mill_bill_items WHERE BILL_ID = ? AND IS_ARCHIVED = 0', [b.BILL_ID]);
                for (const item of restored) {
                    await updateInventoryLedger(q, item.ITEM_ID, null, item.QUANTITY, 'OUT', 'sale', b.BILL_ID, slNow(), `Unlock Restore Bill ${b.INVOICE_NO}`, body.UNLOCKED_BY);
                    if (item.ESTIMATED_INPUT_USED > 0 && ctx.dryWeeId) {
                        await updateInventoryLedger(q, ctx.dryWeeId, null, item.ESTIMATED_INPUT_USED, 'OUT', 'sale_milling_est', b.BILL_ID, slNow(), `Unlock Restore est ${b.INVOICE_NO}`, body.UNLOCKED_BY);
                    }
                }
                await q('UPDATE mill_bills SET IS_SETTLED = 0, FINAL_AMOUNT = 0, HANDWRITTEN_SUB_TOTAL = 0 WHERE BILL_ID = ?', [b.BILL_ID]);
            }
            await q('UPDATE mill_dispatch_notes SET STATUS = "PENDING" WHERE DISPATCH_ID = ?', [note.DISPATCH_ID]);
        });
        res.json({ success: true, message: 'Dispatch note unlocked successfully' });
    } catch (error) {
        sendError(res, error, 'Error unlocking dispatch note:');
    }
});

module.exports = router;
