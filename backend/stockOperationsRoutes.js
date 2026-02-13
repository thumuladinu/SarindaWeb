/**
 * =====================================================
 * STOCK OPERATIONS ROUTES
 * Handles all 9 stock operation types for POS & Weighing Station
 * =====================================================
 */

const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');
const { calculateCurrentStock } = require("./stockCalculator");

router.use(cors());

// Promisify pool.query if not already done
if (!pool.query[util.promisify.custom]) {
    pool.query = util.promisify(pool.query);
}

// Operation type constants
const OP_TYPES = {
    FULL_CLEAR_STANDARD: 1,
    PARTIAL_CLEAR_STANDARD: 2,
    FULL_CLEAR_WITH_SALES: 3,
    PARTIAL_CLEAR_WITH_SALES: 4,
    TRANSFER_STANDARD: 5,
    TRANSFER_FULL_CLEARANCE: 6,
    PARTIAL_CLEAR_WITH_LORRY: 7,
    FULL_CLEAR_WITH_LORRY: 8,
    ITEM_CONVERSION: 9,
    STOCK_RETURN: 11
};

// Clearance type mapping
const getClearanceType = (opType, conversionType = null) => {
    if (opType === OP_TYPES.ITEM_CONVERSION) {
        // For Operation 9, derive from the internal selection
        return conversionType === 'FULL' ? 'FULL' : 'PARTIAL';
    }
    if ([1, 3, 6, 8].includes(opType)) return 'FULL';
    if ([2, 4, 5, 7].includes(opType)) return 'PARTIAL';
    return null;
};

