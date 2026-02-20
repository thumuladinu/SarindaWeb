const mysql = require('mysql2/promise');

async function test() {
    const pool = mysql.createPool({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'chamika_rice_mill',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        dateStrings: true
    });

    try {
        const [rows] = await pool.query("SELECT MAX(CREATED_DATE) as max_date, MIN(CREATED_DATE) as min_date FROM store_stock_operations");
        console.log(rows);
        process.exit(0);
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}
test();
