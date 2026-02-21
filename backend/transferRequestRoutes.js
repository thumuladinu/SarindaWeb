const express = require('express');
const router = express.Router();
const pool = require('./index');
const { calculateCurrentStock } = require("./stockCalculator");

// Helper to ensure pool is available and query is promisified if needed
// (Relies on other routes having promisified it, or we handle it)
const query = (sql, params) => {
    return new Promise((resolve, reject) => {
        pool.query(sql, params, (err, results) => {
            if (err) reject(err);
            else resolve(results);
        });
    });
};

// Helper: Approve Transfer Logic (Reused by /approve and /request with auto-approve)
const approveTransfer = async (transferId, approvedBy, approvedByName, clearanceType) => {
    // Get request details
    const [request] = await query(
        `SELECT * FROM store_stock_transfers WHERE id = ?`, [transferId]
    );

    if (!request) throw new Error('Request not found');
    if (request.status !== 'PENDING') throw new Error('Request already processed');

    // LOGIC: Create Stock Transactions
    // 1. Store 1: Remove Stock (Transfer Out)
    // 2. Store 2: Add Stock (Transfer In)

    const commonId = `TRA-${Date.now()}`;
    const mainQty = parseFloat(request.main_item_qty) || 0;

    // --- STORE 1 (Source) Operations ---
    // If FULL clearance, we remove everything. If PARTIAL, we remove exactly requested.
    // For simplicity, we create a 'TransferOut' transaction.
    // Similar to Op 5 logic but triggered by approval.

    // Get conversions
    const conversions = await query(
        `SELECT * FROM store_stock_transfer_conversions WHERE transfer_id = ?`, [transferId]
    );
    const totalConverted = conversions.reduce((sum, c) => sum + (parseFloat(c.dest_qty) || 0), 0);
    const remainingMain = mainQty - totalConverted; // Assuming simple subtraction if partial

    // Helper to get current stock from ledger (Dynamic Calculation)
    const getCurrentStock = async (itemId, store) => {
        try {
            // Use Unified Stock Calculator
            const stock = await calculateCurrentStock(pool, itemId, store);
            console.log(`[getCurrentStock] Item ${itemId}, Store ${store}: Calculated stock = ${stock}`);
            return stock;
        } catch (error) {
            console.error('[getCurrentStock] Error:', error);
            return 0;
        }
    };


    // Fetch Real-time Stock
    const currentStockS1 = await getCurrentStock(request.main_item_id, 1);

    // Determine Quantities and OpType

    let removeQtyS1 = 0;
    let wastage = 0;
    let surplus = 0;
    let opType = 5; // Standard Transfer

    if (clearanceType === 'FULL') {
        opType = 6; // Transfer + Full Clear
        removeQtyS1 = currentStockS1;
        console.log(`[ApproveTransfer] FULL Clear. Current Stock: ${currentStockS1}, Removing: ${removeQtyS1}`);

        // Calculate Wastage/Surplus
        const totalOutput = request.has_conversion && conversions.length > 0
            ? conversions.reduce((sum, c) => sum + (parseFloat(c.dest_qty) || 0), 0) // Sum of converted outputs
            : mainQty; // Or just the main item moving

        const diff = currentStockS1 - totalOutput;
        if (diff > 0) wastage = diff;     // Had more than needed -> Loss/Wastage
        else if (diff < 0) surplus = Math.abs(diff); // Had less than output -> Found extra/Surplus
    } else {
        // Partial
        opType = 5;
        // If conversion involved, we remove the total converted amount from source
        // If just main item, we remove the requested main qty
        if (request.has_conversion && conversions.length > 0) {
            removeQtyS1 = conversions.reduce((sum, c) => sum + (parseFloat(c.dest_qty) || 0), 0);
        } else {
            removeQtyS1 = mainQty;
        }
    }

    // Insert Master Op for Store 1
    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();

    // Standard OpCode format: S{STORE}-{YYMMDD}-CLR-{TYPE}-{RANDOM}
    // Matches regex: [S%-%-CLR-%
    const opCode = `S1-${dateStr}-CLR-TRA-${randomSuffix}`;
    const s1OpLocalId = `S1-AUTO-OP-TRA-${Date.now()}`;

    const opResult = await query(
        `INSERT INTO store_stock_operations
        (LOCAL_ID, OP_TYPE, STORE_NO, CREATED_BY, CREATED_BY_NAME, COMMENTS, OP_CODE, CLEARANCE_TYPE, WASTAGE_AMOUNT, SURPLUS_AMOUNT, SYNCED)
         VALUES(?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [s1OpLocalId, opType, approvedBy, approvedByName, (request.comments ? request.comments + '\n' : '') + `Approved Request ${request.local_id}`, opCode, clearanceType, wastage, surplus]
    );
    const opId = opResult.insertId;

    // Insert Operation Items for Store 1 (source)
    await query(
        `INSERT INTO store_stock_operation_items
        (OP_ID, ITEM_ID, ITEM_CODE, ITEM_NAME, ORIGINAL_STOCK, CLEARED_QUANTITY, REMAINING_STOCK, IS_ACTIVE, STORE_NO)
        VALUES(?, ?, ?, ?, ?, ?, ?, 1, 1)`,
        [opId, request.main_item_id, request.main_item_code, request.main_item_name, currentStockS1, removeQtyS1, (clearanceType === 'FULL' ? 0 : currentStockS1 - removeQtyS1)]
    );

    // Insert Operation Items for Store 2 (destination) - Track where stock is added
    if (request.has_conversion && conversions.length > 0) {
        for (const c of conversions) {
            const destStockBefore = await getCurrentStock(c.dest_item_id, 2);
            const destQty = parseFloat(c.dest_qty) || 0;
            await query(
                `INSERT INTO store_stock_operation_items
        (OP_ID, ITEM_ID, ITEM_CODE, ITEM_NAME, ORIGINAL_STOCK, CLEARED_QUANTITY, REMAINING_STOCK, IS_ACTIVE, STORE_NO)
                VALUES(?, ?, ?, ?, ?, ?, ?, 1, 2)`,
                [opId, c.dest_item_id, c.dest_item_code, c.dest_item_name, destStockBefore, -destQty, destStockBefore + destQty]
            );
        }

        // Insert conversions into operation_conversions for history breakdown
        for (const c of conversions) {
            await query(
                `INSERT INTO store_stock_operation_conversions
        (OP_ID, SOURCE_ITEM_ID, SOURCE_ITEM_CODE, DEST_ITEM_ID, DEST_ITEM_CODE, DEST_ITEM_NAME, DEST_QUANTITY, IS_ACTIVE)
                VALUES(?, ?, ?, ?, ?, ?, ?, 1)`,
                [opId, request.main_item_id, request.main_item_code, c.dest_item_id, c.dest_item_code, c.dest_item_name, c.dest_qty]
            );
        }
    } else {
        // No conversion - main item goes to Store 2
        const destStockBefore = await getCurrentStock(request.main_item_id, 2);
        await query(
            `INSERT INTO store_stock_operation_items
        (OP_ID, ITEM_ID, ITEM_CODE, ITEM_NAME, ORIGINAL_STOCK, CLEARED_QUANTITY, REMAINING_STOCK, IS_ACTIVE, STORE_NO)
            VALUES(?, ?, ?, ?, ?, ?, ?, 1, 2)`,
            [opId, request.main_item_id, request.main_item_code, request.main_item_name, destStockBefore, -mainQty, destStockBefore + mainQty]
        );
    }

    // --- STOCK UPDATES STORE 1 ---

    // Helper to create transaction and item
    const createTransaction = async (storeNo, type, itemId, qty, refId, comments) => {
        const result = await query(
            `INSERT INTO store_transactions
        (DATE, STORE_NO, TYPE, REFERENCE_TRANSACTION, COMMENTS, CREATED_BY, IS_ACTIVE, CODE)
            VALUES(NOW(), ?, ?, ?, ?, ?, 1, ?)`,
            [storeNo, type, refId, comments, approvedBy, `TX - ${Date.now()} - ${Math.random().toString(36).substr(2, 4)}`]
        );
        const transId = result.insertId;

        await query(
            `INSERT INTO store_transactions_items
        (TRANSACTION_ID, ITEM_ID, QUANTITY, TOTAL, IS_ACTIVE, CREATED_BY)
            VALUES(?, ?, ?, 0, 1, ?)`,
            [transId, itemId, qty, approvedBy]
        );
    };

    // Transaction 1: Store 1 Transfer Out (Active Item)
    // Comment format: [OP_CODE] Description
    await createTransaction(1, 'AdjOut', request.main_item_id, removeQtyS1, opId, `[${opCode}][TransferOut] Fulfilled Request ${request.local_id}`);

    // --- STOCK UPDATES STORE 2 ---
    // Transaction 2: Store 2 Transfer In
    if (request.has_conversion && conversions.length > 0) {
        for (const c of conversions) {
            // Using 'AdjIn'
            await createTransaction(2, 'AdjIn', c.dest_item_id, c.dest_qty, opId, `[${opCode}][TransferIn] From Req ${request.local_id}(Conv)`);
        }
    } else {
        // No conversion, just move main item
        await createTransaction(2, 'AdjIn', request.main_item_id, mainQty, opId, `[${opCode}][TransferIn] From Req ${request.local_id}`);
    }

    // --- UPDATE REQUEST STATUS ---
    await query(
        `UPDATE store_stock_transfers 
            SET status = 'APPROVED', approval_date = NOW(), approved_by = ?, approved_by_name = ?, clearance_type = ?
        WHERE id = ? `,
        [approvedBy, approvedByName, clearanceType, transferId]
    );

    return { success: true, message: 'Request approved and processed' };
};

// Create Transfer Request (Store 2 -> Store 1)
router.post('/request', async (req, res) => {
    try {
        const {
            mainItemId, mainItemCode, mainItemName, mainItemQty,
            hasConversion, storeFrom = 1, storeTo = 2,
            createdBy, createdByName, comments,
            conversions,
            // Auto-Approve Flags (for offline sync)
            autoApprove, approvedBy, approvedByName, clearanceType
        } = req.body;

        const localId = `S2 - REQ - ${Date.now()}`;

        // Insert Request
        const result = await query(
            `INSERT INTO store_stock_transfers
        (local_id, main_item_id, main_item_code, main_item_name, main_item_qty, has_conversion,
            store_from_id, store_to_id, created_by, created_by_name, comments, status)
             VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
            [localId, mainItemId, mainItemCode, mainItemName, (mainItemQty === 'FULL' ? 0 : mainItemQty), hasConversion,
                storeFrom, storeTo, createdBy || null, createdByName || null, comments]
        );

        const transferId = result.insertId;

        // Insert Conversions
        if (hasConversion && conversions && conversions.length > 0) {
            for (const c of conversions) {
                await query(
                    `INSERT INTO store_stock_transfer_conversions
        (transfer_id, source_item_id, dest_item_id, dest_item_code, dest_item_name, dest_qty)
                    VALUES(?, ?, ?, ?, ?, ?)`,
                    [transferId, mainItemId, c.DEST_ITEM_ID, c.DEST_ITEM_CODE, c.DEST_ITEM_NAME, c.DEST_QUANTITY]
                );
            }
        }

        // AUTO APPROVE Logic (if requested)
        if (autoApprove) {
            try {
                await approveTransfer(transferId, approvedBy || createdBy, approvedByName || createdByName, clearanceType || 'FULL');
                res.json({ success: true, message: 'Request submitted and auto-approved', transferId, localId, autoApproved: true });
                return;
            } catch (approveError) {
                console.error('Auto-approve failed, keeping request as PENDING:', approveError);
                // Return success for request creation, but warn about approval failure?
                // Or just return normal success so it stays PENDING
            }
        }

        const { createNotification } = require('./notificationService');
        await createNotification(
            'TRANSFER_REQUEST',
            transferId,
            'New Transfer Request',
            `${createdByName || 'Someone'} requested ${mainItemQty} kg of ${mainItemName}`
        );

        res.json({ success: true, message: 'Request submitted', transferId, localId });
    } catch (error) {
        console.error('Request error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Pending Requests (For Store 1 Notification)
router.get('/pending', async (req, res) => {
    try {
        const requests = await query(
            `SELECT * FROM store_stock_transfers WHERE status = 'PENDING' ORDER BY request_date DESC LIMIT 25`
        );

        // Fetch conversions for each request
        for (let r of requests) {
            if (r.has_conversion) {
                r.conversions = await query(
                    `SELECT * FROM store_stock_transfer_conversions WHERE transfer_id = ? `,
                    [r.id]
                );
            } else {
                r.conversions = [];
            }
        }

        res.json({ success: true, requests });
    } catch (error) {
        console.error('Pending fetch error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Approve Request (Store 1 Action)
// Triggers Stock Clearance at Store 1 and Stock Addition at Store 2
// Approve Request (Store 1 Action)
// Triggers Stock Clearance at Store 1 and Stock Addition at Store 2
router.post('/approve', async (req, res) => {
    try {
        const { transferId, approvedBy, approvedByName, clearanceType } = req.body; // clearanceType: FULL or PARTIAL
        const result = await approveTransfer(transferId, approvedBy, approvedByName, clearanceType);
        res.json(result);
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Decline Request
router.post('/decline', async (req, res) => {
    try {
        const { transferId, approvedBy, approvedByName, comments } = req.body;

        const querySql = `UPDATE store_stock_transfers 
                          SET status = 'DECLINED', approval_date = NOW(), approved_by = ?, approved_by_name = ?, comments = CONCAT(IFNULL(comments, ''), '\n[DECLINED]: ', ?)
                          WHERE id = ? `;

        await query(querySql, [approvedBy, approvedByName, comments, transferId]);

        res.json({ success: true, message: 'Request declined' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
