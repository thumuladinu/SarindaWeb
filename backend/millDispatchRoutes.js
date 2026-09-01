const express = require('express');
const router = express.Router();
const pool = require('./index');
const util = require('util');

const queryAsync = util.promisify(pool.query).bind(pool);

const resolveItemId = async (itemIdInput) => {
    if (!itemIdInput) return null;
    let numericId = parseInt(itemIdInput, 10);
    if (!isNaN(numericId) && numericId > 0 && String(numericId) === String(itemIdInput).trim()) {
        return numericId;
    }
    const rows = await queryAsync(
        'SELECT ITEM_ID FROM mill_items WHERE SYSTEM_CODE = ? OR CODE = ? LIMIT 1',
        [itemIdInput, itemIdInput]
    );
    if (rows && rows.length > 0) {
        return rows[0].ITEM_ID;
    }
    return isNaN(numericId) ? null : numericId;
};

// Helper function to update inventory (copied pattern from inward)
const updateInventoryLedger = async (itemIdInput, placeId, quantity, type, refType, refId, date, notes, createdBy) => {
    const itemId = await resolveItemId(itemIdInput);
    if (!itemId) {
        console.error('Cannot update inventory ledger in dispatch: invalid item ID', itemIdInput);
        return;
    }
    // Get current balance
    const balanceResult = await queryAsync(
        `SELECT COALESCE(SUM(CASE 
            WHEN TYPE IN ('IN','ADJ_IN') THEN QUANTITY 
            WHEN TYPE IN ('OUT','ADJ_OUT') THEN -QUANTITY 
            ELSE 0 END), 0) as balance 
        FROM mill_inventory_ledger 
        WHERE ITEM_ID = ? AND (PLACE_ID = ? OR (? IS NULL AND PLACE_ID IS NULL)) AND IS_ACTIVE = 1`,
        [itemId, placeId, placeId]
    );
    const currentBalance = parseFloat(balanceResult[0]?.balance || 0);
    const newBalance = type === 'IN' || type === 'ADJ_IN' 
        ? currentBalance + parseFloat(quantity) 
        : currentBalance - parseFloat(quantity);

    await queryAsync('INSERT INTO mill_inventory_ledger SET ?', {
        ITEM_ID: itemId,
        PLACE_ID: placeId || null,
        TYPE: type,
        QUANTITY: quantity,
        BALANCE_AFTER: newBalance,
        REFERENCE_TYPE: refType,
        REFERENCE_ID: refId,
        DATE: date,
        NOTES: notes || null,
        CREATED_BY: (createdBy && !isNaN(Number(createdBy))) ? Number(createdBy) : null,
    });

    // Also update STOCK in mill_items
    if (type === 'IN' || type === 'ADJ_IN') {
        await queryAsync('UPDATE mill_items SET STOCK = COALESCE(STOCK, 0) + ? WHERE ITEM_ID = ?', [quantity, itemId]);
    } else {
        await queryAsync('UPDATE mill_items SET STOCK = COALESCE(STOCK, 0) - ? WHERE ITEM_ID = ?', [quantity, itemId]);
    }
};

async function generateDispatchNo(deviceId = 'WEB') {
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
    const cleanDevice = (deviceId || 'WEB').toString().trim().toUpperCase();
    const prefix = `MDN-${yyyymmdd}-${cleanDevice}-`;
    const rows = await queryAsync('SELECT DISPATCH_NO FROM mill_dispatch_notes WHERE DISPATCH_NO LIKE ? ORDER BY DISPATCH_ID DESC LIMIT 1', [`${prefix}%`]);
    let nextNum = 1;
    if (rows.length > 0) {
        const lastNum = parseInt(rows[0].DISPATCH_NO.split('-').pop(), 10);
        nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    }
    return `${prefix}${nextNum.toString().padStart(4, '0')}`;
}

