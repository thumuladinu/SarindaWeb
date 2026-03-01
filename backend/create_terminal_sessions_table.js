const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'chamika_rice_mill',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const createTableQuery = `
CREATE TABLE IF NOT EXISTS terminal_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    terminalId VARCHAR(255) NOT NULL,
    storeNo INT NOT NULL,
    storeName VARCHAR(255),
    type VARCHAR(255),
    cashier VARCHAR(255),
    ip VARCHAR(255),
    connectedAt DATETIME NOT NULL,
    disconnectedAt DATETIME,
    INDEX idx_terminal (terminalId),
    INDEX idx_connected (connectedAt)
);
`;

pool.query(createTableQuery, (err, results) => {
    if (err) {
        console.error('Error creating terminal_sessions table:', err);
    } else {
        console.log('terminal_sessions table created or already exists.');
    }
    process.exit(0);
});
