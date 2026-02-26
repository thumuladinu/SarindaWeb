const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

router.use(cors());

// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// 1. Get all active destinations
router.post('/api/getAllDestinations', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ success: false, message: 'Database connection failed' });
        }

        const queryResult = await pool.query('SELECT * FROM store_destinations WHERE IS_ACTIVE=1 ORDER BY EDITED_DATE DESC');

        if (Array.isArray(queryResult)) {
            const destinations = queryResult.map(dest => ({ ...dest }));
            return res.status(200).json({ success: true, result: destinations });
        } else {
            return res.status(500).json({ success: false, message: 'Invalid query result' });
        }
    } catch (error) {
        console.error('Error fetching destinations:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// 2. Add a new destination
router.post('/api/addDestination', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ success: false, message: 'Database connection failed' });
        }

        // Check if code already exists
        const existing = await pool.query('SELECT * FROM store_destinations WHERE CODE = ?', [req.body.CODE]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Destination code already exists' });
        }

        const insertResult = await pool.query('INSERT INTO store_destinations SET ?', req.body);

        if (insertResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Destination added successfully' });
        } else {
            return res.status(500).json({ success: false, message: 'Failed to add destination' });
        }
    } catch (error) {
        console.error('Error adding destination:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// 3. Update a destination
router.post('/api/updateDestination', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ success: false, message: 'Database connection failed' });
        }

        const { DESTINATION_ID, ...updatedData } = req.body;

        const updateResult = await pool.query('UPDATE store_destinations SET ? WHERE DESTINATION_ID = ?', [
            updatedData,
            DESTINATION_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Destination updated successfully' });
        } else {
            return res.status(500).json({ success: false, message: 'Failed to update destination' });
        }
    } catch (error) {
        console.error('Error updating destination:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// 4. Deactivate a destination (Soft Delete)
router.post('/api/deactivateDestination', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ success: false, message: 'Database connection failed' });
        }

        const { DESTINATION_ID } = req.body;

        const updateResult = await pool.query('UPDATE store_destinations SET IS_ACTIVE = 0 WHERE DESTINATION_ID = ?', [
            DESTINATION_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Destination deactivated successfully' });
        } else {
            return res.status(500).json({ success: false, message: 'Failed to deactivate destination' });
        }
    } catch (error) {
        console.error('Error deactivating destination:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
