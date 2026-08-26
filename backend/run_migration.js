const mysql = require('mysql2/promise');
async function run() {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', database: 'chamika_rice_mill' });
  try {
    await pool.query("ALTER TABLE mill_bills ADD COLUMN DISPATCH_NO VARCHAR(50) NULL");
    console.log("Success: Added DISPATCH_NO to mill_bills");
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log("DISPATCH_NO already exists");
    else console.error("Error adding column:", e.message);
  }
  pool.end();
}
run();
