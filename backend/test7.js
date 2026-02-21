const mysql = require('mysql2/promise');

async function test() {
    try {
        const pool = mysql.createPool({
            host: 'localhost',
            user: 'root',
            password: '',
            database: 'chamika_rice_mill'
        });
        
        console.log("Checking for item 909...");

        const [rows1] = await pool.query(
            `SELECT st.TRANSACTION_ID, st.TYPE, st.CREATED_DATE, st.DATE, sti.QUANTITY, sti.TOTAL
             FROM store_transactions st
             JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
             WHERE sti.ITEM_ID = 909 AND st.TYPE = 'Selling' AND st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1`
        );
        console.log(`Total active selling records for 909 independent of date: ${rows1.length}`);
        if(rows1.length > 0) {
            console.log("Sample dates:", rows1.map(r => r.CREATED_DATE).slice(0, 3));
        }

        const [rows2] = await pool.query(
            `SELECT SUM(sti.TOTAL) as sumTotal, SUM(sti.QUANTITY) as sumQty
             FROM store_transactions st
             JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
             WHERE sti.ITEM_ID = 909 AND st.TYPE = 'Selling'
               AND st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1
               AND st.CREATED_DATE >= ? AND st.CREATED_DATE <= ?`,
            ['2026-02-16 06:15:54', '2026-02-21 23:59:59']
        );
        console.log("Sum via parameters:", rows2[0]);

        const [rows3] = await pool.query(
            `SELECT SUM(sti.TOTAL) as sumTotal, SUM(sti.QUANTITY) as sumQty
             FROM store_transactions st
             JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
             WHERE sti.ITEM_ID = 909 AND st.TYPE = 'Selling'
               AND st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1
               AND st.CREATED_DATE >= '2026-02-16 06:15:54' AND st.CREATED_DATE <= '2026-02-21 23:59:59'`
        );
        console.log("Sum via hardcoded strings:", rows3[0]);

        const [opRows1] = await pool.query(
            `SELECT sso.OP_ID, sso.CREATED_DATE, ssoi.SOLD_QUANTITY, ssoi.TOTAL
             FROM store_stock_operations sso
             JOIN store_stock_operation_items ssoi ON sso.OP_ID = ssoi.OP_ID
             WHERE ssoi.ITEM_ID = 909 AND sso.OP_TYPE IN (3, 4) AND sso.IS_ACTIVE = 1`
        );
        console.log(`Total OP selling records for 909 independent of date: ${opRows1.length}`);
        if(opRows1.length > 0) {
            console.log("Sample OP dates:", opRows1.map(r => r.CREATED_DATE).slice(0, 3));
        }

        const [opRows2] = await pool.query(
            `SELECT SUM(ssoi.TOTAL) as sumTotal, SUM(ssoi.SOLD_QUANTITY) as sumQty
             FROM store_stock_operations sso
             JOIN store_stock_operation_items ssoi ON sso.OP_ID = ssoi.OP_ID
             WHERE ssoi.ITEM_ID = 909 AND sso.OP_TYPE IN (3, 4)
               AND sso.IS_ACTIVE = 1
               AND sso.CREATED_DATE >= ? AND sso.CREATED_DATE <= ?`,
            ['2026-02-16 06:15:54', '2026-02-21 23:59:59']
        );
        console.log("OP Sum via parameters:", opRows2[0]);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
test();
