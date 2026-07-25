const pool = require('./index');
async function run() {
  const [types] = await pool.promise().query('SELECT DISTINCT TYPE FROM store_transactions');
  console.log('types:', types.map(c => c.TYPE).join(', '));
  process.exit(0);
}
run();
