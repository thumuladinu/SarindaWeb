// index.js
const isProduction = process.env.NODE_ENV === 'production';
if (!isProduction) {
    process.env.TZ = 'UTC';
}
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3001; // Set your desired port

// Enable CORS for local apps & electron renderer
const corsOptions = {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(bodyParser.json());

// Create a MySQL connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chamika_rice_mill',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: !isProduction ? 'Z' : undefined, // Set session timezone to UTC only in non-production
    dateStrings: true // Return dates as strings to prevent timezone conversion
});

console.log('MySQL connection pool created successfully');

// Run DB Migrations for mill_bills missing columns
pool.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mill_bills' AND COLUMN_NAME IN ('DEVICE_ID', 'CREATED_BY_NAME')
`, (err, rows) => {
    if (!err) {
        const existing = (rows || []).map(r => r.COLUMN_NAME);
        if (!existing.includes('DEVICE_ID')) {
            pool.query('ALTER TABLE mill_bills ADD COLUMN DEVICE_ID VARCHAR(50) NULL', (e) => {
                if (!e) console.log('[Migration] Added DEVICE_ID column to mill_bills table');
            });
        }
        if (!existing.includes('CREATED_BY_NAME')) {
            pool.query('ALTER TABLE mill_bills ADD COLUMN CREATED_BY_NAME VARCHAR(100) NULL', (e) => {
                if (!e) console.log('[Migration] Added CREATED_BY_NAME column to mill_bills table');
            });
        }
    }
});

// Run DB Migrations for user_details missing PIN column
pool.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_details' AND COLUMN_NAME = 'PIN'
`, (err, rows) => {
    if (!err) {
        const existing = (rows || []).map(r => r.COLUMN_NAME);
        if (!existing.includes('PIN')) {
            pool.query('ALTER TABLE user_details ADD COLUMN PIN VARCHAR(10) NULL', (e) => {
                if (!e) console.log('[Migration] Added PIN column to user_details table');
                else console.error('[Migration] Failed to add PIN column to user_details:', e.message);
            });
        }
    }
});

// Clean up unauthenticated terminal sessions
pool.query(`
    DELETE FROM terminal_sessions 
    WHERE cashier IS NULL 
       OR cashier = '' 
       OR LOWER(cashier) IN ('not logged in', 'no cashier', 'cashier')
`, (err, res) => {
    if (!err && res && res.affectedRows > 0) {
        console.log(`[Migration] Cleaned up ${res.affectedRows} unauthenticated terminal sessions`);
    }
});

// Run DB Migrations for mill_dispatch_notes missing columns
pool.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mill_dispatch_notes' AND COLUMN_NAME IN ('DEVICE_ID', 'CREATED_BY_NAME')
`, (err, rows) => {
    if (!err) {
        const existing = (rows || []).map(r => r.COLUMN_NAME);
        if (!existing.includes('DEVICE_ID')) {
            pool.query('ALTER TABLE mill_dispatch_notes ADD COLUMN DEVICE_ID VARCHAR(50) NULL', (e) => {
                if (!e) console.log('[Migration] Added DEVICE_ID column to mill_dispatch_notes table');
            });
        }
        if (!existing.includes('CREATED_BY_NAME')) {
            pool.query('ALTER TABLE mill_dispatch_notes ADD COLUMN CREATED_BY_NAME VARCHAR(100) NULL', (e) => {
                if (!e) console.log('[Migration] Added CREATED_BY_NAME column to mill_dispatch_notes table');
            });
        }
    }
});

// Run DB Migrations for mill_items missing columns
pool.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mill_items' AND COLUMN_NAME IN ('GS1_CODE')
`, (err, rows) => {
    if (!err) {
        const existing = (rows || []).map(r => r.COLUMN_NAME);
        if (!existing.includes('GS1_CODE')) {
            pool.query('ALTER TABLE mill_items ADD COLUMN GS1_CODE VARCHAR(100) NULL', (e) => {
                if (!e) console.log('[Migration] Added GS1_CODE column to mill_items table');
            });
        }
    }
});

