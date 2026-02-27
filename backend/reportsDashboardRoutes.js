/**
 * =====================================================
 * REPORTS DASHBOARD ROUTES
 * Handles analytics dashboards for item lifecycle analysis
 * =====================================================
 * File: reportsDashboardRoutes.js
 * 
 * KEY DESIGN:
 * - Analysis period is BETWEEN two "Full Clearance" events
 * - Initial clearance event itself is NOT counted (it's the reset point)
 * - Final clearance event's transaction bill IS included
 * - Returns after final clearance are included as stock changes
 * - All data is broken down by Store 1 and Store 2
 */

const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');
const dateTimeUtils = require('./dateTimeUtils');

router.use(cors());

// Promisify pool.query if not already done
if (!pool.query[util.promisify.custom]) {
    pool.query = util.promisify(pool.query);
}

// OP TYPE constants
const OP_TYPE_LABELS = {
    1: 'Full Clear (Standard)',
    2: 'Partial Clear (Standard)',
    3: 'Full Clear + Sale',
    4: 'Partial Clear + Sale',
    5: 'Transfer (Standard)',
    6: 'Transfer + Full Clear',
    7: 'Partial Clear + Lorry',
    8: 'Full Clear + Lorry',
    9: 'Item Conversion',
    11: 'Stock Return'
};

// SQL Helper for selective SL Time conversion
// Server-created records (Actual UTC) -> Shift to SLT
// Synced records (Already SLT string) -> Keep as-is
const SL_TIME_SQL = (field = 'st.CREATED_DATE', codeField = 'st.CODE') => `
    CASE 
        WHEN ${codeField} IS NULL 
             OR ${codeField} LIKE 'ADJ-%' 
             OR ${codeField} LIKE 'STOCKOP-%' 
             OR ${codeField} LIKE 'SLO-%'
        THEN CONVERT_TZ(${field}, '+00:00', '+05:30')
        ELSE ${field}
    END
`;

// SQL Helper for Stock Operations (Always server-created UTC)
const OP_SL_TIME_SQL = (field = 'sso.CREATED_DATE') => `CONVERT_TZ(${field}, '+00:00', '+05:30')`;

