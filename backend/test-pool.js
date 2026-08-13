const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', database: 'chamika_rice_mill' });
  const [result] = await pool.query("SELECT * FROM mill_bills");
  console.log("Array?", Array.isArray(result), "Type:", typeof result);
  console.log(JSON.stringify(result));
  process.exit(0);
}
run();