// Run DB Migration: weight variations (GS1 codes) for mill output items
// Each output item gets 4 default weight variations (5/10/25/50 KG), each with
// a globally-unique 3-digit GS1 product code. Seeding is idempotent and keeps
// any legacy mill_items.GS1_CODE on the 25KG variation.
pool.query(`
    CREATE TABLE IF NOT EXISTS mill_item_variations (
        VARIATION_ID    INT AUTO_INCREMENT PRIMARY KEY,
        ITEM_ID         INT NOT NULL,
        WEIGHT_KG       DECIMAL(10,2) NOT NULL,
        GS1_CODE        VARCHAR(3) NOT NULL,
        BUYING_PRICE    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        SELLING_PRICE   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        IS_ACTIVE       TINYINT(1) NOT NULL DEFAULT 1,
        CREATED_DATE    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        EDITED_DATE     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_variation_gs1 (GS1_CODE),
        KEY idx_var_item (ITEM_ID),
        CONSTRAINT fk_var_item FOREIGN KEY (ITEM_ID) REFERENCES mill_items (ITEM_ID) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`, (err) => {
    if (err) {
        console.error('[Migration] Failed to create mill_item_variations:', err.message);
        return;
    }
    console.log('[Migration] mill_item_variations table ready');
    const { ensureDefaultVariations } = require('./variationSeeding');
    ensureDefaultVariations(pool)
        .then(({ created }) => {
            console.log(`[Migration] Seeded ${created} default weight variations for output items`);
        })
        .catch((e) => {
            console.error('[Migration] Failed to seed weight variations:', e.message);
        });
});

// Fix CREATED_BY column type in mill_dispatch_notes — change from INT to VARCHAR
// so it can accept user names (not just IDs) without MySQL strict mode errors
pool.query(`
    SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mill_dispatch_notes' AND COLUMN_NAME = 'CREATED_BY'
`, (err, rows) => {
    if (!err && rows && rows.length > 0) {
        const dataType = rows[0].DATA_TYPE;
        if (dataType === 'int' || dataType === 'bigint' || dataType === 'tinyint' || dataType === 'smallint') {
            pool.query('ALTER TABLE mill_dispatch_notes MODIFY COLUMN CREATED_BY VARCHAR(100) NULL', (e) => {
                if (!e) console.log('[Migration] Changed CREATED_BY in mill_dispatch_notes from INT to VARCHAR(100)');
                else console.error('[Migration] Failed to change CREATED_BY type:', e.message);
            });
        }
    }
});


// Health check endpoint for sync service
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export the pool for use in other files
module.exports = pool;

// Initialize Cron Jobs (must be after pool export to avoid circular dependency)
const { initChequeJob } = require('./chequeJob');
initChequeJob();

// Include routes after exporting the pool
app.use(require('./loginRoutes'));
app.use(require('./storeCustomerRoutes'));
app.use(require('./TreatmentGroupRoutes'));
app.use(require('./storeItemRoutes'));
app.use(require('./storeTransactionRoutes'));
app.use(require('./dashboardRoutes.js'));
app.use(require('./invoiceRoutes.js'));
app.use(require('./MillItemRoutes'));
app.use(require('./millCustomerRoutes'));
app.use(require('./millTransactionRoutes'));
app.use(require('./millVehicleRoutes'));
app.use(require('./millStaffRoutes'));
app.use(require('./millReturnRoutes'));
app.use(require('./millDashboardRoutes'));
app.use(require('./millDrying'));
app.use(require('./millInventory'));
app.use(require('./MillStockClearRoutes'));
app.use(require('./localSyncRoutes'));
app.use(require('./stockOperationsRoutes'));
app.use(require('./reportsDashboardRoutes'));
app.use(require('./notificationsRoutes'));
app.use(require('./pushRoutes').router);
app.use(require('./storeDestinationRoutes'));
app.use(require('./terminalSessionsRoutes'));
app.use(require('./storeRoutes'));

app.use('/api/stock-transfers', require('./transferRequestRoutes'));
app.use(require('./millPlaceRoutes'));
app.use(require('./millStockInwardRoutes'));
app.use(require('./millYieldRoutes'));
app.use(require('./millSalesRoutes'));
app.use(require('./millDispatchRoutes'));
app.use(require('./millChequeRoutes'));
app.use(require('./millSettingsRoutes'));
app.use(require('./millExpenseRoutes'));

// Start the server
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Initialize Socket.io
const socket = require('./socket');
const io = socket.init(server);
global.io = io; // Make io globally available for routes (optional but convenient for legacy routes)
