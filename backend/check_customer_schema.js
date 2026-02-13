
const mysql = require('mysql2');

// Direct connection config to avoid importing app
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chamika_rice_mill',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    dateStrings: true
});

async function checkSchema() {
    try {
        console.log('Checking schema for store_customers...');
        const [columns] = await pool.promise().query("SHOW COLUMNS FROM store_customers");
        console.log('Columns:', columns.map(c => c.Field).join(', '));
        process.exit(0);
    } catch (error) {
        console.error('Schema check failed:', error);
        process.exit(1);
    }
}

checkSchema();
