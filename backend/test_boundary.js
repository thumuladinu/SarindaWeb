// Debug script - test with exact boundaries
const pool = require('./index');
const util = require('util');

if (!pool.query[util.promisify.custom]) {
    pool.query = util.promisify(pool.query);
}

async function test() {
    try {
        console.log('=== Testing with exact boundary times ===');

        // Test with exact boundary from your log: 2026-02-16 06:05:30 to 2026-02-21 23:59:59
        const startBoundary = '2026-02-16 06:05:30';
        const endBoundary = '2026-02-21 23:59:59';

        for (const itemId of [908, 909, 910]) {
            console.log(`\n=== Item ID: ${itemId} ===`);

            // With exact boundary times (like the function uses)
            const r1 = await pool.query(`
                SELECT SUM(sti.TOTAL) as sumTotal, SUM(sti.QUANTITY) as sumQty
                FROM store_transactions st
                JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                WHERE sti.ITEM_ID = ? AND st.TYPE = 'Selling'
                  AND st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1
                  AND st.CREATED_DATE >= ? AND st.CREATED_DATE <= ?
            `, [itemId, startBoundary, endBoundary]);
            console.log('With exact boundaries:', r1);

            // With DATE() function (to compare dates only, ignore time)
            const r2 = await pool.query(`
                SELECT SUM(sti.TOTAL) as sumTotal, SUM(sti.QUANTITY) as sumQty
                FROM store_transactions st
                JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                WHERE sti.ITEM_ID = ? AND st.TYPE = 'Selling'
                  AND st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1
                  AND DATE(st.CREATED_DATE) >= DATE(?) AND DATE(st.CREATED_DATE) <= DATE(?)
            `, [itemId, startBoundary, endBoundary]);
            console.log('With DATE() function:', r2);
        }

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

test();
