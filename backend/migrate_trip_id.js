
const pool = require('./index');

async function migrate() {
    try {
        console.log('Starting migration to add TRIP_ID column...');

        // Check if column exists
        const [columns] = await pool.promise().query("SHOW COLUMNS FROM store_stock_operations LIKE 'TRIP_ID'");

        if (columns.length === 0) {
            console.log('Adding TRIP_ID column to store_stock_operations table...');
            await pool.promise().query("ALTER TABLE store_stock_operations ADD COLUMN TRIP_ID VARCHAR(50) DEFAULT NULL AFTER OP_CODE");
            console.log('Migration successful: TRIP_ID column added.');
        } else {
            console.log('TRIP_ID column already exists. Skipping.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
