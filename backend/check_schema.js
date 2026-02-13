
const pool = require('./index');

async function checkSchema() {
    try {
        console.log('Checking schema for store_stock_operations...');
        const [columns] = await pool.promise().query("SHOW COLUMNS FROM store_stock_operations");
        console.log('Columns:', columns.map(c => c.Field).join(', '));

        const tripIdCol = columns.find(c => c.Field === 'TRIP_ID');
        if (tripIdCol) {
            console.log('✅ TRIP_ID column FOUND.');
        } else {
            console.log('❌ TRIP_ID column MISING.');

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
