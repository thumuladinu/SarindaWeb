const mysql = require('mysql2');
const util = require('util');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: '', database: 'chamika_rice_mill' });
  pool.query = util.promisify(pool.query);
  
  try {
    const result = await pool.query("SELECT COUNT(*) as count FROM store_transactions");
    console.log("Result is array?", Array.isArray(result));
    console.log("Length:", result.length);
    console.log("First element:", result[0]);
    console.log("Fields element:", result[1]);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
