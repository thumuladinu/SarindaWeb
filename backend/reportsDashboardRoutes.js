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

// =====================================================
// 1. GET ITEMS LIST (for dashboard item selection)
// =====================================================
router.get('/api/reports-dashboard/items', async (req, res) => {
    try {
        const items = await pool.query(
            `SELECT ITEM_ID, CODE, NAME, BUYING_PRICE, SELLING_PRICE 
             FROM store_items WHERE IS_ACTIVE = 1 
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

        // Only fetch Full Clearance operations: OP_TYPE IN (1, 3, 8)
        // Excludes Transfer Full Clear (6) and Item Conversion (9)
        let clearanceQuery = `
            SELECT DISTINCT
                sso.OP_ID,
                sso.OP_CODE,
                sso.OP_TYPE,
                sso.CLEARANCE_TYPE,
                sso.DATE as OP_DATE,
                sso.CREATED_DATE,
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
              AND sso.CLEARANCE_TYPE = 'FULL'
              AND sso.OP_TYPE IN (1, 3, 8)
            ORDER BY sso.CREATED_DATE DESC
            LIMIT 30
        `;

        const clearances = await pool.query(clearanceQuery, [itemId]);

        // Also find "natural zero" points via running stock
        const runningStockQuery = `
            SELECT 
                DATE(st.CREATED_DATE) as tx_date,
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
            GROUP BY DATE(st.CREATED_DATE)
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
                `SELECT MAX(st.CREATED_DATE) as max_date 
                 FROM store_transactions st 
                 WHERE st.COMMENTS LIKE ? AND st.IS_ACTIVE = 1`,
                [`%[${opRow.OP_CODE}]%`]
            );
            // Use latest transaction datetime, or operation's own datetime
            return latestTx?.max_date || opRow.CREATED_DATE;
        };

        if (startOpId) {
            const resolved = await findOpBoundary(startOpId);
            if (resolved) startBoundary = resolved;
        }
        if (endOpId) {
            const resolved = await findOpBoundary(endOpId);
            if (resolved) endBoundary = resolved;
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
                  AND st.CREATED_DATE <= ?
            `, [itemId, storeNo, startBoundary]);
            initialStockByStore[storeNo] = parseFloat(result?.stock_level) || 0;
        }

        // ==========================================
        // B. TRANSACTIONS BY STORE (between boundaries)
        // ==========================================
        // Uses full datetime comparison, not DATE() truncation
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
              AND st.CREATED_DATE > ?
              AND st.CREATED_DATE <= ?
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
        // Use ssoi.STORE_NO = sso.STORE_NO OR ssoi.STORE_NO IS NULL to get primary item row only
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
              AND (ssoi.STORE_NO = sso.STORE_NO OR ssoi.STORE_NO IS NULL)
            WHERE ssoi.ITEM_ID = ?
              AND sso.IS_ACTIVE = 1
              AND ssoi.IS_ACTIVE = 1
              AND sso.CREATED_DATE > ?
              AND sso.CREATED_DATE <= ?
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

        // Also get returns AFTER the final clearance (they count as stock changes)
        const returnsAfterQuery = `
            SELECT 
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
              AND (ssoi.STORE_NO = sso.STORE_NO OR ssoi.STORE_NO IS NULL)
            WHERE ssoi.ITEM_ID = ?
              AND sso.IS_ACTIVE = 1
              AND ssoi.IS_ACTIVE = 1
              AND sso.OP_TYPE = 11
              AND sso.CREATED_DATE > ?
              AND sso.REFERENCE_OP_ID IS NOT NULL
            ORDER BY sso.CREATED_DATE ASC
            LIMIT 20
        `;
        const returnsAfter = await pool.query(returnsAfterQuery, [itemId, endBoundary]);

        // Enrich stock operations with conversion details
        // DEDUPLICATE by OP_ID (JOIN can produce duplicates)
        const enrichedOps = [];
        const seenOpIds = new Set();
        // Exclude the initial clearance operation (startOpId), include final (endOpId)
        const allOpsRaw = [...rawStockOps, ...finalOpRow, ...returnsAfter].filter(op => {
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
                // For conversions (OP_TYPE 9), calculate wastage from source - dest quantities
                WASTAGE_AMOUNT: op.OP_TYPE === 9
                    ? Math.max(0, (parseFloat(op.ORIGINAL_STOCK) || 0) - totalDestQty)
                    : (parseFloat(op.WASTAGE_AMOUNT) || 0),
                SURPLUS_AMOUNT: op.OP_TYPE === 9
                    ? Math.max(0, totalDestQty - (parseFloat(op.ORIGINAL_STOCK) || 0))
                    : (parseFloat(op.SURPLUS_AMOUNT) || 0),
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
                isReturnAfterClear: returnsAfter.some(r => r.OP_ID === op.OP_ID),
                conversions: conversions.map(c => ({
                    sourceItemId: c.SOURCE_ITEM_ID,
                    sourceItemName: c.SOURCE_ITEM_NAME,
                    sourceItemCode: c.SOURCE_ITEM_CODE,
                    sourceQuantity: parseFloat(c.SOURCE_QUANTITY) || 0,
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
                soc.SOURCE_ITEM_NAME,
                soc.SOURCE_ITEM_CODE,
                soc.SOURCE_QUANTITY,
                soc.DEST_ITEM_ID,
                soc.DEST_ITEM_NAME,
                soc.DEST_ITEM_CODE,
                soc.DEST_QUANTITY
            FROM store_stock_operation_conversions soc
            JOIN store_stock_operations sso ON soc.OP_ID = sso.OP_ID
            WHERE soc.SOURCE_ITEM_ID = ?
              AND sso.IS_ACTIVE = 1
              AND soc.IS_ACTIVE = 1
              AND sso.CREATED_DATE > ?
              AND sso.CREATED_DATE <= ?
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
                soc.SOURCE_ITEM_NAME,
                soc.SOURCE_ITEM_CODE,
                soc.SOURCE_QUANTITY,
                soc.DEST_ITEM_ID,
                soc.DEST_ITEM_NAME,
                soc.DEST_ITEM_CODE,
                soc.DEST_QUANTITY
            FROM store_stock_operation_conversions soc
            JOIN store_stock_operations sso ON soc.OP_ID = sso.OP_ID
            WHERE soc.DEST_ITEM_ID = ?
              AND sso.IS_ACTIVE = 1
              AND soc.IS_ACTIVE = 1
              AND sso.CREATED_DATE > ?
              AND sso.CREATED_DATE <= ?
        `;
        const conversionsIn = await pool.query(conversionsInQuery, [itemId, startBoundary, endBoundary]);

        // Build conversion analysis with P&L
        const conversionAnalysis = [];
        for (const conv of conversionsOut) {
            const destQty = parseFloat(conv.DEST_QUANTITY) || 0;
            // SOURCE_QUANTITY is often 0/null in DB, fallback to DEST_QUANTITY
            const sourceQty = parseFloat(conv.SOURCE_QUANTITY) || destQty;
            const [destItem] = await pool.query(
                'SELECT SELLING_PRICE, BUYING_PRICE FROM store_items WHERE ITEM_ID = ?',
                [conv.DEST_ITEM_ID]
            );
            const sourcePrice = parseFloat(itemInfo.SELLING_PRICE) || 0;
            const destPrice = parseFloat(destItem?.SELLING_PRICE) || 0;

            conversionAnalysis.push({
                opCode: conv.OP_CODE,
                opId: conv.OP_ID,
                opType: conv.OP_TYPE,
                date: conv.CREATED_DATE,
                storeNo: conv.STORE_NO,
                sourceItemName: conv.SOURCE_ITEM_NAME,
                sourceQty, sourcePrice,
                sourceValue: sourceQty * sourcePrice,
                destItemId: conv.DEST_ITEM_ID,
                destItemName: conv.DEST_ITEM_NAME,
                destItemCode: conv.DEST_ITEM_CODE,
                destQty, destPrice,
                destValue: destQty * destPrice,
                wastageQty: sourceQty - destQty,
                profitLoss: (destQty * destPrice) - (sourceQty * sourcePrice),
                type: 'out'
            });
        }

        for (const conv of conversionsIn) {
            const destQty = parseFloat(conv.DEST_QUANTITY) || 0;
            // SOURCE_QUANTITY is often 0/null in DB, fallback to DEST_QUANTITY
            const sourceQty = parseFloat(conv.SOURCE_QUANTITY) || destQty;
            const [srcItem] = await pool.query(
                'SELECT SELLING_PRICE, BUYING_PRICE FROM store_items WHERE ITEM_ID = ?',
                [conv.SOURCE_ITEM_ID]
            );
            const sourcePrice = parseFloat(srcItem?.SELLING_PRICE) || 0;
            const destPrice = parseFloat(itemInfo.SELLING_PRICE) || 0;

            conversionAnalysis.push({
                opCode: conv.OP_CODE,
                opId: conv.OP_ID,
                opType: conv.OP_TYPE,
                date: conv.CREATED_DATE,
                storeNo: conv.STORE_NO,
                sourceItemId: conv.SOURCE_ITEM_ID,
                sourceItemName: conv.SOURCE_ITEM_NAME,
                sourceItemCode: conv.SOURCE_ITEM_CODE,
                sourceQty, sourcePrice,
                sourceValue: sourceQty * sourcePrice,
                destItemName: conv.DEST_ITEM_NAME,
                destQty, destPrice,
                destValue: destQty * destPrice,
                profitLoss: (destQty * destPrice) - (sourceQty * sourcePrice),
                type: 'in'
            });
        }

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
                  AND st.CREATED_DATE <= ?
            `, [itemId, storeNo, endBoundary]);
            finalStockByStore[storeNo] = parseFloat(result?.stock_level) || 0;
        }

        // ==========================================
        // G. DAILY CHART DATA (combined both stores)
        // ==========================================
        const dailyQuery = `
            SELECT 
                DATE(st.CREATED_DATE) as tx_date,
                st.TYPE,
                st.STORE_NO,
                SUM(sti.QUANTITY) as total_qty,
                SUM(sti.TOTAL) as total_amount
            FROM store_transactions st
            JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
            WHERE sti.ITEM_ID = ?
              AND st.IS_ACTIVE = 1
              AND sti.IS_ACTIVE = 1
              AND st.CREATED_DATE > ?
              AND st.CREATED_DATE <= ?
            GROUP BY DATE(st.CREATED_DATE), st.TYPE, st.STORE_NO
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
            const dateKey = d.toISOString().split('T')[0];
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
        // H. FINANCIAL SUMMARY
        // ==========================================
        const totalRevenue = totalAggregates.selling.amount;
        const totalCost = totalAggregates.buying.amount;
        const conversionPL = conversionAnalysis.reduce((sum, c) => sum + (c.profitLoss || 0), 0);
        const grossProfit = totalRevenue - totalCost;
        const netProfit = grossProfit + conversionPL;

        // Total wastage from operations
        const totalOperationWastage = enrichedOps.reduce((sum, op) => sum + (op.WASTAGE_AMOUNT || 0), 0);
        const totalOperationSurplus = enrichedOps.reduce((sum, op) => sum + (op.SURPLUS_AMOUNT || 0), 0);

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
                conversions: conversionAnalysis,

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
                    netProfit: parseFloat(netProfit.toFixed(2)),
                    totalBuyQty: parseFloat(totalAggregates.buying.qty.toFixed(2)),
                    totalSellQty: parseFloat(totalAggregates.selling.qty.toFixed(2)),
                    totalWastage: parseFloat(totalAggregates.wastage.qty.toFixed(2)),
                    avgBuyPrice: totalAggregates.buying.qty > 0
                        ? parseFloat((totalAggregates.buying.amount / totalAggregates.buying.qty).toFixed(2)) : 0,
                    avgSellPrice: totalAggregates.selling.qty > 0
                        ? parseFloat((totalAggregates.selling.amount / totalAggregates.selling.qty).toFixed(2)) : 0
                }
            }
        });

    } catch (error) {
        console.error('[ReportsDashboard] Analysis error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
