const pool = require('./index');
const util = require('util');
if (!pool.query[util.promisify.custom]) {
    pool.query = util.promisify(pool.query);
}

async function test() {
    try {
        const [rows] = await pool.query(
            `SELECT SUM(sti.TOTAL) as sumTotal, SUM(sti.QUANTITY) as sumQty
             FROM store_transactions st
             JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
             WHERE sti.ITEM_ID = 909 AND st.TYPE = 'Selling'
               AND st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1
               AND st.CREATED_DATE >= '2026-02-16 06:15:54' AND st.CREATED_DATE <= '2026-02-21 23:59:59'`
        );
        console.log("Selling 909 SUM inside store_transactions:", rows);
        
        const [opRows] = await pool.query(
            `SELECT SUM(ssoi.TOTAL) as sumTotal, SUM(ssoi.SOLD_QUANTITY) as sumQty
             FROM store_stock_operations sso
             JOIN store_stock_operation_items ssoi ON sso.OP_ID = ssoi.OP_ID
             WHERE ssoi.ITEM_ID = 909 AND sso.OP_TYPE IN (3, 4)
               AND sso.IS_ACTIVE = 1
               AND sso.CREATED_DATE >= '2026-02-16 06:15:54' AND sso.CREATED_DATE <= '2026-02-21 23:59:59'`
        );
        console.log("Selling 909 SUM inside store_stock_operations:", opRows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
test();
