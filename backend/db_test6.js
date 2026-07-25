const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'chamika_rice_mill' });
  const [tables] = await pool.query('SHOW TABLES');
  console.log('Tables:', tables.map(t => Object.values(t)[0]).join(', '));
  process.exit(0);
}
run();
