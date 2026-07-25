const pool = require('./index');
async function run() {
  const [types] = await pool.promise().query("SELECT DISTINCT TYPE, COUNT(*) as count FROM store_transactions WHERE STORE_NO = 2 GROUP BY TYPE");
  console.log('Types in Store 2:', types);
  
  const [weighing] = await pool.promise().query("SELECT TRANSACTION_ID, CODE, TYPE, WEIGHT_CODE, IS_CHEQUE_COLLECTED, PAYMENT_AMOUNT, AMOUNT_SETTLED, DUE_AMOUNT FROM store_transactions WHERE STORE_NO = 2 AND WEIGHT_CODE IS NOT NULL LIMIT 5");
  console.log('Weighing:', weighing);

  const [pos] = await pool.promise().query("SELECT TRANSACTION_ID, CODE, TYPE, WEIGHT_CODE, IS_CHEQUE_COLLECTED, PAYMENT_AMOUNT, AMOUNT_SETTLED, DUE_AMOUNT FROM store_transactions WHERE STORE_NO = 2 AND WEIGHT_CODE IS NULL LIMIT 5");
  console.log('POS:', pos);

  process.exit(0);
}
run();
