const express = require('express');
const router = express.Router();
const pool = require('./index.js'); // Use the exported pool

// Initialize Notifications Table
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error getting connection for notifications table init:', err);
        return;
    }

    const createNotificationsTable = `
        CREATE TABLE IF NOT EXISTS notifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type VARCHAR(50) NOT NULL, -- e.g., 'TRANSFER_REQUEST', 'RETURN'
            reference_id INT, -- ID of the transfer request or transaction
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            read_by JSON, -- for tracking which specific users/roles read it if needed, or simple globally for now
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    connection.query(createNotificationsTable, (err) => {
        if (err) console.error('Error creating notifications table:', err);
        else console.log('notifications table verified/created.');
        connection.release();
    });
});

// Get unread notifications count
router.get('/api/notifications/unread-count', async (req, res) => {
    try {
        const [rows] = await pool.promise().query('SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE');
        res.json({ success: true, count: rows[0].count });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get all notifications
router.get('/api/notifications', async (req, res) => {
    try {
        const [rows] = await pool.promise().query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 25');
        res.json({ success: true, result: rows });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Mark all as read
router.post('/api/notifications/mark-read', async (req, res) => {
    try {
        await pool.promise().query('UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE');
        res.json({ success: true, message: 'Notifications marked as read' });
    } catch (error) {
        console.error('Error marking notifications as read:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
