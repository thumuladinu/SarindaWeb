const mysql = require('mysql');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'sarind_pos'
});

async function test() {
    try {
        pool.query("SELECT CONVERT_TZ(NOW(), '+00:00', '+05:30') as sl_time", (err, result) => {
            if (err) throw err;
            console.log("Raw output:", result[0].sl_time);
            if (result[0].sl_time instanceof Date) {
                console.log("ISO String:", result[0].sl_time.toISOString());
                console.log("Local Hours:", result[0].sl_time.getHours());
                console.log("UTC Hours:", result[0].sl_time.getUTCHours());
            }
            process.exit();
        });
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
