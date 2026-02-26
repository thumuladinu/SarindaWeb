const mysql = require('mysql2');
const util = require('util');

// Define connection parameters directly to avoid requiring index.js (which starts the server)
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chamika_rice_mill',
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0
});

// Promisify pool.query for easier use
const query = util.promisify(pool.query).bind(pool);

async function migrate() {
    try {
        console.log('--- Destination Table Migration ---');

        // 1. Create store_destinations table
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS store_destinations (
                DESTINATION_ID INT AUTO_INCREMENT PRIMARY KEY,
                CODE VARCHAR(50) NOT NULL UNIQUE,
                NAME VARCHAR(255) NOT NULL,
                IS_ACTIVE TINYINT(1) DEFAULT 1,
                EDITED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_active (IS_ACTIVE),
                INDEX idx_code (CODE)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `;

        await query(createTableQuery);
        console.log('✅ store_destinations table created or already exists.');

        // 2. Add some initial sample data if empty
        const countResult = await query('SELECT COUNT(*) as count FROM store_destinations');
        if (countResult[0].count === 0) {
            console.log('Adding sample destinations...');
            const sampleData = [
                ['COL-01', 'Colombo Main Warehouse'],
                ['KAN-01', 'Kandy Distribution Center'],
                ['GAL-02', 'Galle Retail Store']
            ];

            for (const [code, name] of sampleData) {
                await query('INSERT INTO store_destinations (CODE, NAME) VALUES (?, ?)', [code, name]);
            }
            console.log('✅ Sample destinations added.');
        }

        console.log('--- Migration Complete ---');
        pool.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        if (pool) pool.end();
        process.exit(1);
    }
}

migrate();
