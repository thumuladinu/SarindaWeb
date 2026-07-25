const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'chamika_rice_mill' });
  const [res] = await pool.query("SELECT * FROM store_transactions WHERE TYPE = 'Payment' AND STORE_NO = 2 LIMIT 5");
  console.log('Payments:', res);
  process.exit(0);
}
run();
