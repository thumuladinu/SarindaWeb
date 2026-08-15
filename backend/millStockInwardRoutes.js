// millStockInwardRoutes.js — Stock Inward (Buy Section) for Chamika Rice Mill
// Handles 3 types: store_transfer, mill_purchase, go_and_get
const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

router.use(cors());
pool.query = util.promisify(pool.query);

// Auto-migrate new columns for condition and dry percentage
(async () => {
    try {
        await pool.query("ALTER TABLE mill_stock_inward ADD COLUMN `CONDITION` VARCHAR(20) DEFAULT 'dry'");
    } catch (e) {}
    try {
        await pool.query("ALTER TABLE mill_stock_inward ADD COLUMN `DRY_PERCENTAGE` DECIMAL(5,2) DEFAULT 100.00");
    } catch (e) {}
    try {
        await pool.query("ALTER TABLE mill_stock_inward ADD COLUMN `GROSS_WEIGHT` DECIMAL(12,2) DEFAULT NULL");
    } catch (e) {}
})();

// Generate reference number: MI-YYYYMMDD-XXXX
const generateReferenceNo = async (type) => {
    const prefix = type === 'store_transfer' ? 'ST' : type === 'mill_purchase' ? 'MP' : 'GG';
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    
    const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM mill_stock_inward WHERE DATE(CREATED_DATE) = CURDATE() AND INWARD_TYPE = ?`,
        [type]
    );
    const seq = (countResult[0]?.count || 0) + 1;
    return `${prefix}-${dateStr}-${String(seq).padStart(4, '0')}`;
};

// Update inventory ledger and mill_items stock
const updateInventoryLedger = async (itemId, placeId, quantity, type, refType, refId, date, notes, createdBy) => {
    // Get current balance for this item+place
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
        CREATED_BY: createdBy || null,
    });

    // Also update STOCK in mill_items (aggregate)
    if (type === 'IN' || type === 'ADJ_IN') {
        await pool.query('UPDATE mill_items SET STOCK = COALESCE(STOCK, 0) + ? WHERE ITEM_ID = ?', [quantity, itemId]);
    } else {
        await pool.query('UPDATE mill_items SET STOCK = COALESCE(STOCK, 0) - ? WHERE ITEM_ID = ?', [quantity, itemId]);
    }
};

// ─── LIST ALL INWARD RECORDS ────────────────────────────────
router.post('/api/mill/inward/list', async (req, res) => {
    try {
        const { type, dateFrom, dateTo, itemId, placeId, limit, offset } = req.body;
        
        let sql = `SELECT si.*, 
            mi.NAME as ITEM_NAME, mi.CODE as ITEM_CODE, mi.CATEGORY as ITEM_CATEGORY, mi.UNIT as ITEM_UNIT,
            mp.NAME as PLACE_NAME, mp.DISTRICT as PLACE_DISTRICT,
            mc.NAME as SUPPLIER_NAME
            FROM mill_stock_inward si
            LEFT JOIN mill_items mi ON si.ITEM_ID = mi.ITEM_ID
            LEFT JOIN mill_places mp ON si.PLACE_ID = mp.PLACE_ID
            LEFT JOIN mill_customers mc ON si.SUPPLIER_ID = mc.CUSTOMER_ID
            WHERE si.IS_ACTIVE = 1`;
        
        const params = [];
        
        if (type && type !== 'all') {
            sql += ' AND si.INWARD_TYPE = ?';
            params.push(type);
        }
        if (dateFrom) {
            sql += ' AND si.DATE >= ?';
            params.push(dateFrom);
        }
        if (dateTo) {
            sql += ' AND si.DATE <= ?';
            params.push(dateTo);
        }
        if (itemId) {
            sql += ' AND si.ITEM_ID = ?';
            params.push(itemId);
        }
        if (placeId) {
            sql += ' AND si.PLACE_ID = ?';
            params.push(placeId);
        }
        
        sql += ' ORDER BY si.CREATED_DATE DESC';
        
        if (limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(limit));
            if (offset) {
                sql += ' OFFSET ?';
                params.push(parseInt(offset));
            }
        }

        const result = await pool.query(sql, params);
        return res.status(200).json({ success: true, result: Array.isArray(result) ? result.map(r => ({ ...r })) : [] });
    } catch (error) {
        console.error('Error fetching mill inward records:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── ADD INWARD RECORD ──────────────────────────────────────
router.post('/api/mill/inward/add', async (req, res) => {
    try {
        const data = { ...req.body };
        
        // Validate required fields
        if (!data.INWARD_TYPE || !data.ITEM_ID || !data.DATE) {
            return res.status(400).json({ success: false, message: 'Type, Item, and Date are required' });
        }

        // Generate reference number
        data.REFERENCE_NO = await generateReferenceNo(data.INWARD_TYPE);

        // Calculate surplus/wastage if both quantities present
        if (data.QUANTITY && data.SOURCE_QUANTITY) {
            data.SURPLUS_WASTAGE = parseFloat(data.QUANTITY) - parseFloat(data.SOURCE_QUANTITY);
        }

        // Calculate total price
        if (data.QUANTITY && data.PRICE_PER_UNIT) {
            data.TOTAL_PRICE = parseFloat(data.QUANTITY) * parseFloat(data.PRICE_PER_UNIT);
        }

        // Clean empty strings
        Object.keys(data).forEach(key => {
            if (data[key] === '') data[key] = null;
        });

        // Remove non-column fields
        const allowedFields = [
            'INWARD_TYPE', 'REFERENCE_NO', 'ITEM_ID', 'PLACE_ID', 'QUANTITY', 'SOURCE_QUANTITY',
            'SURPLUS_WASTAGE', 'PRICE_PER_UNIT', 'TOTAL_PRICE', 'NO_OF_BAGS', 'STORE_NO',
            'STORE_TRANSFER_REF', 'VEHICLE_NO', 'DRIVER_NAME', 'SUPPLIER_ID', 'DATE', 'CREATED_DATE',
            'NOTES', 'RECEIVED_BY', 'CREATED_BY', 'IS_SYNCED', 'LOCAL_ID', 'SYNC_TIMESTAMP',
            'CONDITION', 'DRY_PERCENTAGE', 'GROSS_WEIGHT', 'MOISTURE_LOSS_PERCENT'
        ];
        const insertData = {};
        allowedFields.forEach(f => {
            if (data[f] !== undefined) insertData[f] = data[f];
        });
        if (data.CREATED_DATE) insertData.CREATED_DATE = new Date(data.CREATED_DATE);

        const insertResult = await pool.query('INSERT INTO mill_stock_inward SET ?', insertData);

        if (insertResult.affectedRows > 0) {
            const inwardId = insertResult.insertId;

            // Update inventory ledger
            await updateInventoryLedger(
                data.ITEM_ID,
                data.PLACE_ID || null,
                data.QUANTITY,
                'IN',
                'inward',
                inwardId,
                data.DATE,
                `${data.INWARD_TYPE}: ${data.REFERENCE_NO}`,
                data.CREATED_BY
            );

            // ─── DRYING OPERATION (AMU WEE -> DRY WEE) ───
            if (data.MOISTURE_LOSS_PERCENT) {
                const lossPercent = parseFloat(data.MOISTURE_LOSS_PERCENT);
                if (lossPercent >= 0 && lossPercent <= 100) {
                    const finalDryWeight = parseFloat(data.QUANTITY) * (1 - (lossPercent / 100));

                    // Get ITEM_ID for Dry Wee
                    const [dryWeeRes] = await pool.query('SELECT ITEM_ID FROM mill_items WHERE SYSTEM_CODE = ?', ['RAW_WEE_DRY']);
                    if (dryWeeRes && dryWeeRes.length > 0) {
                        const dryWeeItemId = dryWeeRes[0].ITEM_ID;

                        // Deduct Amu Wee
                        await updateInventoryLedger(
                            data.ITEM_ID,
                            data.PLACE_ID || null,
                            data.QUANTITY,
                            'OUT',
                            'drying',
                            inwardId,
                            data.DATE,
                            `Drying Moisture Loss: ${lossPercent}%`,
                            data.CREATED_BY
                        );

                        // Add Dry Wee
                        await updateInventoryLedger(
                            dryWeeItemId,
                            data.PLACE_ID || null,
                            finalDryWeight,
                            'IN',
                            'drying',
                            inwardId,
                            data.DATE,
                            `Drying Result from Inward ${data.REFERENCE_NO}`,
                            data.CREATED_BY
                        );

                        // Record drying operation
                        await pool.query('INSERT INTO mill_drying_operations SET ?', {
                            INWARD_ID: inwardId,
                            ORIGINAL_WEIGHT: data.QUANTITY,
                            MOISTURE_LOSS_PERCENT: lossPercent,
                            FINAL_DRY_WEIGHT: finalDryWeight,
                            DATE: data.DATE,
                            CREATED_BY: data.CREATED_BY
                        });
                    }
                }
            }

            return res.status(200).json({ 
                success: true, 
                message: 'Stock inward recorded successfully',
                id: inwardId,
                referenceNo: data.REFERENCE_NO
            });
        }
        return res.status(500).json({ success: false, message: 'Failed to add record' });
    } catch (error) {
        console.error('Error adding mill inward:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── PENDING STORE TRANSFERS ────────────────────────────────
// Fetches transfers sent from stores to the mill that are pending
router.get('/api/mill/inward/pending-transfers', async (req, res) => {
    try {
        const query = `
            SELECT MAX(st.id) as STORE_TRANSFER_ID, MAX(st.store_from_id) as STORE_NO, MAX(st.main_item_id) as STORE_ITEM_ID,
            MAX(st.main_item_name) as STORE_ITEM_NAME, COALESCE(MAX(st.transfer_code), st.local_id) as TRANSFER_CODE,
            MAX(st.main_item_qty) as STORE_QUANTITY, MAX(st.has_conversion) as has_conversion, MAX(st.status) as status, MAX(st.request_date) as DATE,
            MAX(sm.mill_item_id) as MAPPED_MILL_ITEM_ID, MAX(mi.CODE) as MAPPED_MILL_ITEM_CODE, MAX(mi.NAME) as MAPPED_MILL_ITEM_NAME
            FROM store_stock_transfers st
            LEFT JOIN store_mill_item_mapping sm ON st.main_item_id = sm.store_item_id
            LEFT JOIN mill_items mi ON sm.mill_item_id = mi.ITEM_ID
            WHERE st.store_to_id = 999 AND (st.status = 'PENDING' OR st.status = 'APPROVED' OR st.status = 'IN_TRANSIT')
            GROUP BY st.local_id
            ORDER BY MAX(st.request_date) DESC
        `;
        const transfers = await pool.query(query);
        return res.status(200).json({ success: true, result: Array.isArray(transfers) ? transfers.map(r => ({ ...r })) : [] });
    } catch (error) {
        // Table might not exist yet during migration
        if (error.code === 'ER_NO_SUCH_TABLE') {
             return res.status(200).json({ success: true, result: [] });
        }
        console.error('Error fetching pending transfers:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── ACCEPT STORE TRANSFER ──────────────────────────────────
// When a transfer comes from stores, mill accepts it with mill-side measurements
router.post('/api/mill/inward/accept-transfer', async (req, res) => {
    try {
        const {
            STORE_TRANSFER_ID, STORE_NO, ITEM_ID, PLACE_ID,
            STORE_QUANTITY, STORE_NO_OF_BAGS,
            MILL_QUANTITY, MILL_NO_OF_BAGS,
            PRICE_PER_UNIT, DATE, NOTES, ACCEPTED_BY, CREATED_BY
        } = req.body;

        if (!ITEM_ID || !MILL_QUANTITY || !DATE) {
            return res.status(400).json({ success: false, message: 'Item, Mill Quantity, and Date are required' });
        }

        const surplus = MILL_QUANTITY && STORE_QUANTITY 
            ? parseFloat(MILL_QUANTITY) - parseFloat(STORE_QUANTITY) 
            : null;
        const totalPrice = MILL_QUANTITY && PRICE_PER_UNIT 
            ? parseFloat(MILL_QUANTITY) * parseFloat(PRICE_PER_UNIT) 
            : null;

        let storeTransferRef = null;
        if (STORE_TRANSFER_ID) {
            const transferRes = await pool.query('SELECT transfer_code, local_id FROM store_stock_transfers WHERE id = ?', [STORE_TRANSFER_ID]);
            if (transferRes.length > 0) {
                storeTransferRef = transferRes[0].transfer_code || transferRes[0].local_id;
            }
        }

        // 1. Create mill_stock_transfers record
        const transferResult = await pool.query('INSERT INTO mill_stock_transfers SET ?', {
            STORE_TRANSFER_ID: STORE_TRANSFER_ID || null,
            STORE_NO: STORE_NO || 1,
            ITEM_ID,
            PLACE_ID: PLACE_ID || null,
            STORE_QUANTITY: STORE_QUANTITY || null,
            STORE_NO_OF_BAGS: STORE_NO_OF_BAGS || null,
            MILL_QUANTITY: MILL_QUANTITY,
            MILL_NO_OF_BAGS: MILL_NO_OF_BAGS || null,
            SURPLUS_WASTAGE: surplus,
            PRICE_PER_UNIT: PRICE_PER_UNIT || null,
            TOTAL_PRICE: totalPrice,
            STATUS: 'accepted',
            ACCEPTED_BY: ACCEPTED_BY || null,
            ACCEPTED_DATE: new Date(),
            DATE,
            NOTES: NOTES || null,
            CREATED_BY: CREATED_BY || null,
        });

        // 2. Also create a mill_stock_inward record
        const refNo = await generateReferenceNo('store_transfer');
        const inwardResult = await pool.query('INSERT INTO mill_stock_inward SET ?', {
            INWARD_TYPE: 'store_transfer',
            REFERENCE_NO: refNo,
            ITEM_ID,
            PLACE_ID: PLACE_ID || null,
            QUANTITY: MILL_QUANTITY,
            SOURCE_QUANTITY: STORE_QUANTITY || null,
            SURPLUS_WASTAGE: surplus,
            PRICE_PER_UNIT: PRICE_PER_UNIT || null,
            TOTAL_PRICE: totalPrice,
            NO_OF_BAGS: MILL_NO_OF_BAGS || null,
            STORE_NO: STORE_NO || 1,
            STORE_TRANSFER_REF: storeTransferRef || (STORE_TRANSFER_ID ? `STR-${STORE_TRANSFER_ID}` : null),
            DATE,
            NOTES: NOTES || null,
            RECEIVED_BY: ACCEPTED_BY || null,
            CREATED_BY: CREATED_BY || null,
        });

        // 3. Update inventory ledger
        if (inwardResult.affectedRows > 0) {
            await updateInventoryLedger(
                ITEM_ID,
                PLACE_ID || null,
                MILL_QUANTITY,
                'IN',
                'store_transfer',
                inwardResult.insertId,
                DATE,
                `Store Transfer from Store ${STORE_NO || 1}: ${refNo}`,
                CREATED_BY
            );
        }

        // 4. Update the store_stock_transfers table status if applicable
        if (STORE_TRANSFER_ID) {
            try {
                await pool.query(
                    `UPDATE store_stock_transfers SET status = 'COMPLETED' WHERE local_id = (SELECT local_id FROM (SELECT local_id FROM store_stock_transfers WHERE id = ?) AS tmp) OR id = ?`,
                    [STORE_TRANSFER_ID, STORE_TRANSFER_ID]
                );
                
                if (global.io) {
                    global.io.emit('transfer_accepted', { 
                        transferId: STORE_TRANSFER_ID,
                        storeNo: STORE_NO,
                        millQuantity: MILL_QUANTITY
                    });
                }
            } catch (e) {
                // Table might not have these columns yet, log but don't fail
                console.log('Note: Could not update store_stock_transfers:', e.message);
                
                // Still emit event even if DB update failed columns
                if (global.io) {
                    global.io.emit('transfer_accepted', { 
                        transferId: STORE_TRANSFER_ID,
                        storeNo: STORE_NO,
                        millQuantity: MILL_QUANTITY
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Transfer accepted successfully',
            transferId: transferResult.insertId,
            inwardId: inwardResult.insertId,
            referenceNo: refNo,
        });
    } catch (error) {
        console.error('Error accepting store transfer:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UPDATE INWARD RECORD ───────────────────────────────────
router.post('/api/mill/inward/update', async (req, res) => {
    try {
        const { INWARD_ID, ...updates } = req.body;
        if (!INWARD_ID) {
            return res.status(400).json({ success: false, message: 'Inward ID is required' });
        }

        // Get old record for ledger reversal
        const [oldRecord] = await pool.query('SELECT * FROM mill_stock_inward WHERE INWARD_ID = ?', [INWARD_ID]);
        if (!oldRecord) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        // Recalculate derived fields
        if (updates.QUANTITY && updates.SOURCE_QUANTITY) {
            updates.SURPLUS_WASTAGE = parseFloat(updates.QUANTITY) - parseFloat(updates.SOURCE_QUANTITY);
        }
        if (updates.QUANTITY && updates.PRICE_PER_UNIT) {
            updates.TOTAL_PRICE = parseFloat(updates.QUANTITY) * parseFloat(updates.PRICE_PER_UNIT);
        }

        // Clean empty strings
        Object.keys(updates).forEach(key => {
            if (updates[key] === '') updates[key] = null;
        });

        delete updates.INWARD_ID;
        delete updates.REFERENCE_NO;
        delete updates.CREATED_DATE;

        const updateResult = await pool.query('UPDATE mill_stock_inward SET ? WHERE INWARD_ID = ?', [updates, INWARD_ID]);

        if (updateResult.affectedRows > 0) {
            // If quantity changed, update ledger
            const newQty = parseFloat(updates.QUANTITY || oldRecord.QUANTITY);
            const oldQty = parseFloat(oldRecord.QUANTITY);
            if (newQty !== oldQty) {
                const diff = newQty - oldQty;
                if (diff > 0) {
                    await updateInventoryLedger(
                        updates.ITEM_ID || oldRecord.ITEM_ID,
                        updates.PLACE_ID !== undefined ? updates.PLACE_ID : oldRecord.PLACE_ID,
                        Math.abs(diff), 'ADJ_IN', 'inward_update', INWARD_ID,
                        updates.DATE || oldRecord.DATE,
                        `Adjusted inward quantity (+${diff})`,
                        updates.CREATED_BY || oldRecord.CREATED_BY
                    );
                } else {
                    await updateInventoryLedger(
                        updates.ITEM_ID || oldRecord.ITEM_ID,
                        updates.PLACE_ID !== undefined ? updates.PLACE_ID : oldRecord.PLACE_ID,
                        Math.abs(diff), 'ADJ_OUT', 'inward_update', INWARD_ID,
                        updates.DATE || oldRecord.DATE,
                        `Adjusted inward quantity (${diff})`,
                        updates.CREATED_BY || oldRecord.CREATED_BY
                    );
                }
            }
            return res.status(200).json({ success: true, message: 'Record updated successfully' });
        }
        return res.status(500).json({ success: false, message: 'Failed to update record' });
    } catch (error) {
        console.error('Error updating mill inward:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── DEACTIVATE (SOFT DELETE) ───────────────────────────────
router.post('/api/mill/inward/deactivate', async (req, res) => {
    try {
        const { INWARD_ID } = req.body;
        if (!INWARD_ID) {
            return res.status(400).json({ success: false, message: 'Inward ID is required' });
        }

        // Get record for ledger reversal
        const records = await pool.query('SELECT * FROM mill_stock_inward WHERE INWARD_ID = ?', [INWARD_ID]);
        if (!records.length) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        const record = records[0];

        // Deactivate the record
        const updateResult = await pool.query(
            'UPDATE mill_stock_inward SET IS_ACTIVE = 0 WHERE INWARD_ID = ?',
            [INWARD_ID]
        );

        if (updateResult.affectedRows > 0) {
            // Reverse the inventory entry
            await updateInventoryLedger(
                record.ITEM_ID,
                record.PLACE_ID,
                record.QUANTITY,
                'ADJ_OUT',
                'inward_delete',
                INWARD_ID,
                new Date().toISOString().slice(0, 10),
                `Reversed: ${record.REFERENCE_NO} deleted`,
                record.CREATED_BY
            );
            return res.status(200).json({ success: true, message: 'Record deactivated and inventory reversed' });
        }
        return res.status(500).json({ success: false, message: 'Failed to deactivate record' });
    } catch (error) {
        console.error('Error deactivating mill inward:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UPDATE INWARD RECORD ───────────────────────────────────
router.post('/api/mill/inward/update', async (req, res) => {
    try {
        const { INWARD_ID } = req.body;
        if (!INWARD_ID) {
            return res.status(400).json({ success: false, message: 'INWARD_ID is required' });
        }

        const existing = await pool.query('SELECT * FROM mill_stock_inward WHERE INWARD_ID = ? AND IS_ACTIVE = 1', [INWARD_ID]);
        if (!existing || existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Inward record not found' });
        }
        const oldRecord = existing[0];

        const data = req.body;
        const allowedFields = [
            'INWARD_TYPE', 'ITEM_ID', 'PLACE_ID', 'QUANTITY', 'SOURCE_QUANTITY',
            'SURPLUS_WASTAGE', 'PRICE_PER_UNIT', 'TOTAL_PRICE', 'NO_OF_BAGS', 'STORE_NO',
            'STORE_TRANSFER_REF', 'VEHICLE_NO', 'DRIVER_NAME', 'SUPPLIER_ID', 'DATE',
            'NOTES', 'CONDITION', 'DRY_PERCENTAGE', 'GROSS_WEIGHT', 'MOISTURE_LOSS_PERCENT'
        ];
        const updateData = {};
        allowedFields.forEach(f => {
            if (data[f] !== undefined) updateData[f] = data[f];
        });

        await pool.query('UPDATE mill_stock_inward SET ? WHERE INWARD_ID = ?', [updateData, INWARD_ID]);

        // Adjust inventory ledger if quantity changed
        const newQty = parseFloat(data.QUANTITY !== undefined ? data.QUANTITY : oldRecord.QUANTITY);
        const oldQty = parseFloat(oldRecord.QUANTITY || 0);
        const diff = newQty - oldQty;

        const itemId = data.ITEM_ID || oldRecord.ITEM_ID;
        const placeId = data.PLACE_ID !== undefined ? data.PLACE_ID : oldRecord.PLACE_ID;
        const date = data.DATE || oldRecord.DATE;

        if (diff !== 0) {
            await updateInventoryLedger(
                itemId,
                placeId,
                Math.abs(diff),
                diff > 0 ? 'ADJ_IN' : 'ADJ_OUT',
                'inward_edit',
                INWARD_ID,
                date,
                `Edit inward ${oldRecord.REFERENCE_NO}: qty adjusted by ${diff > 0 ? '+' : ''}${diff}kg`,
                data.UPDATED_BY || oldRecord.CREATED_BY
            );
        }

        return res.status(200).json({ success: true, message: 'Stock inward record updated successfully' });
    } catch (error) {
        console.error('Error updating mill inward:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── SUMMARY STATS ──────────────────────────────────────────
router.post('/api/mill/inward/summary', async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.body;
        const today = new Date().toISOString().slice(0, 10);
        const from = dateFrom || today;
        const to = dateTo || today;

        const summary = await pool.query(`
            SELECT 
                INWARD_TYPE,
                COUNT(*) as total_records,
                COALESCE(SUM(QUANTITY), 0) as total_quantity,
                COALESCE(SUM(TOTAL_PRICE), 0) as total_value,
                COALESCE(SUM(NO_OF_BAGS), 0) as total_bags
            FROM mill_stock_inward 
            WHERE IS_ACTIVE = 1 AND DATE BETWEEN ? AND ?
            GROUP BY INWARD_TYPE
        `, [from, to]);

        const totalAll = await pool.query(`
            SELECT 
                COUNT(*) as total_records,
                COALESCE(SUM(QUANTITY), 0) as total_quantity,
                COALESCE(SUM(TOTAL_PRICE), 0) as total_value
            FROM mill_stock_inward 
            WHERE IS_ACTIVE = 1 AND DATE BETWEEN ? AND ?
        `, [from, to]);

        return res.status(200).json({
            success: true,
            byType: Array.isArray(summary) ? summary.map(r => ({ ...r })) : [],
            totals: totalAll[0] || {},
        });
    } catch (error) {
        console.error('Error fetching inward summary:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── SYNC ENDPOINT (for Electron offline-first) ─────────────
router.post('/api/mill/inward/sync', async (req, res) => {
    try {
        const { records } = req.body;
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ success: false, message: 'No records to sync' });
        }

        const results = [];
        for (const record of records) {
            try {
                // Check if already synced (by LOCAL_ID)
                if (record.LOCAL_ID) {
                    const existing = await pool.query(
                        'SELECT INWARD_ID FROM mill_stock_inward WHERE LOCAL_ID = ?',
                        [record.LOCAL_ID]
                    );
                    if (existing.length > 0) {
                        results.push({ localId: record.LOCAL_ID, status: 'already_synced', serverId: existing[0].INWARD_ID });
                        continue;
                    }
                }

                // Generate reference number
                record.REFERENCE_NO = await generateReferenceNo(record.INWARD_TYPE);
                record.IS_SYNCED = 1;
                record.SYNC_TIMESTAMP = new Date();

                // Clean and insert
                Object.keys(record).forEach(key => {
                    if (record[key] === '') record[key] = null;
                });

                const allowedFields = [
                    'INWARD_TYPE', 'REFERENCE_NO', 'ITEM_ID', 'PLACE_ID', 'QUANTITY', 'SOURCE_QUANTITY',
                    'SURPLUS_WASTAGE', 'PRICE_PER_UNIT', 'TOTAL_PRICE', 'NO_OF_BAGS', 'STORE_NO',
                    'STORE_TRANSFER_REF', 'VEHICLE_NO', 'DRIVER_NAME', 'SUPPLIER_ID', 'DATE',
                    'NOTES', 'RECEIVED_BY', 'CREATED_BY', 'IS_SYNCED', 'LOCAL_ID', 'SYNC_TIMESTAMP'
                ];
                const insertData = {};
                allowedFields.forEach(f => {
                    if (record[f] !== undefined) insertData[f] = record[f];
                });

                const insertResult = await pool.query('INSERT INTO mill_stock_inward SET ?', insertData);

                if (insertResult.affectedRows > 0) {
                    await updateInventoryLedger(
                        record.ITEM_ID, record.PLACE_ID || null, record.QUANTITY,
                        'IN', 'inward', insertResult.insertId,
                        record.DATE, `Synced: ${record.REFERENCE_NO}`, record.CREATED_BY
                    );
                    results.push({ localId: record.LOCAL_ID, status: 'synced', serverId: insertResult.insertId, referenceNo: record.REFERENCE_NO });
                }
            } catch (err) {
                results.push({ localId: record.LOCAL_ID, status: 'error', error: err.message });
            }
        }

        return res.status(200).json({ success: true, results });
    } catch (error) {
        console.error('Error syncing mill inward records:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── INVENTORY STATUS (per item, per place) ─────────────────
router.post('/api/mill/inventory/status', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                mi.ITEM_ID, mi.CODE, mi.NAME, mi.CATEGORY, mi.SUB_TYPE, mi.UNIT,
                COALESCE(mi.STOCK, 0) as TOTAL_STOCK,
                (SELECT GROUP_CONCAT(
                    CONCAT(mp.NAME, ':', COALESCE(sub.place_balance, 0))
                    SEPARATOR '|'
                ) FROM (
                    SELECT PLACE_ID, SUM(CASE 
                        WHEN TYPE IN ('IN','ADJ_IN') THEN QUANTITY 
                        WHEN TYPE IN ('OUT','ADJ_OUT') THEN -QUANTITY 
                        ELSE 0 END) as place_balance
                    FROM mill_inventory_ledger 
                    WHERE ITEM_ID = mi.ITEM_ID AND IS_ACTIVE = 1
                    GROUP BY PLACE_ID
                ) sub
                LEFT JOIN mill_places mp ON sub.PLACE_ID = mp.PLACE_ID
                ) as PLACE_BREAKDOWN
            FROM mill_items mi
            WHERE mi.IS_ACTIVE = 1
            ORDER BY mi.CATEGORY, mi.NAME
        `);

        return res.status(200).json({ 
            success: true, 
            result: Array.isArray(result) ? result.map(r => ({ ...r })) : [] 
        });
    } catch (error) {
        console.error('Error fetching inventory status:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── INVENTORY LEDGER HISTORY ───────────────────────────────
router.post('/api/mill/inventory/ledger', async (req, res) => {
    try {
        const { itemId, placeId, dateFrom, dateTo, limit } = req.body;
        
        let sql = `SELECT l.*, mi.NAME as ITEM_NAME, mi.CODE as ITEM_CODE, mi.UNIT as ITEM_UNIT,
            mp.NAME as PLACE_NAME
            FROM mill_inventory_ledger l
            LEFT JOIN mill_items mi ON l.ITEM_ID = mi.ITEM_ID
            LEFT JOIN mill_places mp ON l.PLACE_ID = mp.PLACE_ID
            WHERE l.IS_ACTIVE = 1`;
        
        const params = [];
        
        if (itemId) { sql += ' AND l.ITEM_ID = ?'; params.push(itemId); }
        if (placeId) { sql += ' AND l.PLACE_ID = ?'; params.push(placeId); }
        if (dateFrom) { sql += ' AND l.DATE >= ?'; params.push(dateFrom); }
        if (dateTo) { sql += ' AND l.DATE <= ?'; params.push(dateTo); }
        
        sql += ' ORDER BY l.CREATED_DATE DESC';
        if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }

        const result = await pool.query(sql, params);
        return res.status(200).json({ success: true, result: Array.isArray(result) ? result.map(r => ({ ...r })) : [] });
    } catch (error) {
        console.error('Error fetching inventory ledger:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
