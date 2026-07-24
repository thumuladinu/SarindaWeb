// millPlaceRoutes.js — CRUD for Mill Places/Districts
const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

router.use(cors());
pool.query = util.promisify(pool.query);

// ─── GET ALL ACTIVE PLACES ─────────────────────────────────
router.post('/api/mill/places', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM mill_places WHERE IS_ACTIVE = 1 ORDER BY EDITED_DATE DESC'
        );
        if (!Array.isArray(result) || result.length === 0) {
            return res.status(200).json({ success: true, result: [] });
        }
        return res.status(200).json({ success: true, result: result.map(r => ({ ...r })) });
    } catch (error) {
        console.error('Error fetching mill places:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── ADD NEW PLACE ──────────────────────────────────────────
router.post('/api/mill/places/add', async (req, res) => {
    try {
        const { NAME, DISTRICT, DESCRIPTION } = req.body;
        if (!NAME) {
            return res.status(400).json({ success: false, message: 'Name is required' });
        }

        // Check duplicate
        const existing = await pool.query(
            'SELECT PLACE_ID FROM mill_places WHERE NAME = ? AND IS_ACTIVE = 1',
            [NAME]
        );
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Place already exists', duplicate: true });
        }

        const insertResult = await pool.query('INSERT INTO mill_places SET ?', {
            NAME,
            DISTRICT: DISTRICT || null,
            DESCRIPTION: DESCRIPTION || null,
        });

        if (insertResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Place added successfully', id: insertResult.insertId });
        }
        return res.status(500).json({ success: false, message: 'Failed to add place' });
    } catch (error) {
        console.error('Error adding mill place:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UPDATE PLACE ───────────────────────────────────────────
router.post('/api/mill/places/update', async (req, res) => {
    try {
        const { PLACE_ID, NAME, DISTRICT, DESCRIPTION } = req.body;
        if (!PLACE_ID || !NAME) {
            return res.status(400).json({ success: false, message: 'Place ID and Name are required' });
        }

        // Check duplicate (excluding self)
        const existing = await pool.query(
            'SELECT PLACE_ID FROM mill_places WHERE NAME = ? AND IS_ACTIVE = 1 AND PLACE_ID != ?',
            [NAME, PLACE_ID]
        );
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Place name already exists', duplicate: true });
        }

        const updateResult = await pool.query(
            'UPDATE mill_places SET NAME = ?, DISTRICT = ?, DESCRIPTION = ? WHERE PLACE_ID = ?',
            [NAME, DISTRICT || null, DESCRIPTION || null, PLACE_ID]
        );

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Place updated successfully' });
        }
        return res.status(500).json({ success: false, message: 'Failed to update place' });
    } catch (error) {
        console.error('Error updating mill place:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── DEACTIVATE (SOFT DELETE) PLACE ─────────────────────────
router.post('/api/mill/places/deactivate', async (req, res) => {
    try {
        const { PLACE_ID } = req.body;
        if (!PLACE_ID) {
            return res.status(400).json({ success: false, message: 'Place ID is required' });
        }

        const updateResult = await pool.query(
            'UPDATE mill_places SET IS_ACTIVE = 0 WHERE PLACE_ID = ?',
            [PLACE_ID]
        );

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Place deactivated successfully' });
        }
        return res.status(500).json({ success: false, message: 'Failed to deactivate place' });
    } catch (error) {
        console.error('Error deactivating mill place:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
