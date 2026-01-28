// index.js
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = 3001; // Set your desired port

// Enable CORS for local apps
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', process.env.FRONTEND_URL || '*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

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
    dateStrings: true // Return dates as strings to prevent timezone conversion
});

console.log('MySQL connection pool created successfully');

// Health check endpoint for sync service
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export the pool for use in other files
module.exports = pool;

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
app.use(require('./millDrying'));
app.use(require('./millInventory'));
app.use(require('./MillStockClearRoutes'));
app.use(require('./localSyncRoutes'));

// Start the server
const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Initialize Socket.io
const socket = require('./socket');
const io = socket.init(server);
global.io = io; // Make io globally available for routes (optional but convenient for legacy routes)
