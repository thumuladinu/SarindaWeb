const fs = require('fs');

const code = `
// =====================================================
// NEW: DAILY STORE REPORT (80mm summary)
// =====================================================
router.post('/api/reports-dashboard/daily-store-report', async (req, res) => {
    try {
        const { storeNo, date, detailed, itemIds } = req.body;
        if (!storeNo || !date) {
            return res.status(400).json({ success: false, message: 'Missing storeNo or date' });
        }

        // 1. Calculate Overall P&L (Total Income vs Total Outgoes)
        // using SL Time SQL
        const pnlQuery = \`
            SELECT 
                SUM(CASE WHEN TYPE = 'Selling' THEN SUB_TOTAL ELSE 0 END) as totalIncome,
                SUM(CASE WHEN TYPE IN ('Buying', 'Expenses') THEN SUB_TOTAL ELSE 0 END) as totalOutgoes
            FROM store_transactions st
            WHERE st.IS_ACTIVE = 1 
              AND st.STORE_NO = ?
              AND DATE(\${STOCK_CALC_TIME_SQL('st.CREATED_DATE', 'st.CODE', 'st.WEIGHT_CODE', 'st.STOCK_DATE')}) = ?
        \`;
        
        const [pnlResult] = await pool.query(pnlQuery, [storeNo, date]);
        
        let itemsSummary = [];
        
        if (detailed) {
            let itemFilter = "";
            let params = [storeNo, date];
            if (itemIds && itemIds.length > 0) {
                itemFilter = \` AND sti.ITEM_ID IN (\${itemIds.map(() => '?').join(',')})\`;
                params.push(...itemIds);
            }
            
            const itemsQuery = \`
                SELECT 
                    sti.ITEM_ID,
                    si.NAME as ITEM_NAME,
                    st.TYPE,
                    st.CODE,
                    sti.QUANTITY,
                    sti.TOTAL
                FROM store_transactions st
                JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                JOIN store_items si ON sti.ITEM_ID = si.ITEM_ID
                WHERE st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1
                  AND st.STORE_NO = ?
                  AND DATE(\${STOCK_CALC_TIME_SQL('st.CREATED_DATE', 'st.CODE', 'st.WEIGHT_CODE', 'st.STOCK_DATE')}) = ?
                  AND st.TYPE IN ('Selling', 'Buying', 'TransferIn', 'TransferOut', 'AdjIn', 'AdjOut', 'StockClear')
                  \${itemFilter}
                ORDER BY st.CREATED_DATE ASC
            \`;
            
            const txItems = await pool.query(itemsQuery, params);
            
            // Group by item
            const grouped = {};
            txItems.forEach(row => {
                if (!grouped[row.ITEM_ID]) {
                    grouped[row.ITEM_ID] = {
                        itemId: row.ITEM_ID,
                        itemName: row.ITEM_NAME,
                        totalIn: 0,
                        totalOut: 0,
                        bills: []
                    };
                }
                
                const item = grouped[row.ITEM_ID];
                let isOut = ['Selling', 'TransferOut', 'AdjOut', 'StockClear'].includes(row.TYPE);
                let isIn = ['Buying', 'TransferIn', 'AdjIn'].includes(row.TYPE);
                
                if (isIn) item.totalIn += parseFloat(row.QUANTITY) || 0;
                if (isOut) item.totalOut += parseFloat(row.QUANTITY) || 0;
                
                // Short code (last part after '-')
                let shortCode = row.CODE || 'N/A';
                if (shortCode.includes('-')) {
                    const parts = shortCode.split('-');
                    shortCode = parts[parts.length - 1];
                }
                
                item.bills.push({
                    code: shortCode,
                    type: isIn ? 'IN' : 'OUT',
                    fullType: row.TYPE,
                    qty: parseFloat(row.QUANTITY) || 0,
                    amount: parseFloat(row.TOTAL) || 0
                });
            });
            
            itemsSummary = Object.values(grouped);
        }

        return res.json({
            success: true,
            date,
            storeNo,
            summary: {
                totalIncome: parseFloat(pnlResult.totalIncome) || 0,
                totalOutgoes: parseFloat(pnlResult.totalOutgoes) || 0,
                profit: (parseFloat(pnlResult.totalIncome) || 0) - (parseFloat(pnlResult.totalOutgoes) || 0)
            },
            itemsSummary
        });

    } catch (error) {
        console.error('[ReportsDashboard] Error generating daily store report:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
`;

const file = 'reportsDashboardRoutes.js';
let content = fs.readFileSync(file, 'utf8');
content = content.replace('module.exports = router;', code);
fs.writeFileSync(file, content);
console.log('Endpoint appended to reportsDashboardRoutes.js');
