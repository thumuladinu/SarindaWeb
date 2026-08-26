const mysql = require('mysql');
const pool = mysql.createPool({ host: 'localhost', user: 'root', database: 'sarinda' });

pool.query("ALTER TABLE mill_bills ADD COLUMN DISPATCH_NO VARCHAR(50) NULL;", (error, results) => {
    if (error) {
        console.error('Error adding column:', error.message);
    } else {
        console.log('Successfully added DISPATCH_NO to mill_bills');
    }
    pool.end();
});
