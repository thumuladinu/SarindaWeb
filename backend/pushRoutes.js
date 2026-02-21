const express = require('express');
const router = express.Router();
const pool = require('./index.js');
const webpush = require('./webPushConfig');

// Initialize Subscriptions Table
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error getting connection for push_subscriptions table init:', err);
        return;
    }

    const createPushSubsTable = `
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            endpoint VARCHAR(2048) NOT NULL,
            p256dh VARCHAR(255) NOT NULL,
            auth VARCHAR(255) NOT NULL,
            user_id INT, -- Optional: link to a specific user/device
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_endpoint (endpoint(255))
        )
    `;

    connection.query(createPushSubsTable, (err) => {
        if (err) console.error('Error creating push_subscriptions table:', err);
        else console.log('push_subscriptions table verified/created.');
        connection.release();
    });
});

// Subscribe to push notifications
router.post('/api/push/subscribe', async (req, res) => {
    try {
        const subscription = req.body;

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({ success: false, message: 'Invalid subscription object' });
        }

        const endpoint = subscription.endpoint;
        const p256dh = subscription.keys.p256dh;
        const auth = subscription.keys.auth;

        // Insert or update subscription
        const query = `
            INSERT INTO push_subscriptions (endpoint, p256dh, auth) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth)
        `;

        await pool.promise().query(query, [endpoint, p256dh, auth]);

        res.status(201).json({ success: true, message: 'Subscribed successfully.' });
    } catch (error) {
        console.error('Error saving subscription:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Helper function to throw notification (Can be imported elsewhere)
const sendPushToAll = async (payloadData) => {
    try {
        const [rows] = await pool.promise().query('SELECT * FROM push_subscriptions');

        const payload = JSON.stringify(payloadData);

        const notifications = rows.map(sub => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };
            return webpush.sendNotification(pushSubscription, payload).catch(err => {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Subscription has expired or is no longer valid
                    console.log('Subscription expired. Deleting endpoint:', sub.endpoint);
                    pool.promise().query('DELETE FROM push_subscriptions WHERE endpoint = ?', [sub.endpoint]).catch(console.error);
                } else {
                    console.error('Push notification sending error:', err);
                }
            });
        });

        await Promise.all(notifications);
    } catch (err) {
        console.error('Error in sendPushToAll:', err);
    }
};

// Also expose a test route for pushing
router.post('/api/push/test', async (req, res) => {
    await sendPushToAll({ title: 'Test Push', body: 'This is a test notification from SarindaWeb.' });
    res.json({ success: true, message: 'Pushed' });
});

module.exports = {
    router,
    sendPushToAll
};
