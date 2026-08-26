const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

router.use(cors());
pool.query = util.promisify(pool.query);

// Generate Invoice Number: MIV-YYYYMMDD-TERMINAL-XXXX
const generateInvoiceNo = async (deviceId = 'WEB') => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const cleanDevice = (deviceId || 'WEB').toString().trim().toUpperCase();
    const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM mill_bills WHERE DATE(CREATED_DATE) = CURDATE()`
    );
    let seq = (countResult[0]?.count || 0) + 1;
    let candidate = `MIV-${dateStr}-${cleanDevice}-${String(seq).padStart(4, '0')}`;
    
    // Loop to guarantee no duplicate INVOICE_NO collision
    let exists = await pool.query('SELECT BILL_ID FROM mill_bills WHERE INVOICE_NO = ?', [candidate]);
    while (exists && exists.length > 0) {
        seq++;
        candidate = `MIV-${dateStr}-${cleanDevice}-${String(seq).padStart(4, '0')}`;
        exists = await pool.query('SELECT BILL_ID FROM mill_bills WHERE INVOICE_NO = ?', [candidate]);
    }
    return candidate;
};

// Helper to resolve integer ITEM_ID from system code, string ID, GS1 code, or name
const resolveItemId = async (itemIdInput, itemName, gs1Code) => {
    if (itemIdInput) {
        let numericId = parseInt(itemIdInput, 10);
        if (!isNaN(numericId) && numericId > 0 && String(numericId) === String(itemIdInput).trim()) {
            return numericId;
        }
        const rows = await pool.query(
            'SELECT ITEM_ID FROM mill_items WHERE SYSTEM_CODE = ? OR CODE = ? OR GS1_CODE = ? LIMIT 1',
            [itemIdInput, itemIdInput, itemIdInput]
        );
        if (rows && rows.length > 0) {
            return rows[0].ITEM_ID;
        }
    }
    if (gs1Code) {
        const rows = await pool.query('SELECT ITEM_ID FROM mill_items WHERE GS1_CODE = ? OR CODE = ? LIMIT 1', [gs1Code, gs1Code]);
        if (rows && rows.length > 0) return rows[0].ITEM_ID;
    }
    if (itemName) {
        const rows = await pool.query('SELECT ITEM_ID FROM mill_items WHERE NAME LIKE ? OR NAME = ? LIMIT 1', [`%${itemName}%`, itemName]);
        if (rows && rows.length > 0) return rows[0].ITEM_ID;
    }
    const fallback = await pool.query('SELECT ITEM_ID FROM mill_items WHERE IS_ACTIVE = 1 ORDER BY ITEM_ID ASC LIMIT 1');
    if (fallback && fallback.length > 0) return fallback[0].ITEM_ID;
    return null;
};

// Helper function to update inventory (copied pattern from inward)
const updateInventoryLedger = async (itemIdInput, placeId, quantity, type, refType, refId, date, notes, createdBy) => {
    const itemId = await resolveItemId(itemIdInput);
    if (!itemId) {
        console.error('Cannot update inventory ledger: invalid item ID', itemIdInput);
        return;
    }
    // Get current balance
    const balanceResult = await pool.query(
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

    const validCreatedBy = (createdBy && !isNaN(Number(createdBy))) ? Number(createdBy) : null;

    await pool.query('INSERT INTO mill_inventory_ledger SET ?', {
        ITEM_ID: itemId,
        PLACE_ID: placeId || null,
        TYPE: type,
        QUANTITY: quantity,
        BALANCE_AFTER: newBalance,
        REFERENCE_TYPE: refType,
        REFERENCE_ID: refId,
        DATE: date,
        NOTES: notes || null,
        CREATED_BY: validCreatedBy
    });

    // Also update STOCK in mill_items
    if (type === 'IN' || type === 'ADJ_IN') {
        await pool.query('UPDATE mill_items SET STOCK = COALESCE(STOCK, 0) + ? WHERE ITEM_ID = ?', [quantity, itemId]);
    } else {
        await pool.query('UPDATE mill_items SET STOCK = COALESCE(STOCK, 0) - ? WHERE ITEM_ID = ?', [quantity, itemId]);
    }
};

// ─── ADD SALE (BILLING) ──────────────────────────────────────
router.post('/api/mill/sales/add', async (req, res) => {
    try {
        const { CUSTOMER_ID, TOTAL_AMOUNT, DISCOUNT, NET_AMOUNT, DATE, PAYMENT_METHOD, CREATED_BY, ITEMS, PRINTED_SUB_TOTAL, BATCH_NO, IS_SETTLED, REMARK, FINAL_AMOUNT, HANDWRITTEN_SUB_TOTAL, DEVICE_ID, CREATED_BY_NAME } = req.body;
        
        let itemsList = ITEMS;
        if (typeof itemsList === 'string') {
            try { itemsList = JSON.parse(itemsList); } catch(e) { itemsList = []; }
        }
        if (!Array.isArray(itemsList)) itemsList = [];

        let invoiceNo = req.body.INVOICE_NO || await generateInvoiceNo(DEVICE_ID);
        const customerId = (CUSTOMER_ID && !isNaN(Number(CUSTOMER_ID))) ? Number(CUSTOMER_ID) : null;
        const createdById = (CREATED_BY && !isNaN(Number(CREATED_BY))) ? Number(CREATED_BY) : null;

        // Check if invoice already exists to avoid ER_DUP_ENTRY
        const existingBill = await pool.query('SELECT BILL_ID, INVOICE_NO FROM mill_bills WHERE INVOICE_NO = ?', [invoiceNo]);
        if (existingBill.length > 0) {
            if (req.body.INVOICE_NO) {
                return res.json({ 
                    success: true, 
                    message: 'Invoice already exists in database', 
                    billId: existingBill[0].BILL_ID, 
                    invoiceNo: existingBill[0].INVOICE_NO 
                });
            }
            invoiceNo = await generateInvoiceNo(DEVICE_ID);
        }

        // Ensure columns exist on mill_bills
        try { await pool.query("ALTER TABLE mill_bills ADD COLUMN DEVICE_ID VARCHAR(50) NULL"); } catch (e) {}
        try { await pool.query("ALTER TABLE mill_bills ADD COLUMN CREATED_BY_NAME VARCHAR(100) NULL"); } catch (e) {}

        // 1. Create the Bill
        const billResult = await pool.query('INSERT INTO mill_bills SET ?', {
            INVOICE_NO: invoiceNo,
            BATCH_NO: BATCH_NO || null,
            CUSTOMER_ID: customerId,
            TOTAL_AMOUNT: TOTAL_AMOUNT || 0,
            DISCOUNT: DISCOUNT || 0,
            NET_AMOUNT: NET_AMOUNT || 0,
            PRINTED_SUB_TOTAL: PRINTED_SUB_TOTAL || TOTAL_AMOUNT || 0,
            HANDWRITTEN_SUB_TOTAL: HANDWRITTEN_SUB_TOTAL || 0,
            FINAL_AMOUNT: FINAL_AMOUNT || NET_AMOUNT || TOTAL_AMOUNT || 0,
            IS_SETTLED: IS_SETTLED !== undefined ? IS_SETTLED : 0,
            DATE: (DATE && new Date(DATE).toString() !== 'Invalid Date') ? new Date(DATE) : new Date(),
            CREATED_DATE: (req.body.CREATED_DATE && new Date(req.body.CREATED_DATE).toString() !== 'Invalid Date') ? new Date(req.body.CREATED_DATE) : new Date(),
            PAYMENT_METHOD: PAYMENT_METHOD || 'cash',
            REMARK: REMARK || null,
            CREATED_BY: createdById,
            DEVICE_ID: DEVICE_ID || 'WEB',
            CREATED_BY_NAME: CREATED_BY_NAME || null
        });

        const billId = billResult.insertId;

        // 2. Get Yield Configs & System Items for Milling Math
        const yieldConfigRes = await pool.query('SELECT * FROM mill_yield_configs LIMIT 1');
        const yieldConfig = yieldConfigRes && yieldConfigRes.length > 0 ? yieldConfigRes[0] : null;

        const systemItemsRes = await pool.query('SELECT ITEM_ID, SYSTEM_CODE FROM mill_items WHERE SYSTEM_CODE IS NOT NULL');
        const systemItems = {};
        systemItemsRes.forEach(i => {
            systemItems[i.SYSTEM_CODE] = i.ITEM_ID;
        });

        const dryWeeId = systemItems['RAW_WEE_DRY'];
        const halId = systemItems['OUT_HAL'];
        const sambaId = systemItems['OUT_SAMBA'];
        const naduId = systemItems['OUT_NADU'];
        const kuduId = systemItems['OUT_KUDU'];
        const hunsalId = systemItems['OUT_HUNSAL'];

        // 3. Process each item in the bill
        for (const item of itemsList) {
            const validItemId = await resolveItemId(item.ITEM_ID, item.ITEM_NAME || item.itemName, item.GS1_CODE || item.gs1Code);
            if (!validItemId) {
                console.error('Skipping invalid item in sale:', item);
                continue;
            }
            item.ITEM_ID = validItemId;

            let estimatedInputUsed = 0;
            let estimatedKudu = 0;
            let estimatedHunsal = 0;

            // Mathematical Estimation for Milling if they sold 'Hal'
            if ((item.ITEM_ID == halId || item.ITEM_ID == sambaId || item.ITEM_ID == naduId) && yieldConfig) {
                // If they sold 100kg of Hal, and Hal yield is 65% (0.65)
                const halYieldFactor = parseFloat(yieldConfig.HAL_YIELD) / 100;
                const kuduYieldFactor = parseFloat(yieldConfig.KUDU_YIELD) / 100;
                const hunsalYieldFactor = parseFloat(yieldConfig.HUNSAL_YIELD) / 100;
                
                if (halYieldFactor > 0) {
                    // Reverse calculate how much Dry Wee was needed
                    estimatedInputUsed = parseFloat(item.QUANTITY) / halYieldFactor;
                    
                    // Estimate by-products generated from that input
                    estimatedKudu = estimatedInputUsed * kuduYieldFactor;
                    estimatedHunsal = estimatedInputUsed * hunsalYieldFactor;

                    // Update Inventory based on estimations
                    if (dryWeeId) {
                        await updateInventoryLedger(dryWeeId, null, estimatedInputUsed, 'OUT', 'sale_milling_est', billId, DATE, `Estimated milled for Invoice ${invoiceNo}`, CREATED_BY);
                    }
                    // Note: We don't necessarily add kudu/hunsal to inventory dynamically here unless requested, 
                    // user said "we dont count therese results items invtry", but we can log it in the bill items table.
                    // If we do want to add it to inventory, we could do it here. But usually, if they don't count it, we just deduct what they sell.
                }
            }

            // Insert Bill Item
            await pool.query('INSERT INTO mill_bill_items SET ?', {
                BILL_ID: billId,
                ITEM_ID: item.ITEM_ID,
                BAG_WEIGHT: item.BAG_WEIGHT || null,
                BAG_COUNT: item.BAG_COUNT || null,
                QUANTITY: item.QUANTITY,
                UNIT_PRICE: item.UNIT_PRICE,
                TOTAL_PRICE: item.TOTAL_PRICE,
                ESTIMATED_INPUT_USED: estimatedInputUsed,
                ESTIMATED_KUDU_GENERATED: estimatedKudu,
                ESTIMATED_HUNSAL_GENERATED: estimatedHunsal
            });

            // Deduct sold item from Inventory
            await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'OUT', 'sale', billId, DATE, `Sale Invoice ${invoiceNo}`, CREATED_BY);
        }

        res.json({ success: true, message: 'Sale recorded successfully', invoiceNo: invoiceNo, billId: billId });

    } catch (error) {
        console.error('Error adding mill sale:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── SETTLE BILL (HANDWRITTEN) ───────────────────────────────
router.post('/api/mill/sales/settle', async (req, res) => {
    try {
        const { BILL_ID, HANDWRITTEN_SUB_TOTAL, DISCOUNT, FINAL_AMOUNT, PAYMENT_METHOD, CHEQUES, REMARK, ITEMS } = req.body;

        await pool.query(
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

        if (PAYMENT_METHOD === 'cheque' || PAYMENT_METHOD === 'mixed') {
            if (CHEQUES && Array.isArray(CHEQUES)) {
                for (const chq of CHEQUES) {
                    await pool.query('INSERT INTO mill_cheques SET ?', {
                        BILL_ID: BILL_ID,
                        CHEQUE_NUMBER: chq.CHEQUE_NUMBER,
                        BANK: chq.BANK || null,
                        DUE_DATE: chq.DUE_DATE,
                        AMOUNT: chq.AMOUNT,
                        STATUS: 'PENDING'
                    });
                }
            }
        }

        // Process Handwritten Items (if provided)
        if (ITEMS && Array.isArray(ITEMS) && ITEMS.length > 0) {
            // Fetch date for inventory
            const billData = await pool.query('SELECT DATE, INVOICE_NO FROM mill_bills WHERE BILL_ID = ?', [BILL_ID]);
            const billDate = billData.length > 0 ? billData[0].DATE : new Date();
            const invoiceNo = billData.length > 0 ? billData[0].INVOICE_NO : 'UNKNOWN';

            // Get yield config & system items
            const yieldConfigRes = await pool.query('SELECT * FROM mill_yield_configs LIMIT 1');
            const yieldConfig = yieldConfigRes && yieldConfigRes.length > 0 ? yieldConfigRes[0] : null;

            const systemItemsRes = await pool.query('SELECT ITEM_ID, SYSTEM_CODE FROM mill_items WHERE SYSTEM_CODE IS NOT NULL');
            const systemItems = {};
            systemItemsRes.forEach(r => systemItems[r.SYSTEM_CODE] = r.ITEM_ID);
            const halId = systemItems['OUT_HAL'];
            const sambaId = systemItems['OUT_SAMBA'];
            const naduId = systemItems['OUT_NADU'];
            const dryWeeId = systemItems['RAW_WEE_DRY'];

            for (const item of ITEMS) {
                const validItemId = await resolveItemId(item.ITEM_ID);
                if (!validItemId) {
                    console.error('Skipping invalid item in settle:', item);
                    continue;
                }
                item.ITEM_ID = validItemId;

                let estimatedInputUsed = 0;
                let estimatedKudu = 0;
                let estimatedHunsal = 0;

                if ((item.ITEM_ID == halId || item.ITEM_ID == sambaId || item.ITEM_ID == naduId) && yieldConfig) {
                    const halYieldFactor = parseFloat(yieldConfig.HAL_YIELD) / 100;
                    const kuduYieldFactor = parseFloat(yieldConfig.KUDU_YIELD) / 100;
                    const hunsalYieldFactor = parseFloat(yieldConfig.HUNSAL_YIELD) / 100;
                    if (halYieldFactor > 0) {
                        estimatedInputUsed = parseFloat(item.QUANTITY) / halYieldFactor;
                        estimatedKudu = estimatedInputUsed * kuduYieldFactor;
                        estimatedHunsal = estimatedInputUsed * hunsalYieldFactor;
                        if (dryWeeId) {
                            await updateInventoryLedger(dryWeeId, null, estimatedInputUsed, 'OUT', 'sale_milling_est', BILL_ID, billDate, `Estimated milled for HW Invoice ${invoiceNo}`, 1);
                        }
                    }
                }

                await pool.query('INSERT INTO mill_bill_items SET ?', {
                    BILL_ID: BILL_ID,
                    ITEM_ID: item.ITEM_ID,
                    BAG_WEIGHT: item.BAG_WEIGHT || null,
                    BAG_COUNT: item.BAG_COUNT || null,
                    QUANTITY: item.QUANTITY,
                    UNIT_PRICE: item.UNIT_PRICE,
                    TOTAL_PRICE: item.TOTAL_PRICE,
                    IS_HANDWRITTEN: 1,
                    ESTIMATED_INPUT_USED: estimatedInputUsed,
                    ESTIMATED_KUDU_GENERATED: estimatedKudu,
                    ESTIMATED_HUNSAL_GENERATED: estimatedHunsal
                });

                await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'OUT', 'sale', BILL_ID, billDate, `HW Sale Invoice ${invoiceNo}`, 1);
            }
        }

        res.json({ success: true, message: 'Bill settled successfully' });
    } catch (error) {
        console.error('Error settling mill sale:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── LIST BILLS ──────────────────────────────────────────────
router.get('/api/mill/sales/list', async (req, res) => {
    try {
        const bills = await pool.query(`
            SELECT b.*, c.NAME as CUSTOMER_NAME, c.ADDRESS as CUSTOMER_ADDRESS, c.PHONE_NUMBER as CUSTOMER_PHONE,
                   (SELECT COALESCE(SUM(bi.BAG_COUNT), 0) FROM mill_bill_items bi WHERE bi.BILL_ID = b.BILL_ID AND bi.IS_ARCHIVED = 0) as TOTAL_BAGS,
                   (SELECT DISPATCH_ID FROM mill_dispatch_bills db WHERE db.BILL_ID = b.BILL_ID LIMIT 1) as DISPATCH_ID
            FROM mill_bills b
            LEFT JOIN mill_customers c ON b.CUSTOMER_ID = c.CUSTOMER_ID
            WHERE b.IS_ACTIVE = 1
            ORDER BY b.CREATED_DATE DESC, b.BILL_ID DESC
        `);
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

        const items = await pool.query(`
            SELECT bi.*, i.NAME as ITEM_NAME, i.SYSTEM_CODE, i.CODE as ITEM_CODE
            FROM mill_bill_items bi
            JOIN mill_items i ON bi.ITEM_ID = i.ITEM_ID
            WHERE bi.BILL_ID = ? AND bi.IS_ARCHIVED = 0
        `, [req.params.id]);

        const cheques = await pool.query('SELECT * FROM mill_cheques WHERE BILL_ID = ?', [req.params.id]);

        bill.ITEMS = items;
        bill.CHEQUES = cheques;

        res.json({ success: true, result: bill });
    } catch (error) {
        console.error('Error fetching bill:', error); require('fs').writeFileSync('bill-err.log', error.stack);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── DELETE BILL (Unsettled) ──────────────────────────────────
router.post('/api/mill/sales/delete', async (req, res) => {
    try {
        const { BILL_ID } = req.body;
        
        const billRes = await pool.query('SELECT * FROM mill_bills WHERE BILL_ID = ?', [BILL_ID]);
        if (!billRes || billRes.length === 0) return res.status(404).json({ success: false, message: 'Bill not found' });
        
        if (billRes[0].IS_SETTLED) {
            return res.status(400).json({ success: false, message: 'Cannot delete a settled bill. Please unlock it first.' });
        }

        const items = await pool.query('SELECT * FROM mill_bill_items WHERE BILL_ID = ? AND IS_ARCHIVED = 0', [BILL_ID]);
        
        for (const item of items) {
            // Reverse main item out
            await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'IN', 'sale_revert', BILL_ID, new Date(), `Revert Sale ${billRes[0].INVOICE_NO}`, 1);
            
            // Reverse estimated input used if any
            if (item.ESTIMATED_INPUT_USED > 0) {
                const systemItemsRes = await pool.query('SELECT ITEM_ID FROM mill_items WHERE SYSTEM_CODE = "RAW_WEE_DRY"');
                if (systemItemsRes.length > 0) {
                    await updateInventoryLedger(systemItemsRes[0].ITEM_ID, null, item.ESTIMATED_INPUT_USED, 'IN', 'sale_milling_est_revert', BILL_ID, new Date(), `Revert Estimated milled ${billRes[0].INVOICE_NO}`, 1);
                }
            }
        }

        // Soft delete the bill
        await pool.query('UPDATE mill_bills SET IS_ACTIVE = 0 WHERE BILL_ID = ?', [BILL_ID]);
        
        res.json({ success: true, message: 'Sale deleted and inventory reverted' });
    } catch (error) {
        console.error('Error deleting mill sale:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UNLOCK BILL (Revert Settle) ──────────────────────────────
router.post('/api/mill/sales/unlock', async (req, res) => {
    try {
        const { BILL_ID } = req.body;

        const billRes = await pool.query('SELECT * FROM mill_bills WHERE BILL_ID = ?', [BILL_ID]);
        if (!billRes || billRes.length === 0) return res.status(404).json({ success: false, message: 'Bill not found' });

        // Find handwritten items added during settle
        const hwItems = await pool.query('SELECT * FROM mill_bill_items WHERE BILL_ID = ? AND IS_HANDWRITTEN = 1 AND IS_ARCHIVED = 0', [BILL_ID]);
        
        for (const item of hwItems) {
            // Reverse item
            await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'IN', 'sale_revert', BILL_ID, new Date(), `Revert HW Sale ${billRes[0].INVOICE_NO}`, 1);
            
            if (item.ESTIMATED_INPUT_USED > 0) {
                const systemItemsRes = await pool.query('SELECT ITEM_ID FROM mill_items WHERE SYSTEM_CODE = "RAW_WEE_DRY"');
                if (systemItemsRes.length > 0) {
                    await updateInventoryLedger(systemItemsRes[0].ITEM_ID, null, item.ESTIMATED_INPUT_USED, 'IN', 'sale_milling_est_revert', BILL_ID, new Date(), `Revert Estimated HW milled ${billRes[0].INVOICE_NO}`, 1);
                }
            }
        }

        // Delete handwritten items
        await pool.query('DELETE FROM mill_bill_items WHERE BILL_ID = ? AND IS_HANDWRITTEN = 1', [BILL_ID]);
        
        // Remove cheques tied to this bill if any (since they are part of the settlement)
        await pool.query('DELETE FROM mill_cheques WHERE BILL_ID = ?', [BILL_ID]);

        // Unsettle the bill
        await pool.query(
            `UPDATE mill_bills SET 
                IS_SETTLED = 0,
                HANDWRITTEN_SUB_TOTAL = 0,
                DISCOUNT = 0,
                FINAL_AMOUNT = 0,
                PAYMENT_METHOD = 'cash',
                REMARK = NULL
             WHERE BILL_ID = ?`,
            [BILL_ID]
        );

        res.json({ success: true, message: 'Bill unlocked successfully' });
    } catch (error) {
        console.error('Error unlocking mill sale:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── EDIT BILL (Unsettled) ────────────────────────────────────
router.post('/api/mill/sales/edit', async (req, res) => {
    try {
        const { BILL_ID, INVOICE_NO, BATCH_NO, CUSTOMER_ID, TOTAL_AMOUNT, DISCOUNT, NET_AMOUNT, FINAL_AMOUNT, DATE, ITEMS, CREATED_BY } = req.body;
        
        const billRes = await pool.query('SELECT * FROM mill_bills WHERE BILL_ID = ?', [BILL_ID]);
        if (!billRes || billRes.length === 0) return res.status(404).json({ success: false, message: 'Bill not found' });
        
        if (billRes[0].IS_SETTLED) {
            return res.status(400).json({ success: false, message: 'Cannot edit a settled bill. Please unlock it first.' });
        }

        const customerId = (CUSTOMER_ID && !isNaN(Number(CUSTOMER_ID))) ? Number(CUSTOMER_ID) : null;
        const finalAmt = FINAL_AMOUNT !== undefined ? Number(FINAL_AMOUNT) : (NET_AMOUNT || TOTAL_AMOUNT || 0);

        // 1. Revert Old Inventory
        const oldItems = await pool.query('SELECT * FROM mill_bill_items WHERE BILL_ID = ? AND IS_ARCHIVED = 0 AND (IS_HANDWRITTEN IS NULL OR IS_HANDWRITTEN = 0)', [BILL_ID]);
        for (const item of oldItems) {
            await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'IN', 'sale_edit_revert', BILL_ID, new Date(), `Edit Revert ${INVOICE_NO}`, CREATED_BY);
            if (item.ESTIMATED_INPUT_USED > 0) {
                const systemItemsRes = await pool.query('SELECT ITEM_ID FROM mill_items WHERE SYSTEM_CODE = "RAW_WEE_DRY"');
                if (systemItemsRes.length > 0) {
                    await updateInventoryLedger(systemItemsRes[0].ITEM_ID, null, item.ESTIMATED_INPUT_USED, 'IN', 'sale_edit_est_revert', BILL_ID, new Date(), `Edit Est Revert ${INVOICE_NO}`, CREATED_BY);
                }
            }
        }

        // 2. Delete Old Items
        await pool.query('DELETE FROM mill_bill_items WHERE BILL_ID = ? AND IS_ARCHIVED = 0 AND (IS_HANDWRITTEN IS NULL OR IS_HANDWRITTEN = 0)', [BILL_ID]);

        // 3. Update Bill Header
        await pool.query(
            `UPDATE mill_bills SET 
                BATCH_NO = ?, CUSTOMER_ID = ?, TOTAL_AMOUNT = ?, DISCOUNT = ?, 
                NET_AMOUNT = ?, PRINTED_SUB_TOTAL = ?, FINAL_AMOUNT = ?, DATE = ?
             WHERE BILL_ID = ?`,
            [BATCH_NO || null, customerId, TOTAL_AMOUNT || 0, DISCOUNT || 0, NET_AMOUNT || 0, TOTAL_AMOUNT || 0, finalAmt, DATE, BILL_ID]
        );

        // 4. Insert New Items & Deduct Inventory
        const yieldConfigRes = await pool.query('SELECT * FROM mill_yield_configs LIMIT 1');
        const yieldConfig = yieldConfigRes && yieldConfigRes.length > 0 ? yieldConfigRes[0] : null;

        const systemItemsRes = await pool.query('SELECT ITEM_ID, SYSTEM_CODE FROM mill_items WHERE SYSTEM_CODE IS NOT NULL');
        const systemItems = {};
        systemItemsRes.forEach(i => systemItems[i.SYSTEM_CODE] = i.ITEM_ID);
        
        const dryWeeId = systemItems['RAW_WEE_DRY'];
        const halId = systemItems['OUT_HAL'];
        const sambaId = systemItems['OUT_SAMBA'];
        const naduId = systemItems['OUT_NADU'];

        for (const item of ITEMS) {
            const validItemId = await resolveItemId(item.ITEM_ID);
            if (!validItemId) {
                console.error('Skipping invalid item in edit:', item);
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
                        await updateInventoryLedger(dryWeeId, null, estimatedInputUsed, 'OUT', 'sale_edit_est', BILL_ID, DATE, `Edit Est milled ${INVOICE_NO}`, CREATED_BY);
                    }
                }
            }

            await pool.query('INSERT INTO mill_bill_items SET ?', {
                BILL_ID: BILL_ID,
                ITEM_ID: item.ITEM_ID,
                BAG_WEIGHT: item.BAG_WEIGHT || null,
                BAG_COUNT: item.BAG_COUNT || null,
                QUANTITY: item.QUANTITY,
                UNIT_PRICE: item.UNIT_PRICE,
                TOTAL_PRICE: item.TOTAL_PRICE,
                IS_HANDWRITTEN: 0,
                ESTIMATED_INPUT_USED: estimatedInputUsed,
                ESTIMATED_KUDU_GENERATED: estimatedKudu,
                ESTIMATED_HUNSAL_GENERATED: estimatedHunsal
            });

            await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'OUT', 'sale_edit', BILL_ID, DATE, `Edit Sale ${INVOICE_NO}`, CREATED_BY);
        }

        res.json({ success: true, message: 'Sale updated successfully' });
    } catch (error) {
        console.error('Error editing mill sale:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
