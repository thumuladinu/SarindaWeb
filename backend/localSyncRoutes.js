const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');

// Promisify the pool.query method
// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Database Migration: Add BILL_DATA column if not exists
(async () => {
    try {
        await pool.query("ALTER TABLE store_transactions ADD COLUMN BILL_DATA JSON DEFAULT NULL");
        console.log("Verified 'store_transactions' table: Added BILL_DATA column.");
    } catch (err) {
        // Ignore "Duplicate column" error
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log("Verified 'store_transactions' table (BILL_DATA exists or other error):", err.message);
        }
    }
})();

// Database Migration: Add WEIGHT_CODE column if not exists
(async () => {
    try {
        await pool.query("ALTER TABLE store_transactions ADD COLUMN WEIGHT_CODE VARCHAR(50) DEFAULT NULL");
        try {
            await pool.query("CREATE INDEX idx_store_transactions_weight_code ON store_transactions(WEIGHT_CODE)");
        } catch (e) { }
        console.log("Verified 'store_transactions' table: Added WEIGHT_CODE column.");
    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log("Verified 'store_transactions' table (WEIGHT_CODE exists or other error):", err.message);
        }
    }
})();

// Database Migration: Add STOCK_DATE column and Backfill
(async () => {
    try {
        await pool.query("ALTER TABLE store_transactions ADD COLUMN STOCK_DATE DATETIME DEFAULT NULL");
        try {
            await pool.query("CREATE INDEX idx_store_transactions_stock_date ON store_transactions(STOCK_DATE)");
        } catch (e) { }
        console.log("Verified 'store_transactions' table: Added STOCK_DATE column.");

        // Backfill Logic
        console.log("[Migration] Backfilling STOCK_DATE...");

        // 1. Update all to default (Transaction Date)
        await pool.query("UPDATE store_transactions SET STOCK_DATE = CREATED_DATE WHERE STOCK_DATE IS NULL");

        // 2. Correct Store 2 records linked to Weighting (Use Weighting Date)
        // Fix: Explicitly handle collation mismatch between tables
        await pool.query(`
            UPDATE store_transactions t
            JOIN weight_measurements wm ON t.WEIGHT_CODE = wm.CODE COLLATE utf8mb4_general_ci
            SET t.STOCK_DATE = wm.CREATED_DATE
            WHERE t.STORE_NO = 2 AND t.WEIGHT_CODE IS NOT NULL AND wm.IS_ACTIVE = 1
        `);

        console.log("[Migration] Backfill complete: Verified STOCK_DATE logic.");

    } catch (err) {
        if (err.code !== 'ER_DUP_FIELDNAME') {
            console.log("Verified 'store_transactions' table (STOCK_DATE exists or other error):", err.message);
        }
    }
})();

// Database Migration: Add UNIQUE constraint on CODE column to prevent duplicates
(async () => {
    try {
        // Step 1: Clean up existing duplicates (keep IS_ACTIVE=1 preferred, then newest EDITED_DATE)
        const duplicatesQuery = `
            SELECT CODE, COUNT(*) as cnt 
            FROM store_items 
            WHERE CODE IS NOT NULL AND CODE != '' 
            GROUP BY CODE 
            HAVING cnt > 1
        `;
        const duplicateCodes = await pool.query(duplicatesQuery);

        if (duplicateCodes && duplicateCodes.length > 0) {
            console.log(`[Migration] Found ${duplicateCodes.length} duplicate CODE(s), cleaning up...`);
            for (const dup of duplicateCodes) {
                // Get all items with this CODE, ordered by preference
                const items = await pool.query(
                    'SELECT ITEM_ID FROM store_items WHERE CODE = ? ORDER BY IS_ACTIVE DESC, EDITED_DATE DESC',
                    [dup.CODE]
                );
                if (items.length > 1) {
                    // Keep the first one, delete rest
                    const deleteIds = items.slice(1).map(i => i.ITEM_ID);
                    await pool.query('DELETE FROM store_items WHERE ITEM_ID IN (?)', [deleteIds]);
                    console.log(`[Migration] Removed ${deleteIds.length} duplicate(s) for CODE: ${dup.CODE}`);
                }
            }
        }

        // Step 2: Create unique index on CODE column
        await pool.query("CREATE UNIQUE INDEX idx_store_items_code ON store_items(CODE)");
        console.log("[Migration] Created UNIQUE index on store_items.CODE - duplicates will now be prevented!");
    } catch (err) {
        // Index already exists - that's fine
        if (err.code === 'ER_DUP_KEYNAME') {
            console.log("[Migration] UNIQUE index on CODE already exists - good!");
        } else if (err.code === 'ER_DUP_ENTRY') {
            console.log("[Migration] Cannot create unique index - duplicates still exist. Will clean on next sync.");
        } else {
            console.log("[Migration] CODE unique index:", err.message);
        }
    }
})();

// Database Migration: Add UNIQUE constraint on store_transactions.CODE to prevent duplicate transactions
(async () => {
    try {
        // Step 1: Clean up existing duplicate transactions (keep newest by CREATED_DATE)
        const duplicatesQuery = `
            SELECT CODE, COUNT(*) as cnt 
            FROM store_transactions 
            WHERE CODE IS NOT NULL AND CODE != '' 
            GROUP BY CODE 
            HAVING cnt > 1
        `;
        const duplicateCodes = await pool.query(duplicatesQuery);

        if (duplicateCodes && duplicateCodes.length > 0) {
            console.log(`[Migration] Found ${duplicateCodes.length} duplicate transaction CODE(s), cleaning up...`);
            for (const dup of duplicateCodes) {
                // Get all transactions with this CODE, keep newest
                const items = await pool.query(
                    'SELECT TRANSACTION_ID FROM store_transactions WHERE CODE = ? ORDER BY CREATED_DATE DESC, TRANSACTION_ID DESC',
                    [dup.CODE]
                );
                if (items.length > 1) {
                    // Keep the first (newest), delete rest
                    const deleteIds = items.slice(1).map(i => i.TRANSACTION_ID);
                    // Also delete related transaction items
                    await pool.query('DELETE FROM store_transactions_items WHERE TRANSACTION_ID IN (?)', [deleteIds]);
                    await pool.query('DELETE FROM store_transactions WHERE TRANSACTION_ID IN (?)', [deleteIds]);
                    console.log(`[Migration] Removed ${deleteIds.length} duplicate transaction(s) for CODE: ${dup.CODE}`);
                }
            }
        }

        // Step 2: Create unique index on CODE column
        await pool.query("CREATE UNIQUE INDEX idx_store_transactions_code ON store_transactions(CODE)");
        console.log("[Migration] Created UNIQUE index on store_transactions.CODE - transaction duplicates will now be prevented!");
    } catch (err) {
        if (err.code === 'ER_DUP_KEYNAME') {
            console.log("[Migration] UNIQUE index on transactions.CODE already exists - good!");
        } else if (err.code === 'ER_DUP_ENTRY') {
            console.log("[Migration] Cannot create unique index on transactions - duplicates still exist.");
        } else {
            console.log("[Migration] Transactions CODE unique index:", err.message);
        }
    }
})();