const generateInvoiceNo = async (deviceId = 'WEB') => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const cleanDevice = (deviceId || 'WEB').toString().trim().toUpperCase();
    const countResult = await queryAsync(
        `SELECT COUNT(*) as count FROM mill_bills WHERE DATE(CREATED_DATE) = CURDATE()`
    );
    const seq = (countResult[0]?.count || 0) + 1;
    return `MIV-${dateStr}-${cleanDevice}-${String(seq).padStart(4, '0')}`;
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
            LEFT JOIN mill_bills b ON d.DISPATCH_NO = b.DISPATCH_NO
            GROUP BY d.DISPATCH_ID
            ORDER BY d.CREATED_DATE DESC
        `);
        for (let note of notes) {
            if (typeof note.INVOICE_NOS_JSON === 'string') {
                try { note.INVOICE_NOS_JSON = JSON.parse(note.INVOICE_NOS_JSON); } catch(e) {}
            }
            if (Array.isArray(note.INVOICE_NOS_JSON)) {
                note.INVOICE_NOS_JSON = note.INVOICE_NOS_JSON.filter(Boolean);
            } else {
                note.INVOICE_NOS_JSON = [];
            }

            if (typeof note.BILL_IDS_JSON === 'string') {
                try { note.BILL_IDS_JSON = JSON.parse(note.BILL_IDS_JSON); } catch(e) {}
            }
            if (Array.isArray(note.BILL_IDS_JSON)) {
                note.BILL_IDS_JSON = note.BILL_IDS_JSON.filter(Boolean);
            } else {
                note.BILL_IDS_JSON = [];
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

        // Fetch associated bills with customer details
        const bills = await queryAsync(`
            SELECT b.*, c.NAME as CUSTOMER_NAME, c.ADDRESS as CUSTOMER_ADDRESS
            FROM mill_bills b
            LEFT JOIN mill_customers c ON b.CUSTOMER_ID = c.CUSTOMER_ID
            WHERE b.DISPATCH_NO = ?
        `, [note.DISPATCH_NO]);

        for (let b of bills) {
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

// ─── CREATE DISPATCH NOTE ──────────────────────────────────────
router.post('/api/mill/dispatch/create', async (req, res) => {
    try {
        const { BILL_IDS, INVOICE_NOS, DATE, DRIVER_NAME, LORRY_NO, STAFF_NAME, CREATED_BY, DEVICE_ID, CREATED_BY_NAME } = req.body;
        
        const allBillRefs = [];
        if (Array.isArray(INVOICE_NOS)) allBillRefs.push(...INVOICE_NOS);
        if (Array.isArray(BILL_IDS)) allBillRefs.push(...BILL_IDS);

        if (allBillRefs.length === 0) {
            return res.status(400).json({ success: false, message: 'No bills selected' });
        }

        let dispatchNo = req.body.DISPATCH_NO || await generateDispatchNo(DEVICE_ID || 'WEB');

        // Check if dispatch note already exists to update or avoid ER_DUP_ENTRY
        const existingNote = await queryAsync('SELECT DISPATCH_ID, DISPATCH_NO FROM mill_dispatch_notes WHERE DISPATCH_NO = ?', [dispatchNo]);
        if (existingNote.length > 0) {
            if (req.body.DISPATCH_NO) {
                const existingId = existingNote[0].DISPATCH_ID;

                const updateFields = {
                    DATE,
                    DRIVER_NAME,
                    LORRY_NO,
                    STAFF_NAME
                };
                if (req.body.TOTAL_5KG !== undefined) updateFields.TOTAL_5KG = req.body.TOTAL_5KG;
                if (req.body.TOTAL_10KG !== undefined) updateFields.TOTAL_10KG = req.body.TOTAL_10KG;
                if (req.body.TOTAL_25KG !== undefined) updateFields.TOTAL_25KG = req.body.TOTAL_25KG;
                if (req.body.TOTAL_BAGS !== undefined) updateFields.TOTAL_BAGS = req.body.TOTAL_BAGS;

                try {
                    await queryAsync('UPDATE mill_dispatch_notes SET ? WHERE DISPATCH_ID = ?', [updateFields, existingId]);
                } catch(err) {
                    if (err.code === 'ER_BAD_FIELD_ERROR') {
                        try { await queryAsync('ALTER TABLE mill_dispatch_notes ADD COLUMN TOTAL_5KG INT DEFAULT 0'); } catch(e) {}
                        try { await queryAsync('ALTER TABLE mill_dispatch_notes ADD COLUMN TOTAL_10KG INT DEFAULT 0'); } catch(e) {}
                        try { await queryAsync('ALTER TABLE mill_dispatch_notes ADD COLUMN TOTAL_25KG INT DEFAULT 0'); } catch(e) {}
                        try { await queryAsync('ALTER TABLE mill_dispatch_notes ADD COLUMN TOTAL_BAGS INT DEFAULT 0'); } catch(e) {}
                        await queryAsync('UPDATE mill_dispatch_notes SET ? WHERE DISPATCH_ID = ?', [updateFields, existingId]);
                    } else {
                        throw err;
                    }
                }

                // Clear old bill associations & re-link updated bills
                await queryAsync('UPDATE mill_bills SET DISPATCH_NO = NULL WHERE DISPATCH_NO = ?', [existingNote[0].DISPATCH_NO]);

                for (const ref of allBillRefs) {
                    if (!ref) continue;
                    const strRef = String(ref).trim();
                    let updateRes = await queryAsync('UPDATE mill_bills SET DISPATCH_NO = ? WHERE INVOICE_NO = ?', [existingNote[0].DISPATCH_NO, strRef]);
                    if (updateRes.affectedRows === 0 && !isNaN(Number(strRef))) {
                        await queryAsync('UPDATE mill_bills SET DISPATCH_NO = ? WHERE BILL_ID = ?', [existingNote[0].DISPATCH_NO, Number(strRef)]);
                    }
                }

                return res.json({ 
                    success: true, 
                    message: 'Dispatch note updated successfully in database', 
                    dispatchId: existingId, 
                    dispatchNo: existingNote[0].DISPATCH_NO 
                });
            }
            dispatchNo = await generateDispatchNo(DEVICE_ID || 'WEB');
        }

        const createdById = Number(CREATED_BY) || null; // CREATED_BY must be INT; name goes in CREATED_BY_NAME

        const insertRow = {
            DISPATCH_NO: dispatchNo,
            DATE,
            DRIVER_NAME,
            LORRY_NO,
            STAFF_NAME,
            CREATED_BY: createdById
        };
        if (req.body.TOTAL_5KG !== undefined) insertRow.TOTAL_5KG = req.body.TOTAL_5KG;
        if (req.body.TOTAL_10KG !== undefined) insertRow.TOTAL_10KG = req.body.TOTAL_10KG;
        if (req.body.TOTAL_25KG !== undefined) insertRow.TOTAL_25KG = req.body.TOTAL_25KG;
        if (req.body.TOTAL_BAGS !== undefined) insertRow.TOTAL_BAGS = req.body.TOTAL_BAGS;

        if (req.body.CREATED_DATE) insertRow.CREATED_DATE = new Date(req.body.CREATED_DATE);
        if (DEVICE_ID) insertRow.DEVICE_ID = DEVICE_ID;
        if (CREATED_BY_NAME) insertRow.CREATED_BY_NAME = CREATED_BY_NAME;

        let dispatchId = null;
        try {
            const insertRes = await queryAsync('INSERT INTO mill_dispatch_notes SET ?', insertRow);
            dispatchId = insertRes.insertId;
        } catch(err) {
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                try { await queryAsync('ALTER TABLE mill_dispatch_notes ADD COLUMN TOTAL_5KG INT DEFAULT 0'); } catch(e) {}
                try { await queryAsync('ALTER TABLE mill_dispatch_notes ADD COLUMN TOTAL_10KG INT DEFAULT 0'); } catch(e) {}
                try { await queryAsync('ALTER TABLE mill_dispatch_notes ADD COLUMN TOTAL_25KG INT DEFAULT 0'); } catch(e) {}
                try { await queryAsync('ALTER TABLE mill_dispatch_notes ADD COLUMN TOTAL_BAGS INT DEFAULT 0'); } catch(e) {}
                const insertRes = await queryAsync('INSERT INTO mill_dispatch_notes SET ?', insertRow);
                dispatchId = insertRes.insertId;
            } else {
                throw err;
            }
        }

        for (const ref of allBillRefs) {
            if (!ref) continue;
            const strRef = String(ref).trim();
            let updateRes = await queryAsync('UPDATE mill_bills SET DISPATCH_NO = ? WHERE INVOICE_NO = ?', [dispatchNo, strRef]);
            if (updateRes.affectedRows === 0 && !isNaN(Number(strRef))) {
                await queryAsync('UPDATE mill_bills SET DISPATCH_NO = ? WHERE BILL_ID = ?', [dispatchNo, Number(strRef)]);
            }
        }

        res.json({ success: true, message: 'Dispatch note created successfully', dispatchNo, dispatchId });
    } catch (error) {
        console.error('Error creating dispatch note:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── DELETE DISPATCH NOTE ──────────────────────────────────────
router.post('/api/mill/dispatch/delete', async (req, res) => {
    try {
        const { DISPATCH_ID } = req.body;
        
        const noteRes = await queryAsync('SELECT STATUS FROM mill_dispatch_notes WHERE DISPATCH_ID = ?', [DISPATCH_ID]);
        if (noteRes.length === 0) return res.status(404).json({ success: false, message: 'Not found' });
        if (noteRes[0].STATUS === 'SETTLED') return res.status(400).json({ success: false, message: 'Cannot delete a settled dispatch note' });

        const dNoRes = await queryAsync('SELECT DISPATCH_NO FROM mill_dispatch_notes WHERE DISPATCH_ID = ?', [DISPATCH_ID]);
        if (dNoRes.length > 0) {
            await queryAsync('UPDATE mill_bills SET DISPATCH_NO = NULL WHERE DISPATCH_NO = ?', [dNoRes[0].DISPATCH_NO]);
        }
        await queryAsync('DELETE FROM mill_dispatch_notes WHERE DISPATCH_ID = ?', [DISPATCH_ID]);

        res.json({ success: true, message: 'Dispatch note deleted successfully' });
    } catch (error) {
        console.error('Error deleting dispatch note:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── SETTLE DISPATCH NOTE ──────────────────────────────────────
router.post('/api/mill/dispatch/settle', async (req, res) => {
    try {
        const { DISPATCH_ID, BILLS, EXTRA_BILLS, CREATED_BY } = req.body;

        if (!DISPATCH_ID || !BILLS || !Array.isArray(BILLS)) {
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }

        // Get dispatch date for inventory logging
        const noteRes = await queryAsync('SELECT * FROM mill_dispatch_notes WHERE DISPATCH_ID = ?', [DISPATCH_ID]);
        if (noteRes.length === 0) return res.status(404).json({ success: false, message: 'Dispatch Note not found' });
        const dispatchDate = noteRes[0].DATE || new Date();

        // 1. Settle pre-printed bills
        for (const billData of BILLS) {
            const { BILL_ID, HANDWRITTEN_SUB_TOTAL, DISCOUNT, FINAL_AMOUNT, PAYMENT_METHOD, CHEQUES, REMARK, ITEMS } = billData;

            // Mark bill as settled
            await queryAsync(
                `UPDATE mill_bills SET 
                    HANDWRITTEN_SUB_TOTAL = ?, 
                    DISCOUNT = ?, 
                    FINAL_AMOUNT = ?, 
                    PAYMENT_METHOD = ?, 
                    REMARK = ?,
                    IS_SETTLED = 1 
                 WHERE BILL_ID = ?`,
                [HANDWRITTEN_SUB_TOTAL || 0, DISCOUNT || 0, FINAL_AMOUNT || 0, PAYMENT_METHOD || 'cash', REMARK || null, BILL_ID]
            );

            // Add new cheques if any
            if ((PAYMENT_METHOD === 'cheque' || PAYMENT_METHOD === 'mixed') && CHEQUES && Array.isArray(CHEQUES)) {
                for (const chq of CHEQUES) {
                    if (!chq.CHEQUE_ID) { // Only insert if it's new
                        await queryAsync('INSERT INTO mill_cheques SET ?', {
                            BILL_ID,
                            CHEQUE_NUMBER: chq.CHEQUE_NUMBER,
                            BANK: chq.BANK || null,
                            DUE_DATE: chq.DUE_DATE,
                            AMOUNT: chq.AMOUNT,
                            STATUS: 'PENDING'
                        });
                    }
                }
            }

            // 3. Process new final settled items (replaces old items)
            if (ITEMS && Array.isArray(ITEMS) && ITEMS.length > 0) {
                const billInfo = await queryAsync('SELECT INVOICE_NO FROM mill_bills WHERE BILL_ID = ?', [BILL_ID]);
                const invoiceNo = billInfo.length > 0 ? billInfo[0].INVOICE_NO : 'UNKNOWN';

                // --- REVERT INVENTORY FOR OLD PRINTED ITEMS ---
                const oldItems = await queryAsync('SELECT * FROM mill_bill_items WHERE BILL_ID = ? AND IS_ARCHIVED = 0 AND (IS_HANDWRITTEN IS NULL OR IS_HANDWRITTEN = 0)', [BILL_ID]);
                for (const item of oldItems) {
                    await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'IN', 'sale_settle_revert', BILL_ID, dispatchDate, `Settle Revert ${invoiceNo}`, CREATED_BY);
                    if (item.ESTIMATED_INPUT_USED > 0) {
                        const dryWeeRes = await queryAsync('SELECT ITEM_ID FROM mill_items WHERE SYSTEM_CODE = "RAW_WEE_DRY"');
                        if (dryWeeRes.length > 0) {
                            await updateInventoryLedger(dryWeeRes[0].ITEM_ID, null, item.ESTIMATED_INPUT_USED, 'IN', 'sale_milling_revert', BILL_ID, dispatchDate, `Est mill revert ${invoiceNo}`, CREATED_BY);
                        }
                    }
                }

                // --- MARK OLD ITEMS AS ARCHIVED ---
                await queryAsync('UPDATE mill_bill_items SET IS_ARCHIVED = 1 WHERE BILL_ID = ? AND IS_ARCHIVED = 0 AND (IS_HANDWRITTEN IS NULL OR IS_HANDWRITTEN = 0)', [BILL_ID]);


                // --- PROCESS NEW FINAL ITEMS ---
                const yieldConfigRes = await queryAsync('SELECT * FROM mill_yield_configs LIMIT 1');
                const yieldConfig = yieldConfigRes.length > 0 ? yieldConfigRes[0] : null;

                const systemItemsRes = await queryAsync('SELECT ITEM_ID, SYSTEM_CODE FROM mill_items WHERE SYSTEM_CODE IS NOT NULL');
                const systemItems = {};
                systemItemsRes.forEach(r => systemItems[r.SYSTEM_CODE] = r.ITEM_ID);

                const halId = systemItems['OUT_HAL'];
                const sambaId = systemItems['OUT_SAMBA'];
                const naduId = systemItems['OUT_NADU'];
                const dryWeeId = systemItems['RAW_WEE_DRY'];

                for (const item of ITEMS) {
                    // Only process items that have quantity > 0
                    if (!item.QUANTITY || item.QUANTITY <= 0) continue;

                    const validItemId = await resolveItemId(item.ITEM_ID);
                    if (!validItemId) {
                        console.error('Skipping invalid item in dispatch settle:', item);
                        continue;
                    }
                    item.ITEM_ID = validItemId;

                    let estimatedInputUsed = 0, estimatedKudu = 0, estimatedHunsal = 0;

                    if ((item.ITEM_ID == halId || item.ITEM_ID == sambaId || item.ITEM_ID == naduId) && yieldConfig) {
                        const halYieldFactor = parseFloat(yieldConfig.HAL_YIELD) / 100;
                        if (halYieldFactor > 0) {
                            estimatedInputUsed = parseFloat(item.QUANTITY) / halYieldFactor;
                            estimatedKudu = estimatedInputUsed * (parseFloat(yieldConfig.KUDU_YIELD) / 100);
                            estimatedHunsal = estimatedInputUsed * (parseFloat(yieldConfig.HUNSAL_YIELD) / 100);
                            if (dryWeeId) {
                                await updateInventoryLedger(dryWeeId, null, estimatedInputUsed, 'OUT', 'sale_milling_est', BILL_ID, dispatchDate, `Est milled for Settle ${invoiceNo}`, CREATED_BY);
                            }
                        }
                    }

                    await queryAsync('INSERT INTO mill_bill_items SET ?', {
                        BILL_ID: BILL_ID,
                        ITEM_ID: item.ITEM_ID,
                        BAG_WEIGHT: item.BAG_WEIGHT || null,
                        BAG_COUNT: item.BAG_COUNT || null,
                        QUANTITY: item.QUANTITY,
                        UNIT_PRICE: item.UNIT_PRICE,
                        TOTAL_PRICE: item.TOTAL_PRICE,
                        IS_HANDWRITTEN: 0, // Final active items, treated as regular items now
                        IS_ARCHIVED: 0,
                        ESTIMATED_INPUT_USED: estimatedInputUsed,
                        ESTIMATED_KUDU_GENERATED: estimatedKudu,
                        ESTIMATED_HUNSAL_GENERATED: estimatedHunsal
                    });

                    await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'OUT', 'sale', BILL_ID, dispatchDate, `Settle Invoice ${invoiceNo}`, CREATED_BY);
                }
            }
        }

        // 2. Process EXTRA_BILLS (New handwritten invoices added during settlement)
        if (EXTRA_BILLS && Array.isArray(EXTRA_BILLS) && EXTRA_BILLS.length > 0) {
            for (const extra of EXTRA_BILLS) {
                const { CUSTOMER_NAME, FINAL_AMOUNT, PAYMENT_METHOD, CHEQUES, REMARK, ITEMS } = extra;
                if (!ITEMS || !Array.isArray(ITEMS) || ITEMS.length === 0) continue;

                const invoiceNo = await generateInvoiceNo();

                // Create bill in mill_bills
                const billRes = await queryAsync('INSERT INTO mill_bills SET ?', {
                    INVOICE_NO: invoiceNo,
                    TOTAL_AMOUNT: FINAL_AMOUNT || 0,
                    DISCOUNT: 0,
                    NET_AMOUNT: FINAL_AMOUNT || 0,
                    PRINTED_SUB_TOTAL: 0,
                    HANDWRITTEN_SUB_TOTAL: FINAL_AMOUNT || 0,
                    FINAL_AMOUNT: FINAL_AMOUNT || 0,
                    IS_SETTLED: 1,
                    DATE: dispatchDate,
                    PAYMENT_METHOD: PAYMENT_METHOD || 'cash',
                    REMARK: REMARK || 'Handwritten Bill added during Dispatch Settle',
                    CREATED_BY: CREATED_BY || null
                });

                const billId = billRes.insertId;

                // Link to dispatch note
                await queryAsync('UPDATE mill_bills SET DISPATCH_NO = ? WHERE BILL_ID = ?', [noteRes[0].DISPATCH_NO, billId]);

                // Insert cheques if any
                if ((PAYMENT_METHOD === 'cheque' || PAYMENT_METHOD === 'mixed') && CHEQUES && Array.isArray(CHEQUES)) {
                    for (const chq of CHEQUES) {
                        await queryAsync('INSERT INTO mill_cheques SET ?', {
                            BILL_ID: billId,
                            CHEQUE_NUMBER: chq.CHEQUE_NUMBER,
                            BANK: chq.BANK || null,
                            DUE_DATE: chq.DUE_DATE,
                            AMOUNT: chq.AMOUNT,
                            STATUS: 'PENDING'
                        });
                    }
                }

                // Process Items
                const yieldConfigRes = await queryAsync('SELECT * FROM mill_yield_configs LIMIT 1');
                const yieldConfig = yieldConfigRes.length > 0 ? yieldConfigRes[0] : null;

                const systemItemsRes = await queryAsync('SELECT ITEM_ID, SYSTEM_CODE FROM mill_items WHERE SYSTEM_CODE IS NOT NULL');
                const systemItems = {};
                systemItemsRes.forEach(r => systemItems[r.SYSTEM_CODE] = r.ITEM_ID);

                const halId = systemItems['OUT_HAL'];
                const sambaId = systemItems['OUT_SAMBA'];
                const naduId = systemItems['OUT_NADU'];
                const dryWeeId = systemItems['RAW_WEE_DRY'];

                for (const item of ITEMS) {
                    if (!item.QUANTITY || item.QUANTITY <= 0) continue;

                    let estimatedInputUsed = 0, estimatedKudu = 0, estimatedHunsal = 0;

                    if ((item.ITEM_ID == halId || item.ITEM_ID == sambaId || item.ITEM_ID == naduId) && yieldConfig) {
                        const halYieldFactor = parseFloat(yieldConfig.HAL_YIELD) / 100;
                        if (halYieldFactor > 0) {
                            estimatedInputUsed = parseFloat(item.QUANTITY) / halYieldFactor;
                            estimatedKudu = estimatedInputUsed * (parseFloat(yieldConfig.KUDU_YIELD) / 100);
                            estimatedHunsal = estimatedInputUsed * (parseFloat(yieldConfig.HUNSAL_YIELD) / 100);
                            if (dryWeeId) {
                                await updateInventoryLedger(dryWeeId, null, estimatedInputUsed, 'OUT', 'sale_milling_est', billId, dispatchDate, `Est milled for Extra Invoice ${invoiceNo}`, CREATED_BY);
                            }
                        }
                    }

                    await queryAsync('INSERT INTO mill_bill_items SET ?', {
                        BILL_ID: billId,
                        ITEM_ID: item.ITEM_ID,
                        BAG_WEIGHT: item.BAG_WEIGHT || null,
                        BAG_COUNT: item.BAG_COUNT || null,
                        QUANTITY: item.QUANTITY,
                        UNIT_PRICE: item.UNIT_PRICE,
                        TOTAL_PRICE: item.TOTAL_PRICE,
                        IS_HANDWRITTEN: 1,
                        IS_ARCHIVED: 0,
                        ESTIMATED_INPUT_USED: estimatedInputUsed,
                        ESTIMATED_KUDU_GENERATED: estimatedKudu,
                        ESTIMATED_HUNSAL_GENERATED: estimatedHunsal
                    });

                    await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'OUT', 'sale', billId, dispatchDate, `Extra Sale Invoice ${invoiceNo}`, CREATED_BY);
                }
            }
        }

        // Mark Dispatch Note as SETTLED
        await queryAsync('UPDATE mill_dispatch_notes SET STATUS = "SETTLED" WHERE DISPATCH_ID = ?', [DISPATCH_ID]);

        res.json({ success: true, message: 'Dispatch note and all related bills settled successfully' });
    } catch (error) {
        console.error('Error settling dispatch note:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UPDATE DISPATCH NOTE (BEFORE SETTLE) ──────────────────────
router.post('/api/mill/dispatch/update', async (req, res) => {
    try {
        const { DISPATCH_ID, DRIVER_NAME, LORRY_NO, STAFF_NAME, DATE } = req.body;
        
        const noteRes = await queryAsync('SELECT STATUS FROM mill_dispatch_notes WHERE DISPATCH_ID = ?', [DISPATCH_ID]);
        if (noteRes.length === 0) return res.status(404).json({ success: false, message: 'Dispatch note not found' });
        if (noteRes[0].STATUS === 'SETTLED') return res.status(400).json({ success: false, message: 'Cannot edit a settled dispatch note' });

        await queryAsync(
            'UPDATE mill_dispatch_notes SET DRIVER_NAME = ?, LORRY_NO = ?, STAFF_NAME = ?, DATE = ? WHERE DISPATCH_ID = ?',
            [DRIVER_NAME || null, LORRY_NO || null, STAFF_NAME || null, DATE || new Date(), DISPATCH_ID]
        );

        res.json({ success: true, message: 'Dispatch note updated successfully' });
    } catch (error) {
        console.error('Error updating dispatch note:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UNLOCK SETTLED DISPATCH NOTE (ADMIN ONLY) ──────────────────
router.post('/api/mill/dispatch/unlock', async (req, res) => {
    try {
        const { DISPATCH_ID, UNLOCKED_BY } = req.body;

        const noteRes = await queryAsync('SELECT * FROM mill_dispatch_notes WHERE DISPATCH_ID = ?', [DISPATCH_ID]);
        if (noteRes.length === 0) return res.status(404).json({ success: false, message: 'Dispatch note not found' });
        if (noteRes[0].STATUS !== 'SETTLED') return res.status(400).json({ success: false, message: 'Dispatch note is not settled' });

        const bills = await queryAsync('SELECT BILL_ID FROM mill_bills WHERE DISPATCH_NO = ?', [noteRes[0].DISPATCH_NO]);

        for (const b of bills) {
            const billId = b.BILL_ID;

            // 1. Revert inventory for settled active items
            const activeItems = await queryAsync('SELECT * FROM mill_bill_items WHERE BILL_ID = ? AND IS_ARCHIVED = 0', [billId]);
            for (const item of activeItems) {
                await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'IN', 'sale_unlock_revert', billId, new Date(), `Unlock Revert Bill ${billId}`, UNLOCKED_BY);
            }

            // 2. Delete settled active items
            await queryAsync('DELETE FROM mill_bill_items WHERE BILL_ID = ? AND IS_ARCHIVED = 0', [billId]);

            // 3. Restore archived printed items
            await queryAsync('UPDATE mill_bill_items SET IS_ARCHIVED = 0 WHERE BILL_ID = ? AND IS_ARCHIVED = 1', [billId]);

            // 4. Re-apply inventory for restored printed items
            const restoredItems = await queryAsync('SELECT * FROM mill_bill_items WHERE BILL_ID = ? AND IS_ARCHIVED = 0', [billId]);
            for (const item of restoredItems) {
                await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'OUT', 'sale', billId, new Date(), `Unlock Restore Bill ${billId}`, UNLOCKED_BY);
            }

            // 5. Reset bill status to un-settled
            await queryAsync('UPDATE mill_bills SET IS_SETTLED = 0, FINAL_AMOUNT = 0, HANDWRITTEN_SUB_TOTAL = 0 WHERE BILL_ID = ?', [billId]);
        }

        // 6. Set dispatch note status back to PENDING
        await queryAsync('UPDATE mill_dispatch_notes SET STATUS = "PENDING" WHERE DISPATCH_ID = ?', [DISPATCH_ID]);

        res.json({ success: true, message: 'Dispatch note unlocked successfully' });
    } catch (error) {
        console.error('Error unlocking dispatch note:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
