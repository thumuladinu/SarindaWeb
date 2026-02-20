const mysql = require('mysql2/promise');
const fs = require('fs');

async function test() {
  const index = fs.readFileSync('index.js', 'utf8');
  let configStr = index.match(/mysql\.createPool\(\{([\s\S]*?)\}\)/)[1];
  
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'chamika_rice_mill',
    port: 3306
  });

  try {
    const codes = ['S1-260219-CLR-WEB_A-002', 'S2-260220-CLR-RBM9A-001', 'S2-260219-CLR-WS-004'];
    
    for (const code of codes) {
      const [rows] = await pool.query('SELECT TRANSACTION_ID, COMMENTS, SUB_TOTAL, CREATED_DATE, IS_ACTIVE, TYPE FROM store_transactions WHERE TYPE="Expenses" AND COMMENTS LIKE ?', [`%${code}%`]);
      console.log(`Results for ${code}:`);
      console.dir(rows, { depth: null });
    }

    console.log("Checking for 'Automated' regardless of TYPE:");
    const [allRows] = await pool.query('SELECT TRANSACTION_ID, COMMENTS, SUB_TOTAL, CREATED_DATE, IS_ACTIVE, TYPE FROM store_transactions WHERE COMMENTS LIKE "%Automated%" ORDER BY CREATED_DATE DESC LIMIT 5');
    console.dir(allRows, { depth: null });
    
  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}

test();
