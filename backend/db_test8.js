const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'chamika_rice_mill' });
  const [res] = await pool.query("SELECT DISTINCT TYPE, COUNT(*) as c FROM store_transactions GROUP BY TYPE");
  console.log('All types:', res);
  process.exit(0);
}
run();
