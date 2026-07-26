const mysql = require('mysql2/promise');
async function test() {
    const pool = mysql.createPool({ host: 'localhost', user: 'root', database: 'chamika_rice_mill' });
    const date = '2026-07-26';
    const weighingQuery = `
                SELECT COUNT(*) as count, SUM(SUB_TOTAL) as total
                FROM store_transactions st
                WHERE st.IS_ACTIVE = 1 AND st.STORE_NO = 2 
                  AND st.TYPE IN ('Buying', 'Selling')
                  AND st.WEIGHT_CODE IS NOT NULL AND st.WEIGHT_CODE != ''
                  AND DATE(IFNULL(st.STOCK_DATE, st.CREATED_DATE)) = ?
            `;
    const [weighingResult] = await pool.query(weighingQuery, [date]);
    console.log('weighingResult:', weighingResult);
    console.log('weighingBills:', { count: weighingResult[0]?.count || 0, total: parseFloat(weighingResult[0]?.total) || 0 });
    process.exit(0);
}
test();
