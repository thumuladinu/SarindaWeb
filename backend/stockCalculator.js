// SQL Helper for selective SL Time conversion
// Server-created records (Actual UTC) -> Shift to SLT
// Synced records (Already SLT string) -> Keep as-is
const SL_TIME_SQL = (field = 'st.CREATED_DATE', codeField = 'st.CODE') => `
    CASE 
        WHEN ${codeField} IS NULL 
             OR ${codeField} LIKE 'ADJ-%' 
             OR ${codeField} LIKE 'STOCKOP-%' 
             OR ${codeField} LIKE 'SLO-%'
             OR ${codeField} LIKE 'WEB-%'
             OR ${codeField} LIKE '%-WEB-%'
             OR ${codeField} LIKE '%-SLO-%'
             OR ${codeField} LIKE 'RETURN-EXP-%'
             OR ${codeField} LIKE 'TX-%'
        THEN CONVERT_TZ(${field}, '+00:00', '+05:30')
        ELSE ${field}
    END
`;

const calculateCurrentStock = async (pool, itemId, storeNo, upToTimestamp = null) => {
    console.log(`[stockCalculator] Calculating stock for Item ${itemId} Store ${storeNo} at ${upToTimestamp}`);
    // UNIFIED STOCK CALCULATION QUERY
    // This query MUST be the single source of truth for stock calculations across the app.
    // It includes ALL transaction types:
    // Positive: AdjIn, Opening, Buying, TransferIn, StockTake
    // Negative: AdjOut, Selling, StockClear, TransferOut, Wastage

    try {
        // Build query conditions
        let timeCondition = "";
        const queryParams = [itemId, storeNo];

        if (upToTimestamp) {
            timeCondition = `AND ${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')} <= ?`;
            queryParams.push(upToTimestamp);
        }

        // Use pool.promise() to get a promise-based wrapper directly
        const [rows] = await pool.promise().query(`
            SELECT 
                COALESCE(SUM(CASE 
                    WHEN st.TYPE IN ('AdjIn', 'Opening', 'Buying', 'TransferIn', 'StockTake') THEN sti.QUANTITY
                    WHEN st.TYPE IN ('AdjOut', 'Selling', 'StockClear', 'TransferOut', 'Wastage') THEN -sti.QUANTITY
                    ELSE 0
                END), 0) as STOCK
            FROM store_transactions st
            JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
            WHERE sti.ITEM_ID = ? 
              AND st.IS_ACTIVE = 1 
              AND sti.IS_ACTIVE = 1
              AND st.STORE_NO = ?
              ${timeCondition}
        `, queryParams);


        const stock = parseFloat(rows[0]?.STOCK) || 0;

        // Debug Log (can be disabled in production)
        if (itemId == 860) {
            console.log(`[stockCalculator] Item ${itemId} Store ${storeNo}: ${stock.toFixed(2)}kg`);
        }

        return stock;

    } catch (error) {
        console.error(`[stockCalculator] Error calculating stock for Item ${itemId} Store ${storeNo}:`, error);
        throw error;
    }
};

module.exports = { calculateCurrentStock };
