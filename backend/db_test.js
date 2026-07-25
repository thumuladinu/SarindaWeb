const pool = require('./index');
async function run() {
  const [cols] = await pool.promise().query('DESCRIBE store_transactions');
  console.log(cols.map(c => c.Field).join(', '));
  
  const [samples] = await pool.promise().query('SELECT TRANSACTION_ID, CODE, TYPE, WEIGHT_CODE, IS_CHEQUE_COLLECTED, PAYMENT_AMOUNT, AMOUNT_SETTLED, DUE_AMOUNT, REFERENCE_TRANSACTION FROM store_transactions WHERE STORE_NO = 2 LIMIT 10');
  console.log(samples);
  process.exit(0);
}
run();
