const pool = require('./index.js');
const { sendPushToAll } = require('./pushRoutes');

const createNotification = async (type, referenceId, title, message) => {
    try {
        // 1. Save to database
        const query = `
            INSERT INTO notifications (type, reference_id, title, message)
            VALUES (?, ?, ?, ?)
        `;
        await pool.promise().query(query, [type, referenceId, title, message]);

        // 2. Broadcast via socket.io (if active)
        if (global.io) {
            global.io.emit('new_notification', { type, referenceId, title, message });
        }

        // 3. Send Web Push
        const pushUrl = type === 'TRANSFER_REQUEST'
            ? `/notifications?tab=1&id=${referenceId}`
            : `/notifications?tab=2&id=${referenceId}`;

        await sendPushToAll({
            title,
            body: message,
            url: pushUrl
        });

    } catch (err) {
        console.error('Error creating notification:', err);
    }
};

module.exports = {
    createNotification
};
