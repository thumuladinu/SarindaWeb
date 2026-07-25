const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'chamika_rice_mill' });
  const [cols] = await pool.query('DESCRIBE store_transactions');
  console.log(cols.map(c => c.Field).join(', '));
  process.exit(0);
}
run();