// =====================================================
// 1. GET ITEMS LIST (for dashboard item selection)
// =====================================================
router.get('/api/reports-dashboard/items', async (req, res) => {
    try {
        const items = await pool.query(
            `SELECT ITEM_ID, CODE, NAME, BUYING_PRICE, SELLING_PRICE 
             FROM store_items 
             WHERE IS_ACTIVE = 1 
               AND CODE NOT IN ('CONTAINER', 'RETURN')
             ORDER BY NAME ASC`
        );
        return res.json({ success: true, result: items });
    } catch (error) {
        console.error('[ReportsDashboard] Error fetching items:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// 2. GET FULL CLEARANCE EVENTS FOR AN ITEM
// =====================================================
router.get('/api/reports-dashboard/clearances/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;

        // Fetch Full AND Partial Clearance operations
        // OP_TYPE: 1=Full Clear, 2=Partial Clear, 3=Full+Sale, 4=Partial+Sale,
        //          7=Partial+Lorry, 8=Full+Lorry
        // Excludes Transfer Full Clear (6) and Item Conversion (9)
        let clearanceQuery = `
            SELECT DISTINCT
                sso.OP_ID,
                sso.OP_CODE,
                sso.OP_TYPE,
                sso.CLEARANCE_TYPE,
                sso.DATE as OP_DATE,
                ${OP_SL_TIME_SQL('sso.CREATED_DATE')} as CREATED_DATE,
                sso.STORE_NO,
                sso.COMMENTS,
                sso.BILL_CODE,
                sso.BILL_AMOUNT,
                sso.WASTAGE_AMOUNT,
                sso.SURPLUS_AMOUNT,
                sso.CUSTOMER_NAME,
                sso.LORRY_NAME,
                ssoi.ORIGINAL_STOCK,
                ssoi.CLEARED_QUANTITY,
                ssoi.REMAINING_STOCK,
                ssoi.SOLD_QUANTITY
            FROM store_stock_operations sso
            JOIN store_stock_operation_items ssoi ON sso.OP_ID = ssoi.OP_ID
            WHERE ssoi.ITEM_ID = ?
              AND sso.IS_ACTIVE = 1
              AND ssoi.IS_ACTIVE = 1
              AND sso.OP_TYPE IN (1, 2, 3, 4, 7, 8)
            ORDER BY ${OP_SL_TIME_SQL('sso.CREATED_DATE')} DESC
            LIMIT 50
        `;

        const clearances = await pool.query(clearanceQuery, [itemId]);

        // Also find "natural zero" points via running stock
        const runningStockQuery = `
            SELECT 
                DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) as tx_date,
                SUM(CASE 
                    WHEN st.TYPE IN ('AdjIn', 'Opening', 'Buying', 'TransferIn', 'StockTake') THEN sti.QUANTITY
                    WHEN st.TYPE IN ('AdjOut', 'Selling', 'StockClear', 'TransferOut', 'Wastage') THEN -sti.QUANTITY
                    ELSE 0
                END) as day_change
            FROM store_transactions st
            JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
            WHERE sti.ITEM_ID = ?
              AND st.IS_ACTIVE = 1
              AND sti.IS_ACTIVE = 1
            GROUP BY DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')})
            ORDER BY tx_date ASC
        `;

        const dailyChanges = await pool.query(runningStockQuery, [itemId]);

        // Find zero-crossing dates
        let runningTotal = 0;
        const zeroDates = [];
        for (const day of dailyChanges) {
            runningTotal += parseFloat(day.day_change) || 0;
            if (Math.abs(runningTotal) < 0.01) {
                zeroDates.push({
                    date: day.tx_date,
                    stockAtPoint: runningTotal,
                    source: 'calculated'
                });
            }
        }

        return res.json({
            success: true,
            clearances: clearances.map(c => ({
                ...c,
                source: 'operation'
            })),
            zeroDates: zeroDates.slice(-20)
        });

    } catch (error) {
        console.error('[ReportsDashboard] Error fetching clearances:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// 3. FULL PERIOD ANALYSIS BETWEEN TWO CLEARANCE EVENTS
// =====================================================
// Main analytics engine. Analyzes stock lifecycle between
// two full clearance events with per-store breakdown.
router.post('/api/reports-dashboard/analyze-period', async (req, res) => {
    try {
        const { itemId, startDate, endDate, startOpId, endOpId } = req.body;

        if (!itemId || !startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'itemId, startDate, endDate are required' });
        }

        // Get item info
        const [itemInfo] = await pool.query(
            'SELECT ITEM_ID, CODE, NAME, BUYING_PRICE, SELLING_PRICE FROM store_items WHERE ITEM_ID = ?',
            [itemId]
        );

        if (!itemInfo) {
            return res.status(404).json({ success: false, message: 'Item not found' });
        }

        // ==========================================
        // 0. RESOLVE EXACT DATETIME BOUNDARIES
        // ==========================================
        // Find the OP_CODE for start/end operations, then find the latest
        // linked transaction datetime for each (COMMENTS LIKE '[OP_CODE]%')
        let startBoundary = `${startDate} 23:59:59`;
        let endBoundary = `${endDate} 23:59:59`;

        // If it's a custom-range or specific request for "up to now" (from frontend)
        if (req.body.isNow && endDate === dateTimeUtils.toSLMySQLDateTime(new Date()).split(' ')[0]) {
            endBoundary = dateTimeUtils.toSLMySQLDateTime(new Date());
        }

        // Helper: find latest transaction datetime linked to an operation
        const findOpBoundary = async (opId) => {
            if (!opId) return null;
            // Get OP_CODE
            const [opRow] = await pool.query(
                'SELECT OP_CODE, CREATED_DATE FROM store_stock_operations WHERE OP_ID = ?', [opId]
            );
            if (!opRow) return null;
            // Find latest linked transaction
            const [latestTx] = await pool.query(
                `SELECT MAX(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) as max_date 
                 FROM store_transactions st 
                 WHERE st.COMMENTS LIKE ? AND st.IS_ACTIVE = 1`,
                [`%[${opRow.OP_CODE}]%`]
            );
            // Use latest transaction datetime, or operation's own datetime
            return latestTx?.max_date || dateTimeUtils.toSLMySQLDateTime(opRow.CREATED_DATE);
        };

        if (startOpId) {
            const resolved = await findOpBoundary(startOpId);
            if (resolved) startBoundary = resolved;
        }
        if (endOpId) {
            const resolved = await findOpBoundary(endOpId);
            if (resolved) endBoundary = resolved;
        } else if (req.body.isNow) {
            // Fix: If "Now" is selected, set end boundary to exact current SL Time
            endBoundary = dateTimeUtils.toSLMySQLDateTime(new Date());
        }

        console.log(`[ReportsDashboard] Boundaries: start=${startBoundary}, end=${endBoundary}`);

        // ==========================================
        // A. INITIAL STOCK (after first clearance)
        // ==========================================
        // Stock at the exact moment of initial clearance (including its transactions)
        const initialStockByStore = { 1: 0, 2: 0 };

        for (const storeNo of [1, 2]) {
            const [result] = await pool.query(`
                SELECT COALESCE(SUM(CASE 
                    WHEN st.TYPE IN ('AdjIn', 'Opening', 'Buying', 'TransferIn', 'StockTake') THEN sti.QUANTITY
                    WHEN st.TYPE IN ('AdjOut', 'Selling', 'StockClear', 'TransferOut', 'Wastage') THEN -sti.QUANTITY
                    ELSE 0
                END), 0) as stock_level
                FROM store_transactions st
                JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                WHERE sti.ITEM_ID = ?
                  AND st.STORE_NO = ?
                  AND st.IS_ACTIVE = 1
                  AND sti.IS_ACTIVE = 1
                  AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} <= ?
            `, [itemId, storeNo, startBoundary]);
            initialStockByStore[storeNo] = parseFloat(result?.stock_level) || 0;
        }

        // ==========================================
        // B. TRANSACTIONS BY STORE (between boundaries)
        // ==========================================
        // Uses full datetime comparison, not DATE() truncation
        // EXCLUDE transactions linked to stock operations (conversions, returns, etc.)
        // to avoid double-counting. These are identified by COMMENTS containing [OP_CODE]
        const txByStoreQuery = `
            SELECT 
                st.TRANSACTION_ID,
                st.CODE as TX_CODE,
                st.TYPE,
                st.STORE_NO,
                st.CREATED_DATE,
                st.COMMENTS,
                st.SUB_TOTAL,
                sti.QUANTITY,
                sti.PRICE,
                sti.TOTAL
            FROM store_transactions st
            JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
            WHERE sti.ITEM_ID = ?
              AND st.IS_ACTIVE = 1
              AND sti.IS_ACTIVE = 1
              AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} > ?
              AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} <= ?
              AND st.COMMENTS NOT LIKE '%[OP-%'  -- Exclude operation-linked transactions
              AND st.COMMENTS NOT LIKE '%[S2-%'   -- Exclude store operation codes
              AND st.COMMENTS NOT LIKE '%[S1-%'
            ORDER BY st.CREATED_DATE ASC
        `;
        const allTransactions = await pool.query(txByStoreQuery, [itemId, startBoundary, endBoundary]);

        // Aggregate per store
        // TransferIn merged into adjIn, TransferOut merged into adjOut
        const storeAggregates = {
            1: { buying: { qty: 0, amount: 0 }, selling: { qty: 0, amount: 0 }, adjIn: { qty: 0, amount: 0 }, adjOut: { qty: 0, amount: 0 }, stockClear: { qty: 0, amount: 0 }, opening: { qty: 0, amount: 0 }, wastage: { qty: 0, amount: 0 }, stockTake: { qty: 0, amount: 0 } },
            2: { buying: { qty: 0, amount: 0 }, selling: { qty: 0, amount: 0 }, adjIn: { qty: 0, amount: 0 }, adjOut: { qty: 0, amount: 0 }, stockClear: { qty: 0, amount: 0 }, opening: { qty: 0, amount: 0 }, wastage: { qty: 0, amount: 0 }, stockTake: { qty: 0, amount: 0 } }
        };

        const totalAggregates = {
            buying: { qty: 0, amount: 0 }, selling: { qty: 0, amount: 0 },
            adjIn: { qty: 0, amount: 0 }, adjOut: { qty: 0, amount: 0 },
            stockClear: { qty: 0, amount: 0 }, opening: { qty: 0, amount: 0 },
            wastage: { qty: 0, amount: 0 }, stockTake: { qty: 0, amount: 0 }
        };

        // TransferIn -> adjIn, TransferOut -> adjOut
        const typeKeyMap = {
            'Buying': 'buying', 'Selling': 'selling',
            'AdjIn': 'adjIn', 'AdjOut': 'adjOut',
            'TransferIn': 'adjIn', 'TransferOut': 'adjOut',
            'StockClear': 'stockClear', 'Opening': 'opening',
            'Wastage': 'wastage', 'StockTake': 'stockTake'
        };

        for (const tx of allTransactions) {
            const qty = parseFloat(tx.QUANTITY) || 0;
            const amount = parseFloat(tx.TOTAL) || (parseFloat(tx.PRICE) || 0) * qty;
            const storeNo = tx.STORE_NO || 1;
            const key = typeKeyMap[tx.TYPE];

            if (key && storeAggregates[storeNo]) {
                storeAggregates[storeNo][key].qty += qty;
                storeAggregates[storeNo][key].amount += amount;
            }
            if (key && totalAggregates[key]) {
                totalAggregates[key].qty += qty;
                totalAggregates[key].amount += amount;
            }
        }

        // ==========================================
        // C. STOCK OPERATIONS IN PERIOD
        // ==========================================
        // Get all stock operations (including the final clearance)
        // NOTE: Do NOT filter by ssoi.STORE_NO here — returns (op11) and conversions (op9)
        // may have items whose STORE_NO differs from the operation's STORE_NO.
        // Deduplication by OP_ID is handled in code below.
        const opsQuery = `
            SELECT DISTINCT
                sso.OP_ID,
                sso.OP_CODE,
                sso.OP_TYPE,
                sso.CLEARANCE_TYPE,
                sso.DATE as OP_DATE,
                sso.CREATED_DATE,
                sso.STORE_NO,
                sso.BILL_CODE,
                sso.BILL_AMOUNT,
                sso.WASTAGE_AMOUNT,
                sso.SURPLUS_AMOUNT,
                sso.COMMENTS,
                sso.CUSTOMER_NAME,
                sso.LORRY_NAME,
                sso.DRIVER_NAME,
                sso.DESTINATION,
                sso.REFERENCE_OP_ID,
                ssoi.ITEM_ID,
                ssoi.ITEM_NAME,
                ssoi.ITEM_CODE,
                ssoi.ORIGINAL_STOCK,
                ssoi.CLEARED_QUANTITY,
                ssoi.REMAINING_STOCK,
                ssoi.SOLD_QUANTITY,
                ssoi.PRICE,
                ssoi.TOTAL
            FROM store_stock_operations sso
            JOIN store_stock_operation_items ssoi ON sso.OP_ID = ssoi.OP_ID
            WHERE ssoi.ITEM_ID = ?
              AND sso.IS_ACTIVE = 1
              AND ssoi.IS_ACTIVE = 1
              AND ${OP_SL_TIME_SQL('sso.CREATED_DATE')} > ?
              AND ${OP_SL_TIME_SQL('sso.CREATED_DATE')} <= ?
            ORDER BY sso.CREATED_DATE ASC
        `;
        const rawStockOps = await pool.query(opsQuery, [itemId, startBoundary, endBoundary]);

        // Explicitly fetch the final clearance operation if not already in results
        let finalOpRow = [];
        if (endOpId) {
            const hasEndOp = rawStockOps.some(op => op.OP_ID == endOpId);
            if (!hasEndOp) {
                finalOpRow = await pool.query(`
                    SELECT DISTINCT
                        sso.OP_ID, sso.OP_CODE, sso.OP_TYPE, sso.CLEARANCE_TYPE,
                        sso.DATE as OP_DATE, sso.CREATED_DATE, sso.STORE_NO,
                        sso.BILL_CODE, sso.BILL_AMOUNT, sso.WASTAGE_AMOUNT, sso.SURPLUS_AMOUNT,
                        sso.COMMENTS, sso.CUSTOMER_NAME, sso.LORRY_NAME, sso.DRIVER_NAME,
                        sso.DESTINATION, sso.REFERENCE_OP_ID,
                        ssoi.ITEM_ID, ssoi.ITEM_NAME, ssoi.ITEM_CODE,
                        ssoi.ORIGINAL_STOCK, ssoi.CLEARED_QUANTITY, ssoi.REMAINING_STOCK,
                        ssoi.SOLD_QUANTITY, ssoi.PRICE, ssoi.TOTAL
                    FROM store_stock_operations sso
                    JOIN store_stock_operation_items ssoi ON sso.OP_ID = ssoi.OP_ID
                    WHERE sso.OP_ID = ? AND ssoi.ITEM_ID = ?
                      AND sso.IS_ACTIVE = 1 AND ssoi.IS_ACTIVE = 1
                    LIMIT 1
                `, [endOpId, itemId]);
                console.log(`[ReportsDashboard] Final op ${endOpId} fetched explicitly:`, finalOpRow.length, 'rows');
            }
        }

        // Enrich stock operations with conversion details
        // DEDUPLICATE by OP_ID (JOIN can produce duplicates)
        const enrichedOps = [];
        const seenOpIds = new Set();
        // Exclude the initial clearance operation (startOpId), include final (endOpId)
        const allOpsRaw = [...rawStockOps, ...finalOpRow].filter(op => {
            if (seenOpIds.has(op.OP_ID)) return false;
            if (startOpId && op.OP_ID == startOpId) return false; // Exclude initial clearance
            seenOpIds.add(op.OP_ID);
            return true;
        });

        for (const op of allOpsRaw) {
            // Get conversions for this operation
            const conversions = await pool.query(
                'SELECT * FROM store_stock_operation_conversions WHERE OP_ID = ? AND IS_ACTIVE = 1',
                [op.OP_ID]
            );

            // Get all items in this operation (for transfers - store 2 items)
            const allOpItems = await pool.query(
                'SELECT * FROM store_stock_operation_items WHERE OP_ID = ? AND IS_ACTIVE = 1',
                [op.OP_ID]
            );

            // Get stock adjustments linked to this operation
            const stockAdjustments = await pool.query(`
                SELECT st.TYPE, st.STORE_NO, sti.QUANTITY, sti.ITEM_ID, i.NAME as ITEM_NAME, i.CODE as ITEM_CODE
                FROM store_transactions st
                JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                LEFT JOIN store_items i ON sti.ITEM_ID = i.ITEM_ID
                WHERE st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1 
                  AND st.COMMENTS LIKE ?
            `, [`[${op.OP_CODE}]%`]);

            const store2Items = allOpItems.filter(i => i.STORE_NO === 2);

            const totalDestQty = conversions.reduce((sum, c) =>
                sum + (parseFloat(c.DEST_QUANTITY) || 0), 0
            );

            enrichedOps.push({
                OP_ID: op.OP_ID,
                OP_CODE: op.OP_CODE,
                OP_TYPE: op.OP_TYPE,
                opTypeLabel: OP_TYPE_LABELS[op.OP_TYPE] || `Type ${op.OP_TYPE}`,
                CLEARANCE_TYPE: op.CLEARANCE_TYPE,
                OP_DATE: op.OP_DATE,
                CREATED_DATE: op.CREATED_DATE,
                STORE_NO: op.STORE_NO,
                BILL_CODE: op.BILL_CODE,
                BILL_AMOUNT: parseFloat(op.BILL_AMOUNT) || 0,
                // -----------------------------------------------------------------------
                // Wastage/Surplus — identical logic to Stock Operations page view modal
                // Only applies to Full operations: OP_TYPE [1,3,6,8] and OP_TYPE 9 + FULL.
                // All other ops (partial, transfers-partial, returns) → 0.
                // -----------------------------------------------------------------------
                WASTAGE_AMOUNT: (() => {
                    const isFullOp = [1, 3, 6, 8].includes(op.OP_TYPE) ||
                        (op.OP_TYPE === 9 && op.CLEARANCE_TYPE === 'FULL');
                    if (!isFullOp) return 0;

                    const prevStock = parseFloat(op.ORIGINAL_STOCK) || 0;
                    const clearedQty = parseFloat(op.CLEARED_QUANTITY) || 0;
                    const isSalesOp = [3, 4].includes(op.OP_TYPE);

                    // GUARD: If this item had no starting stock (ORIGINAL_STOCK=0), it wasn't
                    // the primary item being cleared (e.g., just a conversion destination).
                    // Exception: older sales ops where ORIGINAL_STOCK wasn't recorded, but CLEARED_QUANTITY was.
                    const effectivePrevStock = prevStock > 0 ? prevStock : (isSalesOp && clearedQty > 0 ? clearedQty : 0);
                    if (effectivePrevStock === 0) return 0;

                    // Step 1: ALWAYS use stored DB values first — saved at op creation time,
                    //         identical to what the StockOperations view modal does.
                    const storedWastage = parseFloat(op.WASTAGE_AMOUNT) || 0;
                    const storedSurplus = parseFloat(op.SURPLUS_AMOUNT) || 0;
                    if (storedWastage > 0) return storedWastage;
                    if (storedSurplus > 0) return 0; // surplus stored → no wastage

                    // Step 2: fallback calculation when both stored values are 0
                    const soldQty = parseFloat(op.SOLD_QUANTITY) || 0;

                    if (isSalesOp) {
                        const diff = effectivePrevStock - (soldQty + totalDestQty);
                        return diff > 0 ? diff : 0;
                    }

                    if (conversions.length > 0 && effectivePrevStock > 0) {
                        const diff = effectivePrevStock - totalDestQty;
                        return diff > 0 ? diff : 0;
                    }
                    return effectivePrevStock > 0 ? Math.max(0, effectivePrevStock - clearedQty) : 0;
                })(),
                SURPLUS_AMOUNT: (() => {
                    const isFullOp = [1, 3, 6, 8].includes(op.OP_TYPE) ||
                        (op.OP_TYPE === 9 && op.CLEARANCE_TYPE === 'FULL');
                    if (!isFullOp) return 0;

                    const prevStock = parseFloat(op.ORIGINAL_STOCK) || 0;
                    const clearedQty = parseFloat(op.CLEARED_QUANTITY) || 0;
                    const isSalesOp = [3, 4].includes(op.OP_TYPE);

                    // GUARD: If this item had no starting stock (ORIGINAL_STOCK=0), it wasn't
                    // the primary item being cleared (e.g., just a conversion destination).
                    // Exception: older sales ops where ORIGINAL_STOCK wasn't recorded, but CLEARED_QUANTITY was.
                    const effectivePrevStock = prevStock > 0 ? prevStock : (isSalesOp && clearedQty > 0 ? clearedQty : 0);

                    // Allow negative prevStock to bypass guard (for rectifying negative balances)
                    if (effectivePrevStock === 0 && prevStock >= 0) return 0;

                    // Step 1: ALWAYS use stored DB values first — saved at op creation time.
                    const storedWastage = parseFloat(op.WASTAGE_AMOUNT) || 0;
                    const storedSurplus = parseFloat(op.SURPLUS_AMOUNT) || 0;
                    if (storedSurplus > 0) return storedSurplus;
                    if (storedWastage > 0) return 0; // wastage stored → no surplus

                    // Step 2: fallback calculation when both stored values are 0
                    const soldQty = parseFloat(op.SOLD_QUANTITY) || 0;

                    if (isSalesOp && effectivePrevStock > 0) {
                        const diff = (soldQty + totalDestQty) - effectivePrevStock;
                        return diff > 0 ? diff : 0;
                    }

                    if (conversions.length > 0) {
                        if (prevStock > 0) { const d = totalDestQty - prevStock; return d > 0 ? d : 0; }
                        if (prevStock < 0) return Math.abs(prevStock) + totalDestQty;
                        return 0;
                    }
                    if (prevStock < 0) return Math.abs(prevStock);
                    if (prevStock > 0 && clearedQty > prevStock) return clearedQty - prevStock;
                    return 0;
                })(),
                COMMENTS: op.COMMENTS,
                CUSTOMER_NAME: op.CUSTOMER_NAME,
                LORRY_NAME: op.LORRY_NAME,
                DRIVER_NAME: op.DRIVER_NAME,
                DESTINATION: op.DESTINATION,
                REFERENCE_OP_ID: op.REFERENCE_OP_ID,
                ORIGINAL_STOCK: parseFloat(op.ORIGINAL_STOCK) || 0,
                CLEARED_QUANTITY: parseFloat(op.CLEARED_QUANTITY) || 0,
                REMAINING_STOCK: parseFloat(op.REMAINING_STOCK) || 0,
                SOLD_QUANTITY: parseFloat(op.SOLD_QUANTITY) || 0,
                itemPrice: parseFloat(op.PRICE) || 0,
                itemTotal: parseFloat(op.TOTAL) || 0,
                isReturnAfterClear: false,
                conversions: conversions.map(c => ({
                    sourceItemId: c.SOURCE_ITEM_ID,
                    sourceItemName: c.SOURCE_ITEM_NAME,
                    sourceItemCode: c.SOURCE_ITEM_CODE,
                    // Use DEST_QUANTITY as canonical amount for both sides (SOURCE_QUANTITY unreliable)
                    sourceQuantity: parseFloat(c.DEST_QUANTITY) || 0,
                    destItemId: c.DEST_ITEM_ID,
                    destItemName: c.DEST_ITEM_NAME,
                    destItemCode: c.DEST_ITEM_CODE,
                    destQuantity: parseFloat(c.DEST_QUANTITY) || 0
                })),
                totalDestQty,
                // For transfers: store 2 items with before/after
                store2Items: store2Items.map(i => ({
                    itemId: i.ITEM_ID,
                    itemCode: i.ITEM_CODE,
                    itemName: i.ITEM_NAME,
                    previousStock: parseFloat(i.ORIGINAL_STOCK) || 0,
                    addedQty: Math.abs(parseFloat(i.CLEARED_QUANTITY) || 0),
                    currentStock: parseFloat(i.REMAINING_STOCK) || 0
                })),
                stockAdjustments: stockAdjustments.map(a => ({
                    type: a.TYPE,
                    storeNo: a.STORE_NO,
                    quantity: parseFloat(a.QUANTITY) || 0,
                    itemId: a.ITEM_ID,
                    itemName: a.ITEM_NAME,
                    itemCode: a.ITEM_CODE
                }))
            });
        }

        // ==========================================
        // D. TRANSFERS ANALYSIS
        // ==========================================
        // Extract transfer operations for special display
        const transfers = enrichedOps.filter(op => [5, 6].includes(op.OP_TYPE));

        // ==========================================
        // E. CONVERSIONS IN/OUT
        // ==========================================
        // Get conversions where this item was SOURCE
        const conversionsOutQuery = `
            SELECT 
                soc.CONV_ID,
                sso.OP_ID,
                sso.OP_CODE,
                sso.OP_TYPE,
                sso.DATE as OP_DATE,
                sso.CREATED_DATE,
                sso.STORE_NO,
                soc.SOURCE_ITEM_ID,
                COALESCE(si_src.NAME, soc.SOURCE_ITEM_NAME) AS SOURCE_ITEM_NAME,
                COALESCE(si_src.CODE, soc.SOURCE_ITEM_CODE) AS SOURCE_ITEM_CODE,
                soc.SOURCE_QUANTITY,
                soc.DEST_ITEM_ID,
                COALESCE(si_dst.NAME, soc.DEST_ITEM_NAME) AS DEST_ITEM_NAME,
                COALESCE(si_dst.CODE, soc.DEST_ITEM_CODE) AS DEST_ITEM_CODE,
                soc.DEST_QUANTITY
            FROM store_stock_operation_conversions soc
            JOIN store_stock_operations sso ON soc.OP_ID = sso.OP_ID
            LEFT JOIN store_items si_src ON soc.SOURCE_ITEM_ID = si_src.ITEM_ID
            LEFT JOIN store_items si_dst ON soc.DEST_ITEM_ID = si_dst.ITEM_ID
            WHERE soc.SOURCE_ITEM_ID = ?
              AND sso.IS_ACTIVE = 1
              AND soc.IS_ACTIVE = 1
              AND ${OP_SL_TIME_SQL('sso.CREATED_DATE')} > ?
              AND ${OP_SL_TIME_SQL('sso.CREATED_DATE')} <= ?
        `;
        const conversionsOut = await pool.query(conversionsOutQuery, [itemId, startBoundary, endBoundary]);

        // Where this item was DESTINATION
        const conversionsInQuery = `
            SELECT 
                soc.CONV_ID,
                sso.OP_ID,
                sso.OP_CODE,
                sso.OP_TYPE,
                sso.DATE as OP_DATE,
                sso.CREATED_DATE,
                sso.STORE_NO,
                soc.SOURCE_ITEM_ID,
                COALESCE(si_src.NAME, soc.SOURCE_ITEM_NAME) AS SOURCE_ITEM_NAME,
                COALESCE(si_src.CODE, soc.SOURCE_ITEM_CODE) AS SOURCE_ITEM_CODE,
                soc.SOURCE_QUANTITY,
                soc.DEST_ITEM_ID,
                COALESCE(si_dst.NAME, soc.DEST_ITEM_NAME) AS DEST_ITEM_NAME,
                COALESCE(si_dst.CODE, soc.DEST_ITEM_CODE) AS DEST_ITEM_CODE,
                soc.DEST_QUANTITY
            FROM store_stock_operation_conversions soc
            JOIN store_stock_operations sso ON soc.OP_ID = sso.OP_ID
            LEFT JOIN store_items si_src ON soc.SOURCE_ITEM_ID = si_src.ITEM_ID
            LEFT JOIN store_items si_dst ON soc.DEST_ITEM_ID = si_dst.ITEM_ID
            WHERE soc.DEST_ITEM_ID = ?
              AND sso.IS_ACTIVE = 1
              AND soc.IS_ACTIVE = 1
              AND ${OP_SL_TIME_SQL('sso.CREATED_DATE')} > ?
              AND ${OP_SL_TIME_SQL('sso.CREATED_DATE')} <= ?
        `;
        const conversionsIn = await pool.query(conversionsInQuery, [itemId, startBoundary, endBoundary]);

        // Build conversion analysis with P&L
        // IMPORTANT: Use DEST_QUANTITY directly as the conversion amount for BOTH source and
        // destination sides. SOURCE_QUANTITY is unreliable (often 0/null) in the DB.
        // The convention is: whatever was converted out of the source item became destQty of dest item.

        const avgPriceCache = {};
        const getAvgSellingPrice = async (targetId, defaultPrice) => {
            if (avgPriceCache[targetId] !== undefined) {
                // console.log(`[ReportsDashboard] Item ${targetId}: Using cached avg price:`, avgPriceCache[targetId]);
                return avgPriceCache[targetId] !== null ? avgPriceCache[targetId] : defaultPrice;
            }
            try {
                console.log(`\n[ReportsDashboard] --- Calculating Avg Selling Price ---`);
                console.log(`[ReportsDashboard] DEBUG: Query params:`, { targetId, startBoundary, endBoundary });
                console.log(`[ReportsDashboard] Item ID: ${targetId}`);
                console.log(`[ReportsDashboard] Period: ${startBoundary} to ${endBoundary}`);

                const rows = await pool.query(`
                    SELECT SUM(sti.TOTAL) as sumTotal, SUM(sti.QUANTITY) as sumQty
                    FROM store_transactions st
                    JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                    WHERE sti.ITEM_ID = ? AND st.TYPE = 'Selling'
                      AND st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1
                      AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} >= ? 
                      AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} <= ?
                      AND st.COMMENTS NOT LIKE '%[OP-%'
                      AND st.COMMENTS NOT LIKE '%[S2-%'
                      AND st.COMMENTS NOT LIKE '%[S1-%'
                `, [targetId, startBoundary, endBoundary]);

                const opRows = await pool.query(`
                    SELECT SUM(ssoi.TOTAL) as sumTotal, SUM(ssoi.SOLD_QUANTITY) as sumQty
                    FROM store_stock_operations sso
                    JOIN store_stock_operation_items ssoi ON sso.OP_ID = ssoi.OP_ID
                    WHERE ssoi.ITEM_ID = ? AND sso.OP_TYPE IN (3, 4)
                      AND sso.IS_ACTIVE = 1
                      AND ${OP_SL_TIME_SQL('sso.CREATED_DATE')} >= ? 
                      AND ${OP_SL_TIME_SQL('sso.CREATED_DATE')} <= ?
                `, [targetId, startBoundary, endBoundary]);

                const sumTotalRaw = (parseFloat(rows[0]?.sumTotal) || 0) + (parseFloat(opRows[0]?.sumTotal) || 0);
                const sumQtyRaw = (parseFloat(rows[0]?.sumQty) || 0) + (parseFloat(opRows[0]?.sumQty) || 0);

                const sumTotal = parseFloat(sumTotalRaw.toFixed(2));
                const sumQty = parseFloat(sumQtyRaw.toFixed(2));

                console.log(`[ReportsDashboard] Sum Total: ${sumTotal}, Sum Qty: ${sumQty} (Normal: ${parseFloat(rows[0]?.sumQty) || 0}, Ops: ${parseFloat(opRows[0]?.sumQty) || 0})`);

                if (sumQty > 0) {
                    const avg = parseFloat((sumTotal / sumQty).toFixed(2));
                    console.log(`[ReportsDashboard] Calculated Avg Price: ${avg} (Fallback price was: ${defaultPrice})`);
                    avgPriceCache[targetId] = avg;
                    return avg;
                } else {
                    console.log(`[ReportsDashboard] No 'Selling' transactions found. Falling back to default list price: ${defaultPrice}`);
                }
            } catch (err) {
                console.error('[ReportsDashboard] Error fetching avg price for conversion:', err);
            }
            avgPriceCache[targetId] = null;
            return defaultPrice;
        };

        const conversionAnalysis = [];
        for (const conv of conversionsOut) {
            // destQty = amount converted OUT of selected item (both source qty and dest qty treated as same)
            const convQty = parseFloat(conv.DEST_QUANTITY) || 0;
            const [destItem] = await pool.query(
                'SELECT SELLING_PRICE, BUYING_PRICE FROM store_items WHERE ITEM_ID = ?',
                [conv.DEST_ITEM_ID]
            );

            const fallbackSourcePrice = parseFloat(itemInfo.SELLING_PRICE) || 0;
            const fallbackDestPrice = parseFloat(destItem?.SELLING_PRICE) || 0;

            const sourcePrice = await getAvgSellingPrice(conv.SOURCE_ITEM_ID, fallbackSourcePrice);
            const destPrice = await getAvgSellingPrice(conv.DEST_ITEM_ID, fallbackDestPrice);

            conversionAnalysis.push({
                opCode: conv.OP_CODE,
                opId: conv.OP_ID,
                opType: conv.OP_TYPE,
                date: conv.CREATED_DATE,
                storeNo: conv.STORE_NO,
                sourceItemId: conv.SOURCE_ITEM_ID,
                sourceItemName: conv.SOURCE_ITEM_NAME,
                sourceItemCode: conv.SOURCE_ITEM_CODE,
                sourceQty: convQty, sourcePrice,
                sourceValue: convQty * sourcePrice,
                destItemId: conv.DEST_ITEM_ID,
                destItemName: conv.DEST_ITEM_NAME,
                destItemCode: conv.DEST_ITEM_CODE,
                destQty: convQty, destPrice,
                destValue: convQty * destPrice,
                wastageQty: 0,
                profitLoss: (convQty * destPrice) - (convQty * sourcePrice),
                type: 'out'
            });
        }

        for (const conv of conversionsIn) {
            // convQty = amount converted INTO selected item (use DEST_QUANTITY as source of truth)
            const convQty = parseFloat(conv.DEST_QUANTITY) || 0;
            const [srcItem] = await pool.query(
                'SELECT SELLING_PRICE, BUYING_PRICE FROM store_items WHERE ITEM_ID = ?',
                [conv.SOURCE_ITEM_ID]
            );

            const fallbackSourcePrice = parseFloat(srcItem?.SELLING_PRICE) || 0;
            const fallbackDestPrice = parseFloat(itemInfo.SELLING_PRICE) || 0;

            const sourcePrice = await getAvgSellingPrice(conv.SOURCE_ITEM_ID, fallbackSourcePrice);
            const destPrice = await getAvgSellingPrice(conv.DEST_ITEM_ID, fallbackDestPrice);

            conversionAnalysis.push({
                opCode: conv.OP_CODE,
                opId: conv.OP_ID,
                opType: conv.OP_TYPE,
                date: conv.CREATED_DATE,
                storeNo: conv.STORE_NO,
                sourceItemId: conv.SOURCE_ITEM_ID,
                sourceItemName: conv.SOURCE_ITEM_NAME,
                sourceItemCode: conv.SOURCE_ITEM_CODE,
                sourceQty: convQty, sourcePrice,
                sourceValue: convQty * sourcePrice,
                destItemId: conv.DEST_ITEM_ID,
                destItemName: conv.DEST_ITEM_NAME,
                destItemCode: conv.DEST_ITEM_CODE,
                destQty: convQty, destPrice,
                destValue: convQty * destPrice,
                profitLoss: (convQty * destPrice) - (convQty * sourcePrice),
                type: 'in'
            });
        }

        // Remove cancelled-out self-conversions: same source & dest item AND zero financial impact.
        // Both conditions required (sourceItemId === destItemId AND profitLoss === 0).
        // Hide any conversion where source item = destination item (self-conversions),
        // regardless of direction (in/out) or financial impact.
        const filteredConversionAnalysis = conversionAnalysis.filter(c =>
            String(c.sourceItemId) !== String(c.destItemId)
        );

        // ==========================================
        // F. FINAL STOCK (after final clearance)
        // ==========================================
        const finalStockByStore = { 1: 0, 2: 0 };
        for (const storeNo of [1, 2]) {
            const [result] = await pool.query(`
                SELECT COALESCE(SUM(CASE 
                    WHEN st.TYPE IN ('AdjIn', 'Opening', 'Buying', 'TransferIn', 'StockTake') THEN sti.QUANTITY
                    WHEN st.TYPE IN ('AdjOut', 'Selling', 'StockClear', 'TransferOut', 'Wastage') THEN -sti.QUANTITY
                    ELSE 0
                END), 0) as stock_level
                FROM store_transactions st
                JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                WHERE sti.ITEM_ID = ?
                  AND st.STORE_NO = ?
                  AND st.IS_ACTIVE = 1
                  AND sti.IS_ACTIVE = 1
                  AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} <= ?
            `, [itemId, storeNo, endBoundary]);
            finalStockByStore[storeNo] = parseFloat(result?.stock_level) || 0;
        }

        // ==========================================
        // G. DAILY CHART DATA (combined both stores)
        // ==========================================
        // Exclude operation-linked transactions to avoid double-counting
        const dailyQuery = `
            SELECT 
                DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) as tx_date,
                st.TYPE,
                st.STORE_NO,
                SUM(sti.QUANTITY) as total_qty,
                SUM(sti.TOTAL) as total_amount
            FROM store_transactions st
            JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
            WHERE sti.ITEM_ID = ?
              AND st.IS_ACTIVE = 1
              AND sti.IS_ACTIVE = 1
              AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} > ?
              AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} <= ?
              AND st.COMMENTS NOT LIKE '%[OP-%'  -- Exclude operation-linked transactions
              AND st.COMMENTS NOT LIKE '%[S2-%'   -- Exclude store operation codes
              AND st.COMMENTS NOT LIKE '%[S1-%'
            GROUP BY DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}), st.TYPE, st.STORE_NO
            ORDER BY tx_date ASC
        `;
        const dailyRows = await pool.query(dailyQuery, [itemId, startBoundary, endBoundary]);

        // Build daily chart data
        const dailyMap = {};
        for (const row of dailyRows) {
            const dateKey = row.tx_date;
            if (!dailyMap[dateKey]) {
                dailyMap[dateKey] = { date: dateKey, buyQty: 0, sellQty: 0, adjInQty: 0, adjOutQty: 0, otherIn: 0, otherOut: 0 };
            }
            const qty = parseFloat(row.total_qty) || 0;
            switch (row.TYPE) {
                case 'Buying': dailyMap[dateKey].buyQty += qty; break;
                case 'Selling': dailyMap[dateKey].sellQty += qty; break;
                case 'AdjIn': dailyMap[dateKey].adjInQty += qty; break;
                case 'AdjOut': dailyMap[dateKey].adjOutQty += qty; break;
                case 'Opening': case 'TransferIn': case 'StockTake':
                    dailyMap[dateKey].otherIn += qty; break;
                case 'TransferOut': case 'StockClear': case 'Wastage':
                    dailyMap[dateKey].otherOut += qty; break;
            }
        }

        // Fill in gaps and compute running stock
        const totalStartStock = initialStockByStore[1] + initialStockByStore[2];
        const chartData = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Add INITIAL point representing stock at startBoundary
        // Use startDate but maybe add a marker like '(Start)' to distinguish if needed, 
        // or just rely on index order. Frontend uses date string.
        chartData.push({
            date: startDate, // Same date as first day, but represents Start Time
            stock: parseFloat(totalStartStock.toFixed(2)),
            buyQty: 0, sellQty: 0, adjInQty: 0, adjOutQty: 0, otherIn: 0, otherOut: 0, netChange: 0,
            isInitial: true // Flag for potential frontend use
        });

        let currentStock = totalStartStock;

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            // Fix: Use SL Time string for dateKey in charts to match SL records
            const dateKey = dateTimeUtils.toSLMySQLDateTime(d).split(' ')[0];
            const dayData = dailyMap[dateKey] || { date: dateKey, buyQty: 0, sellQty: 0, adjInQty: 0, adjOutQty: 0, otherIn: 0, otherOut: 0 };

            const dayIn = dayData.buyQty + dayData.adjInQty + dayData.otherIn;
            const dayOut = dayData.sellQty + dayData.adjOutQty + dayData.otherOut;
            currentStock += (dayIn - dayOut);

            chartData.push({
                date: dateKey,
                stock: parseFloat(currentStock.toFixed(2)),
                buyQty: parseFloat(dayData.buyQty.toFixed(2)),
                sellQty: parseFloat(dayData.sellQty.toFixed(2)),
                adjInQty: parseFloat(dayData.adjInQty.toFixed(2)),
                adjOutQty: parseFloat(dayData.adjOutQty.toFixed(2)),
                otherIn: parseFloat(dayData.otherIn.toFixed(2)),
                otherOut: parseFloat(dayData.otherOut.toFixed(2)),
                netChange: parseFloat((dayIn - dayOut).toFixed(2))
            });
        }

        // ==========================================
        // G.5 APPEND SALES FROM STOCK OPERATIONS TO AGGREGATES
        // ==========================================
        // Operations 3 and 4 (Sales) have SOLD_QUANTITY and BILL_AMOUNT that were excluded 
        // from allTransactions to avoid double-counting. We add them to selling aggregates here.
        for (const op of enrichedOps) {
            const soldQty = op.SOLD_QUANTITY || 0;
            const itemTotal = op.itemTotal || 0;

            if (soldQty > 0) {
                const storeNo = op.STORE_NO || 1;

                if (storeAggregates[storeNo]) {
                    storeAggregates[storeNo].selling.qty += soldQty;
                    storeAggregates[storeNo].selling.amount += itemTotal;
                }

                totalAggregates.selling.qty += soldQty;
                totalAggregates.selling.amount += itemTotal;
            }
        }

        // ==========================================
        // H. FINANCIAL SUMMARY
        // ==========================================
        const totalRevenue = totalAggregates.selling.amount;
        const totalCost = totalAggregates.buying.amount;
        const conversionPL = filteredConversionAnalysis.reduce((sum, c) => sum + (c.profitLoss || 0), 0);
        const grossProfit = totalRevenue - totalCost;

        // Fetch return expenses associated with the returns in this period
        // Return expense transactions have Comments like "Automated: Expense for this return. Return code: [OP_CODE]"
        // or "Automated: Expense for this return with return code [OP_CODE]"
        let totalReturnExpense = 0;
        const returnOpCodes = enrichedOps.filter(op => op.OP_TYPE === 11).map(op => op.OP_CODE);
        console.log(`[ReportsDashboard] Found ${returnOpCodes.length} return operations:`, returnOpCodes);
        if (returnOpCodes.length > 0) {
            // Create LIKE clauses for each return op code
            const likeClauses = returnOpCodes.map(() => `COMMENTS LIKE ?`).join(' OR ');
            // Loosen the match to just the code, but we specify the general pattern in the base query
            const likeValues = returnOpCodes.map(code => `%${code}%`);

            const expenseQuery = `
                SELECT SUM(SUB_TOTAL) as total_expense
                FROM store_transactions
                WHERE TYPE = 'Expenses' AND IS_ACTIVE = 1
                AND (${likeClauses})
            `;

            try {
                const [expenseRows] = await pool.query(expenseQuery, likeValues);
                totalReturnExpense = parseFloat(expenseRows[0]?.total_expense || expenseRows?.total_expense || 0);
            } catch (err) {
                console.error('[ReportsDashboard] Error fetching return expenses:', err);
                totalReturnExpense = 0;
            }
        }

        // Total wastage from operations
        const totalOperationWastage = enrichedOps.reduce((sum, op) => sum + (op.WASTAGE_AMOUNT || 0), 0);
        const totalOperationSurplus = enrichedOps.reduce((sum, op) => sum + (op.SURPLUS_AMOUNT || 0), 0);

        // Calculate W/S Impact (Opportunity cost of wastage/surplus)
        // Formula: (Wastage or Surplus kg) * (W/S Impact / Sold kg value)
        // W/S Impact / Sold kg value is -(incomePerKg * netWS / totalSellQty)
        const netWS = totalOperationWastage - totalOperationSurplus;
        const totalSellQty = totalAggregates.selling.qty;
        const incomePerKg = totalSellQty > 0 ? totalAggregates.selling.amount / totalSellQty : (parseFloat(itemInfo.SELLING_PRICE) || 0);

        const wsFinancialImpactPerKg = totalSellQty > 0 ? incomePerKg * (netWS / totalSellQty) : 0;
        const totalWSImpact = Math.abs(netWS) * (-wsFinancialImpactPerKg);

        const netProfit = grossProfit + conversionPL - totalReturnExpense + totalWSImpact;

        // ==========================================
        // I. MANUAL ADJUSTMENTS (AdjIn, AdjOut, Opening, StockClear, StockTake, Wastage)
        // These are free-standing transactions from the Inventory/Adjust Stock page,
        // NOT linked to any stock operation.
        // ==========================================
        // Pure manual adjustment types from the Inventory / Adjust Stock page only.
        // TransferIn / TransferOut are intentionally excluded — those are generated
        // by stock-transfer operations and would double-count if included here.
        const ADJ_IN_TYPES = new Set(['AdjIn', 'Opening', 'StockTake']);
        // Types that DECREASE stock (negative delta)
        const ADJ_OUT_TYPES = new Set(['AdjOut', 'StockClear', 'Wastage']);
        const ADJ_ALL_TYPES = new Set([...ADJ_IN_TYPES, ...ADJ_OUT_TYPES]);

        const ADJ_LABELS = {
            AdjIn: 'Adjust In', AdjOut: 'Adjust Out',
            Opening: 'Opening Stock', StockClear: 'Stock Clearance',
            StockTake: 'Stock Take', Wastage: 'Wastage'
        };

        const manualAdjustments = allTransactions
            .filter(tx => ADJ_ALL_TYPES.has(tx.TYPE) && tx.TX_CODE && tx.TX_CODE.startsWith('ADJ-'))
            .map(tx => {
                const qty = parseFloat(tx.QUANTITY) || 0;
                const isIn = ADJ_IN_TYPES.has(tx.TYPE);
                const delta = isIn ? qty : -qty;
                return {
                    txId: tx.TRANSACTION_ID,
                    txCode: tx.TX_CODE,
                    type: tx.TYPE,
                    typeLabel: ADJ_LABELS[tx.TYPE] || tx.TYPE,
                    isIn,
                    qty: parseFloat(qty.toFixed(3)),
                    delta: parseFloat(delta.toFixed(3)),
                    storeNo: tx.STORE_NO || 1,
                    date: tx.CREATED_DATE,
                    comments: tx.COMMENTS || null
                };
            });

        // Partial Clear (Standard) ops on the selected item.
        // The AdjOut/StockClear transaction these ops generate is excluded from allTransactions
        // (COMMENTS filter), so we must capture the cleared qty here directly.
        // When CLEARED_QUANTITY is 0 (older ops), look it up from the linked AdjOut transaction.
        const partialClearAdjs = (await Promise.all(
            enrichedOps
                .filter(op => op.OP_TYPE === 2)
                .map(async op => {
                    let clearedQty = parseFloat(op.CLEARED_QUANTITY) || 0;

                    // Fallback: when CLEARED_QUANTITY is 0, look up the AdjOut/StockClear
                    // transaction created by this op via COMMENTS matching the OP_CODE.
                    if (clearedQty === 0) {
                        const txRows = await pool.query(
                            `SELECT sti.QUANTITY
                             FROM store_transactions st
                             JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                             WHERE st.COMMENTS LIKE ?
                               AND sti.ITEM_ID = ?
                               AND st.TYPE IN ('AdjOut', 'StockClear')
                               AND st.IS_ACTIVE = 1
                               AND sti.IS_ACTIVE = 1
                             LIMIT 1`,
                            [`[${op.OP_CODE}]%`, itemId]
                        );
                        if (txRows && txRows.length > 0) {
                            clearedQty = parseFloat(txRows[0].QUANTITY) || 0;
                        }
                    }

                    if (clearedQty <= 0) return null;

                    // Subtract conversion-out qty — those are already tracked in Conv. Out.
                    const convOutQty = (op.conversions || [])
                        .filter(c => c.sourceItemId === itemId || c.sourceItemId === String(itemId))
                        .reduce((s, c) => s + (parseFloat(c.sourceQuantity) || parseFloat(c.destQuantity) || 0), 0);
                    const netCleared = Math.max(0, clearedQty - convOutQty);

                    return {
                        txId: null,
                        txCode: op.OP_CODE,
                        type: 'StockOp',
                        typeLabel: 'Partial Clear',
                        isIn: false,
                        qty: parseFloat(netCleared.toFixed(3)),
                        delta: parseFloat((-netCleared).toFixed(3)),
                        storeNo: op.STORE_NO || 1,
                        date: op.CREATED_DATE,
                        comments: op.COMMENTS || null
                    };
                })
        )).filter(a => a !== null && a.qty > 0);



        const allManualAdjustments = [...manualAdjustments, ...partialClearAdjs];

        // Also fold partial clear cleared quantities into the aggregates so that
        // the Adj Out card in Stock Summary reflects them (they are not in allTransactions).
        for (const a of partialClearAdjs) {
            const sn = a.storeNo || 1;
            if (storeAggregates[sn]) {
                storeAggregates[sn].adjOut.qty = parseFloat((storeAggregates[sn].adjOut.qty + a.qty).toFixed(3));
            }
            totalAggregates.adjOut.qty = parseFloat((totalAggregates.adjOut.qty + a.qty).toFixed(3));
        }


        // Net stock impact of all manual adjustments (positive = stock added)
        const netManualAdjustment = allManualAdjustments.reduce((s, a) => s + a.delta, 0);

        return res.json({
            success: true,
            data: {
                item: itemInfo,
                period: { startDate, endDate },

                // Per-store initial stock (after first clearance)
                initialStock: {
                    store1: parseFloat(initialStockByStore[1].toFixed(3)),
                    store2: parseFloat(initialStockByStore[2].toFixed(3)),
                    total: parseFloat((initialStockByStore[1] + initialStockByStore[2]).toFixed(3))
                },

                // Per-store final stock (after final clearance)
                finalStock: {
                    store1: parseFloat(finalStockByStore[1].toFixed(3)),
                    store2: parseFloat(finalStockByStore[2].toFixed(3)),
                    total: parseFloat((finalStockByStore[1] + finalStockByStore[2]).toFixed(3))
                },

                // Per-store aggregates
                storeAggregates: {
                    store1: storeAggregates[1],
                    store2: storeAggregates[2]
                },

                // Combined aggregates (backward compat)
                aggregates: totalAggregates,

                // Daily chart data
                chartData,

                // Detailed transaction list (for reference, not primary display)
                transactions: allTransactions,

                // Enriched stock operations with full breakdown
                stockOperations: enrichedOps,

                // Transfer operations (subset of stockOperations)
                transfers,

                // Conversion analysis with P&L
                conversions: filteredConversionAnalysis,

                // Manual adjustments (AdjIn, AdjOut, Opening, StockClear, etc.)
                manualAdjustments: allManualAdjustments,
                netManualAdjustment: parseFloat(netManualAdjustment.toFixed(3)),

                // Wastage summary from operations
                operationWastage: {
                    totalWastage: parseFloat(totalOperationWastage.toFixed(3)),
                    totalSurplus: parseFloat(totalOperationSurplus.toFixed(3)),
                    operations: enrichedOps
                        .filter(op => op.WASTAGE_AMOUNT > 0 || op.SURPLUS_AMOUNT > 0)
                        .map(op => ({
                            opCode: op.OP_CODE,
                            opType: op.OP_TYPE,
                            opTypeLabel: op.opTypeLabel,
                            date: op.CREATED_DATE,
                            wastage: op.WASTAGE_AMOUNT,
                            surplus: op.SURPLUS_AMOUNT,
                            originalStock: op.ORIGINAL_STOCK
                        }))
                },

                // Financial summary
                financials: {
                    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
                    totalCost: parseFloat(totalCost.toFixed(2)),
                    grossProfit: parseFloat(grossProfit.toFixed(2)),
                    conversionImpact: parseFloat(conversionPL.toFixed(2)),
                    totalReturnExpense: parseFloat(totalReturnExpense.toFixed(2)),
                    netProfit: parseFloat(netProfit.toFixed(2)),
                    totalBuyQty: parseFloat(totalAggregates.buying.qty.toFixed(2)),
                    totalSellQty: parseFloat(totalAggregates.selling.qty.toFixed(2)),
                    totalWastage: parseFloat(totalAggregates.wastage.qty.toFixed(2)),
                    totalReturnedQty: parseFloat(enrichedOps.filter(op => op.OP_TYPE === 11).reduce((sum, op) => sum + (parseFloat(op.CLEARED_QUANTITY) || 0), 0).toFixed(2)),
                    avgBuyPrice: totalAggregates.buying.qty > 0
                        ? parseFloat((totalAggregates.buying.amount / totalAggregates.buying.qty).toFixed(2)) : 0,
                    avgSellPrice: totalAggregates.selling.qty > 0
                        ? parseFloat((totalAggregates.selling.amount / totalAggregates.selling.qty).toFixed(2)) : 0,
                    totalWSImpact: parseFloat(totalWSImpact.toFixed(2)),
                    incomePerKg: parseFloat(incomePerKg.toFixed(5))
                },

                // Transaction List Effect (Buy/Sell movements with signs)
                transactionListEffect: {
                    transactions: allTransactions
                        .filter(tx => tx.TYPE === 'Buying' || tx.TYPE === 'Selling')
                        .map(tx => {
                            const isBuy = tx.TYPE === 'Buying';
                            const qty = parseFloat(tx.QUANTITY) || 0;
                            const amount = parseFloat(tx.TOTAL) || (parseFloat(tx.PRICE) || 0) * qty;
                            return {
                                code: tx.TX_CODE,
                                date: tx.CREATED_DATE,
                                type: tx.TYPE,
                                // Amount: Buy -, Sell +
                                amount: isBuy ? -amount : amount,
                                // Qty: Buy +, Sell -
                                qty: isBuy ? qty : -qty
                            };
                        }),
                    // Also include sales from Stock Operations (Ops 3 & 4)
                    operationSales: enrichedOps
                        .filter(op => (op.OP_TYPE === 3 || op.OP_TYPE === 4) && op.SOLD_QUANTITY > 0)
                        .map(op => ({
                            code: op.OP_CODE,
                            date: op.CREATED_DATE,
                            type: 'Selling (Op)',
                            amount: op.itemTotal || 0,
                            qty: -(op.SOLD_QUANTITY || 0)
                        }))
                }
            }
        });

    } catch (error) {
        console.error('[ReportsDashboard] Analysis error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});


// =====================================================
// 4. GRAPHS DATA ENDPOINT
// =====================================================
router.post('/api/graphs/item-data', async (req, res) => {
    try {
        const { itemId, startDate, endDate, period } = req.body;
        // period: 'Daily', 'Weekly', 'Monthly', 'Yearly'

        if (!itemId || !startDate || !endDate || !period) {
            return res.status(400).json({ success: false, message: 'Missing required parameters' });
        }

        // 0. Fetch Item Master Prices for Profit Calculations
        const [rowsItem] = await pool.query('SELECT SELLING_PRICE, BUYING_PRICE FROM store_items WHERE ITEM_ID = ?', [itemId]);
        const itemInfo = rowsItem[0] || { SELLING_PRICE: 0, BUYING_PRICE: 0 };
        const masterSellPrice = parseFloat(itemInfo.SELLING_PRICE) || 0;
        const masterBuyPrice = parseFloat(itemInfo.BUYING_PRICE) || 0;

        // Helper
        function toLocalYYYYMMDD(dateObj) {
            const y = dateObj.getFullYear();
            const m = String(dateObj.getMonth() + 1).padStart(2, '0');
            const d = String(dateObj.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        function parseDbDate(dInput) {
            if (!dInput) return null;
            if (typeof dInput === 'string') return dInput.split('T')[0].split(' ')[0];
            if (dInput instanceof Date) return toLocalYYYYMMDD(dInput);
            return null;
        }

        // 1. Get running stock up to endDate
        const runningStockQuery = `
            SELECT 
                DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) as tx_date,
                st.STORE_NO,
                SUM(CASE 
                    WHEN st.TYPE IN ('AdjIn', 'Opening', 'Buying', 'TransferIn', 'StockTake') THEN sti.QUANTITY
                    WHEN st.TYPE IN ('AdjOut', 'Selling', 'StockClear', 'TransferOut', 'Wastage') THEN -sti.QUANTITY
                    ELSE 0
                END) as day_change
            FROM store_transactions st
            JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
            WHERE sti.ITEM_ID = ?
              AND st.IS_ACTIVE = 1
              AND sti.IS_ACTIVE = 1
              AND DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) <= ?
            GROUP BY DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}), st.STORE_NO
            ORDER BY tx_date ASC
        `;
        const dailyStockChanges = await pool.query(runningStockQuery, [itemId, endDate]);

        // ... (Price transactions query remains same) ...
        const txQuery = `
            SELECT 
                DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) as tx_date,
                st.TYPE,
                sti.QUANTITY,
                sti.TOTAL
            FROM store_transactions st
            JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
            WHERE sti.ITEM_ID = ?
              AND st.IS_ACTIVE = 1
              AND sti.IS_ACTIVE = 1
              AND st.TYPE IN ('Buying', 'Selling')
              AND st.COMMENTS NOT LIKE '%[OP-%'
              AND st.COMMENTS NOT LIKE '%[S2-%'
              AND st.COMMENTS NOT LIKE '%[S1-%'
              AND DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) >= ?
              AND DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) <= ?
        `;
        const transactions = await pool.query(txQuery, [itemId, startDate, endDate]);

        const opsQuery = `
            SELECT 
                DATE(${OP_SL_TIME_SQL('sso.CREATED_DATE')}) as tx_date,
                'Selling' as TYPE,
                ssoi.SOLD_QUANTITY as QUANTITY,
                ssoi.TOTAL
            FROM store_stock_operations sso
            JOIN store_stock_operation_items ssoi ON sso.OP_ID = ssoi.OP_ID
            WHERE ssoi.ITEM_ID = ?
              AND sso.IS_ACTIVE = 1
              AND ssoi.IS_ACTIVE = 1
              AND sso.OP_TYPE IN (3, 4)
              AND DATE(${OP_SL_TIME_SQL('sso.CREATED_DATE')}) >= ?
              AND DATE(${OP_SL_TIME_SQL('sso.CREATED_DATE')}) <= ?
        `;
        const opTransactions = await pool.query(opsQuery, [itemId, startDate, endDate]);

        const allPriceTransactions = [...transactions, ...opTransactions];

        // 3. Generate date buckets based on period
        const buckets = [];
        let curr = new Date(startDate);
        const endDay = new Date(endDate);

        while (curr <= endDay) {
            let bucketStart = new Date(curr);
            let bucketEnd;
            let label;

            if (period === 'Daily') {
                bucketEnd = new Date(curr);
                label = toLocalYYYYMMDD(bucketStart);
                curr.setDate(curr.getDate() + 1);
            } else if (period === 'Weekly') {
                const day = curr.getDay();
                const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
                bucketStart = new Date(curr.getFullYear(), curr.getMonth(), diff);
                bucketEnd = new Date(bucketStart);
                bucketEnd.setDate(bucketStart.getDate() + 6);

                label = `Week of ${toLocalYYYYMMDD(bucketStart)}`;

                curr = new Date(bucketEnd);
                curr.setDate(curr.getDate() + 1);
            } else if (period === 'Monthly') {
                bucketStart = new Date(curr.getFullYear(), curr.getMonth(), 1);
                bucketEnd = new Date(curr.getFullYear(), curr.getMonth() + 1, 0);
                label = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;

                curr = new Date(bucketEnd);
                curr.setDate(curr.getDate() + 1);
            } else if (period === 'Yearly') {
                bucketStart = new Date(curr.getFullYear(), 0, 1);
                bucketEnd = new Date(curr.getFullYear(), 11, 31);
                label = `${curr.getFullYear()}`;

                curr = new Date(bucketEnd);
                curr.setDate(curr.getDate() + 1);
            }

            buckets.push({
                label,
                startDate: toLocalYYYYMMDD(bucketStart),
                endDate: toLocalYYYYMMDD(bucketEnd),
                buyTotal: 0, buyQty: 0,
                sellTotal: 0, sellQty: 0
            });
        }

        if (buckets.length > 100) {
            return res.status(400).json({ success: false, message: 'Date range too large for selected period (max 100 data points)' });
        }

        // 4. Calculate daily running stock by store
        const runningStockByDate = {}; // will store { date: { s1, s2, total } }
        let currentS1 = 0;
        let currentS2 = 0;

        // Group changes by date first to handle same-day changes in both stores
        const changesByDateAndStore = {};
        for (const record of dailyStockChanges) {
            const dStr = parseDbDate(record.tx_date);
            if (!dStr) continue;
            if (!changesByDateAndStore[dStr]) changesByDateAndStore[dStr] = { 1: 0, 2: 0 };
            changesByDateAndStore[dStr][record.STORE_NO] = parseFloat(record.day_change) || 0;
        }

        let earliestDateStr = dailyStockChanges.length > 0 ? parseDbDate(dailyStockChanges[0].tx_date) : startDate;
        if (!earliestDateStr) earliestDateStr = startDate;

        let trackDateObj = new Date(earliestDateStr);
        if (new Date(startDate) < trackDateObj) trackDateObj = new Date(startDate);
        const maxDateObj = new Date(endDate);

        while (trackDateObj <= maxDateObj) {
            const dStr = toLocalYYYYMMDD(trackDateObj);
            const changes = changesByDateAndStore[dStr] || { 1: 0, 2: 0 };

            currentS1 += parseFloat(changes[1]) || 0;
            currentS2 += parseFloat(changes[2]) || 0;

            runningStockByDate[dStr] = {
                s1: currentS1,
                s2: currentS2,
                total: currentS1 + currentS2
            };
            trackDateObj.setDate(trackDateObj.getDate() + 1);
        }

        // 5. Populate buckets with price data
        let globalTotalBuyAmount = 0;
        let globalTotalBuyQty = 0;
        let globalTotalSellAmount = 0;
        let globalTotalSellQty = 0;

        for (const tx of allPriceTransactions) {
            const txDate = parseDbDate(tx.tx_date);
            const total = parseFloat(tx.TOTAL) || 0;
            const qty = parseFloat(tx.QUANTITY) || 0;

            if (qty <= 0 || !txDate) continue;

            const bucket = buckets.find(b => txDate >= b.startDate && txDate <= b.endDate);
            if (bucket) {
                if (tx.TYPE === 'Buying') {
                    bucket.buyTotal += total;
                    bucket.buyQty += qty;
                    globalTotalBuyAmount += total;
                    globalTotalBuyQty += qty;
                } else if (tx.TYPE === 'Selling') {
                    bucket.sellTotal += total;
                    bucket.sellQty += qty;
                    globalTotalSellAmount += total;
                    globalTotalSellQty += qty;
                }
            }
        }

        // 6. Compute period-wide average profit margin for "smoothed" profit calculation
        const globalAvgBuyPrice = globalTotalBuyQty > 0 ? (globalTotalBuyAmount / globalTotalBuyQty) : masterBuyPrice;
        const globalAvgSellPrice = globalTotalSellQty > 0 ? (globalTotalSellAmount / globalTotalSellQty) : masterSellPrice;
        const globalAvgProfitPerKg = globalAvgSellPrice - globalAvgBuyPrice;

        // 7. Compute final array
        const result = buckets.map(b => {
            let stockAtEndOfBucket = runningStockByDate[b.endDate] || { s1: currentS1, s2: currentS2, total: currentS1 + currentS2 };

            // Profit Calculation (Smoothed logic requested by user)
            // Use global average profit per kg multiplied by current bucket's sold quantity
            const profitSoldAmt = globalAvgProfitPerKg * b.sellQty;

            return {
                label: b.label,
                avgBuyPrice: b.buyQty > 0 ? parseFloat((b.buyTotal / b.buyQty).toFixed(2)) : null,
                avgSellPrice: b.sellQty > 0 ? parseFloat((b.sellTotal / b.sellQty).toFixed(2)) : null,
                sellAmount: parseFloat(b.sellTotal.toFixed(2)),
                buyAmount: parseFloat(b.buyTotal.toFixed(2)),
                profitSoldAmt: parseFloat(profitSoldAmt.toFixed(2)),
                stockS1: parseFloat(stockAtEndOfBucket.s1.toFixed(3)),
                stockS2: parseFloat(stockAtEndOfBucket.s2.toFixed(3)),
                stock: parseFloat(stockAtEndOfBucket.total.toFixed(3))
            };
        });

        // If bucket is entirely in the future (no stock data computed), it defaults to trackStock (last known stock).

        return res.json({ success: true, result });
    } catch (error) {
        console.error('[GraphsAPI] Error fetching graph data:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// =====================================================
// STOCK EVENTS - Event-by-Event Inventory for Graphs Page
// =====================================================
// Returns every individual transaction and stock operation event
// as a separate data point with cumulative Store 1 / Store 2 / Total stock.
// Uses IDENTICAL SLT conversion logic as analyze-period.
router.post('/api/graphs/stock-events', async (req, res) => {
    try {
        const { itemId, startDatetime, endDatetime } = req.body;

        if (!itemId || !startDatetime || !endDatetime) {
            return res.status(400).json({ success: false, message: 'itemId, startDatetime, endDatetime are required' });
        }

        // -------------------------------------------------------
        // Helpers
        // -------------------------------------------------------
        const normalizeTime = (t) => {
            if (!t) return null;
            if (typeof t === 'string') return t.replace('T', ' ').replace('.000Z', '');
            if (t instanceof Date) {
                const y = t.getUTCFullYear(), mo = String(t.getUTCMonth() + 1).padStart(2, '0');
                const d = String(t.getUTCDate()).padStart(2, '0');
                const hh = String(t.getUTCHours()).padStart(2, '0');
                const mm = String(t.getUTCMinutes()).padStart(2, '0');
                const ss = String(t.getUTCSeconds()).padStart(2, '0');
                return `${y}-${mo}-${d} ${hh}:${mm}:${ss}`;
            }
            return String(t);
        };

        // Format "2026-01-28 14:32:00" → "28 Jan 14:32"
        const formatLabel = (timeStr) => {
            if (!timeStr) return timeStr;
            try {
                const parts = timeStr.split(' ');
                const dateParts = (parts[0] || '').split('-');
                const timeParts = (parts[1] || '00:00:00').split(':');
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${dateParts[2]} ${months[parseInt(dateParts[1], 10) - 1]} ${timeParts[0]}:${timeParts[1]}`;
            } catch (e) { return timeStr; }
        };

        const OP_TYPE_LABEL_MAP = {
            1: 'Full Clear', 2: 'Partial Clear', 3: 'Full Clear + Sale',
            4: 'Partial Clear + Sale', 5: 'Transfer', 6: 'Transfer + Clear',
            7: 'Partial + Lorry', 8: 'Full + Lorry', 9: 'Conversion',
            11: 'Stock Return', 12: 'Transfer S1→S2', 13: 'Transfer S2→S1'
        };
        const TX_SIGN = {
            'Buying': 1, 'AdjIn': 1, 'Opening': 1, 'TransferIn': 1, 'StockTake': 1,
            'Selling': -1, 'AdjOut': -1, 'StockClear': -1, 'TransferOut': -1, 'Wastage': -1
        };

        // -------------------------------------------------------
        // STEP 0: Opening stock — all transactions up to and including startDatetime
        // -------------------------------------------------------
        const initialStockByStore = { 1: 0, 2: 0 };
        for (const storeNo of [1, 2]) {
            const [result] = await pool.query(`
                SELECT COALESCE(SUM(CASE
                    WHEN st.TYPE IN ('AdjIn', 'Opening', 'Buying', 'TransferIn', 'StockTake') THEN sti.QUANTITY
                    WHEN st.TYPE IN ('AdjOut', 'Selling', 'StockClear', 'TransferOut', 'Wastage') THEN -sti.QUANTITY
                    ELSE 0
                END), 0) as stock_level
                FROM store_transactions st
                JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                WHERE sti.ITEM_ID = ?
                  AND st.STORE_NO = ?
                  AND st.IS_ACTIVE = 1
                  AND sti.IS_ACTIVE = 1
                  AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} <= ?
            `, [itemId, storeNo, startDatetime]);
            initialStockByStore[storeNo] = parseFloat(result?.stock_level) || 0;
        }

        // Closing stock — all transactions up to and including endDatetime
        const finalStockByStore = { 1: 0, 2: 0 };
        for (const storeNo of [1, 2]) {
            const [result] = await pool.query(`
                SELECT COALESCE(SUM(CASE
                    WHEN st.TYPE IN ('AdjIn', 'Opening', 'Buying', 'TransferIn', 'StockTake') THEN sti.QUANTITY
                    WHEN st.TYPE IN ('AdjOut', 'Selling', 'StockClear', 'TransferOut', 'Wastage') THEN -sti.QUANTITY
                    ELSE 0
                END), 0) as stock_level
                FROM store_transactions st
                JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                WHERE sti.ITEM_ID = ?
                  AND st.STORE_NO = ?
                  AND st.IS_ACTIVE = 1
                  AND sti.IS_ACTIVE = 1
                  AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} <= ?
            `, [itemId, storeNo, endDatetime]);
            finalStockByStore[storeNo] = parseFloat(result?.stock_level) || 0;
        }

        // -------------------------------------------------------
        // STEP 1: Fetch individual transaction events strictly BETWEEN
        // startDatetime (exclusive) and endDatetime (inclusive)
        // -------------------------------------------------------
        const txEventsQuery = `
            SELECT
                ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} as event_time,
                st.TYPE as event_type,
                'transaction' as event_source,
                st.STORE_NO,
                st.CODE as tx_code,
                st.COMMENTS,
                sti.QUANTITY,
                sti.TOTAL
            FROM store_transactions st
            JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
            WHERE sti.ITEM_ID = ?
              AND st.IS_ACTIVE = 1
              AND sti.IS_ACTIVE = 1
              AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} > ?
              AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} <= ?
            ORDER BY event_time ASC
        `;
        const txEvents = await pool.query(txEventsQuery, [itemId, startDatetime, endDatetime]);

        // -------------------------------------------------------
        // STEP 2: Fetch stock operation events in the same window
        // -------------------------------------------------------
        const opEventsQuery = `
            SELECT
                ${OP_SL_TIME_SQL('sso.CREATED_DATE')} as event_time,
                sso.OP_TYPE as event_type,
                'stock_operation' as event_source,
                sso.STORE_NO,
                sso.OP_CODE as tx_code,
                sso.COMMENTS,
                ssoi.CLEARED_QUANTITY as QUANTITY,
                ssoi.TOTAL,
                ssoi.ORIGINAL_STOCK
            FROM store_stock_operations sso
            JOIN store_stock_operation_items ssoi ON sso.OP_ID = ssoi.OP_ID
            WHERE ssoi.ITEM_ID = ?
              AND sso.IS_ACTIVE = 1
              AND ssoi.IS_ACTIVE = 1
              AND ${OP_SL_TIME_SQL('sso.CREATED_DATE')} > ?
              AND ${OP_SL_TIME_SQL('sso.CREATED_DATE')} <= ?
            ORDER BY event_time ASC
        `;
        const opEvents = await pool.query(opEventsQuery, [itemId, startDatetime, endDatetime]);

        // -------------------------------------------------------
        // STEP 3: Merge + sort all events chronologically
        // -------------------------------------------------------
        const allEvents = [];

        for (const tx of txEvents) {
            const sign = TX_SIGN[tx.event_type] ?? 0;
            const qty = parseFloat(tx.QUANTITY) || 0;
            const timeStr = normalizeTime(tx.event_time);
            allEvents.push({
                event_time: timeStr,
                label: formatLabel(timeStr),
                event_type: tx.event_type,
                event_source: tx.event_source,
                storeNo: tx.STORE_NO || 1,
                tx_code: tx.tx_code,
                delta_s1: tx.STORE_NO === 1 ? sign * qty : 0,
                delta_s2: tx.STORE_NO === 2 ? sign * qty : 0
            });
        }

        for (const op of opEvents) {
            const qty = parseFloat(op.QUANTITY) || 0;
            const opTypeNum = parseInt(op.event_type);
            const timeStr = normalizeTime(op.event_time);
            allEvents.push({
                event_time: timeStr,
                label: formatLabel(timeStr),
                event_type: OP_TYPE_LABEL_MAP[opTypeNum] || `Op ${opTypeNum}`,
                event_source: op.event_source,
                storeNo: op.STORE_NO || 1,
                tx_code: op.tx_code,
                delta_s1: op.STORE_NO === 1 ? -qty : 0,
                delta_s2: op.STORE_NO === 2 ? -qty : 0
            });
        }

        allEvents.sort((a, b) => (a.event_time > b.event_time ? 1 : -1));

        // -------------------------------------------------------
        // STEP 4: Build result points + accumulate summary by type
        // -------------------------------------------------------
        let runS1 = initialStockByStore[1];
        let runS2 = initialStockByStore[2];

        const resultPoints = [];
        const summaryByType = {}; // { typeName: { s1: number, s2: number } }

        // Opening anchor point
        resultPoints.push({
            time: startDatetime,
            label: formatLabel(startDatetime),
            event_type: 'Period Start',
            event_source: 'snapshot',
            tx_code: null,
            storeNo: null,
            delta: 0, delta_s1: 0, delta_s2: 0,
            prev_s1: null, prev_s2: null, prev_total: null,
            s1: parseFloat(runS1.toFixed(3)),
            s2: parseFloat(runS2.toFixed(3)),
            total: parseFloat((runS1 + runS2).toFixed(3))
        });

        for (const ev of allEvents) {
            if (!ev.event_time) continue;
            const prevS1 = parseFloat(runS1.toFixed(3));
            const prevS2 = parseFloat(runS2.toFixed(3));
            const prevTotal = parseFloat((runS1 + runS2).toFixed(3));

            runS1 += ev.delta_s1;
            runS2 += ev.delta_s2;

            // Accumulate summary
            if (!summaryByType[ev.event_type]) {
                summaryByType[ev.event_type] = { s1: 0, s2: 0 };
            }
            summaryByType[ev.event_type].s1 += ev.delta_s1;
            summaryByType[ev.event_type].s2 += ev.delta_s2;

            resultPoints.push({
                time: ev.event_time,
                label: ev.label,
                event_type: ev.event_type,
                event_source: ev.event_source,
                tx_code: ev.tx_code,
                storeNo: ev.storeNo,
                delta: parseFloat((ev.delta_s1 + ev.delta_s2).toFixed(3)),
                delta_s1: parseFloat(ev.delta_s1.toFixed(3)),
                delta_s2: parseFloat(ev.delta_s2.toFixed(3)),
                prev_s1: prevS1,
                prev_s2: prevS2,
                prev_total: prevTotal,
                s1: parseFloat(runS1.toFixed(3)),
                s2: parseFloat(runS2.toFixed(3)),
                total: parseFloat((runS1 + runS2).toFixed(3))
            });
        }

        // Closing cap point
        const lastPoint = resultPoints[resultPoints.length - 1];
        const finalS1 = parseFloat(finalStockByStore[1].toFixed(3));
        const finalS2 = parseFloat(finalStockByStore[2].toFixed(3));
        const finalTotal = parseFloat((finalStockByStore[1] + finalStockByStore[2]).toFixed(3));

        if (!lastPoint || lastPoint.event_source === 'snapshot' ||
            lastPoint.s1 !== finalS1 || lastPoint.s2 !== finalS2) {
            resultPoints.push({
                time: endDatetime,
                label: formatLabel(endDatetime),
                event_type: 'Period End',
                event_source: 'snapshot',
                tx_code: null,
                storeNo: null,
                delta: 0, delta_s1: 0, delta_s2: 0,
                prev_s1: null, prev_s2: null, prev_total: null,
                s1: finalS1,
                s2: finalS2,
                total: finalTotal
            });
        }

        // -------------------------------------------------------
        // STEP 5: Build summary table rows
        // -------------------------------------------------------
        const byType = Object.entries(summaryByType).map(([type, vals]) => ({
            type,
            s1: parseFloat(vals.s1.toFixed(3)),
            s2: parseFloat(vals.s2.toFixed(3)),
            net: parseFloat((vals.s1 + vals.s2).toFixed(3))
        }));

        // -------------------------------------------------------
        // STEP 6: Mathematical Validation
        // opening + sum(all deltas) should equal closing
        // -------------------------------------------------------
        const openingS1 = parseFloat(initialStockByStore[1].toFixed(3));
        const openingS2 = parseFloat(initialStockByStore[2].toFixed(3));
        const openingTotal = parseFloat((openingS1 + openingS2).toFixed(3));

        const deltaS1Sum = parseFloat(allEvents.reduce((acc, e) => acc + e.delta_s1, 0).toFixed(3));
        const deltaS2Sum = parseFloat(allEvents.reduce((acc, e) => acc + e.delta_s2, 0).toFixed(3));

        const expectedS1 = parseFloat((openingS1 + deltaS1Sum).toFixed(3));
        const expectedS2 = parseFloat((openingS2 + deltaS2Sum).toFixed(3));
        const expectedTotal = parseFloat((expectedS1 + expectedS2).toFixed(3));

        const discrepancyS1 = parseFloat((finalS1 - expectedS1).toFixed(3));
        const discrepancyS2 = parseFloat((finalS2 - expectedS2).toFixed(3));
        const discrepancyTotal = parseFloat((finalTotal - expectedTotal).toFixed(3));
        const valid = discrepancyS1 === 0 && discrepancyS2 === 0;

        // If invalid, identify the event(s) most likely at fault
        // (any event where running total differs from expected by > 0.001)
        const issues = [];
        if (!valid) {
            let chkS1 = openingS1, chkS2 = openingS2;
            for (const ev of allEvents) {
                chkS1 += ev.delta_s1;
                chkS2 += ev.delta_s2;
                // Flag if delta is suspiciously zero for a non-snapshot event
                if (ev.delta_s1 === 0 && ev.delta_s2 === 0) {
                    issues.push({
                        time: ev.event_time,
                        type: ev.event_type,
                        tx_code: ev.tx_code,
                        reason: 'Event recorded zero quantity change'
                    });
                }
            }
            // If no zero-delta events found, flag the discrepancy itself
            if (issues.length === 0) {
                issues.push({
                    time: null,
                    type: null,
                    tx_code: null,
                    reason: `Cannot pin to a specific event. Total discrepancy: S1=${discrepancyS1}kg, S2=${discrepancyS2}kg. Possible external modification to stock not captured in transaction log.`
                });
            }
        }

        const summary = {
            opening: { s1: openingS1, s2: openingS2, total: openingTotal },
            closing: { s1: finalS1, s2: finalS2, total: finalTotal },
            deltaSum: { s1: deltaS1Sum, s2: deltaS2Sum, total: parseFloat((deltaS1Sum + deltaS2Sum).toFixed(3)) },
            byType,
            validation: {
                valid,
                expected: { s1: expectedS1, s2: expectedS2, total: expectedTotal },
                actual: { s1: finalS1, s2: finalS2, total: finalTotal },
                discrepancy: { s1: discrepancyS1, s2: discrepancyS2, total: discrepancyTotal },
                issues
            }
        };

        return res.json({ success: true, result: resultPoints, summary });

    } catch (error) {
        console.error('[GraphsAPI] Error fetching stock events:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});


module.exports = router;