// Sync items from POS to Web App
// NOTE: STOCK column does not exist in store_items table - stock is managed locally on POS
// This endpoint handles both item updates AND soft deletes (IS_ACTIVE = 0)
// CONFLICT RESOLUTION: Only update if incoming EDITED_DATE is newer than existing
router.post('/api/syncItemTableWithLocal', async (req, res) => {
    // Ensure 'items' is always an array
    const items = Array.isArray(req.body) ? req.body : [req.body];
    console.log('[Sync] Items received from local:', items.length, 'items');

    try {
        let updated = 0;
        let skipped = 0;
        let created = 0;

        for (const rawItem of items) {
            // Normalize properties
            const item = {
                ITEM_ID: rawItem.ITEM_ID || rawItem.id,
                CODE: (rawItem.CODE || rawItem.code || '').trim(),
                NAME: rawItem.NAME || rawItem.name || '',
                BUYING_PRICE: rawItem.BUYING_PRICE !== undefined ? rawItem.BUYING_PRICE : (rawItem.price !== undefined ? rawItem.price : 0),
                SELLING_PRICE: rawItem.SELLING_PRICE !== undefined ? rawItem.SELLING_PRICE : (rawItem.sellingPrice !== undefined ? rawItem.sellingPrice : 0),
                IS_ACTIVE: (rawItem.IS_ACTIVE !== undefined) ? (rawItem.IS_ACTIVE === 1 || rawItem.IS_ACTIVE === true || rawItem.IS_ACTIVE === '1' ? 1 : 0) : (rawItem.isActive === true || rawItem.isActive === 1 ? 1 : 0),
                EDITED_DATE: rawItem.EDITED_DATE || rawItem.editedDate || null,
                CREATED_BY: rawItem.CREATED_BY || rawItem.createdBy || null,
                STORE_NO: rawItem.STORE_NO || rawItem.storeNo || 1
            };

            if (!item.CODE) continue;

            // Format dates
            const incomingEditedDate = new Date(item.EDITED_DATE);
            const formattedEditedDate = toMySQLDateTime(item.EDITED_DATE);
            const formattedCreatedDate = item.CREATED_DATE ? toMySQLDateTime(item.CREATED_DATE) : null;

            // Check if item exists and compare EDITED_DATE
            const existing = await pool.query('SELECT ITEM_ID, EDITED_DATE FROM store_items WHERE ITEM_ID = ?', [item.ITEM_ID]);

            if (existing && existing.length > 0) {
                const existingDate = new Date(existing[0].EDITED_DATE);

                // Only update if incoming date is NEWER
                if (incomingEditedDate > existingDate) {
                    await pool.query(`
                        UPDATE store_items 
                        SET CODE = ?, NAME = ?, BUYING_PRICE = ?, SELLING_PRICE = ?, 
                            IS_ACTIVE = ?, CREATED_BY = ?, STORE_NO = ?, EDITED_DATE = ?
                        WHERE ITEM_ID = ?
                    `, [item.CODE, item.NAME, item.BUYING_PRICE, item.SELLING_PRICE,
                    item.IS_ACTIVE, item.CREATED_BY, item.STORE_NO, formattedEditedDate, item.ITEM_ID]);

                    console.log(`[Sync] Updated item ${item.CODE} (ID: ${item.ITEM_ID}, IS_ACTIVE: ${item.IS_ACTIVE})`);
                    updated++;
                } else {
                    console.log(`[Sync] Skipped item ${item.CODE} - server has newer version`);
                    skipped++;
                }
            } else {
                // New item - insert
                await pool.query(`
                    INSERT INTO store_items (ITEM_ID, CODE, NAME, BUYING_PRICE, SELLING_PRICE, IS_ACTIVE, CREATED_BY, STORE_NO, EDITED_DATE)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [item.ITEM_ID, item.CODE, item.NAME, item.BUYING_PRICE, item.SELLING_PRICE,
                item.IS_ACTIVE, item.CREATED_BY, item.STORE_NO, formattedEditedDate]);

                console.log(`[Sync] Created new item ${item.CODE} (ID: ${item.ITEM_ID})`);
                created++;
            }
        }

        console.log(`[Sync] Complete: ${created} created, ${updated} updated, ${skipped} skipped`);
        res.status(200).json({
            success: true,
            message: 'Items synchronized successfully.',
            stats: { created, updated, skipped }
        });
    } catch (error) {
        console.error('Error syncing items from local:', error);
        res.status(500).json({ success: false, message: 'Failed to sync items from local.', error: error.message });
    }
});

// ============================================
// BI-DIRECTIONAL MERGE SYNC ENDPOINT
// ============================================
// Simple and effective sync:
// 1. POS sends all its items
// 1. POS sends all its items
// 2. Compare each item by CODE (unique identifier)
// 3. Newer EDITED_DATE wins
// 4. Only sync 5 columns: CODE, NAME, BUYING_PRICE, SELLING_PRICE, IS_ACTIVE
// 5. Returns items that POS needs to update + updates Web DB with newer POS items
router.post('/api/items/merge-sync', async (req, res) => {
    const localItems = Array.isArray(req.body) ? req.body : [req.body];
    console.log('[MergeSync] Received', localItems.length, 'items from POS');

    // Helper to safely parse dates
    const safeDate = (d) => {
        if (!d) return new Date(0);
        try {
            const date = new Date(d);
            return isNaN(date.getTime()) ? new Date(0) : date;
        } catch (e) {
            return new Date(0);
        }
    };

    try {
        // ========================================
        // STEP 0: CLEANUP NULL and DUPLICATE items
        // ========================================

        // 0a. Delete NULL/empty CODE from Web DB
        const nullCleanup = await pool.query("DELETE FROM store_items WHERE CODE IS NULL OR CODE = ''");
        if (nullCleanup.affectedRows > 0) {
            console.log(`[MergeSync] Cleaned up ${nullCleanup.affectedRows} NULL code items from Web DB`);
        }

        // 0b. Remove DUPLICATE CODE items from Web DB
        // Keep: IS_ACTIVE=1 preferred, then newest EDITED_DATE
        const duplicatesQuery = `
            SELECT CODE, COUNT(*) as cnt 
            FROM store_items 
            WHERE CODE IS NOT NULL AND CODE != '' 
            GROUP BY CODE 
            HAVING cnt > 1
        `;
        const duplicateCodes = await pool.query(duplicatesQuery);

        let webDupsRemoved = 0;
        for (const dup of duplicateCodes) {
            // Get all items with this CODE
            // COMPARISON LOGIC: Newer EDITED_DATE always wins (keep newest)
            const items = await pool.query(
                'SELECT ITEM_ID, IS_ACTIVE, EDITED_DATE FROM store_items WHERE CODE = ? ORDER BY EDITED_DATE DESC, IS_ACTIVE DESC',
                [dup.CODE]
            );

            // Keep the first one (newest EDITED_DATE wins), delete rest
            if (items.length > 1) {
                const keepId = items[0].ITEM_ID;
                const deleteIds = items.slice(1).map(i => i.ITEM_ID);
                await pool.query('DELETE FROM store_items WHERE ITEM_ID IN (?)', [deleteIds]);
                webDupsRemoved += deleteIds.length;
            }
        }
        if (webDupsRemoved > 0) {
            console.log(`[MergeSync] Removed ${webDupsRemoved} duplicate CODE items from Web DB`);
        }

        // 1. Get ALL items from Web DB (now deduplicated), including inactive
        // IMPORTANT: We sync ALL items (IS_ACTIVE 0 and 1) so both Web and POS always have the same list.
        // IS_ACTIVE changes are treated the same as any other field change - latest EDITED_DATE wins.
        const webItems = await pool.query("SELECT ITEM_ID, CODE, NAME, BUYING_PRICE, SELLING_PRICE, IS_ACTIVE, EDITED_DATE FROM store_items WHERE CODE IS NOT NULL AND CODE != ''");
        const webItemMap = {};
        webItems.forEach(item => { webItemMap[item.CODE] = item; });
        console.log('[MergeSync] Web DB has', webItems.length, 'valid items (all active states)');

        // 2. Normalize, Filter and DEDUPLICATE local items by CODE
        // POS might send lowercase properties (code, isActive, editedDate)
        const normalizedLocalItems = localItems.map(item => ({
            ITEM_ID: item.ITEM_ID || item.id || null,
            CODE: (item.CODE || item.code || '').trim(),
            NAME: item.NAME || item.name || '',
            BUYING_PRICE: item.BUYING_PRICE !== undefined ? item.BUYING_PRICE : (item.price !== undefined ? item.price : 0),
            SELLING_PRICE: item.SELLING_PRICE !== undefined ? item.SELLING_PRICE : (item.sellingPrice !== undefined ? item.sellingPrice : 0),
            IS_ACTIVE: (item.IS_ACTIVE !== undefined) ? (item.IS_ACTIVE === 1 || item.IS_ACTIVE === true || item.IS_ACTIVE === '1') : (item.isActive === true || item.isActive === 1 ? 1 : 0),
            EDITED_DATE: item.EDITED_DATE || item.editedDate || null
        }));

        const validLocalItems = normalizedLocalItems.filter(item => item.CODE !== '');
        const localDedupMap = {};

        for (const item of validLocalItems) {
            const code = item.CODE;
            const existing = localDedupMap[code];

            if (!existing) {
                localDedupMap[code] = item;
            } else {
                // COMPARISON LOGIC: Newer EDITED_DATE always wins
                const existingDate = safeDate(existing.EDITED_DATE);
                const newDate = safeDate(item.EDITED_DATE);

                if (newDate > existingDate) {
                    localDedupMap[code] = item;
                } else if (newDate.getTime() === existingDate.getTime()) {
                    // Tie-break: active wins
                    const existingActive = existing.IS_ACTIVE === 1 || existing.IS_ACTIVE === '1';
                    const newActive = item.IS_ACTIVE === 1 || item.IS_ACTIVE === '1';
                    if (newActive && !existingActive) {
                        localDedupMap[code] = item;
                    }
                }
            }
        }

        const dedupedLocalItems = Object.values(localDedupMap);
        const localDupsRemoved = validLocalItems.length - dedupedLocalItems.length;
        if (localDupsRemoved > 0) {
            console.log(`[MergeSync] Filtered out ${localDupsRemoved} duplicate CODE items from POS request`);
        }
        console.log('[MergeSync] POS has', dedupedLocalItems.length, 'unique valid items');



        // Results
        const itemsForPOS = [];      // Items POS should update (web is newer)
        const itemsUpdatedOnWeb = []; // Items updated on web DB (POS is newer)
        const itemsCreatedOnWeb = []; // New items created on web (from POS)
        const itemsForPOSNew = [];   // New items for POS (from web)

        // 3. Process each deduplicated local item (POS → Web)
        for (const localItem of dedupedLocalItems) {
            try {
                const webItem = webItemMap[localItem.CODE];
                const localDate = safeDate(localItem.EDITED_DATE);

                if (webItem) {
                    // Item exists in both - compare dates
                    const webDate = safeDate(webItem.EDITED_DATE);

                    if (localDate > webDate) {
                        // POS is newer - update Web DB
                        await pool.query(`
                            UPDATE store_items 
                            SET NAME = ?, BUYING_PRICE = ?, SELLING_PRICE = ?, IS_ACTIVE = ?, EDITED_DATE = ?
                            WHERE CODE = ?
                        `, [
                            localItem.NAME, localItem.BUYING_PRICE, localItem.SELLING_PRICE,
                            localItem.IS_ACTIVE, toMySQLDateTime(localItem.EDITED_DATE), localItem.CODE
                        ]);
                        itemsUpdatedOnWeb.push(localItem.CODE);
                    } else if (webDate > localDate) {
                        // Web is newer - POS should update
                        itemsForPOS.push({
                            ITEM_ID: webItem.ITEM_ID,
                            CODE: webItem.CODE,
                            NAME: webItem.NAME,
                            BUYING_PRICE: webItem.BUYING_PRICE,
                            SELLING_PRICE: webItem.SELLING_PRICE,
                            IS_ACTIVE: webItem.IS_ACTIVE,
                            EDITED_DATE: webItem.EDITED_DATE
                        });
                    }
                    // If dates are equal, no action needed
                } else {
                    // Item only exists on POS - create on Web (or update if duplicate exists)
                    await pool.query(`
                        INSERT INTO store_items (CODE, NAME, BUYING_PRICE, SELLING_PRICE, IS_ACTIVE, EDITED_DATE)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE 
                            NAME = VALUES(NAME),
                            BUYING_PRICE = VALUES(BUYING_PRICE),
                            SELLING_PRICE = VALUES(SELLING_PRICE),
                            IS_ACTIVE = VALUES(IS_ACTIVE),
                            EDITED_DATE = VALUES(EDITED_DATE)
                    `, [
                        localItem.CODE, localItem.NAME, localItem.BUYING_PRICE,
                        localItem.SELLING_PRICE, localItem.IS_ACTIVE, toMySQLDateTime(localItem.EDITED_DATE)
                    ]);
                    itemsCreatedOnWeb.push(localItem.CODE);
                }
            } catch (itemError) {
                console.error(`[MergeSync] Error processing item ${localItem.CODE}:`, itemError.message);
            }
        }

        // 4. Check for items only on Web (Web → POS)
        // Send ALL web-only items to POS regardless of IS_ACTIVE status.
        // POS will store them and apply IS_ACTIVE flag — ensuring both sides mirror each other exactly.
        for (const webItem of webItems) {
            if (!localDedupMap[webItem.CODE]) {
                // Item only exists on Web — send to POS so it can mirror the web
                itemsForPOSNew.push({
                    ITEM_ID: webItem.ITEM_ID,
                    CODE: webItem.CODE,
                    NAME: webItem.NAME,
                    BUYING_PRICE: webItem.BUYING_PRICE,
                    SELLING_PRICE: webItem.SELLING_PRICE,
                    IS_ACTIVE: webItem.IS_ACTIVE,
                    EDITED_DATE: webItem.EDITED_DATE
                });
            }
        }

        console.log('[MergeSync] Complete:', {
            updatedOnWeb: itemsUpdatedOnWeb.length,
            createdOnWeb: itemsCreatedOnWeb.length,
            toUpdateOnPOS: itemsForPOS.length,
            newForPOS: itemsForPOSNew.length
        });

        res.status(200).json({
            success: true,
            message: 'Sync complete',
            // Items POS needs to update (web was newer)
            updateItems: itemsForPOS,
            // New items POS needs to add (only exist on web)
            newItems: itemsForPOSNew,
            // Stats
            stats: {
                updatedOnWeb: itemsUpdatedOnWeb.length,
                createdOnWeb: itemsCreatedOnWeb.length,
                toUpdateOnPOS: itemsForPOS.length,
                newForPOS: itemsForPOSNew.length
            }
        });

    } catch (error) {
        console.error('[MergeSync] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

function toMySQLDateTime(isoStr) {
    try {
        if (!isoStr) isoStr = new Date();

        let date;
        // If it's a string missing timezone info (e.g., "2026-02-21 06:12:14" from POS localSync)
        if (typeof isoStr === 'string' && !isoStr.includes('Z') && !isoStr.includes('T') && !isoStr.includes('+')) {
            // Assume it's already Asia/Colombo time (SLT)
            date = new Date(isoStr + " +05:30");
            // If parsing fails with offset, fallback to normal
            if (isNaN(date.getTime())) date = new Date(isoStr);
        } else {
            // It's likely an ISO string or Date object
            date = new Date(isoStr);
        }

        if (isNaN(date.getTime())) {
            date = new Date();
        }

        // Return YYYY-MM-DD HH:mm:ss in Asia/Colombo
        return date.toLocaleString('sv-SE', {
            timeZone: 'Asia/Colombo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace('T', ' ');

    } catch (error) {
        console.error('[toMySQLDateTime] Error:', error);
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
}

router.post('/api/getAllItemsforSync', async (req, res) => {
    // console.log('Get all Items request received:', req.body);
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }


        // Query to fetch all active items
        const queryResult = await pool.query('SELECT * FROM store_items');

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any items are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active items found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(items => ({ ...items }));

            data.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));
            // console.log('Items:', data);

            return res.status(200).json({ success: true, result: data });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// router.post('/api/syncTransactionTableWithLocal', async (req, res) => {
//     // Ensure 'transactions' is always an array
//     const transactions = Array.isArray(req.body) ? req.body : [req.body];
//     console.log('Transactions received from local:', transactions);
//
//     try {
//         const promises = transactions.map(async (transaction) => {
//             // Format dates if needed
//             transaction.EDITED_DATE = toMySQLDateTime(transaction.EDITED_DATE);
//             transaction.CREATED_DATE = toMySQLDateTime(transaction.CREATED_DATE); // Ensure CREATED_DATE is formatted
//
//             // SQL Query for inserting or updating transaction
//             if (transaction.IS_SYNCED_INSERT === 0) {
//                 // Insert new transaction (without TRANSACTION_ID, since it's auto-incremented)
//                 const result = await pool.query(`
//                     INSERT INTO store_transactions (
//                         REFERENCE_TRANSACTION,
//                         CODE,
//                         TYPE,
//                         CHEQUE_NO,
//                         IS_CHEQUE_COLLECTED,
//                         CHEQUE_EXPIRY,
//                         BANK_NAME,
//                         BANK_TRANS_DATETIME,
//                         CUSTOMER,
//                         METHOD,
//                         DATE,
//                         SUB_TOTAL,
//                         PAYMENT_AMOUNT,
//                         AMOUNT_SETTLED,
//                         DUE_AMOUNT,
//                         DUE_DATE,
//                         COMMENTS,
//                         CREATED_BY,
//                         STORE_NO,
//                         EDITED_DATE)
//                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//                 `, [
//                     transaction.REFERENCE_TRANSACTION,
//                     transaction.CODE,
//                     transaction.TYPE,
//                     transaction.CHEQUE_NO,
//                     transaction.IS_CHEQUE_COLLECTED,
//                     transaction.CHEQUE_EXPIRY,
//                     transaction.BANK_NAME,
//                     transaction.BANK_TRANS_DATETIME,
//                     transaction.CUSTOMER,
//                     transaction.METHOD,
//                     transaction.DATE,
//                     transaction.SUB_TOTAL,
//                     transaction.PAYMENT_AMOUNT,
//                     transaction.AMOUNT_SETTLED,
//                     transaction.DUE_AMOUNT,
//                     transaction.DUE_DATE,
//                     transaction.COMMENTS,
//                     transaction.CREATED_BY,
//                     transaction.STORE_NO,
//                     transaction.EDITED_DATE
//                 ]);
//
//                 // Retrieve the auto-generated TRANSACTION_ID
//                 const insertedId = result.insertId;
//
//                 // Return the inserted TRANSACTION_ID as CLOUD_ID
//                 return { ...transaction, CLOUD_ID: insertedId };
//             } else {
//                 // Update existing transaction
//                 await pool.query(`
//                     UPDATE store_transactions
//                     SET REFERENCE_TRANSACTION = ?,
//                         CODE = ?,
//                         TYPE = ?,
//                         CHEQUE_NO = ?,
//                         IS_CHEQUE_COLLECTED = ?,
//                         CHEQUE_EXPIRY = ?,
//                         BANK_NAME = ?,
//                         BANK_TRANS_DATETIME = ?,
//                         CUSTOMER = ?,
//                         METHOD = ?,
//                         DATE = ?,
//                         SUB_TOTAL = ?,
//                         PAYMENT_AMOUNT = ?,
//                         AMOUNT_SETTLED = ?,
//                         DUE_AMOUNT = ?,
//                         DUE_DATE = ?,
//                         COMMENTS = ?,
//                         CREATED_BY = ?,
//                         STORE_NO = ?,
//                         EDITED_DATE = ?
//                     WHERE TRANSACTION_ID = ?
//                 `, [
//                     transaction.REFERENCE_TRANSACTION,
//                     transaction.CODE,
//                     transaction.TYPE,
//                     transaction.CHEQUE_NO,
//                     transaction.IS_CHEQUE_COLLECTED,
//                     transaction.CHEQUE_EXPIRY,
//                     transaction.BANK_NAME,
//                     transaction.BANK_TRANS_DATETIME,
//                     transaction.CUSTOMER,
//                     transaction.METHOD,
//                     transaction.DATE,
//                     transaction.SUB_TOTAL,
//                     transaction.PAYMENT_AMOUNT,
//                     transaction.AMOUNT_SETTLED,
//                     transaction.DUE_AMOUNT,
//                     transaction.DUE_DATE,
//                     transaction.COMMENTS,
//                     transaction.CREATED_BY,
//                     transaction.STORE_NO,
//                     transaction.EDITED_DATE,
//                     transaction.CLOUD_ID // Use CLOUD_ID to find the right record
//                 ]);
//
//                 // Return the CLOUD_ID after update
//                 return { ...transaction, CLOUD_ID: transaction.CLOUD_ID };
//             }
//         });
//
//         const results = await Promise.all(promises);
//         res.status(200).json({ success: true, message: 'Transactions synced successfully.', data: results });
//     } catch (error) {
//         console.error('Error syncing transactions from local:', error);
//         res.status(500).json({ success: false, message: 'Failed to sync transactions from local.', error: error.message });
//     }
// });
// ============================================
// NEW SYNC ENDPOINTS FOR LOCAL APPS
// ============================================

// Get items updated after a specific timestamp
// IMPORTANT: Returns ALL items (including IS_ACTIVE=0 deleted items) for bi-directional sync
// POS should use this to detect items deleted on Web App and remove them locally
router.get('/api/items/since/:timestamp', async (req, res) => {
    try {
        const timestamp = req.params.timestamp;
        console.log(`[Sync] Items since ${timestamp} requested`);

        const queryResult = await pool.query(
            'SELECT * FROM store_items WHERE EDITED_DATE > ? ORDER BY EDITED_DATE DESC',
            [timestamp]
        );

        if (Array.isArray(queryResult)) {
            const data = queryResult.map(item => ({ ...item }));
            console.log(`[Sync] Returning ${data.length} items (includes deleted items for sync)`);
            return res.status(200).json({ success: true, items: data, count: data.length });
        }
        return res.status(200).json({ success: true, items: [], count: 0 });
    } catch (error) {
        console.error('Error fetching items since timestamp:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Get ALL items including deleted (IS_ACTIVE=0) for full bi-directional sync
// POS should call this on startup or when doing a full resync
router.get('/api/items/all', async (req, res) => {
    try {
        console.log('[Sync] Full item list requested (including deleted)');

        const queryResult = await pool.query(
            'SELECT * FROM store_items ORDER BY EDITED_DATE DESC'
        );

        if (Array.isArray(queryResult)) {
            const data = queryResult.map(item => ({ ...item }));
            console.log(`[Sync] Returning ${data.length} total items (all states)`);
            return res.status(200).json({ success: true, items: data, count: data.length });
        }
        return res.status(200).json({ success: true, items: [], count: 0 });
    } catch (error) {
        console.error('Error fetching all items:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Get all items (items are shared across stores, STOCK is JSON: {"1": qty, "2": qty})
// NOTE: This endpoint only returns ACTIVE items for display purposes
// For Store 2 (Weighing Station), also filter by SHOW_IN_WEIGHING=1
router.get('/api/items/store/:storeNo', async (req, res) => {
    try {
        const storeNo = req.params.storeNo;

        // CLEANUP: Automatically delete "Virtual" items from DB if they exist
        // These are handled by POS logic and should not be in the database
        await pool.query("DELETE FROM store_items WHERE CODE IN ('RETURN', 'CONTAINER', 'TARE')");

        // For Store 2 (Weighing Station), only show items with SHOW_IN_WEIGHING=1
        let query = 'SELECT * FROM store_items WHERE IS_ACTIVE = 1';
        if (storeNo === '2') {
            query += ' AND (SHOW_IN_WEIGHING = 1 OR SHOW_IN_WEIGHING IS NULL)';
        }
        query += ' ORDER BY NAME';

        const queryResult = await pool.query(query);

        if (Array.isArray(queryResult)) {
            // Transform STOCK JSON to include storeNo-specific stock for backward compatibility
            const data = queryResult.map(item => {
                const stock = typeof item.STOCK === 'string' ? JSON.parse(item.STOCK) : (item.STOCK || {});
                return {
                    ...item,
                    STOCK_STORE1: parseFloat(stock['1'] || 0),
                    STOCK_STORE2: parseFloat(stock['2'] || 0),
                    // For POS compatibility, provide STOCK as the current store's stock
                    STOCK: parseFloat(stock[storeNo] || 0)
                };
            });
            return res.status(200).json({ success: true, items: data });
        }
        return res.status(200).json({ success: true, items: [] });
    } catch (error) {
        console.error('Error fetching items by store:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Sync transaction from local app
router.post('/api/transactions/sync', async (req, res) => {
    const transaction = req.body;
    console.log('Transaction sync received:', transaction);

    try {
        const transactionCode = transaction.code || `S${transaction.storeNo}-${Date.now()}`;

        // =====================================================
        // NEW: Check for existing weight stock placeholder
        // If weight was synced before POS payment, a placeholder tx exists.
        // We update it with real payment data instead of creating a new row.
        // =====================================================
        if (transaction.s2BillCode) {
            const [placeholder] = await pool.query(
                `SELECT TRANSACTION_ID FROM store_transactions
                 WHERE WEIGHT_CODE = ? AND CODE IS NULL AND IS_ACTIVE = 1 LIMIT 1`,
                [transaction.s2BillCode]
            );

            if (placeholder && placeholder.TRANSACTION_ID) {
                const placeholderId = placeholder.TRANSACTION_ID;
                console.log(`[Sync] Found stock placeholder tx ${placeholderId} for weight ${transaction.s2BillCode} — promoting to full transaction`);

                const createdDate = toMySQLDateTime(transaction.createdAt);

                // Build comments string
                const txCommentParts = [];
                if (transaction.sourceType === 'QR' && transaction.s2BillCode) {
                    txCommentParts.push(`[Store 2 QR: ${transaction.s2BillCode}]`);
                } else {
                    txCommentParts.push('[Direct Sale]');
                }
                if (transaction.items && transaction.items.length > 0) {
                    txCommentParts.push(`${transaction.items.length} item(s)`);
                    const txItemNames = transaction.items.map(i => `${i.productName || i.name || i.productCode || i.code} x${i.quantity || 1}`);
                    txCommentParts.push(`Items: ${txItemNames.join(', ')}`);
                }
                if (transaction.notes) txCommentParts.push(`Note: ${transaction.notes}`);
                const txCommentsStr = txCommentParts.join(' | ');

                // Promote placeholder: fill in payment + code + date data
                await pool.query(`
                    UPDATE store_transactions SET
                        CODE = ?, TYPE = ?, CUSTOMER = ?, METHOD = ?, DATE = ?,
                        SUB_TOTAL = ?, PAYMENT_AMOUNT = ?, AMOUNT_SETTLED = ?,
                        DUE_AMOUNT = ?, COMMENTS = ?, CREATED_BY = ?,
                        BILL_DATA = ?, CREATED_DATE = ?
                    WHERE TRANSACTION_ID = ?
                `, [
                    transactionCode,
                    transaction.type || 'Selling',
                    transaction.customerId || null,
                    transaction.paymentMethod || 'Cash',
                    createdDate,
                    transaction.total || 0,
                    transaction.amountPaid || 0,
                    transaction.amountPaid || 0,
                    transaction.dueAmount || ((transaction.total || 0) - (transaction.amountPaid || 0)),
                    txCommentsStr,
                    transaction.userId || null,
                    transaction.billData ? JSON.stringify(transaction.billData) : null,
                    createdDate,
                    placeholderId
                ]);

                // Replace placeholder items with real transaction items
                await pool.query('UPDATE store_transactions_items SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [placeholderId]);

                const SYMBOLIC_CODES = ['CONTAINER', 'RETURN', 'TARE', 'DEDUCTION'];
                if (transaction.items && transaction.items.length > 0) {
                    for (const item of transaction.items) {
                        const productCode = item.productCode || item.code || '';
                        const productName = item.productName || item.name || '';
                        const productPrice = parseFloat(item.price) || 0;
                        const isSymbolicItem = SYMBOLIC_CODES.includes(productCode.toUpperCase()) ||
                            SYMBOLIC_CODES.some(c => productName.toUpperCase().includes(c));
                        let itemId = null;
                        if (!isSymbolicItem) {
                            itemId = (typeof item.productId === 'number') ? item.productId : null;
                            if (!itemId && productCode) {
                                const [byCode] = await pool.query(
                                    'SELECT ITEM_ID FROM store_items WHERE CODE = ? AND IS_ACTIVE = 1 LIMIT 1',
                                    [productCode]
                                );
                                if (byCode && byCode.ITEM_ID) itemId = byCode.ITEM_ID;
                            }
                            if (!itemId && productName) {
                                const [byName] = await pool.query(
                                    'SELECT ITEM_ID FROM store_items WHERE NAME = ? AND IS_ACTIVE = 1 LIMIT 1',
                                    [productName]
                                );
                                if (byName && byName.ITEM_ID) itemId = byName.ITEM_ID;
                            }
                        }
                        await pool.query(`
                            INSERT INTO store_transactions_items
                                (TRANSACTION_ID, ITEM_ID, PRICE, QUANTITY, TOTAL, IS_ACTIVE, CREATED_DATE)
                            VALUES (?, ?, ?, ?, ?, 1, ?)
                        `, [placeholderId, itemId, productPrice, item.quantity || 0,
                            productPrice * (item.quantity || 0), createdDate]);
                    }
                }

                // Update weight status to Money Collected
                const weightFullCode = `S2-${transaction.s2BillCode}`;
                try {
                    const wRows = await pool.query(
                        'SELECT ID, ITEM_DETAILS FROM weight_measurements WHERE CODE = ? AND IS_ACTIVE = 1 LIMIT 1',
                        [weightFullCode]
                    );
                    if (wRows && wRows.length > 0) {
                        let wDetails = {};
                        try { wDetails = typeof wRows[0].ITEM_DETAILS === 'string' ? JSON.parse(wRows[0].ITEM_DETAILS) : (wRows[0].ITEM_DETAILS || {}); } catch (e) { }
                        wDetails.status = 'Money Collected';
                        wDetails.collectedAt = toMySQLDateTime();
                        wDetails.transactionCode = transactionCode;
                        await pool.query(
                            'UPDATE weight_measurements SET ITEM_DETAILS = ?, UPDATED_DATE = NOW() WHERE CODE = ?',
                            [JSON.stringify(wDetails), weightFullCode]
                        );
                        console.log(`[Sync] Weight ${weightFullCode} status -> Money Collected (promoted tx)`);
                    }
                } catch (e) {
                    console.warn('[Sync] Failed to update weight status for promoted tx:', e.message);
                }

                // Return Notification if applicable
                if (transaction.type === 'Return') {
                    try {
                        const { createNotification } = require('./notificationService');
                        const itemName = transaction.items?.[0]?.productName || 'items';
                        const qty = transaction.items?.[0]?.quantity || '';
                        await createNotification('RETURN', placeholderId, 'New Return Registered (Sync)',
                            `A return of ${qty} kg ${itemName} was synced from Store ${transaction.storeNo || 1}`);
                    } catch (notifyErr) {
                        console.error('[Sync] Error sending Return notification:', notifyErr);
                    }
                }

                return res.status(200).json({
                    success: true,
                    message: 'Placeholder transaction promoted',
                    transactionId: placeholderId,
                    storeNo: transaction.storeNo,
                    promoted: true,
                    syncedAt: new Date().toISOString()
                });
            }
        }

        // CHECK FOR DUPLICATE: If transaction with same CODE already exists, return success
        const [existingTx] = await pool.query(
            'SELECT TRANSACTION_ID FROM store_transactions WHERE CODE = ? AND IS_ACTIVE = 1 LIMIT 1',
            [transactionCode]
        );

        if (existingTx && existingTx.TRANSACTION_ID) {
            console.log(`[Sync] Transaction ${transactionCode} already exists (ID: ${existingTx.TRANSACTION_ID}) - skipping duplicate`);
            return res.status(200).json({
                success: true,
                message: 'Transaction already synced',
                transactionId: existingTx.TRANSACTION_ID,
                duplicate: true,
                storeNo: transaction.storeNo,
                syncedAt: new Date().toISOString()
            });
        }

        // Format dates
        const createdDate = toMySQLDateTime(transaction.createdAt);

        // Build human-readable comments
        let commentParts = [];

        // For Expenses type, ONLY show the reason - nothing else
        if (transaction.type === 'Expenses') {
            const reason = transaction.comment || transaction.metadata?.reason || 'No reason provided';
            commentParts.push(reason);
            // Skip all other comment parts for expenses
        } else {
            // For regular transactions (Selling/Buying)

            // Add source info
            if (transaction.sourceType === 'QR' && transaction.s2BillCode) {
                commentParts.push(`[Store 2 QR: ${transaction.s2BillCode}]`);
            } else {
                commentParts.push('[Direct Sale]');
            }

            // Add item count and item list
            const itemCount = transaction.items?.length || 0;
            if (itemCount > 0) {
                commentParts.push(`${itemCount} item(s)`);

                // Add item names list (especially for symbolic items like CONTAINER, RETURN)
                const itemNames = transaction.items.map(item => {
                    const name = item.productName || item.name || item.productCode || item.code || 'Unknown';
                    const qty = item.quantity || 1;
                    return `${name} x${qty}`;
                });
                commentParts.push(`Items: ${itemNames.join(', ')}`);
            }

            // Add lot details if any items are lot items
            if (transaction.items && transaction.items.length > 0) {
                transaction.items.forEach((item, idx) => {
                    if (item.isLot && item.lotEntries && item.lotEntries.length > 0) {
                        commentParts.push(`\n${item.productName || item.productCode || 'Lot Item'} (LOT):`);
                        item.lotEntries.forEach((entry, entryIdx) => {
                            commentParts.push(`  #${entryIdx + 1}: ${entry.bags || 0} bags, ${(entry.kilos || 0).toFixed(2)} kg = Rs.${(entry.subtotal || 0).toFixed(2)}`);
                        });
                    }
                });
            }

            // Add notes if any
            if (transaction.notes) {
                commentParts.push(`Note: ${transaction.notes}`);
            }
        }

        const commentsString = commentParts.join(' | ').replace(/ \| \n/g, '\n');

        // Debug log for expenses
        if (transaction.type === 'Expenses') {
            console.log(`[Sync] Expense received - comment: "${transaction.comment}", metadata.reason: "${transaction.metadata?.reason}", final: "${commentsString}"`);
        }

        // Log the payment method being used
        console.log('[Sync] Transaction paymentMethod:', transaction.paymentMethod, '-> Using:', transaction.paymentMethod || 'Cash');

        // Logic to determine STOCK_DATE
        // Default to transaction date
        let stockDate = createdDate;

        // If Store 2 and has Weight Code, try to fetch original weighting date
        if ((transaction.storeNo == 2 || transaction.storeNo == '2') && transaction.s2BillCode) {
            try {
                let wRows = null;
                // 1. Try exact match
                const [exactMatch] = await pool.query(
                    'SELECT CREATED_DATE FROM weight_measurements WHERE CODE = ? LIMIT 1',
                    [transaction.s2BillCode]
                );

                if (exactMatch && exactMatch.CREATED_DATE) {
                    wRows = exactMatch;
                } else {
                    // 2. Try with S2- prefix (common pattern)
                    const prefixedCode = `S2-${transaction.s2BillCode}`;
                    console.log(`[Sync] Exact match failed for ${transaction.s2BillCode}, trying ${prefixedCode}`);
                    const [prefixMatch] = await pool.query(
                        'SELECT CREATED_DATE FROM weight_measurements WHERE CODE = ? LIMIT 1',
                        [prefixedCode]
                    );
                    if (prefixMatch && prefixMatch.CREATED_DATE) {
                        wRows = prefixMatch;
                        // Found logic using prefixed code, but we keep extraction raw for storage
                        // transaction.s2BillCode remains as is (or update if you want to store prefix, but user said remove it)
                        // So we DO NOT update transaction.s2BillCode here.
                    }
                }

                if (wRows && wRows.CREATED_DATE) {
                    stockDate = toMySQLDateTime(wRows.CREATED_DATE);
                    console.log(`[Sync] Found Weight Record date for ${transaction.s2BillCode}: ${stockDate}`);
                }
            } catch (e) {
                console.warn(`[Sync] Failed to lookup weight date for ${transaction.s2BillCode}`, e.message);
            }
        }

        // Insert transaction with all fields including bank/cheque details
        const result = await pool.query(`
            INSERT INTO store_transactions (
                CODE, TYPE, CUSTOMER, METHOD, DATE, 
                SUB_TOTAL, PAYMENT_AMOUNT, AMOUNT_SETTLED, DUE_AMOUNT, DUE_DATE,
                BANK_NAME, BANK_TRANS_DATETIME, CHEQUE_NO, CHEQUE_EXPIRY, IS_CHEQUE_COLLECTED,
                COMMENTS, CREATED_BY, STORE_NO, CREATED_DATE, IS_ACTIVE, BILL_DATA, WEIGHT_CODE, STOCK_DATE
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        `, [
            transactionCode,
            transaction.type || 'Selling',
            transaction.customerId || null,
            transaction.paymentMethod || 'Cash',
            createdDate,
            transaction.total || 0,
            transaction.amountPaid || 0,
            transaction.amountPaid || 0,
            transaction.dueAmount || (transaction.total || 0) - (transaction.amountPaid || 0),
            transaction.dueDate || null,
            transaction.bankName || null,
            transaction.bankTransactionDateTime || null,
            transaction.chequeNo || null,
            transaction.chequeExpiryDate || null,
            transaction.chequeCollected ? 1 : 0,
            commentsString,
            transaction.userId || null,
            transaction.storeNo || 1,
            createdDate,
            transaction.billData ? JSON.stringify(transaction.billData) : null,
            transaction.s2BillCode || null,
            stockDate
        ]);

        const transactionId = result.insertId;
        console.log(`[Sync] Transaction ${transactionCode} saved with store=${transaction.storeNo}, source=${transaction.sourceType}`);

        // Insert transaction items with proper ITEM_ID lookup
        // Special symbolic codes that are not actual inventory items
        const SYMBOLIC_CODES = ['CONTAINER', 'RETURN', 'TARE', 'DEDUCTION'];

        if (transaction.items && transaction.items.length > 0) {
            for (const item of transaction.items) {
                const productCode = item.productCode || item.code || '';
                const productName = item.productName || item.name || '';
                const productPrice = parseFloat(item.price) || 0;
                const storeNo = transaction.storeNo || 1;

                // Check if this is a symbolic item (not a real inventory item)
                const isSymbolicItem = SYMBOLIC_CODES.includes(productCode.toUpperCase()) ||
                    SYMBOLIC_CODES.some(code => productName.toUpperCase().includes(code));

                let itemId = null;

                if (isSymbolicItem) {
                    // Symbolic items don't need ITEM_ID lookup - they represent deductions/adjustments
                    console.log(`[Sync] Symbolic item detected: "${productName}" (${productCode}) - skipping ITEM_ID lookup`);
                } else {
                    // Try to find the ITEM_ID by product code, name, or price
                    // Only use productId if it's a valid number
                    itemId = (typeof item.productId === 'number') ? item.productId : null;

                    console.log(`[Sync] Looking up item: code="${productCode}", name="${productName}", price=${productPrice}`);

                    // If no valid numeric itemId, try to find it by code/name/price
                    if (!itemId) {
                        // Strategy 1: Lookup by exact CODE
                        if (productCode) {
                            const [byCode] = await pool.query(
                                `SELECT ITEM_ID, NAME FROM store_items WHERE CODE = ? AND IS_ACTIVE = 1 LIMIT 1`,
                                [productCode]
                            );
                            if (byCode && byCode.ITEM_ID) {
                                itemId = byCode.ITEM_ID;
                                console.log(`[Sync] Found by CODE: ${productCode} -> ITEM_ID=${itemId}`);
                            }
                        }

                        // Strategy 2: Lookup by NAME
                        if (!itemId && productName) {
                            const [byName] = await pool.query(
                                `SELECT ITEM_ID FROM store_items WHERE NAME = ? AND IS_ACTIVE = 1 LIMIT 1`,
                                [productName]
                            );
                            if (byName && byName.ITEM_ID) {
                                itemId = byName.ITEM_ID;
                                console.log(`[Sync] Found by NAME: ${productName} -> ITEM_ID=${itemId}`);
                            }
                        }

                        // Strategy 3: Lookup by BUYING_PRICE (fallback for matching by price)
                        if (!itemId && productPrice > 0) {
                            const [byPrice] = await pool.query(
                                `SELECT ITEM_ID, NAME FROM store_items WHERE BUYING_PRICE = ? AND IS_ACTIVE = 1 LIMIT 1`,
                                [productPrice]
                            );
                            if (byPrice && byPrice.ITEM_ID) {
                                itemId = byPrice.ITEM_ID;
                                console.log(`[Sync] Found by PRICE: ${productPrice} -> ITEM_ID=${itemId} (${byPrice.NAME})`);
                            }
                        }

                        if (!itemId) {
                            console.log(`[Sync] WARNING: Could not find ITEM_ID for code="${productCode}", name="${productName}", price=${productPrice}. Using NULL.`);
                        }
                    }

                    // Final validation: ensure itemId is a number or null (never a string)
                    if (itemId && typeof itemId !== 'number') {
                        console.log(`[Sync] WARNING: itemId "${itemId}" is not a number, setting to NULL`);
                        itemId = null;
                    }
                }

                await pool.query(`
                    INSERT INTO store_transactions_items (
                        TRANSACTION_ID, ITEM_ID, PRICE, QUANTITY, TOTAL, IS_ACTIVE, CREATED_DATE
                    ) VALUES (?, ?, ?, ?, ?, 1, ?)
                `, [
                    transactionId,
                    itemId,
                    item.price || 0,
                    item.quantity || 0,
                    (item.price || 0) * (item.quantity || 0),
                    createdDate
                ]);
            }
            console.log(`[Sync] Inserted ${transaction.items.length} items for transaction ${transaction.code}`);
        }

        // --- NEW: Trigger Push Notification for RETURNS from POS ---
        if (transaction.type === 'Return') {
            try {
                const { createNotification } = require('./notificationService');
                const itemName = transaction.items && transaction.items.length > 0 ? (transaction.items[0].productName || transaction.items[0].name || transaction.items[0].productCode || transaction.items[0].code) : 'items';
                const qty = transaction.items && transaction.items.length > 0 ? (transaction.items[0].quantity || '') : '';
                await createNotification(
                    'RETURN',
                    transactionId,
                    'New Return Registered (Sync)',
                    `A return of ${qty} kg ${itemName} was synced from Store ${transaction.storeNo || 1}`
                );
            } catch (notifyErr) {
                console.error('[Sync] Error sending Return notification:', notifyErr);
            }
        }

        res.status(200).json({
            success: true,
            message: 'Transaction synced',
            transactionId: transactionId,
            storeNo: transaction.storeNo,
            sourceType: transaction.sourceType,
            syncedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error syncing transaction:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get recent transactions for POS BillsPage
router.get('/api/transactions/recent/:storeNo', async (req, res) => {
    try {
        const storeNo = req.params.storeNo || 1;
        const limit = req.query.limit || 100;
        const typeFilter = req.query.type || null; // Optional: filter by specific type

        // Build type filter condition
        let typeCondition = "t.TYPE IN ('Selling', 'Buying', 'Expenses')";
        const queryParams = [storeNo];

        if (typeFilter) {
            typeCondition = "t.TYPE = ?";
            queryParams.unshift(typeFilter);
        }

        // Fetch recent transactions (Selling, Buying, Expenses)
        const transactions = await pool.query(`
            SELECT 
                t.TRANSACTION_ID as id,
                t.CODE as code,
                t.TYPE as type,
                t.METHOD as paymentMethod,
                t.DATE as date,
                t.SUB_TOTAL as total,
                t.PAYMENT_AMOUNT as amountPaid,
                t.AMOUNT_SETTLED as amountSettled,
                t.DUE_AMOUNT as dueAmount,
                t.COMMENTS as comments,
                t.COMMENTS as comment,
                t.CREATED_BY as userId,
                t.STORE_NO as storeNo,
                t.CREATED_DATE as createdAt,
                t.CREATED_DATE as createdAt,
                t.IS_ACTIVE as isActive,
                t.BILL_DATA as billData
            FROM store_transactions t
            WHERE t.IS_ACTIVE = 1 
              AND ${typeCondition}
              AND (t.STORE_NO = ? OR t.STORE_NO = 2)
            ORDER BY t.CREATED_DATE DESC
            LIMIT ?
        `, [...queryParams, parseInt(limit)]);

        // Fetch items for each transaction
        for (let tx of transactions) {
            const items = await pool.query(`
                SELECT 
                    ti.ITEM_ID as itemId,
                    ti.PRICE as price,
                    ti.QUANTITY as quantity,
                    ti.TOTAL as total,
                    COALESCE(si.CODE, 'N/A') as productCode,
                    COALESCE(si.NAME, 'Unknown Item') as productName
                FROM store_transactions_items ti
                LEFT JOIN store_items si ON ti.ITEM_ID = si.ITEM_ID
                WHERE ti.TRANSACTION_ID = ? AND ti.IS_ACTIVE = 1
            `, [tx.id]);

            tx.items = items;
            tx.itemCount = items.length;

            // Parse comments JSON if present
            try {
                tx.metadata = tx.comments ? JSON.parse(tx.comments) : {};
            } catch (e) {
                tx.metadata = { notes: tx.comments };
            }
        }

        res.json({
            success: true,
            transactions,
            count: transactions.length
        });
    } catch (error) {
        console.error('Error fetching recent transactions:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update transaction from POS Bill Edit
router.post('/api/transactions/update', async (req, res) => {
    let { transactionId, billCode, total, amountPaid, items } = req.body;
    console.log(`[Sync] Updating transaction id=${transactionId}, code=${billCode}`);

    try {
        // If transactionId looks like a code (contains letters/dashes), treat it as billCode
        if (transactionId && typeof transactionId === 'string' && isNaN(transactionId)) {
            billCode = billCode || transactionId;
            transactionId = null;
        }

        // If no valid numeric transactionId, lookup by billCode
        if (!transactionId && billCode) {
            const [existing] = await pool.query(
                `SELECT TRANSACTION_ID FROM store_transactions WHERE CODE = ? AND IS_ACTIVE = 1 LIMIT 1`,
                [billCode]
            );
            if (existing && existing.TRANSACTION_ID) {
                transactionId = existing.TRANSACTION_ID;
                console.log(`[Sync] Found transaction by code: ${billCode} -> ID=${transactionId}`);
            } else {
                console.log(`[Sync] Transaction not found by code: ${billCode}`);
                return res.status(404).json({ success: false, message: 'Transaction not found' });
            }
        }

        if (!transactionId) {
            return res.status(400).json({ success: false, message: 'transactionId or billCode required' });
        }

        // Check if this is a soft delete request
        if (req.body.isActive === 0 || req.body.isActive === false) {
            await pool.query(`
                UPDATE store_transactions 
                SET IS_ACTIVE = 0, EDITED_DATE = NOW()
                WHERE TRANSACTION_ID = ?
            `, [transactionId]);
            console.log(`[Sync] Soft deleted transaction: ${transactionId}`);
            return res.json({ success: true, message: 'Transaction deleted', transactionId });
        }

        // Update transaction totals and BILL_DATA
        const billDataUpdate = req.body.billData ? JSON.stringify(req.body.billData) : null;

        let updateSql = `
            UPDATE store_transactions 
            SET SUB_TOTAL = ?, PAYMENT_AMOUNT = ?, AMOUNT_SETTLED = ?, 
                DUE_AMOUNT = ?, EDITED_DATE = NOW()
        `;
        const updateParams = [total, amountPaid, amountPaid, (total || 0) - (amountPaid || 0)];

        if (billDataUpdate) {
            updateSql += `, BILL_DATA = ?`;
            updateParams.push(billDataUpdate);
        }

        updateSql += ` WHERE TRANSACTION_ID = ?`;
        updateParams.push(transactionId);

        await pool.query(updateSql, updateParams);

        // Deactivate old items
        await pool.query(`
            UPDATE store_transactions_items SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?
        `, [transactionId]);

        // Insert updated items with proper ITEM_ID lookup
        // Special symbolic codes that are not actual inventory items
        const SYMBOLIC_CODES = ['CONTAINER', 'RETURN', 'TARE', 'DEDUCTION'];

        if (items && items.length > 0) {
            for (const item of items) {
                const productCode = item.productCode || item.code || '';
                const productName = item.productName || item.name || '';
                const productPrice = parseFloat(item.price) || 0;

                // Check if this is a symbolic item (not a real inventory item)
                const isSymbolicItem = SYMBOLIC_CODES.includes(productCode.toUpperCase()) ||
                    SYMBOLIC_CODES.some(code => productName.toUpperCase().includes(code));

                let itemId = null;

                if (isSymbolicItem) {
                    // Symbolic items don't need ITEM_ID lookup
                    console.log(`[Update] Symbolic item detected: "${productName}" (${productCode}) - skipping ITEM_ID lookup`);
                } else {
                    // Only use itemId/productId if it's a valid number
                    const rawItemId = item.itemId || item.productId;
                    itemId = (typeof rawItemId === 'number') ? rawItemId : null;

                    console.log(`[Update] Looking up item: code="${productCode}", name="${productName}", price=${productPrice}, itemId=${itemId}`);

                    // If no valid itemId, try to find it
                    if (!itemId) {
                        // Strategy 1: Lookup by exact CODE
                        if (productCode) {
                            const [byCode] = await pool.query(
                                `SELECT ITEM_ID FROM store_items WHERE CODE = ? AND IS_ACTIVE = 1 LIMIT 1`,
                                [productCode]
                            );
                            if (byCode && byCode.ITEM_ID) {
                                itemId = byCode.ITEM_ID;
                                console.log(`[Update] Found by CODE: ${productCode} -> ITEM_ID=${itemId}`);
                            }
                        }

                        // Strategy 2: Lookup by NAME
                        if (!itemId && productName) {
                            const [byName] = await pool.query(
                                `SELECT ITEM_ID FROM store_items WHERE NAME = ? AND IS_ACTIVE = 1 LIMIT 1`,
                                [productName]
                            );
                            if (byName && byName.ITEM_ID) {
                                itemId = byName.ITEM_ID;
                                console.log(`[Update] Found by NAME: ${productName} -> ITEM_ID=${itemId}`);
                            }
                        }

                        // Strategy 3: Lookup by BUYING_PRICE
                        if (!itemId && productPrice > 0) {
                            const [byPrice] = await pool.query(
                                `SELECT ITEM_ID, NAME FROM store_items WHERE BUYING_PRICE = ? AND IS_ACTIVE = 1 LIMIT 1`,
                                [productPrice]
                            );
                            if (byPrice && byPrice.ITEM_ID) {
                                itemId = byPrice.ITEM_ID;
                                console.log(`[Update] Found by PRICE: ${productPrice} -> ITEM_ID=${itemId} (${byPrice.NAME})`);
                            }
                        }
                    }

                    // Final validation: ensure itemId is a number or null (never a string)
                    if (itemId && typeof itemId !== 'number') {
                        console.log(`[Update] WARNING: itemId "${itemId}" is not a number, setting to NULL`);
                        itemId = null;
                    }
                }

                await pool.query(`
                    INSERT INTO store_transactions_items (
                        TRANSACTION_ID, ITEM_ID, PRICE, QUANTITY, TOTAL, IS_ACTIVE, CREATED_DATE
                    ) VALUES (?, ?, ?, ?, ?, 1, NOW())
                `, [
                    transactionId,
                    itemId,
                    item.price || 0,
                    item.quantity || 0,
                    (item.price || 0) * (item.quantity || 0)
                ]);
            }
        }

        console.log(`[Sync] Transaction ${transactionId} updated with ${items?.length || 0} items`);

        res.json({
            success: true,
            message: 'Transaction updated',
            transactionId
        });
    } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// WEIGHT MEASUREMENTS - Sync with Store 2 Weighing Station App
// Simplified table: ID, CODE, ITEM_DETAILS (JSON), NOTES, CREATED_BY, CREATED_DATE, UPDATED_DATE, IS_ACTIVE
// =====================================================

// Sync weight measurement from Store 2 Weighing Station
router.post('/api/weights/sync', async (req, res) => {
    const weightData = req.body;
    console.log('[WeightSync] Received:', weightData.code || weightData.measureId);

    try {
        const createdDate = weightData.createdAt
            ? toMySQLDateTime(weightData.createdAt)
            : toMySQLDateTime();
        const code = weightData.code || weightData.measureId || `WM-${Date.now()}`;

        // Handle delete
        if (weightData.isDelete) {
            await pool.query('UPDATE weight_measurements SET IS_ACTIVE = 0 WHERE CODE = ?', [code]);
            console.log(`[WeightSync] Deleted: ${code}`);
            return res.status(200).json({ success: true, message: 'Weight deleted', code });
        }

        // Prepare ITEM_DETAILS JSON - store all measurement data
        const itemDetails = {
            items: weightData.items || [],
            grossWeight: weightData.grossWeight || 0,
            tareWeight: weightData.tareWeight || 0,
            netWeight: weightData.netWeight || 0,
            totalBags: weightData.totalBags || 0,
            unitPrice: weightData.unitPrice || 0,
            totalAmount: weightData.totalAmount || 0,
            itemName: weightData.itemName || '',
            customerName: weightData.customerName || '',
            customerId: weightData.customerId || null,
            vehicleNo: weightData.vehicleNo || '',
            driverName: weightData.driverName || '',
            status: weightData.status || 'Pending',
            storeNo: weightData.storeNo || 2
        };

        // Check if record exists for upsert
        const existing = await pool.query('SELECT ID FROM weight_measurements WHERE CODE = ?', [code]);

        if (existing && existing.length > 0) {
            // Update existing record
            await pool.query(`
                UPDATE weight_measurements SET 
                    ITEM_DETAILS = ?,
                    NOTES = ?,
                    UPDATED_DATE = NOW()
                WHERE CODE = ?
            `, [
                JSON.stringify(itemDetails),
                weightData.notes || null,
                code
            ]);
            console.log(`[WeightSync] Updated: ${code}`);
        } else {
            // Insert new record
            const result = await pool.query(`
                INSERT INTO weight_measurements (CODE, ITEM_DETAILS, NOTES, CREATED_BY, CREATED_DATE, IS_ACTIVE)
                VALUES (?, ?, ?, ?, ?, 1)
            `, [
                code,
                JSON.stringify(itemDetails),
                weightData.notes || null,
                weightData.userId || weightData.createdBy || null,
                createdDate
            ]);
            console.log(`[WeightSync] Inserted: ${code}, ID: ${result.insertId}`);
        }

        // =====================================================
        // Cross-check with store_transactions
        // =====================================================
        const s2Code = code.replace(/^S2-/, ''); // code WITHOUT 'S2-' prefix
        try {
            const [existingTxForWeight] = await pool.query(
                `SELECT TRANSACTION_ID FROM store_transactions
                 WHERE WEIGHT_CODE = ? AND IS_ACTIVE = 1 LIMIT 1`,
                [s2Code]
            );

            if (existingTxForWeight && existingTxForWeight.TRANSACTION_ID) {
                // POS already paid — mark weight as collected
                itemDetails.status = 'Money Collected';
                await pool.query(
                    `UPDATE weight_measurements SET ITEM_DETAILS = ?, UPDATED_DATE = NOW() WHERE CODE = ?`,
                    [JSON.stringify(itemDetails), code]
                );
                console.log(`[WeightSync] POS already paid for ${code} — marked Collected (tx: ${existingTxForWeight.TRANSACTION_ID})`);
            } else {
                // POS hasn't paid yet — create stock placeholder transaction for inventory
                const stockDate = toMySQLDateTime(weightData.createdAt);
                const placeholderResult = await pool.query(`
                    INSERT INTO store_transactions
                        (TYPE, STORE_NO, WEIGHT_CODE, STOCK_DATE, IS_ACTIVE, CREATED_DATE)
                    VALUES ('Buying', 2, ?, ?, 1, NOW())
                `, [s2Code, stockDate]);
                const placeholderId = placeholderResult.insertId;

                // Insert items for stock calculation
                const weightItems = itemDetails.items || [];
                for (const wItem of weightItems) {
                    const prodCode = (wItem.productCode || wItem.code || '').toUpperCase();
                    const netWeight = parseFloat(wItem.netWeight != null ? wItem.netWeight : wItem.netWt) || 0;
                    let itemId = null;
                    if (prodCode) {
                        const [byCode] = await pool.query(
                            'SELECT ITEM_ID FROM store_items WHERE CODE = ? AND IS_ACTIVE = 1 LIMIT 1',
                            [prodCode]
                        );
                        if (byCode && byCode.ITEM_ID) itemId = byCode.ITEM_ID;
                    }
                    await pool.query(`
                        INSERT INTO store_transactions_items
                            (TRANSACTION_ID, ITEM_ID, PRICE, QUANTITY, TOTAL, IS_ACTIVE, CREATED_DATE)
                        VALUES (?, ?, 0, ?, 0, 1, NOW())
                    `, [placeholderId, itemId, netWeight]);
                }
                console.log(`[WeightSync] Created stock placeholder tx (ID: ${placeholderId}) for ${code} with ${weightItems.length} item(s)`);
            }
        } catch (crossCheckError) {
            // Non-fatal — log and continue
            console.warn('[WeightSync] Cross-check with transactions failed (non-fatal):', crossCheckError.message);
        }

        res.status(200).json({
            success: true,
            message: 'Weight synced',
            code: code
        });

    } catch (error) {
        console.error('[WeightSync] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update weight measurement status (called when POS completes QR transaction)
router.post('/api/weights/update-status', async (req, res) => {
    const { code, status, transactionCode } = req.body;
    console.log(`[WeightSync] Status update: ${code} -> ${status}`);

    try {
        if (!code) {
            return res.status(400).json({ success: false, message: 'Weight code is required' });
        }

        // Get current record
        const rows = await pool.query('SELECT ID, ITEM_DETAILS FROM weight_measurements WHERE CODE = ? AND IS_ACTIVE = 1', [code]);
        const existing = Array.isArray(rows) ? rows : (rows?.length ? rows : []);

        if (!existing || existing.length === 0) {
            console.log(`[WeightSync] Weight record not found: ${code}`);
            return res.status(404).json({ success: false, message: 'Weight record not found' });
        }

        // Parse existing ITEM_DETAILS and preserve ALL existing data
        let itemDetails = {};
        try {
            const rawDetails = existing[0].ITEM_DETAILS || existing[0].item_details || '{}';
            itemDetails = typeof rawDetails === 'string' ? JSON.parse(rawDetails) : rawDetails;
            console.log('[WeightSync] Existing itemDetails:', JSON.stringify(itemDetails).substring(0, 200));
        } catch (e) {
            console.error('[WeightSync] Parse error, using empty object:', e.message);
            itemDetails = {};
        }

        // ONLY update status fields, preserve everything else (items, weights, etc.)
        itemDetails.status = status || 'Money Collected';
        itemDetails.collectedAt = toMySQLDateTime();
        itemDetails.transactionCode = transactionCode || null;

        // Update the record - preserving all other fields
        await pool.query(`
            UPDATE weight_measurements SET 
                ITEM_DETAILS = ?,
                UPDATED_DATE = NOW()
            WHERE CODE = ?
        `, [
            JSON.stringify(itemDetails),
            code
        ]);

        console.log(`[WeightSync] Status updated: ${code} -> ${status}, Transaction: ${transactionCode}, Items preserved: ${itemDetails.items?.length || 0}`);

        res.status(200).json({
            success: true,
            message: 'Status updated',
            code: code,
            status: status
        });

    } catch (error) {
        console.error('[WeightSync] Status update error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get weight measurements (for web display and POS)
router.post('/api/weights/get', async (req, res) => {
    try {
        const { code, startDate, endDate, limit = 500 } = req.body;

        let query = 'SELECT * FROM weight_measurements WHERE IS_ACTIVE = 1';
        const params = [];

        if (code) {
            query += ' AND CODE = ?';
            params.push(code);
        }
        if (startDate && endDate) {
            query += ' AND CREATED_DATE BETWEEN ? AND ?';
            params.push(startDate, endDate);
        }

        query += ' ORDER BY CREATED_DATE DESC LIMIT ?';
        params.push(parseInt(limit));

        const rows = await pool.query(query, params);

        // Parse ITEM_DETAILS JSON for each row (handle if already object)
        const result = (rows || []).map(row => {
            let itemDetails = {};
            try {
                if (row.ITEM_DETAILS) {
                    itemDetails = typeof row.ITEM_DETAILS === 'string'
                        ? JSON.parse(row.ITEM_DETAILS)
                        : row.ITEM_DETAILS;
                }
            } catch (e) {
                console.warn(`[WeightGet] Failed to parse ITEM_DETAILS for ${row.CODE}:`, e.message);
                itemDetails = {};
            }
            return {
                ...row,
                ITEM_DETAILS: itemDetails
            };
        });

        res.status(200).json({
            success: true,
            weights: result
        });
    } catch (error) {
        console.error('[WeightGet] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single weight by code (for QR scanning)
router.post('/api/weights/getByCode', async (req, res) => {
    try {
        const { code } = req.body;

        if (!code) {
            return res.status(400).json({ success: false, message: 'Code is required' });
        }

        const rows = await pool.query('SELECT * FROM weight_measurements WHERE CODE = ? AND IS_ACTIVE = 1', [code]);

        if (!rows || rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Weight measurement not found' });
        }

        const row = rows[0];
        res.status(200).json({
            success: true,
            result: {
                ...row,
                ITEM_DETAILS: row.ITEM_DETAILS ? JSON.parse(row.ITEM_DETAILS) : {}
            }
        });
    } catch (error) {
        console.error('[WeightGetByCode] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update weight measurement (update notes/status)
router.post('/api/weights/update', async (req, res) => {
    try {
        const { code, notes, itemDetails } = req.body;

        if (!code) {
            return res.status(400).json({ success: false, message: 'Code is required' });
        }

        const updates = [];
        const params = [];

        if (itemDetails) {
            updates.push('ITEM_DETAILS = ?');
            params.push(JSON.stringify(itemDetails));
        }
        if (notes) {
            updates.push('NOTES = CONCAT(IFNULL(NOTES, \'\'), ?)');
            params.push(` | ${notes}`);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No updates provided' });
        }

        updates.push('UPDATED_DATE = NOW()');
        params.push(code);

        await pool.query(`UPDATE weight_measurements SET ${updates.join(', ')} WHERE CODE = ?`, params);

        res.status(200).json({
            success: true,
            message: 'Weight updated'
        });
    } catch (error) {
        console.error('[WeightUpdate] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all weight measures (with pagination and search)
router.get('/api/weights/all', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search || '';
        const startDate = req.query.startDate;
        const endDate = req.query.endDate;

        let query = `
            SELECT ID, CODE, ITEM_DETAILS, NOTES, CREATED_BY, CREATED_DATE, UPDATED_DATE, IS_ACTIVE
            FROM weight_measurements 
            WHERE IS_ACTIVE = 1
        `;
        const params = [];

        // Search Filter (CODE or content in JSON)
        if (search) {
            query += ` AND (CODE LIKE ? OR ITEM_DETAILS LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        // Date Filter
        if (startDate && endDate) {
            query += ` AND CREATED_DATE BETWEEN ? AND ?`;
            params.push(startDate, endDate);
        }

        // Count Total for Pagination
        const countQuery = `SELECT COUNT(*) as total FROM (${query}) as countTable`;
        // Create a separate connection/query for count if needed, or parse the query string.
        // Easiest is to run the count query first with same params.
        // Note: For large datasets, SQL_CALC_FOUND_ROWS is deprecated but separate count is fine.

        // Refined Count Query:
        let whereClause = 'WHERE IS_ACTIVE = 1';
        const countParams = [];
        if (search) {
            whereClause += ` AND (CODE LIKE ? OR ITEM_DETAILS LIKE ?)`;
            countParams.push(`%${search}%`, `%${search}%`);
        }
        if (startDate && endDate) {
            whereClause += ` AND CREATED_DATE BETWEEN ? AND ?`;
            countParams.push(startDate, endDate);
        }

        const [countResult] = await pool.query(`SELECT COUNT(*) as total FROM weight_measurements ${whereClause}`, countParams);
        const total = countResult.total;

        // Final Data Query
        query += ` ORDER BY CREATED_DATE DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const queryResult = await pool.query(query, params);

        if (Array.isArray(queryResult)) {
            const measures = queryResult.map(record => {
                let itemDetails = {};
                try {
                    if (record.ITEM_DETAILS) {
                        itemDetails = typeof record.ITEM_DETAILS === 'string'
                            ? JSON.parse(record.ITEM_DETAILS)
                            : record.ITEM_DETAILS;
                    }
                } catch (parseError) {
                    console.warn('[WeightAll] Failed to parse ITEM_DETAILS:', parseError.message);
                    itemDetails = {};
                }

                return {
                    id: record.ID,
                    code: record.CODE,
                    ...itemDetails,
                    notes: record.NOTES,
                    createdBy: record.CREATED_BY,
                    createdAt: record.CREATED_DATE,
                    updatedAt: record.UPDATED_DATE,
                    isActive: record.IS_ACTIVE
                };
            });

            return res.status(200).json({
                success: true,
                measures,
                pagination: {
                    current: page,
                    pageSize: limit,
                    total: total
                }
            });
        }
        return res.status(200).json({ success: true, measures: [], pagination: { total: 0 } });
    } catch (error) {
        console.error('[WeightAll] Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Get weight measure by CODE (for QR scanning)
router.get('/api/weights/:code', async (req, res) => {
    try {
        const code = req.params.code;
        const queryResult = await pool.query(
            'SELECT * FROM weight_measurements WHERE CODE = ? AND IS_ACTIVE = 1',
            [code]
        );

        if (Array.isArray(queryResult) && queryResult.length > 0) {
            const record = queryResult[0];
            const itemDetails = record.ITEM_DETAILS ? JSON.parse(record.ITEM_DETAILS) : {};
            return res.status(200).json({
                success: true,
                measure: {
                    id: record.ID,
                    code: record.CODE,
                    ...itemDetails,
                    notes: record.NOTES,
                    createdBy: record.CREATED_BY,
                    createdAt: record.CREATED_DATE
                }
            });
        }
        return res.status(404).json({ success: false, message: 'Weight measure not found' });
    } catch (error) {
        console.error('[WeightById] Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Get all users (for local app login)
router.get('/api/users/all', async (req, res) => {
    try {
        const queryResult = await pool.query(
            'SELECT USER_ID, NAME, USERNAME, ROLE, PHOTO, IS_ACTIVE FROM user_details WHERE IS_ACTIVE = 1'
        );

        if (Array.isArray(queryResult)) {
            const data = queryResult.map(user => ({ ...user }));
            return res.status(200).json({ success: true, users: data });
        }
        return res.status(200).json({ success: true, users: [] });
    } catch (error) {
        console.error('Error fetching users:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});




// ============================================================================
// NEW ENDPOINTS FOR COMPLETE SYNC SYSTEM
// ============================================================================

// Update item (from local POS item editing)
// NOTE: STOCK column does not exist in store_items table - stock is managed locally on POS
router.post('/api/items/update', async (req, res) => {
    const { itemId, price, sellingPrice, userId, isActive, name } = req.body;

    try {
        // Check if itemId is numeric or a code
        const isNumeric = !isNaN(itemId) && !isNaN(parseFloat(itemId));

        // 1. Fetch existing item to handle partial updates
        let existing = null;
        if (isNumeric) {
            const [rows] = await pool.query('SELECT * FROM store_items WHERE ITEM_ID = ?', [itemId]);
            existing = rows;
        } else {
            const [rows] = await pool.query('SELECT * FROM store_items WHERE CODE = ?', [itemId]);
            existing = rows;
        }

        if (!existing) {
            // console.log(`[Update] No item found for ${isNumeric ? 'ID' : 'CODE'}: ${itemId}`);
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // 2. Prepare fields (use existing if new value is undefined)
        // Note: checking !== undefined to allow setting 0 or null if intended
        const finalBuyingPrice = price !== undefined ? price : existing.BUYING_PRICE;
        const finalSellingPrice = sellingPrice !== undefined ? sellingPrice : existing.SELLING_PRICE;
        const finalCreatedBy = userId || existing.CREATED_BY;
        const finalName = name !== undefined ? name : existing.NAME;
        // Handle isActive: convert boolean to 1/0
        const finalIsActive = isActive !== undefined ? (isActive ? 1 : 0) : existing.IS_ACTIVE;

        console.log(`[Update] Updating item ${itemId}: IS_ACTIVE=${finalIsActive}`);

        // 3. Update Query (includes IS_ACTIVE and NAME)
        let updateQuery, updateParams;
        if (isNumeric) {
            updateQuery = `
                UPDATE store_items 
                SET NAME = ?,
                    BUYING_PRICE = ?, 
                    SELLING_PRICE = ?, 
                    IS_ACTIVE = ?,
                    CREATED_BY = ?,
                    EDITED_DATE = NOW()
                WHERE ITEM_ID = ?
            `;
            updateParams = [finalName, finalBuyingPrice, finalSellingPrice, finalIsActive, finalCreatedBy, itemId];
        } else {
            updateQuery = `
                UPDATE store_items 
                SET NAME = ?,
                    BUYING_PRICE = ?, 
                    SELLING_PRICE = ?, 
                    IS_ACTIVE = ?,
                    CREATED_BY = ?,
                    EDITED_DATE = NOW()
                WHERE CODE = ?
            `;
            updateParams = [finalName, finalBuyingPrice, finalSellingPrice, finalIsActive, finalCreatedBy, itemId];
        }

        const result = await pool.query(updateQuery, updateParams);

        // Emit socket event for real-time sync
        if (req.io) {
            req.io.emit('item:updated', { itemId, isActive: finalIsActive });
        }

        res.status(200).json({ success: true, message: 'Item updated successfully' });
    } catch (error) {
        console.error('Error updating item:', error);
        res.status(500).json({ success: false, message: 'Failed to update item', error: error.message });
    }
});

// Create transaction with items (from POS completeBill)
router.post('/api/transactions/create', async (req, res) => {
    const { code, storeNo, total, subtotal, discount, amountPaid, paymentMethod, userId, items, createdAt } = req.body;

    try {
        // Insert transaction header
        const transResult = await pool.query(`
            INSERT INTO store_transactions 
            (CODE, TYPE, METHOD, DATE, SUB_TOTAL, PAYMENT_AMOUNT, AMOUNT_SETTLED, DUE_AMOUNT, CREATED_BY, STORE_NO, IS_ACTIVE)
            VALUES (?, 'Selling', ?, ?, ?, ?, ?, '0', ?, ?, 1)
        `, [code, paymentMethod, createdAt, subtotal, amountPaid, amountPaid, userId, storeNo]);

        const transactionId = transResult.insertId;

        // Insert transaction items
        const itemPromises = items.map(item => {
            return pool.query(`
                INSERT INTO store_transactions_items 
                (TRANSACTION_ID, ITEM_ID, PRICE, QUANTITY, TOTAL, CREATED_BY, IS_ACTIVE)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            `, [transactionId, item.productId, item.price, item.quantity, item.total, userId]);
        });

        await Promise.all(itemPromises);

        res.status(200).json({
            success: true,
            message: 'Transaction created successfully',
            transactionId
        });
    } catch (error) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ success: false, message: 'Failed to create transaction', error: error.message });
    }
});

// Get transaction details (for reprint/edit)
router.get('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;

    try {
        // Get transaction header
        const trans = await pool.query(`
            SELECT * FROM store_transactions WHERE TRANSACTION_ID = ? AND IS_ACTIVE = 1
        `, [id]);

        if (!trans || trans.length === 0) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        // Get transaction items
        const items = await pool.query(`
            SELECT ti.*, si.NAME as ITEM_NAME, si.CODE as ITEM_CODE
            FROM store_transactions_items ti
            LEFT JOIN store_items si ON ti.ITEM_ID = si.ITEM_ID
            WHERE ti.TRANSACTION_ID = ? AND ti.IS_ACTIVE = 1
        `, [id]);

        res.status(200).json({
            success: true,
            transaction: trans[0],
            items: items || []
        });
    } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch transaction', error: error.message });
    }
});

// Edit transaction (soft edit - deactivate old, create new)
router.put('/api/transactions/:id/edit', async (req, res) => {
    const { id } = req.params;
    const { items, subtotal, total, userId } = req.body;

    try {
        // Get original transaction
        const origTrans = await pool.query(`
            SELECT * FROM store_transactions WHERE TRANSACTION_ID = ? AND IS_ACTIVE = 1
        `, [id]);

        if (!origTrans || origTrans.length === 0) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        const orig = origTrans[0];

        // Deactivate old transaction and items
        await pool.query(`UPDATE store_transactions SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?`, [id]);
        await pool.query(`UPDATE store_transactions_items SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?`, [id]);

        // Create new transaction
        const newTrans = await pool.query(`
            INSERT INTO store_transactions 
            (REFERENCE_TRANSACTION, CODE, TYPE, METHOD, DATE, SUB_TOTAL, PAYMENT_AMOUNT, AMOUNT_SETTLED, DUE_AMOUNT, CREATED_BY, STORE_NO, IS_ACTIVE)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `, [id, orig.CODE, orig.TYPE, orig.METHOD, orig.DATE, subtotal, total, total, '0', userId, orig.STORE_NO]);

        const newTransId = newTrans.insertId;

        // Insert new items
        const itemPromises = items.map(item => {
            return pool.query(`
                INSERT INTO store_transactions_items 
                (TRANSACTION_ID, ITEM_ID, PRICE, QUANTITY, TOTAL, CREATED_BY, IS_ACTIVE)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            `, [newTransId, item.itemId, item.price, item.quantity, item.total, userId]);
        });

        await Promise.all(itemPromises);

        res.status(200).json({
            success: true,
            message: 'Transaction edited successfully',
            newTransactionId: newTransId
        });
    } catch (error) {
        console.error('Error editing transaction:', error);
        res.status(500).json({ success: false, message: 'Failed to edit transaction', error: error.message });
    }
});

// Delete transaction (soft delete)
router.delete('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;

    try {
        await pool.query(`UPDATE store_transactions SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?`, [id]);
        await pool.query(`UPDATE store_transactions_items SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?`, [id]);

        res.status(200).json({ success: true, message: 'Transaction deleted successfully' });
    } catch (error) {
        console.error('Error deleting transaction:', error);
        res.status(500).json({ success: false, message: 'Failed to delete transaction', error: error.message });
    }
});

// Get all transactions (for Bills page)
router.get('/api/transactions/list/:storeNo', async (req, res) => {
    const { storeNo } = req.params;

    try {
        const transactions = await pool.query(`
            SELECT 
                t.TRANSACTION_ID,
                t.CODE,
                t.TYPE,
                t.METHOD,
                t.DATE,
                t.SUB_TOTAL,
                t.PAYMENT_AMOUNT,
                t.CREATED_BY,
                t.CREATED_DATE,
                u.NAME as CASHIER_NAME,
                COUNT(ti.TI_ID) as ITEM_COUNT
            FROM store_transactions t
            LEFT JOIN user_details u ON t.CREATED_BY = u.USER_ID
            LEFT JOIN store_transactions_items ti ON t.TRANSACTION_ID = ti.TRANSACTION_ID AND ti.IS_ACTIVE = 1
            WHERE t.STORE_NO = ? AND t.IS_ACTIVE = 1
            GROUP BY t.TRANSACTION_ID
            ORDER BY t.CREATED_DATE DESC
            LIMIT 100
        `, [storeNo]);

        res.status(200).json({ success: true, transactions: transactions || [] });
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch transactions', error: error.message });
    }
});

module.exports = router;