// Generate unique operation code
// Format: S{STORE}-{YYMMDD}-CLR-{TERMINAL}-{COUNT}
// Example: S1-260128-CLR-CN4ZH-001
const generateOpCode = async (storeNo = 1, terminalCode = 'POS') => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yy}${mm}${dd}`;

    const storePrefix = `S${storeNo}`;
    const prefix = `${storePrefix}-${dateStr}-CLR`;

    // Get count of operations today for this store
    const result = await pool.query(
        "SELECT COUNT(*) as cnt FROM store_stock_operations WHERE OP_CODE LIKE ? AND DATE(CREATED_DATE) = CURDATE()",
        [`${storePrefix}-${dateStr}%`]
    );
    const count = (result[0]?.cnt || 0) + 1;

    // Terminal code - take first 5 chars if longer
    const termCode = (terminalCode || 'POS').slice(0, 5).toUpperCase();

    return `${prefix}-${termCode}-${String(count).padStart(3, '0')}`;
};

// Generate unique transfer code
const generateTransferCode = async () => {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `TR-${dateStr}`;

    const result = await pool.query(
        "SELECT COUNT(*) as cnt FROM store_stock_transfers WHERE TRANSFER_CODE LIKE ?",
        [`${prefix}%`]
    );
    const count = (result[0]?.cnt || 0) + 1;
    return `${prefix}-${String(count).padStart(4, '0')}`;
};

// =====================================================
// MAIN OPERATION CREATION ENDPOINT
// =====================================================

router.post('/api/stock-ops/create', async (req, res) => {
    console.log('[Stock Ops] Create operation request:', req.body.OP_TYPE);

    try {
        const data = req.body;
        const opType = parseInt(data.OP_TYPE);

        if (!opType || opType < 1 || (opType > 9 && opType !== 11)) {
            return res.status(400).json({ success: false, message: 'Invalid operation type' });
        }

        // Check for existing operation with same LOCAL_ID (Idempotency)
        if (data.LOCAL_ID) {
            const existing = await pool.query(
                "SELECT OP_CODE, BILL_CODE FROM store_stock_operations WHERE LOCAL_ID = ?",
                [data.LOCAL_ID]
            );
            if (existing && existing.length > 0) {
                console.log(`[Stock Ops] Duplicate submission detected for LOCAL_ID: ${data.LOCAL_ID}. Returning existing.`);
                return res.status(200).json({
                    success: true,
                    message: 'Operation already processed (Duplicate)',
                    opCode: existing[0].OP_CODE,
                    billCode: existing[0].BILL_CODE
                });
            }
        }

        // Generate operation code with store number and terminal code
        const storeNo = data.STORE_NO || 1;
        const terminalCode = data.TERMINAL_CODE || 'POS';

        let opCode = data.OP_CODE;

        // If OP_CODE is provided (Offline Mode), check for collision/update
        if (opCode) {
            const existingOp = await pool.query("SELECT OP_ID, OP_CODE FROM store_stock_operations WHERE OP_CODE = ?", [opCode]);
            if (existingOp && existingOp.length > 0) {
                console.log(`[Stock Ops] Existing OP_CODE ${opCode} found. Archiving old record (Edit/Re-sync).`);
                const oldOpId = existingOp[0].OP_ID;

                // Soft Delete Strategy:
                // 1. Rename old OP_CODE to free up the unique constraint (if any) or just for clarity
                // 2. Set IS_ACTIVE = 0
                // 3. Set STATUS = 'REPLACED'
                await pool.query(
                    "UPDATE store_stock_operations SET IS_ACTIVE = 0, OP_CODE = CONCAT(OP_CODE, '_OLD_', ?) WHERE OP_ID = ?",
                    [oldOpId, oldOpId]
                );
            }
        } else {
            // Fallback: Generate server-side if not provided
            opCode = await generateOpCode(storeNo, terminalCode);
        }

        // Determine clearance type
        const clearanceType = getClearanceType(opType, data.CONVERSION_TYPE);

        // Calculate wastage/surplus for applicable operations
        let wastageAmount = 0;
        let surplusAmount = 0;

        if (data.calculateWastageSurplus && data.items && data.items.length > 0) {
            const totalOriginal = data.items.reduce((sum, item) => sum + (parseFloat(item.ORIGINAL_STOCK) || 0), 0);
            let totalProcessed = 0;

            if (opType === OP_TYPES.FULL_CLEAR_WITH_SALES || opType === OP_TYPES.PARTIAL_CLEAR_WITH_SALES) {
                totalProcessed = data.items.reduce((sum, item) => sum + (parseFloat(item.SOLD_QUANTITY) || 0), 0);
            } else if (opType === OP_TYPES.ITEM_CONVERSION && clearanceType === 'FULL') {
                // For full conversion, sum destination quantities
                totalProcessed = (data.conversions || []).reduce((sum, conv) => sum + (parseFloat(conv.DEST_QUANTITY) || 0), 0);
            } else if (opType === OP_TYPES.TRANSFER_FULL_CLEARANCE || opType === OP_TYPES.FULL_CLEAR_WITH_LORRY) {
                totalProcessed = data.items.reduce((sum, item) => sum + (parseFloat(item.CLEARED_QUANTITY) || 0), 0);
            }

            if (totalProcessed < totalOriginal) {
                wastageAmount = totalOriginal - totalProcessed;
            } else if (totalProcessed > totalOriginal) {
                surplusAmount = totalProcessed - totalOriginal;
            }
        }

        // Insert main operation record
        const opRecord = {
            OP_CODE: opCode,
            OP_TYPE: opType,
            STORE_NO: data.STORE_NO || 1,
            CLEARANCE_TYPE: clearanceType,
            CUSTOMER_ID: data.CUSTOMER_ID || null,
            CUSTOMER_NAME: data.CUSTOMER_NAME || null,
            CUSTOMER_CONTACT: data.CUSTOMER_CONTACT || null,
            BILL_CODE: data.BILL_CODE || null,
            BILL_AMOUNT: data.BILL_AMOUNT || null,
            LORRY_NAME: data.LORRY_NAME || null,
            DRIVER_NAME: data.DRIVER_NAME || null,
            DESTINATION: data.DESTINATION || null,
            RETURN_STATUS: ([7, 8].includes(opType)) ? 'PENDING' : null,
            WASTAGE_AMOUNT: wastageAmount,
            SURPLUS_AMOUNT: surplusAmount,
            COMMENTS: data.COMMENTS || null,
            TRIP_ID: data.TRIP_ID || null,
            DATE: data.DATE || new Date().toISOString(),
            CREATED_BY: data.CREATED_BY,
            CREATED_BY_NAME: data.CREATED_BY_NAME || null,
            LOCAL_ID: data.LOCAL_ID || null,
            IS_ACTIVE: 1
        };

        const insertResult = await pool.query('INSERT INTO store_stock_operations SET ?', opRecord);
        const opId = insertResult.insertId;

        // Pre-fetch current stock for all items BEFORE any operations
        // This is critical - we need the stock BEFORE any transactions modify it
        const itemStocks = new Map();
        if (data.items && data.items.length > 0) {
            for (const item of data.items) {
                // Use Unified Stock Calculator
                const stock = await calculateCurrentStock(pool, item.ITEM_ID, data.STORE_NO || 1);
                itemStocks.set(item.ITEM_ID, stock);
                console.log(`[Stock Ops] Pre-fetch stock for item ${item.ITEM_ID}: ${stock.toFixed(2)}kg`);
            }
        }

        // Insert operation items with PRE-FETCHED stock values
        if (data.items && data.items.length > 0) {
            for (const item of data.items) {
                const originalStock = itemStocks.get(item.ITEM_ID) || 0;
                const itemRecord = {
                    OP_ID: opId,
                    ITEM_ID: item.ITEM_ID,
                    ITEM_CODE: item.ITEM_CODE || null,
                    ITEM_NAME: item.ITEM_NAME || null,
                    ORIGINAL_STOCK: originalStock, // Use pre-fetched stock, not from request
                    CLEARED_QUANTITY: parseFloat(item.CLEARED_QUANTITY) || 0,
                    REMAINING_STOCK: parseFloat(item.REMAINING_STOCK) || 0,
                    SOLD_QUANTITY: parseFloat(item.SOLD_QUANTITY) || 0,
                    PRICE: parseFloat(item.PRICE) || 0,
                    TOTAL: parseFloat(item.TOTAL) || 0,
                    HAS_CONVERSION: item.HAS_CONVERSION ? 1 : 0,
                    IS_ACTIVE: 1
                };
                await pool.query('INSERT INTO store_stock_operation_items SET ?', itemRecord);
            }
        }

        // Insert conversions if provided
        if (data.conversions && data.conversions.length > 0) {
            for (const conv of data.conversions) {
                const convRecord = {
                    OP_ID: opId,
                    SOURCE_ITEM_ID: conv.SOURCE_ITEM_ID,
                    SOURCE_ITEM_CODE: conv.SOURCE_ITEM_CODE || null,
                    SOURCE_ITEM_NAME: conv.SOURCE_ITEM_NAME || null,
                    SOURCE_QUANTITY: parseFloat(conv.SOURCE_QUANTITY) || 0,
                    DEST_ITEM_ID: conv.DEST_ITEM_ID,
                    DEST_ITEM_CODE: conv.DEST_ITEM_CODE || null,
                    DEST_ITEM_NAME: conv.DEST_ITEM_NAME || null,
                    DEST_QUANTITY: parseFloat(conv.DEST_QUANTITY) || 0,
                    IS_ACTIVE: 1
                };
                await pool.query('INSERT INTO store_stock_operation_conversions SET ?', convRecord);
            }
        }

        // Handle transfer operations (5, 6)
        let transferId = null;
        if ([5, 6].includes(opType)) {
            const transferCode = await generateTransferCode();
            const transferRecord = {
                TRANSFER_CODE: transferCode,
                OP_ID: opId,
                SOURCE_STORE: 1,
                DEST_STORE: 2,
                TRANSFER_TYPE: opType === 5 ? 'STANDARD' : 'FULL_CLEARANCE',
                ORIGINAL_QUANTITY: data.items?.reduce((sum, i) => sum + (parseFloat(i.ORIGINAL_STOCK) || 0), 0) || 0,
                TRANSFERRED_QUANTITY: data.items?.reduce((sum, i) => sum + (parseFloat(i.CLEARED_QUANTITY) || 0), 0) || 0,
                WASTAGE_AMOUNT: wastageAmount,
                SURPLUS_AMOUNT: surplusAmount,
                STATUS: 'PENDING',
                INITIATED_BY: data.CREATED_BY,
                INITIATED_BY_NAME: data.CREATED_BY_NAME || null,
                COMMENTS: data.COMMENTS || null,
                IS_ACTIVE: 1
            };

            const transferResult = await pool.query('INSERT INTO store_stock_transfers SET ?', transferRecord);
            transferId = transferResult.insertId;

            // Update operation with transfer ID
            await pool.query('UPDATE store_stock_operations SET TRANSFER_ID = ? WHERE OP_ID = ?', [transferId, opId]);

            // Insert transfer items
            if (data.items && data.items.length > 0) {
                for (const item of data.items) {
                    const transferItemRecord = {
                        TRANSFER_ID: transferId,
                        ITEM_ID: item.ITEM_ID,
                        ITEM_CODE: item.ITEM_CODE || null,
                        ITEM_NAME: item.ITEM_NAME || null,
                        ORIGINAL_QUANTITY: parseFloat(item.ORIGINAL_STOCK) || 0,
                        WEIGHED_QUANTITY: parseFloat(item.CLEARED_QUANTITY) || 0,
                        HAS_CONVERSION: item.HAS_CONVERSION ? 1 : 0,
                        IS_ACTIVE: 1
                    };
                    await pool.query('INSERT INTO store_stock_transfer_items SET ?', transferItemRecord);
                }
            }
        }

        // Update stock levels (skip for transfers until approved)
        // For ops 3, 4: updateStockLevels will create the Selling transaction
        let billCode = null;
        let actualWastage = wastageAmount;
        let actualSurplus = surplusAmount;

        if (![5, 6].includes(opType)) {
            const stockResult = await updateStockLevels(opType, data, clearanceType, opCode, itemStocks);
            if (stockResult?.billCode) {
                billCode = stockResult.billCode;
                // Update operation record with bill code
                await pool.query('UPDATE store_stock_operations SET BILL_CODE = ? WHERE OP_ID = ?', [billCode, opId]);
            }

            // For ops 3, 4: Update the operation items record with actual values
            if ([3, 4].includes(opType) && stockResult) {
                actualWastage = stockResult.wastage || 0;
                actualSurplus = stockResult.surplus || 0;

                // Update operation record with wastage/surplus
                await pool.query(
                    'UPDATE store_stock_operations SET WASTAGE_AMOUNT = ?, SURPLUS_AMOUNT = ? WHERE OP_ID = ?',
                    [actualWastage, actualSurplus, opId]
                );

                // Update items record with sold and cleared quantities
                // NOTE: ORIGINAL_STOCK is already set correctly from pre-fetch, don't overwrite it
                await pool.query(
                    `UPDATE store_stock_operation_items 
                     SET SOLD_QUANTITY = ?, CLEARED_QUANTITY = ?
                     WHERE OP_ID = ? AND ITEM_ID = ?`,
                    [
                        stockResult.soldQty || 0,
                        (stockResult.soldQty || 0) + (stockResult.totalConvertedQty || 0) + actualWastage,
                        opId,
                        stockResult.itemId
                    ]
                );
            }
        }

        console.log(`[Stock Ops] Created operation ${opCode} (Type: ${opType})${billCode ? `, Bill: ${billCode}` : ''}`);

        return res.status(200).json({
            success: true,
            message: 'Stock operation created successfully',
            opId: opId,
            opCode: opCode,
            billCode: billCode,
            transferId: transferId,
            wastage: actualWastage,
            surplus: actualSurplus
        });

    } catch (error) {
        console.error('[Stock Ops] Create error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
});

// =====================================================
// UPDATE OPERATION ENDPOINT
// =====================================================

router.post('/api/stock-ops/update', async (req, res) => {
    console.log('[Stock Ops] Update operation request:', req.body.OP_ID || req.body.LOCAL_ID);

    try {
        const data = req.body;

        let opId = data.OP_ID;
        // If no OP_ID, try to find by LOCAL_ID
        if (!opId && data.LOCAL_ID) {
            const [existing] = await pool.query('SELECT OP_ID FROM store_stock_operations WHERE LOCAL_ID = ?', [data.LOCAL_ID]);
            if (existing) opId = existing.OP_ID;
        }

        if (!opId) {
            return res.status(404).json({ success: false, message: 'Operation not found' });
        }

        // 1. Update main record fields (Editable fields)
        // Note: Changing quantities strictly is complex due to ledger impact. 
        // For now, allowing update of metadata. If quantities update, simplified logic: just update record, won't adjust ledger diffs (safety).
        const updateFields = {
            CUSTOMER_NAME: data.CUSTOMER_NAME || null,
            CUSTOMER_CONTACT: data.CUSTOMER_CONTACT || null,
            LORRY_NAME: data.LORRY_NAME || null,
            DRIVER_NAME: data.DRIVER_NAME || null,
            DESTINATION: data.DESTINATION || null,
            COMMENTS: data.COMMENTS || null,
            COMMENTS: data.COMMENTS || null,
            IS_SYNCED: 1,
            TRIP_ID: data.TRIP_ID || undefined
        };

        // If backend ID is provided (syncing an update to an existing backend record), update it.
        await pool.query('UPDATE store_stock_operations SET ? WHERE OP_ID = ?', [updateFields, opId]);

        return res.status(200).json({
            success: true,
            message: 'Stock operation updated successfully',
            opId: opId
        });

    } catch (error) {
        console.error('[Stock Ops] Update error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
});

// =====================================================
// DELETE OPERATION (UNDO STOCK) ENDPOINT
// =====================================================

router.post('/api/stock-ops/delete', async (req, res) => {
    console.log('[Stock Ops] Delete operation request:', req.body);

    const connection = await pool.promise().getConnection();
    try {
        await connection.beginTransaction();

        const { OP_ID, LOCAL_ID, OP_CODE } = req.body;

        // 1. Identify the Operation
        let op = null;
        if (OP_ID) {
            const [rows] = await connection.query('SELECT * FROM store_stock_operations WHERE OP_ID = ?', [OP_ID]);
            if (rows.length > 0) op = rows[0];
        } else if (LOCAL_ID) {
            const [rows] = await connection.query('SELECT * FROM store_stock_operations WHERE LOCAL_ID = ?', [LOCAL_ID]);
            if (rows.length > 0) op = rows[0];
        } else if (OP_CODE) {
            const [rows] = await connection.query('SELECT * FROM store_stock_operations WHERE OP_CODE = ?', [OP_CODE]);
            if (rows.length > 0) op = rows[0];
        }

        console.log('[Stock Ops] Found op:', op);

        if (!op) {
            await connection.release();
            return res.status(404).json({ success: false, message: 'Operation not found' });
        }

        const opId = op.OP_ID;
        const opCode = op.OP_CODE;

        console.log(`[Stock Ops] Soft deleting operation: ${opCode} (ID: ${opId})`);

        // 2. Soft Delete Operation Record
        await connection.query('UPDATE store_stock_operations SET IS_ACTIVE = 0 WHERE OP_ID = ?', [opId]);

        // 2.1 Soft Delete Operation Items
        await connection.query('UPDATE store_stock_operation_items SET IS_ACTIVE = 0 WHERE OP_ID = ?', [opId]);

        // 2.2 Soft Delete Conversions
        await connection.query('UPDATE store_stock_operation_conversions SET IS_ACTIVE = 0 WHERE OP_ID = ?', [opId]);


        // 3. Undo Stock Transactions
        // We find transactions where COMMENTS contain the OP_CODE (Bracketed or standard)
        // Pattern: [S1-250210-CLR-POS-001]

        const searchPattern = `%[${opCode}]%`;

        // Find transaction IDs first for logging/verification
        const [txs] = await connection.query(
            'SELECT TRANSACTION_ID FROM store_transactions WHERE COMMENTS LIKE ? AND IS_ACTIVE = 1',
            [searchPattern]
        );

        if (txs.length > 0) {
            const txIds = txs.map(t => t.TRANSACTION_ID);
            console.log(`[Stock Ops] Deactivating ${txIds.length} stock transactions: ${txIds.join(', ')}`);

            // Soft Delete Transaction Items
            await connection.query('UPDATE store_transactions_items SET IS_ACTIVE = 0 WHERE TRANSACTION_ID IN (?)', [txIds]);

            // Soft Delete Transactions
            await connection.query('UPDATE store_transactions SET IS_ACTIVE = 0 WHERE TRANSACTION_ID IN (?)', [txIds]);
        } else {
            console.log(`[Stock Ops] Warning: No active stock transactions found for OpCode ${opCode}`);
        }

        // 4. Handle Selling Transactions (if Op 3/4)
        // If this operation created a bill (Selling Tx), we should also reverse it?
        // User said "Undo its changes". Usually stock operations bills are internal or quick sales.
        // If we delete the operation, the sales record should probably also be voided to correct cash/stock.
        // We'll trust the OP_CODE search above to catch "Stock Operation Sale" transactions too,
        // as they also include [OP_CODE] in comments (see create endpoint).

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'Operation deleted and stock changes reversed successfully',
            opId: opId,
            opCode: opCode,
            transactionsReversed: txs.length
        });

    } catch (error) {
        await connection.rollback();
        console.error('[Stock Ops] Delete error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    } finally {
        connection.release();
    }
});


// Helper function to update stock levels by creating transaction records
// This integrates with the existing stock calculation system (store_transactions + store_transactions_items)
// 
// EQUATIONS:
// For Full Stock Clearance: currentStock + x = 0, where x is adjustment needed
//   - If currentStock = -45kg, need x = +45kg (AdjIn)
//   - If currentStock = +45kg, need x = -45kg (AdjOut)
//
// For Item Conversion with Full Clear: 
//   currentStock - sum(destItems) + wastage_or_surplus = 0
//   - Clear source to 0, add destinations with their quantities
//
// For Partial Conversion:
//   Remove sum(destItems) from source, add each destination
//
async function updateStockLevels(opType, data, clearanceType, opCode = '', itemStocks = new Map()) {
    const storeNo = data.STORE_NO || 1;
    const createdBy = data.CREATED_BY || 1;

    console.log(`[Stock Ops] Updating stock for opType=${opType}, clearance=${clearanceType}`);
    console.log(`[Stock Ops] Items:`, JSON.stringify(data.items?.map(i => ({ id: i.ITEM_ID, name: i.ITEM_NAME, qty: i.QUANTITY || i.CLEARED_QUANTITY })) || []));
    console.log(`[Stock Ops] Conversions:`, JSON.stringify(data.conversions?.map(c => ({ src: c.SOURCE_ITEM_ID, dest: c.DEST_ITEM_ID, qty: c.DEST_QUANTITY })) || []));

    // Generate transaction code
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const dateStr = `${day}${month}${year}`;
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();

    // Helper to get current stock from ledger using Unified Calculator
    async function getCurrentStock(itemId) {
        return await calculateCurrentStock(pool, itemId, storeNo);
    }

    // Helper to create a stock adjustment transaction
    async function createAdjustment(itemId, adjustmentQty, txType, comment) {
        if (adjustmentQty === 0) return null;

        const txCode = `STOCKOP-${dateStr}-${randomSuffix}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
        const txObj = {
            CODE: txCode,
            STORE_NO: storeNo,
            TYPE: txType,
            CREATED_BY: createdBy,
            CREATED_DATE: new Date(),
            SUB_TOTAL: 0,
            COMMENTS: `[${opCode}] ${comment}`,
            IS_ACTIVE: 1
        };

        const txRes = await pool.query('INSERT INTO store_transactions SET ?', txObj);
        const txId = txRes.insertId;

        const txItemObj = {
            TRANSACTION_ID: txId,
            ITEM_ID: itemId,
            PRICE: 0,
            QUANTITY: Math.abs(adjustmentQty),
            TOTAL: 0,
            CREATED_BY: createdBy,
            IS_ACTIVE: 1
        };
        await pool.query('INSERT INTO store_transactions_items SET ?', txItemObj);

        console.log(`[Stock Ops] Created ${txType} tx#${txId} for item ${itemId}: ${adjustmentQty > 0 ? '+' : ''}${adjustmentQty.toFixed(2)}kg`);
        return txId;
    }

    // Get item quantity - POS sends QUANTITY, some paths send CLEARED_QUANTITY
    function getItemQty(item) {
        if (item.QUANTITY === 'FULL') return null; // Full clearance - will calculate from ledger
        return parseFloat(item.QUANTITY) || parseFloat(item.CLEARED_QUANTITY) || 0;
    }

    // Check if item has conversions in the data
    function hasConversions(itemId) {
        return (data.conversions || []).some(c => c.SOURCE_ITEM_ID === itemId || c.SOURCE_ITEM_ID === String(itemId));
    }

    // Get conversions for a specific source item
    function getItemConversions(itemId) {
        return (data.conversions || []).filter(c =>
            c.SOURCE_ITEM_ID === itemId || c.SOURCE_ITEM_ID === String(itemId)
        );
    }

    // ========================================================
    // TYPE 9: ITEM CONVERSION (Dedicated conversion operation)
    // ========================================================
    if (opType === 9 && data.conversions && data.conversions.length > 0) {
        // Group conversions by source item
        const sourceItemMap = {};
        for (const conv of data.conversions) {
            const sourceId = String(conv.SOURCE_ITEM_ID);
            if (!sourceItemMap[sourceId]) {
                sourceItemMap[sourceId] = {
                    itemId: parseInt(sourceId),
                    itemCode: conv.SOURCE_ITEM_CODE || '',
                    itemName: conv.SOURCE_ITEM_NAME || 'Item',
                    totalDestQty: 0,
                    destinations: []
                };
            }
            sourceItemMap[sourceId].totalDestQty += parseFloat(conv.DEST_QUANTITY) || 0;
            sourceItemMap[sourceId].destinations.push(conv);
        }

        // Process each source item
        for (const sourceId of Object.keys(sourceItemMap)) {
            const sourceInfo = sourceItemMap[sourceId];
            const totalDestQty = sourceInfo.totalDestQty;
            const currentStock = await getCurrentStock(sourceInfo.itemId);

            console.log(`[Stock Ops] Conversion - Source ${sourceId} (${sourceInfo.itemName}): current=${currentStock}kg, destSum=${totalDestQty}kg`);

            if (clearanceType === 'FULL') {
                // Full conversion: Clear source to 0, add all destinations
                if (currentStock !== 0) {
                    const adjustment = -currentStock;
                    const txType = adjustment > 0 ? 'AdjIn' : 'AdjOut';
                    const wastageOrSurplus = totalDestQty - currentStock;

                    const comment = `Stock Cleared for Conversion: ${sourceInfo.itemName} (was ${currentStock.toFixed(2)}kg → 0kg). ` +
                        `Outputs: ${totalDestQty.toFixed(2)}kg. ` +
                        (wastageOrSurplus >= 0 ? `Surplus: ${wastageOrSurplus.toFixed(2)}kg` : `Wastage: ${Math.abs(wastageOrSurplus).toFixed(2)}kg`);

                    await createAdjustment(sourceInfo.itemId, adjustment, txType, comment);
                }
            } else {
                // Partial conversion: Remove totalDestQty from source
                if (totalDestQty > 0) {
                    const comment = `Partial Conversion: Removed ${totalDestQty.toFixed(2)}kg from ${sourceInfo.itemName}`;
                    await createAdjustment(sourceInfo.itemId, -totalDestQty, 'AdjOut', comment);
                }
            }

            // Add stock to each destination
            for (const conv of sourceInfo.destinations) {
                const destQty = parseFloat(conv.DEST_QUANTITY) || 0;
                if (destQty <= 0) continue;

                const comment = `Conversion: Added ${destQty.toFixed(2)}kg of ${conv.DEST_ITEM_NAME || 'Item'} (from ${sourceInfo.itemName})`;
                await createAdjustment(parseInt(conv.DEST_ITEM_ID), destQty, 'AdjIn', comment);
            }
        }
        return; // Done with Type 9
    }

    // ========================================================
    // TYPES 3, 4: Full/Partial Clear + SALES BILL
    // - Op 3: Full Clear + Bill - Clear stock to 0, create Selling tx, calc wastage
    // - Op 4: Partial Clear + Bill - Remove (sold + converted), create Selling tx
    // ========================================================
    if ([3, 4].includes(opType) && data.items && data.items.length > 0) {
        const item = data.items[0]; // Single item for these operations
        const itemId = item.ITEM_ID;
        const itemName = item.ITEM_NAME || 'Item';
        const itemCode = item.ITEM_CODE || '';
        const soldQty = parseFloat(item.SOLD_QUANTITY) || parseFloat(data.SELL_QUANTITY) || 0;
        const pricePerKg = parseFloat(item.PRICE) || parseFloat(data.SELL_PRICE) || 0;
        const billTotal = soldQty * pricePerKg;

        // Get conversions for this item
        const convs = (data.conversions || []).filter(c =>
            c.SOURCE_ITEM_ID === itemId || c.SOURCE_ITEM_ID === String(itemId)
        );
        const totalConvertedQty = convs.reduce((sum, c) => sum + (parseFloat(c.DEST_QUANTITY) || 0), 0);
        // Use pre-fetched current stock (consistent with DB record)
        const currentStock = itemStocks.get(itemId) || 0;
        console.log(`[Stock Ops] Using pre-fetched stock for ${itemId}: ${currentStock.toFixed(2)}kg`);

        console.log(`[Stock Ops] OP ${opType} - ${itemCode} ${itemName}`);
        console.log(`[Stock Ops]   Current Stock: ${currentStock.toFixed(2)}kg`);
        console.log(`[Stock Ops]   Sold: ${soldQty}kg @ Rs${pricePerKg}/kg = Rs${billTotal}`);
        console.log(`[Stock Ops]   Converted: ${totalConvertedQty}kg to ${convs.length} items`);

        // Generate bill code - Format: S{STORE}-{YYMMDD}-SLO-{TERMINAL}-{COUNT}
        const now = new Date();
        const yy = String(now.getFullYear()).slice(-2);
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const dateStr = `${yy}${mm}${dd}`;
        const termCode = (data.TERMINAL_CODE || 'POS').slice(0, 5).toUpperCase();

        // Get count of SLO bills today for this store
        const billCountResult = await pool.query(
            "SELECT COUNT(*) as cnt FROM store_transactions WHERE CODE LIKE ? AND DATE(CREATED_DATE) = CURDATE()",
            [`S${storeNo}-${dateStr}-SLO%`]
        );
        const billCount = (billCountResult[0]?.cnt || 0) + 1;
        const billCode = `S${storeNo}-${dateStr}-SLO-${termCode}-${String(billCount).padStart(3, '0')}`;

        // Create Selling transaction for the sold portion
        // This REDUCES stock by soldQty (Selling type transactions are subtracted in stock calc)
        if (soldQty > 0) {

            // Generate BILL_DATA for receipt viewing
            const billData = {
                billId: billCode,
                date: new Date().toISOString(),
                storeNo: storeNo,
                items: [{
                    id: itemId,
                    code: itemCode,
                    name: itemName,
                    price: pricePerKg,
                    quantity: soldQty,
                    total: billTotal
                }],
                subtotal: billTotal,
                discount: 0,
                total: billTotal,
                payment: {
                    method: 'Cash',
                    amount: billTotal
                },
                change: 0,
                cashier: data.CREATED_BY_NAME || 'System'
            };

            const sellingTxObj = {
                CODE: billCode,
                STORE_NO: storeNo,
                TYPE: 'Selling',
                CREATED_BY: createdBy,
                CREATED_DATE: new Date(),
                SUB_TOTAL: billTotal,
                COMMENTS: `[${opCode}] Stock Operation Sale: ${itemCode} ${itemName}`,
                BILL_DATA: JSON.stringify(billData),
                IS_ACTIVE: 1
            };

            const sellingTxRes = await pool.query('INSERT INTO store_transactions SET ?', sellingTxObj);
            const sellingTxId = sellingTxRes.insertId;

            const sellingItemObj = {
                TRANSACTION_ID: sellingTxId,
                ITEM_ID: itemId,
                PRICE: pricePerKg,
                QUANTITY: soldQty,
                TOTAL: billTotal,
                CREATED_BY: createdBy,
                IS_ACTIVE: 1
            };
            await pool.query('INSERT INTO store_transactions_items SET ?', sellingItemObj);

            console.log(`[Stock Ops] Created Selling tx#${sellingTxId} (${billCode}): ${soldQty}kg @ Rs${pricePerKg} = Rs${billTotal}`);
        }

        // Handle conversions - AdjOut from source, AdjIn to destinations
        if (totalConvertedQty > 0) {
            const convComment = `[${opCode}] Stock Converted: ${totalConvertedQty.toFixed(2)}kg of ${itemCode} ${itemName}`;
            await createAdjustment(itemId, -totalConvertedQty, 'AdjOut', convComment);

            for (const conv of convs) {
                const destQty = parseFloat(conv.DEST_QUANTITY) || 0;
                if (destQty <= 0) continue;

                const destComment = `[${opCode}] Conversion: Added ${destQty.toFixed(2)}kg of ${conv.DEST_ITEM_NAME || 'Item'} (from ${itemName})`;
                await createAdjustment(parseInt(conv.DEST_ITEM_ID), destQty, 'AdjIn', destComment);
            }
        }

        // For Op 3 (Full Clear): Calculate wastage and clear remaining stock
        if (opType === 3) {
            // Stock after selling and conversion: currentStock - soldQty - totalConvertedQty
            // For full clear, remaining must go to 0, so wastage = remaining
            const remainingAfterSaleConv = currentStock - soldQty - totalConvertedQty;

            if (remainingAfterSaleConv !== 0) {
                if (remainingAfterSaleConv > 0) {
                    // Positive remaining = wastage (needs AdjOut)
                    const wastageComment = `[${opCode}] Wastage: ${remainingAfterSaleConv.toFixed(2)}kg of ${itemCode} ${itemName} (Full Clear: ${currentStock.toFixed(2)}kg - Sold ${soldQty}kg - Converted ${totalConvertedQty}kg)`;
                    await createAdjustment(itemId, -remainingAfterSaleConv, 'AdjOut', wastageComment);
                    console.log(`[Stock Ops] Wastage: ${remainingAfterSaleConv.toFixed(2)}kg`);
                } else {
                    // Negative remaining = surplus discovered (needs AdjIn)
                    const surplusQty = Math.abs(remainingAfterSaleConv);
                    const surplusComment = `[${opCode}] Surplus: ${surplusQty.toFixed(2)}kg of ${itemCode} ${itemName} (Full Clear: stock correction)`;
                    await createAdjustment(itemId, surplusQty, 'AdjIn', surplusComment);
                    console.log(`[Stock Ops] Surplus: ${surplusQty.toFixed(2)}kg`);
                }
            }

            console.log(`[Stock Ops] Full Clear complete: ${itemCode} stock now 0`);
        } else {
            // Op 4 (Partial Clear): Stock = current - sold - converted
            const newStock = currentStock - soldQty - totalConvertedQty;
            console.log(`[Stock Ops] Partial Clear complete: ${itemCode} stock ${currentStock.toFixed(2)}kg → ${newStock.toFixed(2)}kg`);
        }

        // Calculate wastage for return  
        const remainingAfterSaleConv = currentStock - soldQty - totalConvertedQty;
        const wastageAmount = opType === 3 && remainingAfterSaleConv > 0 ? remainingAfterSaleConv : 0;
        const surplusAmount = opType === 3 && remainingAfterSaleConv < 0 ? Math.abs(remainingAfterSaleConv) : 0;

        return {
            billCode,
            itemId,
            originalStock: currentStock,
            soldQty,
            totalConvertedQty,
            wastage: wastageAmount,
            surplus: surplusAmount
        };
    }

    // ========================================================
    // TYPES 1-8: Stock Clearance/Transfer Operations
    // (Excluding 3, 4 which are handled above)
    // ========================================================
    if (!data.items || data.items.length === 0) {
        console.log('[Stock Ops] No items to process');
        return;
    }

    for (const item of data.items) {
        const itemId = item.ITEM_ID;
        const itemName = item.ITEM_NAME || 'Item';
        const itemCode = item.ITEM_CODE || '';
        const itemQty = getItemQty(item);
        const itemHasConversions = hasConversions(itemId);

        console.log(`[Stock Ops] Processing item ${itemId} (${itemName}): qty=${itemQty}, hasConv=${itemHasConversions}`);

        if (clearanceType === 'FULL') {
            // FULL CLEARANCE: Make stock = 0
            const currentStock = await getCurrentStock(itemId);

            if (currentStock === 0) {
                console.log(`[Stock Ops] Item ${itemId} already at 0, skipping clearance`);
            } else {
                const adjustment = -currentStock;
                const txType = adjustment > 0 ? 'AdjIn' : 'AdjOut';
                const comment = `Stock Cleared: ${itemCode} ${itemName} (was ${currentStock.toFixed(2)}kg → 0kg)`;
                await createAdjustment(itemId, adjustment, txType, comment);
            }

            // Process conversions for this item if any
            if (itemHasConversions) {
                const convs = getItemConversions(itemId);
                for (const conv of convs) {
                    const destQty = parseFloat(conv.DEST_QUANTITY) || 0;
                    if (destQty <= 0) continue;

                    const comment = `Conversion: Added ${destQty.toFixed(2)}kg of ${conv.DEST_ITEM_NAME || 'Item'} (from ${itemName})`;
                    await createAdjustment(parseInt(conv.DEST_ITEM_ID), destQty, 'AdjIn', comment);
                }
            }
        } else {
            // PARTIAL CLEARANCE: Remove specific quantity
            if (itemHasConversions) {
                // If has conversions, the quantity to remove = sum of destination quantities AND any main item cleared amount
                const convs = getItemConversions(itemId);
                const totalConvQty = convs.reduce((sum, c) => sum + (parseFloat(c.DEST_QUANTITY) || 0), 0);

                // Use explicitly provided quantity if it covers the conversion (as expected from new POS logic)
                // Fallback to totalConvQty if itemQty is missing or less (legacy safety)
                console.log(`[Stock Ops] Op 2 DEBUG: itemQty=${itemQty}, totalConvQty=${totalConvQty}, condition=${(itemQty && itemQty >= totalConvQty)}`);
                const qtyToRemove = (itemQty && itemQty >= totalConvQty) ? itemQty : totalConvQty;

                if (qtyToRemove > 0) {
                    const mainPortion = qtyToRemove - totalConvQty;
                    const comment = `Partial Clear: Removed ${qtyToRemove.toFixed(2)}kg ` +
                        `(${mainPortion > 0.001 ? `Main ${mainPortion.toFixed(2)}kg + ` : ''}Converted ${totalConvQty.toFixed(2)}kg) ` +
                        `from ${itemCode} ${itemName}`;

                    await createAdjustment(itemId, -qtyToRemove, 'AdjOut', comment);

                    // Add destinations
                    for (const conv of convs) {
                        const destQty = parseFloat(conv.DEST_QUANTITY) || 0;
                        if (destQty <= 0) continue;

                        const destComment = `Conversion: Added ${destQty.toFixed(2)}kg of ${conv.DEST_ITEM_NAME || 'Item'} (from ${itemName})`;
                        await createAdjustment(parseInt(conv.DEST_ITEM_ID), destQty, 'AdjIn', destComment);
                    }
                }
            } else if (itemQty && itemQty > 0) {
                // No conversions, just remove the specified quantity
                const comment = `Stock Removed: ${itemQty.toFixed(2)}kg of ${itemCode} ${itemName}`;
                await createAdjustment(itemId, -itemQty, 'AdjOut', comment);
            }
        }
    }

    // Log wastage/surplus from operation data
    if (data.WASTAGE_AMOUNT && parseFloat(data.WASTAGE_AMOUNT) > 0) {
        console.log(`[Stock Ops] Wastage: ${data.WASTAGE_AMOUNT}kg`);
    }
    if (data.SURPLUS_AMOUNT && parseFloat(data.SURPLUS_AMOUNT) > 0) {
        console.log(`[Stock Ops] Surplus: ${data.SURPLUS_AMOUNT}kg`);
    }
}

