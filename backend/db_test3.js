const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chamika_rice_mill'
  });
  
  const [types] = await pool.query("SELECT DISTINCT TYPE, COUNT(*) as count FROM store_transactions WHERE STORE_NO = 2 GROUP BY TYPE");
  console.log('Types in Store 2:', types);
  
  const [weighing] = await pool.query("SELECT TRANSACTION_ID, CODE, TYPE, WEIGHT_CODE, IS_CHEQUE_COLLECTED, PAYMENT_AMOUNT, AMOUNT_SETTLED, DUE_AMOUNT FROM store_transactions WHERE STORE_NO = 2 AND WEIGHT_CODE IS NOT NULL AND WEIGHT_CODE != '' LIMIT 5");
  console.log('Weighing:', weighing);

  const [pos] = await pool.query("SELECT TRANSACTION_ID, CODE, TYPE, WEIGHT_CODE, IS_CHEQUE_COLLECTED, PAYMENT_AMOUNT, AMOUNT_SETTLED, DUE_AMOUNT FROM store_transactions WHERE STORE_NO = 2 AND (WEIGHT_CODE IS NULL OR WEIGHT_CODE = '') LIMIT 5");
  console.log('POS:', pos);

  process.exit(0);
}
run();
