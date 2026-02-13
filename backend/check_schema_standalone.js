
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
        console.log('Checking schema for store_stock_operations...');
        const [columns] = await pool.promise().query("SHOW COLUMNS FROM store_stock_operations");
        // console.log('Columns:', columns.map(c => c.Field).join(', '));

        const tripIdCol = columns.find(c => c.Field === 'TRIP_ID');
        if (tripIdCol) {
            console.log('✅ TRIP_ID column FOUND.');
        } else {
            console.log('❌ TRIP_ID column MISSING.');

            console.log('Attempting to add TRIP_ID column now...');
            await pool.promise().query("ALTER TABLE store_stock_operations ADD COLUMN TRIP_ID VARCHAR(50) DEFAULT NULL AFTER OP_CODE");
            console.log('✅ TRIP_ID column added successfully.');
        }
        process.exit(0);
    } catch (error) {
        console.error('Schema check failed:', error);
        process.exit(1);
    }
}

checkSchema();