// =====================================================
// LIST OPERATIONS
// =====================================================

router.post('/api/stock-ops/list', async (req, res) => {
    try {
        const { storeNo, opType, clearanceType, startDate, endDate, lorryName, limit = 100 } = req.body;

        let query = `
            SELECT so.*, 
                CASE so.OP_TYPE
                    WHEN 1 THEN 'Full Clear (Standard)'
                    WHEN 2 THEN 'Partial Clear (Standard)'
                    WHEN 3 THEN 'Full Clear + Sales'
                    WHEN 4 THEN 'Partial Clear + Sales'
                    WHEN 5 THEN 'Transfer (Standard)'
                    WHEN 6 THEN 'Transfer + Full Clear'
                    WHEN 7 THEN 'Partial Clear + Lorry'
                    WHEN 8 THEN 'Full Clear + Lorry'
                    WHEN 9 THEN 'Item Conversion'
                    ELSE 'Unknown'
                END AS OP_TYPE_NAME
            FROM store_stock_operations so
            WHERE so.IS_ACTIVE = 1
        `;
        const params = [];

        if (storeNo) {
            query += ' AND so.STORE_NO = ?';
            params.push(storeNo);
        }
        if (opType) {
            query += ' AND so.OP_TYPE = ?';
            params.push(opType);
        }
        if (clearanceType) {
            query += ' AND so.CLEARANCE_TYPE = ?';
            params.push(clearanceType);
        }
        if (startDate) {
            query += ' AND DATE(so.CREATED_DATE) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            query += ' AND DATE(so.CREATED_DATE) <= ?';
            params.push(endDate);
        }
        if (lorryName) {
            query += ' AND so.LORRY_NAME LIKE ?';
            params.push(`%${lorryName}%`);
        }

        query += ' ORDER BY so.CREATED_DATE DESC LIMIT ?';
        params.push(parseInt(limit));

        const operations = await pool.query(query, params);

        // Fetch items for each operation
        for (let op of operations) {
            op.items = await pool.query(
                'SELECT * FROM store_stock_operation_items WHERE OP_ID = ? AND IS_ACTIVE = 1',
                [op.OP_ID]
            );
            op.conversions = await pool.query(
                'SELECT * FROM store_stock_operation_conversions WHERE OP_ID = ? AND IS_ACTIVE = 1',
                [op.OP_ID]
            );
        }

        return res.status(200).json({ success: true, operations: operations });

    } catch (error) {
        console.error('[Stock Ops] List error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// =====================================================
// GET SINGLE OPERATION BY ID
// =====================================================

router.get('/api/stock-ops/by-id/:id', async (req, res) => {
    try {
        const opId = req.params.id;

        const operations = await pool.query(
            'SELECT * FROM store_stock_operations WHERE OP_ID = ? AND IS_ACTIVE = 1',
            [opId]
        );

        if (!operations || operations.length === 0) {
            return res.status(404).json({ success: false, message: 'Operation not found' });
        }

        const op = operations[0];
        op.items = await pool.query(
            'SELECT * FROM store_stock_operation_items WHERE OP_ID = ? AND IS_ACTIVE = 1',
            [opId]
        );
        op.conversions = await pool.query(
            'SELECT * FROM store_stock_operation_conversions WHERE OP_ID = ? AND IS_ACTIVE = 1',
            [opId]
        );

        // If it's a transfer, get transfer details
        if (op.TRANSFER_ID) {
            const transfers = await pool.query(
                'SELECT * FROM store_stock_transfers WHERE TRANSFER_ID = ?',
                [op.TRANSFER_ID]
            );
            if (transfers && transfers.length > 0) {
                op.transfer = transfers[0];
                op.transfer.items = await pool.query(
                    'SELECT * FROM store_stock_transfer_items WHERE TRANSFER_ID = ? AND IS_ACTIVE = 1',
                    [op.TRANSFER_ID]
                );
            }
        }

        // If it's a lorry operation, get returns
        if ([7, 8].includes(op.OP_TYPE)) {
            op.returns = await pool.query(
                'SELECT * FROM store_lorry_returns WHERE OP_ID = ? AND IS_ACTIVE = 1 ORDER BY CREATED_DATE DESC',
                [opId]
            );
            for (let ret of op.returns) {
                ret.items = await pool.query(
                    'SELECT * FROM store_lorry_return_items WHERE RETURN_ID = ? AND IS_ACTIVE = 1',
                    [ret.RETURN_ID]
                );
            }
        }

        return res.status(200).json({ success: true, operation: op });

    } catch (error) {
        console.error('[Stock Ops] Get by ID error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// =====================================================
// TRANSFER MANAGEMENT
// =====================================================

// Get pending transfers for approval
router.get('/api/stock-ops/transfers/pending', async (req, res) => {
    try {
        const transfers = await pool.query(`
            SELECT t.*, so.OP_CODE, so.COMMENTS as OP_COMMENTS
            FROM store_stock_transfers t
            LEFT JOIN store_stock_operations so ON t.OP_ID = so.OP_ID
            WHERE t.IS_ACTIVE = 1 AND t.STATUS = 'PENDING'
            ORDER BY t.INITIATED_DATE DESC
        `);

        // Get items for each transfer
        for (let t of transfers) {
            t.items = await pool.query(
                'SELECT * FROM store_stock_transfer_items WHERE TRANSFER_ID = ? AND IS_ACTIVE = 1',
                [t.TRANSFER_ID]
            );
            // Get conversions
            t.conversions = await pool.query(
                'SELECT * FROM store_stock_operation_conversions WHERE OP_ID = ? AND IS_ACTIVE = 1',
                [t.OP_ID]
            );
        }

        return res.status(200).json({ success: true, transfers: transfers });

    } catch (error) {
        console.error('[Stock Ops] Pending transfers error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Approve transfer
router.post('/api/stock-ops/transfers/approve', async (req, res) => {
    try {
        const { TRANSFER_ID, APPROVED_BY, APPROVED_BY_NAME } = req.body;

        if (!TRANSFER_ID) {
            return res.status(400).json({ success: false, message: 'Transfer ID required' });
        }

        // Get transfer details
        const transfers = await pool.query(
            'SELECT * FROM store_stock_transfers WHERE TRANSFER_ID = ? AND STATUS = ?',
            [TRANSFER_ID, 'PENDING']
        );

        if (!transfers || transfers.length === 0) {
            return res.status(404).json({ success: false, message: 'Pending transfer not found' });
        }

        const transfer = transfers[0];

        // Update transfer status
        await pool.query(`
            UPDATE store_stock_transfers 
            SET STATUS = 'APPROVED', 
                APPROVED_BY = ?, 
                APPROVED_BY_NAME = ?,
                APPROVED_DATE = NOW()
            WHERE TRANSFER_ID = ?
        `, [APPROVED_BY, APPROVED_BY_NAME, TRANSFER_ID]);

        // Get the operation and update stock levels
        const operations = await pool.query(
            'SELECT * FROM store_stock_operations WHERE OP_ID = ?',
            [transfer.OP_ID]
        );

        if (operations && operations.length > 0) {
            const op = operations[0];
            const items = await pool.query(
                'SELECT * FROM store_stock_operation_items WHERE OP_ID = ? AND IS_ACTIVE = 1',
                [op.OP_ID]
            );

            // Now apply stock changes (deduct from Store 1, add to Store 2)
            // This integrates with your existing stock calculation system

            const createTransferTx = async (itemId, qty, type, comment, storeNo) => {
                // Generate unique transaction code
                const now = new Date();
                const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
                const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
                const txCode = `TR-${dateStr}-${randomSuffix}`; // Unique code for this transaction

                const txObj = {
                    CODE: txCode,
                    STORE_NO: storeNo,
                    TYPE: type,
                    CREATED_BY: APPROVED_BY || 1,
                    CREATED_DATE: new Date(),
                    SUB_TOTAL: 0,
                    COMMENTS: comment,
                    IS_ACTIVE: 1
                };

                const txRes = await pool.query('INSERT INTO store_transactions SET ?', txObj);
                const txId = txRes.insertId;

                const txItemObj = {
                    TRANSACTION_ID: txId,
                    ITEM_ID: itemId,
                    PRICE: 0,
                    QUANTITY: Math.abs(qty),
                    TOTAL: 0,
                    CREATED_BY: APPROVED_BY || 1,
                    IS_ACTIVE: 1
                };
                await pool.query('INSERT INTO store_transactions_items SET ?', txItemObj);
                return txId;
            };

            for (const item of items) {
                const qty = parseFloat(item.WEIGHED_QUANTITY) || parseFloat(item.ORIGINAL_QUANTITY) || 0;

                if (qty > 0) {
                    // 1. Deduct from Store 1 (AdjOut)
                    const outComment = `[TR-${TRANSFER_ID}] Transfer Out to Store 2: ${item.ITEM_CODE || ''} ${item.ITEM_NAME || ''}`;
                    await createTransferTx(item.ITEM_ID, -qty, 'AdjOut', outComment, 1);

                    // 2. Add to Store 2 (AdjIn)
                    const inComment = `[TR-${TRANSFER_ID}] Transfer In from Store 1: ${item.ITEM_CODE || ''} ${item.ITEM_NAME || ''}`;
                    await createTransferTx(item.ITEM_ID, qty, 'AdjIn', inComment, 2);
                }
            }
        }

        console.log(`[Stock Ops] Transfer ${TRANSFER_ID} approved`);
        return res.status(200).json({ success: true, message: 'Transfer approved successfully' });

    } catch (error) {
        console.error('[Stock Ops] Approve transfer error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Reject transfer
router.post('/api/stock-ops/transfers/reject', async (req, res) => {
    try {
        const { TRANSFER_ID, APPROVED_BY, APPROVED_BY_NAME, REJECT_REASON } = req.body;

        if (!TRANSFER_ID) {
            return res.status(400).json({ success: false, message: 'Transfer ID required' });
        }

        await pool.query(`
            UPDATE store_stock_transfers 
            SET STATUS = 'REJECTED', 
                APPROVED_BY = ?, 
                APPROVED_BY_NAME = ?,
                APPROVED_DATE = NOW(),
                REJECT_REASON = ?
            WHERE TRANSFER_ID = ? AND STATUS = 'PENDING'
        `, [APPROVED_BY, APPROVED_BY_NAME, REJECT_REASON || '', TRANSFER_ID]);

        console.log(`[Stock Ops] Transfer ${TRANSFER_ID} rejected`);
        return res.status(200).json({ success: true, message: 'Transfer rejected' });

    } catch (error) {
        console.error('[Stock Ops] Reject transfer error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// =====================================================
// LORRY RETURN MANAGEMENT
// =====================================================

// Get lorry clearances awaiting returns
router.get('/api/stock-ops/lorry/pending-returns', async (req, res) => {
    try {
        const operations = await pool.query(`
            SELECT so.*,
                (SELECT SUM(CLEARED_QUANTITY) FROM store_stock_operation_items WHERE OP_ID = so.OP_ID AND IS_ACTIVE = 1) as TOTAL_CLEARED,
                (SELECT COALESCE(SUM(RETURN_QUANTITY), 0) FROM store_lorry_returns WHERE OP_ID = so.OP_ID AND IS_ACTIVE = 1) as TOTAL_RETURNED,
                DATEDIFF(NOW(), so.CREATED_DATE) as DAYS_SINCE_CLEARANCE
            FROM store_stock_operations so
            WHERE so.IS_ACTIVE = 1 
                AND so.OP_TYPE IN (7, 8)
                AND (so.RETURN_STATUS IS NULL OR so.RETURN_STATUS = 'PENDING' OR so.RETURN_STATUS = 'PARTIAL_RETURN')
            ORDER BY so.CREATED_DATE DESC
        `);

        // Get items for each operation
        for (let op of operations) {
            op.items = await pool.query(
                'SELECT * FROM store_stock_operation_items WHERE OP_ID = ? AND IS_ACTIVE = 1',
                [op.OP_ID]
            );
            op.returns = await pool.query(
                'SELECT * FROM store_lorry_returns WHERE OP_ID = ? AND IS_ACTIVE = 1',
                [op.OP_ID]
            );
        }

        return res.status(200).json({ success: true, operations: operations });

    } catch (error) {
        console.error('[Stock Ops] Pending returns error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Add lorry return
router.post('/api/stock-ops/lorry/returns', async (req, res) => {
    try {
        const data = req.body;

        if (!data.OP_ID) {
            return res.status(400).json({ success: false, message: 'Operation ID required' });
        }

        // Get original operation
        const operations = await pool.query(
            'SELECT * FROM store_stock_operations WHERE OP_ID = ? AND OP_TYPE IN (7, 8) AND IS_ACTIVE = 1',
            [data.OP_ID]
        );

        if (!operations || operations.length === 0) {
            return res.status(404).json({ success: false, message: 'Lorry operation not found' });
        }

        const op = operations[0];

        // Calculate original cleared quantity
        const clearedResult = await pool.query(
            'SELECT SUM(CLEARED_QUANTITY) as total FROM store_stock_operation_items WHERE OP_ID = ? AND IS_ACTIVE = 1',
            [data.OP_ID]
        );
        const originalCleared = clearedResult[0]?.total || 0;

        // Get previous returns
        const prevReturns = await pool.query(
            'SELECT SUM(RETURN_QUANTITY) as total FROM store_lorry_returns WHERE OP_ID = ? AND IS_ACTIVE = 1',
            [data.OP_ID]
        );
        const previousReturned = prevReturns[0]?.total || 0;

        const returnQty = parseFloat(data.RETURN_QUANTITY) || 0;
        const wastageFromReturn = parseFloat(data.WASTAGE_FROM_RETURN) || 0;
        const netDelivered = originalCleared - previousReturned - returnQty - wastageFromReturn;

        // Insert return record
        const returnRecord = {
            OP_ID: data.OP_ID,
            LORRY_NAME: op.LORRY_NAME,
            ORIGINAL_CLEARED: originalCleared,
            RETURN_QUANTITY: returnQty,
            WASTAGE_FROM_RETURN: wastageFromReturn,
            NET_DELIVERED: netDelivered > 0 ? netDelivered : originalCleared - previousReturned - returnQty,
            NOTES: data.NOTES || null,
            PHOTO_URL: data.PHOTO_URL || null,
            HAS_CONVERSION: data.HAS_CONVERSION ? 1 : 0,
            CREATED_BY: data.CREATED_BY,
            CREATED_BY_NAME: data.CREATED_BY_NAME || null,
            IS_ACTIVE: 1
        };

        const insertResult = await pool.query('INSERT INTO store_lorry_returns SET ?', returnRecord);
        const returnId = insertResult.insertId;

        // Insert return items if provided
        if (data.items && data.items.length > 0) {
            for (const item of data.items) {
                const returnItemRecord = {
                    RETURN_ID: returnId,
                    ITEM_ID: item.ITEM_ID,
                    ITEM_CODE: item.ITEM_CODE || null,
                    ITEM_NAME: item.ITEM_NAME || null,
                    RETURN_QUANTITY: parseFloat(item.RETURN_QUANTITY) || 0,
                    WASTAGE_QUANTITY: parseFloat(item.WASTAGE_QUANTITY) || 0,
                    HAS_CONVERSION: item.HAS_CONVERSION ? 1 : 0,
                    IS_ACTIVE: 1
                };
                await pool.query('INSERT INTO store_lorry_return_items SET ?', returnItemRecord);
            }
        }

        // Handle conversions on returns
        if (data.conversions && data.conversions.length > 0) {
            for (const conv of data.conversions) {
                const convRecord = {
                    OP_ID: data.OP_ID,
                    SOURCE_ITEM_ID: conv.SOURCE_ITEM_ID,
                    SOURCE_ITEM_CODE: conv.SOURCE_ITEM_CODE || null,
                    SOURCE_ITEM_NAME: conv.SOURCE_ITEM_NAME || null,
                    SOURCE_QUANTITY: parseFloat(conv.SOURCE_QUANTITY) || 0,
                    DEST_ITEM_ID: conv.DEST_ITEM_ID,
                    DEST_ITEM_CODE: conv.DEST_ITEM_CODE || null,
                    DEST_ITEM_NAME: conv.DEST_ITEM_NAME || null,
                    DEST_QUANTITY: parseFloat(conv.DEST_QUANTITY) || 0,
                    IS_ACTIVE: 1
                };
                await pool.query('INSERT INTO store_stock_operation_conversions SET ?', convRecord);
            }
        }

        // Update operation return status
        const totalReturned = previousReturned + returnQty;
        let newStatus = 'PARTIAL_RETURN';
        if (totalReturned >= originalCleared) {
            newStatus = 'FULLY_RETURNED';
        }

        await pool.query(
            'UPDATE store_stock_operations SET RETURN_STATUS = ? WHERE OP_ID = ?',
            [newStatus, data.OP_ID]
        );

        console.log(`[Stock Ops] Return added to operation ${data.OP_ID}`);
        return res.status(200).json({
            success: true,
            message: 'Return recorded successfully',
            returnId: returnId,
            returnStatus: newStatus,
            netDelivered: netDelivered
        });

    } catch (error) {
        console.error('[Stock Ops] Add return error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// =====================================================
// DEACTIVATE OPERATION
// =====================================================

router.post('/api/stock-ops/deactivate', async (req, res) => {
    try {
        const { OP_ID } = req.body;

        if (!OP_ID) {
            return res.status(400).json({ success: false, message: 'Operation ID required' });
        }

        // Deactivate operation and related records
        await pool.query('UPDATE store_stock_operations SET IS_ACTIVE = 0 WHERE OP_ID = ?', [OP_ID]);
        await pool.query('UPDATE store_stock_operation_items SET IS_ACTIVE = 0 WHERE OP_ID = ?', [OP_ID]);
        await pool.query('UPDATE store_stock_operation_conversions SET IS_ACTIVE = 0 WHERE OP_ID = ?', [OP_ID]);

        // If there's a transfer, deactivate it too
        const ops = await pool.query('SELECT TRANSFER_ID FROM store_stock_operations WHERE OP_ID = ?', [OP_ID]);
        if (ops && ops.length > 0 && ops[0].TRANSFER_ID) {
            await pool.query('UPDATE store_stock_transfers SET IS_ACTIVE = 0 WHERE TRANSFER_ID = ?', [ops[0].TRANSFER_ID]);
            await pool.query('UPDATE store_stock_transfer_items SET IS_ACTIVE = 0 WHERE TRANSFER_ID = ?', [ops[0].TRANSFER_ID]);
        }

        console.log(`[Stock Ops] Operation ${OP_ID} deactivated`);
        return res.status(200).json({ success: true, message: 'Operation deactivated' });

    } catch (error) {
        console.error('[Stock Ops] Deactivate error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// =====================================================
// REPORTS
// =====================================================

// Get stock operations summary report
router.post('/api/stock-ops/reports/summary', async (req, res) => {
    try {
        const { startDate, endDate, storeNo } = req.body;

        let whereClause = 'WHERE IS_ACTIVE = 1';
        const params = [];

        if (startDate) {
            whereClause += ' AND DATE(CREATED_DATE) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            whereClause += ' AND DATE(CREATED_DATE) <= ?';
            params.push(endDate);
        }
        if (storeNo) {
            whereClause += ' AND STORE_NO = ?';
            params.push(storeNo);
        }

        const summary = await pool.query(`
            SELECT 
                OP_TYPE,
                CLEARANCE_TYPE,
                COUNT(*) as OPERATION_COUNT,
                SUM(WASTAGE_AMOUNT) as TOTAL_WASTAGE,
                SUM(SURPLUS_AMOUNT) as TOTAL_SURPLUS,
                SUM(BILL_AMOUNT) as TOTAL_SALES
            FROM store_stock_operations
            ${whereClause}
            GROUP BY OP_TYPE, CLEARANCE_TYPE
            ORDER BY OP_TYPE
        `, params);

        return res.status(200).json({ success: true, summary: summary });

    } catch (error) {
        console.error('[Stock Ops] Report error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// =====================================================
// STOCK RETURN - GET RETURNABLE OPERATIONS
// Returns Op 3 (Full+Bill) and Op 4 (Half+Bill) that can have returns
// =====================================================

router.post('/api/stock-ops/get-returnable', async (req, res) => {
    console.log('[Stock Ops] Get returnable operations request', req.body);

    try {
        const { storeNo, limit = 50, itemId, search } = req.body;

        // Valid Ops: 1 (Full Clear), 2 (Partial), 3 (Full+Sale), 4 (Partial+Sale)
        // We trust the user to know how much to return. No strict "remaining" calc.
        let query = `
            SELECT 
                so.OP_ID,
                so.OP_CODE,
                so.OP_TYPE,
                so.STORE_NO,
                so.CREATED_DATE,
                so.CREATED_BY_NAME,
                so.BILL_CODE,
                so.BILL_AMOUNT,
                so.CUSTOMER_NAME,
                so.TRIP_ID,
                so.WASTAGE_AMOUNT,
                so.SURPLUS_AMOUNT,
                CASE so.OP_TYPE
                    WHEN 1 THEN 'Full Clearance'
                    WHEN 2 THEN 'Partial Clearance'
                    WHEN 3 THEN 'Full Clear + Sales'
                    WHEN 4 THEN 'Partial Clear + Sales'
                END AS OP_TYPE_NAME,
                soi.ITEM_ID,
                soi.ITEM_CODE,
                soi.ITEM_NAME,
                soi.SOLD_QUANTITY,
                soi.CLEARED_QUANTITY,
                soi.ORIGINAL_STOCK
            FROM store_stock_operations so
            JOIN store_stock_operation_items soi ON so.OP_ID = soi.OP_ID AND soi.IS_ACTIVE = 1
            WHERE so.IS_ACTIVE = 1
              AND so.OP_TYPE IN (1, 2, 3, 4)
        `;
        const params = [];

        if (itemId) {
            query += ' AND soi.ITEM_ID = ?';
            params.push(itemId);
        }

        if (search && search.trim()) {
            query += ` AND (
                so.OP_CODE LIKE ? 
                OR so.BILL_CODE LIKE ? 
                OR soi.ITEM_NAME LIKE ?
                OR soi.ITEM_CODE LIKE ?
                OR so.TRIP_ID LIKE ?
            )`;
            const searchPattern = `%${search.trim()}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        query += ' ORDER BY so.CREATED_DATE DESC LIMIT ?';
        params.push(parseInt(limit));

        console.log('[Stock Ops] returnable Query:', query);
        const operations = await pool.query(query, params);

        // Enhance with BILL_CODE fallback if needed
        for (let op of operations) {
            if (!op.BILL_CODE && op.TXN_BILL_CODE) {
                op.BILL_CODE = op.TXN_BILL_CODE;
            }
        }

        console.log('[Stock Ops] Found returnable ops:', operations.length);

        return res.status(200).json({
            success: true,
            operations: operations
        });

    } catch (error) {
        console.error('[Stock Ops] Get returnable error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
});

// =====================================================
// STOCK RETURN - CREATE RETURN (OP 11)
// =====================================================

router.post('/api/stock-ops/create-return', async (req, res) => {
    console.log('[Stock Ops] Create stock return request');

    try {
        const data = req.body;
        const {
            REFERENCE_OP_ID,
            STORE_NO,
            RETURN_QUANTITY,
            ITEM_ID,
            ITEM_CODE,
            ITEM_NAME,
            conversions,
            COMMENTS,
            CREATED_BY,
            CREATED_BY_NAME,
            TERMINAL_CODE
        } = data;

        if (!REFERENCE_OP_ID) {
            return res.status(400).json({ success: false, message: 'Reference operation ID required' });
        }

        console.log(`[Stock Ops] Return request for REF_OP_ID=${REFERENCE_OP_ID}, ITEM_CODE=${ITEM_CODE}, QTY=${RETURN_QUANTITY}`);

        // Validate reference operation exists and is type 1, 2, 3 or 4
        let refOpResult = await pool.query(
            'SELECT * FROM store_stock_operations WHERE OP_ID = ? AND OP_TYPE IN (1, 2, 3, 4) AND IS_ACTIVE = 1',
            [REFERENCE_OP_ID]
        );
        let validRefOpId = REFERENCE_OP_ID;

        // Smart Retry: If ID lookup failed, try looking up by OP_CODE
        // This handles cases where client sends a local ID (e.g. S1-OP-...) or explicitly sends OP_CODE
        if (refOpResult.length === 0) {
            const lookupCode = data.REFERENCE_OP_CODE || (String(REFERENCE_OP_ID).startsWith('S') ? String(REFERENCE_OP_ID) : null);

            if (lookupCode) {
                console.log(`[Stock Ops] Lookup by ID failed, trying OP_CODE=${lookupCode}`);
                const codeResult = await pool.query(
                    'SELECT * FROM store_stock_operations WHERE OP_CODE = ? AND OP_TYPE IN (1, 2, 3, 4) AND IS_ACTIVE = 1 LIMIT 1',
                    [lookupCode]
                );

                if (codeResult.length > 0) {
                    refOpResult = codeResult;
                    validRefOpId = codeResult[0].OP_ID;
                    console.log(`[Stock Ops] Recovered reference Op: ${lookupCode} -> ID ${validRefOpId}`);
                }
            }
        }

        if (refOpResult.length === 0) {
            // Smart retry: If REFERENCE_OP_ID is an operation code (S2-OP-...), the operation might not be synced yet
            // Only mark as permanent if it's a numeric ID (truly doesn't exist in DB)
            console.warn(`[Stock Ops] Invalid reference operation: OP_ID=${REFERENCE_OP_ID} not found (or inactive/wrong type)`);
            return res.status(400).json({
                success: false,
                message: `Invalid reference operation (OP_ID=${REFERENCE_OP_ID} not found in DB)`,
                permanent: !isNaN(REFERENCE_OP_ID) && Number.isInteger(Number(REFERENCE_OP_ID))  // Only permanent if numeric ID
            });
        }

        const refOp = refOpResult[0];
        const returnQty = parseFloat(RETURN_QUANTITY) || 0;

        // Check if return quantity is valid
        if (returnQty <= 0) {
            return res.status(400).json({ success: false, message: 'Return quantity must be greater than 0' });
        }

        // Removed strict max returnable check per user request.
        // We trust the user to enter a valid return amount.

        // Generate operation code
        const storeNo = STORE_NO || refOp.STORE_NO || 1;
        const termCode = (TERMINAL_CODE || 'POS').slice(0, 5).toUpperCase();
        const opCode = await generateOpCode(storeNo, termCode);

        // Calculate conversion total if provided
        const hasConversion = conversions && conversions.length > 0;
        const totalConversionQty = hasConversion
            ? conversions.reduce((sum, c) => sum + (parseFloat(c.DEST_QUANTITY) || 0), 0)
            : returnQty;

        // Create the return operation record
        const opRecord = {
            OP_CODE: opCode,
            OP_TYPE: 11, // Stock Return
            STORE_NO: storeNo,
            CLEARANCE_TYPE: 'RETURN',
            REFERENCE_OP_ID: validRefOpId, // Use the resolved numeric ID
            RETURN_TYPE: hasConversion ? 'CONVERSION' : 'DIRECT',
            COMMENTS: COMMENTS || `Return from ${refOp.OP_CODE}`,
            DATE: new Date().toISOString(),
            CREATED_BY: CREATED_BY,
            CREATED_BY_NAME: CREATED_BY_NAME || null,
            IS_ACTIVE: 1
        };

        const insertResult = await pool.query('INSERT INTO store_stock_operations SET ?', opRecord);
        const opId = insertResult.insertId;

        // Get current stock for recording using Unified Calculator
        const currentStock = await calculateCurrentStock(pool, ITEM_ID || refItemResult[0]?.ITEM_ID, storeNo);


        const itemId = ITEM_ID || refItemResult[0]?.ITEM_ID;
        const itemCode = ITEM_CODE || refItemResult[0]?.ITEM_CODE;
        const itemName = ITEM_NAME || refItemResult[0]?.ITEM_NAME;

        // Insert operation item
        const itemRecord = {
            OP_ID: opId,
            ITEM_ID: itemId,
            ITEM_CODE: itemCode,
            ITEM_NAME: itemName,
            ORIGINAL_STOCK: currentStock,
            CLEARED_QUANTITY: returnQty,
            REMAINING_STOCK: currentStock + (hasConversion ? 0 : returnQty),
            HAS_CONVERSION: hasConversion ? 1 : 0,
            IS_ACTIVE: 1
        };
        await pool.query('INSERT INTO store_stock_operation_items SET ?', itemRecord);

        // Create stock adjustment transactions
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = String(now.getFullYear()).slice(-2);
        const dateStr = `${day}${month}${year}`;
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();

        if (hasConversion) {
            // Add stock for each conversion destination
            for (const conv of conversions) {
                const destQty = parseFloat(conv.DEST_QUANTITY) || 0;
                if (destQty <= 0) continue;

                const txCode = `RETURN-${dateStr}-${randomSuffix}-${Math.random().toString(36).substring(2, 4).toUpperCase()}`;
                const txObj = {
                    CODE: txCode,
                    STORE_NO: storeNo,
                    TYPE: 'AdjIn',
                    CREATED_BY: CREATED_BY,
                    CREATED_DATE: new Date(),
                    SUB_TOTAL: 0,
                    COMMENTS: `[${opCode}] Return: Added ${destQty.toFixed(2)}kg of ${conv.DEST_ITEM_NAME || 'Item'} (from ${refOp.OP_CODE})`,
                    IS_ACTIVE: 1
                };

                const txRes = await pool.query('INSERT INTO store_transactions SET ?', txObj);
                const txId = txRes.insertId;

                const txItemObj = {
                    TRANSACTION_ID: txId,
                    ITEM_ID: conv.DEST_ITEM_ID,
                    PRICE: 0,
                    QUANTITY: destQty,
                    TOTAL: 0,
                    CREATED_BY: CREATED_BY,
                    IS_ACTIVE: 1
                };
                await pool.query('INSERT INTO store_transactions_items SET ?', txItemObj);

                // Insert conversion record
                const convRecord = {
                    OP_ID: opId,
                    SOURCE_ITEM_ID: itemId,
                    SOURCE_ITEM_CODE: itemCode,
                    SOURCE_ITEM_NAME: itemName,
                    SOURCE_QUANTITY: returnQty,
                    DEST_ITEM_ID: conv.DEST_ITEM_ID,
                    DEST_ITEM_CODE: conv.DEST_ITEM_CODE || null,
                    DEST_ITEM_NAME: conv.DEST_ITEM_NAME || null,
                    DEST_QUANTITY: destQty,
                    IS_ACTIVE: 1
                };
                await pool.query('INSERT INTO store_stock_operation_conversions SET ?', convRecord);

                console.log(`[Stock Ops] Return conversion: Added ${destQty}kg of ${conv.DEST_ITEM_NAME} to Store ${storeNo}`);
            }
        } else {
            // Direct return - add stock for the original item
            const txCode = `RETURN-${dateStr}-${randomSuffix}`;
            const txObj = {
                CODE: txCode,
                STORE_NO: storeNo,
                TYPE: 'AdjIn',
                CREATED_BY: CREATED_BY,
                CREATED_DATE: new Date(),
                SUB_TOTAL: 0,
                COMMENTS: `[${opCode}] Return: Added ${returnQty.toFixed(2)}kg of ${itemName} (from ${refOp.OP_CODE})`,
                IS_ACTIVE: 1
            };

            const txRes = await pool.query('INSERT INTO store_transactions SET ?', txObj);
            const txId = txRes.insertId;

            const txItemObj = {
                TRANSACTION_ID: txId,
                ITEM_ID: itemId,
                PRICE: 0,
                QUANTITY: returnQty,
                TOTAL: 0,
                CREATED_BY: CREATED_BY,
                IS_ACTIVE: 1
            };
            await pool.query('INSERT INTO store_transactions_items SET ?', txItemObj);

            console.log(`[Stock Ops] Direct return: Added ${returnQty}kg of ${itemName} to Store ${storeNo}`);
        }

        console.log(`[Stock Ops] Created return operation ${opCode} (ref: ${refOp.OP_CODE})`);

        return res.status(200).json({
            success: true,
            message: 'Stock return created successfully',
            opId: opId,
            opCode: opCode,
            returnedQuantity: returnQty
        });

    } catch (error) {
        console.error('[Stock Ops] Create return error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
});

// =====================================================
// GET STOCK RETURNS (For Store 1 View)
// =====================================================
router.get('/api/stock-ops/returns', async (req, res) => {
    try {
        const { limit = 50, storeNo = 2 } = req.query; // Default to Store 2 returns

        const query = `
            SELECT 
                so.*,
                soi.ITEM_NAME, soi.ITEM_CODE, soi.CLEARED_QUANTITY as RETURN_QTY,
                soi.HAS_CONVERSION
            FROM store_stock_operations so
            JOIN store_stock_operation_items soi ON so.OP_ID = soi.OP_ID AND soi.IS_ACTIVE = 1
            WHERE so.IS_ACTIVE = 1 
              AND so.OP_TYPE = 11
              AND so.STORE_NO = ?
            ORDER BY so.CREATED_DATE DESC
            LIMIT ?
        `;

        const operations = await pool.query(query, [parseInt(storeNo), parseInt(limit)]);

        // Fetch conversions for conversion returns
        for (let op of operations) {
            if (op.RETURN_TYPE === 'CONVERSION') {
                const convs = await pool.query(`
                    SELECT * FROM store_stock_operation_conversions 
                    WHERE OP_ID = ? AND IS_ACTIVE = 1
                `, [op.OP_ID]);
                op.conversions = convs;
            }
        }

        res.json({ success: true, returns: operations });
    } catch (error) {
        console.error('[Stock Ops] Get returns error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
