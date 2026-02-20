const mysql = require('mysql2/promise');

async function test() {
    const pool = mysql.createPool({
        host: '91.107.207.196',
        user: 'root',
        password: '', // Assuming same empty password or we need SSH access. Let's try SSH query instead.
        database: 'chamika_rice_mill',
        waitForConnections: true,
        connectionLimit: 10,
    });
}
