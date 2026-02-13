const calculateCurrentStock = async (pool, itemId, storeNo) => {
    // UNIFIED STOCK CALCULATION QUERY
    // This query MUST be the single source of truth for stock calculations across the app.
    // It includes ALL transaction types:
    // Positive: AdjIn, Opening, Buying, TransferIn, StockTake
    // Negative: AdjOut, Selling, StockClear, TransferOut, Wastage

    try {
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
        `, [itemId, storeNo]);

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
