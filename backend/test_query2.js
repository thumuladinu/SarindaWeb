const mysql = require('mysql2');
const util = require('util');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chamika_rice_mill',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
});

pool.query = util.promisify(pool.query);

async function test() {
    try {
        const stockOpsQuery = `
            SELECT 
                so.OP_ID,
                so.OP_CODE as CODE,
                so.REFERENCE_OP_ID,
                parent_op.OP_CODE as REF_OP_CODE,
                parent_op.BILL_CODE as REF_BILL_CODE,
                so.OP_TYPE,
                so.CLEARANCE_TYPE,
                so.STORE_NO,
                so.COMMENTS,
                so.CREATED_DATE,
                so.CREATED_BY,
                so.CREATED_BY_NAME,
                so.WASTAGE_AMOUNT,
                so.SURPLUS_AMOUNT,
                so.CUSTOMER_NAME,
                so.LORRY_NAME,
                so.DRIVER_NAME,
                so.DESTINATION,
                so.BILL_CODE,
                so.BILL_AMOUNT,
                st_bill.SUB_TOTAL as TRANSACTION_BILL_AMOUNT,
                'stock_operation' as SOURCE_TYPE,
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
                    WHEN 10 THEN 'Cash Float Adjustment'
                    WHEN 11 THEN 'Stock Return'
                    ELSE 'Stock Operation'
                END AS OP_TYPE_NAME
            FROM store_stock_operations so
            LEFT JOIN store_stock_operations parent_op ON so.REFERENCE_OP_ID = parent_op.OP_ID
            LEFT JOIN store_transactions st_bill ON so.BILL_CODE = st_bill.CODE AND st_bill.IS_ACTIVE = 1
            WHERE so.IS_ACTIVE = 1
        `;
        let stockOpsRows = [];
        try {
            stockOpsRows = await pool.query(stockOpsQuery);

            for (let op of stockOpsRows) {
                op.items = await pool.query(
                    'SELECT * FROM store_stock_operation_items WHERE OP_ID = ? AND IS_ACTIVE = 1',
                    [op.OP_ID]
                );
                op.conversions = await pool.query(
                    'SELECT * FROM store_stock_operation_conversions WHERE OP_ID = ? AND IS_ACTIVE = 1',
                    [op.OP_ID]
                );

                const txQuery = `
                    SELECT st.TYPE, sti.QUANTITY, sti.ITEM_ID, i.NAME as ITEM_NAME, i.CODE as ITEM_CODE
                    FROM store_transactions st
                    JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                    LEFT JOIN store_items i ON sti.ITEM_ID = i.ITEM_ID
                    WHERE st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1 
                      AND st.COMMENTS LIKE ?
                `;
                op.stockAdjustments = await pool.query(txQuery, [`[${op.CODE}]%`]);
            }
            console.log("SUCCESS! Got rows:", stockOpsRows.length);
        } catch (e) {
            console.log('[getInventoryHistory] Stock operations table may not exist yet:', e.message);
        }
        process.exit(0);
    } catch (e) {
        console.error("Outer FAILED:", e.message);
        process.exit(1);
    }
}
test();
