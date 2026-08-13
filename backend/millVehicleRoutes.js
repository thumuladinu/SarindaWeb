// millVehicleRoutes.js — CRUD for Mill Vehicles
const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

router.use(cors());
pool.query = util.promisify(pool.query);

// Initialize table
const initVehicleTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mill_vehicles (
                VEHICLE_ID INT AUTO_INCREMENT PRIMARY KEY,
                VEHICLE_NO VARCHAR(50) NOT NULL UNIQUE,
                VEHICLE_TYPE VARCHAR(50) DEFAULT 'Lorry',
                DRIVER_NAME VARCHAR(100) DEFAULT NULL,
                REMARK VARCHAR(255) DEFAULT NULL,
                IS_ACTIVE TINYINT(1) DEFAULT 1,
                CREATED_DATE DATETIME DEFAULT CURRENT_TIMESTAMP,
                EDITED_DATE DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
    } catch (e) {
        console.error('Error creating mill_vehicles table:', e);
    }
};
initVehicleTable();

// ─── GET ALL VEHICLES ───────────────────────────────────────
router.get('/api/mill/vehicles/list', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM mill_vehicles WHERE IS_ACTIVE = 1 ORDER BY EDITED_DATE DESC'
        );
        res.json({ success: true, result: Array.isArray(result) ? result.map(r => ({ ...r })) : [] });
    } catch (error) {
        console.error('Error fetching mill vehicles:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── ADD VEHICLE ────────────────────────────────────────────
router.post('/api/mill/vehicles/add', async (req, res) => {
    try {
        const { VEHICLE_NO, VEHICLE_TYPE, DRIVER_NAME, REMARK } = req.body;
        if (!VEHICLE_NO) {
            return res.status(400).json({ success: false, message: 'Vehicle number required' });
        }

        await pool.query('INSERT INTO mill_vehicles SET ?', {
            VEHICLE_NO,
            VEHICLE_TYPE: VEHICLE_TYPE || 'Lorry',
            DRIVER_NAME: DRIVER_NAME || null,
            REMARK: REMARK || null,
            IS_ACTIVE: 1
        });

        res.json({ success: true, message: 'Vehicle added successfully' });
    } catch (error) {
        console.error('Error adding vehicle:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ success: false, message: 'Vehicle number already exists' });
        }
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UPDATE VEHICLE ─────────────────────────────────────────
router.post('/api/mill/vehicles/update', async (req, res) => {
    try {
        const { VEHICLE_ID, VEHICLE_NO, VEHICLE_TYPE, DRIVER_NAME, REMARK } = req.body;
        if (!VEHICLE_ID || !VEHICLE_NO) {
            return res.status(400).json({ success: false, message: 'VEHICLE_ID and VEHICLE_NO required' });
        }

        await pool.query(
            'UPDATE mill_vehicles SET VEHICLE_NO = ?, VEHICLE_TYPE = ?, DRIVER_NAME = ?, REMARK = ? WHERE VEHICLE_ID = ?',
            [VEHICLE_NO, VEHICLE_TYPE || 'Lorry', DRIVER_NAME || null, REMARK || null, VEHICLE_ID]
        );

        res.json({ success: true, message: 'Vehicle updated successfully' });
    } catch (error) {
        console.error('Error updating vehicle:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── DELETE / DEACTIVATE VEHICLE ───────────────────────────
router.post('/api/mill/vehicles/delete', async (req, res) => {
    try {
        const { VEHICLE_ID } = req.body;
        if (!VEHICLE_ID) {
            return res.status(400).json({ success: false, message: 'VEHICLE_ID required' });
        }

        await pool.query('UPDATE mill_vehicles SET IS_ACTIVE = 0 WHERE VEHICLE_ID = ?', [VEHICLE_ID]);
        res.json({ success: true, message: 'Vehicle deleted successfully' });
    } catch (error) {
        console.error('Error deleting vehicle:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
