const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'chamika_rice_mill' });
  const [res] = await pool.query("SELECT TRANSACTION_ID, DUE_AMOUNT, AMOUNT_SETTLED, SUB_TOTAL, PAYMENT_AMOUNT FROM store_transactions WHERE STORE_NO = 2 AND TYPE IN ('Buying', 'Selling') AND WEIGHT_CODE IS NOT NULL AND WEIGHT_CODE != '' ORDER BY TRANSACTION_ID DESC LIMIT 10");
  console.log(res);
  process.exit(0);
}
run();
