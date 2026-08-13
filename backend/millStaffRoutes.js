// millStaffRoutes.js — CRUD for Mill Staff (Drivers, Laborers, Officers)
const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

// router.use(cors());
pool.query = util.promisify(pool.query);

// Initialize table
const initStaffTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mill_staff (
                STAFF_ID INT AUTO_INCREMENT PRIMARY KEY,
                NAME VARCHAR(100) NOT NULL,
                PHONE_NUMBER VARCHAR(20) DEFAULT NULL,
                ROLE VARCHAR(50) NOT NULL DEFAULT 'labor',
                USERNAME VARCHAR(50) DEFAULT NULL,
                PASSWORD VARCHAR(255) DEFAULT NULL,
                PIN VARCHAR(10) DEFAULT NULL,
                REMARK VARCHAR(255) DEFAULT NULL,
                IS_ACTIVE TINYINT(1) DEFAULT 1,
                CREATED_DATE DATETIME DEFAULT CURRENT_TIMESTAMP,
                EDITED_DATE DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        await pool.query('ALTER TABLE mill_staff ADD COLUMN PROFILE_IMAGE LONGTEXT DEFAULT NULL').catch(() => {});
    } catch (e) {
        console.error('Error creating mill_staff table:', e);
    }
};
initStaffTable();

// ─── GET ALL STAFF ──────────────────────────────────────────
router.get('/api/mill/staff/list', async (req, res) => {
    try {
        const { role } = req.query;
        let query = 'SELECT * FROM mill_staff WHERE IS_ACTIVE = 1';
        let params = [];

        if (role) {
            query += ' AND ROLE = ?';
            params.push(role);
        }

        query += ' ORDER BY ROLE ASC, NAME ASC';

        const result = await pool.query(query, params);
        res.json({ success: true, result: Array.isArray(result) ? result.map(r => ({ ...r })) : [] });
    } catch (error) {
        console.error('Error fetching mill staff:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── ADD STAFF ──────────────────────────────────────────────
router.post('/api/mill/staff/add', async (req, res) => {
    try {
        const { NAME, PHONE_NUMBER, ROLE, USERNAME, PASSWORD, PIN, REMARK, PROFILE_IMAGE } = req.body;
        if (!NAME || !ROLE) {
            return res.status(400).json({ success: false, message: 'Name and Role required' });
        }

        await pool.query('INSERT INTO mill_staff SET ?', {
            NAME,
            PHONE_NUMBER: PHONE_NUMBER || null,
            ROLE: ROLE || 'labor',
            USERNAME: USERNAME || null,
            PASSWORD: PASSWORD || null,
            PIN: PIN || null,
            REMARK: REMARK || null,
            PROFILE_IMAGE: PROFILE_IMAGE || null,
            IS_ACTIVE: 1
        });

        res.json({ success: true, message: 'Staff member added successfully' });
    } catch (error) {
        console.error('Error adding staff:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UPDATE STAFF ───────────────────────────────────────────
router.post('/api/mill/staff/update', async (req, res) => {
    try {
        const { STAFF_ID, NAME, PHONE_NUMBER, ROLE, USERNAME, PASSWORD, PIN, REMARK, PROFILE_IMAGE } = req.body;
        if (!STAFF_ID || !NAME) {
            return res.status(400).json({ success: false, message: 'STAFF_ID and NAME required' });
        }

        await pool.query(
            `UPDATE mill_staff 
             SET NAME = ?, PHONE_NUMBER = ?, ROLE = ?, USERNAME = ?, PASSWORD = ?, PIN = ?, REMARK = ?, PROFILE_IMAGE = ? 
             WHERE STAFF_ID = ?`,
            [
                NAME,
                PHONE_NUMBER || null,
                ROLE || 'labor',
                USERNAME || null,
                PASSWORD || null,
                PIN || null,
                REMARK || null,
                PROFILE_IMAGE || null,
                STAFF_ID
            ]
        );

        res.json({ success: true, message: 'Staff member updated successfully' });
    } catch (error) {
        console.error('Error updating staff:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── DELETE STAFF ───────────────────────────────────────────
router.post('/api/mill/staff/delete', async (req, res) => {
    try {
        const { STAFF_ID } = req.body;
        if (!STAFF_ID) {
            return res.status(400).json({ success: false, message: 'STAFF_ID required' });
        }

        await pool.query('UPDATE mill_staff SET IS_ACTIVE = 0 WHERE STAFF_ID = ?', [STAFF_ID]);
        res.json({ success: true, message: 'Staff member deleted successfully' });
    } catch (error) {
        console.error('Error deleting staff:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── QUICK PIN LOGIN FOR OFFICERS ───────────────────────────
router.post('/api/mill/staff/pin-login', async (req, res) => {
    try {
        const { PIN } = req.body;
        if (!PIN) {
            return res.status(400).json({ success: false, message: 'PIN required' });
        }

        const result = await pool.query(
            "SELECT * FROM mill_staff WHERE PIN = ? AND ROLE = 'officer' AND IS_ACTIVE = 1 LIMIT 1",
            [PIN]
        );

        if (!result || result.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid PIN or unauthorized officer' });
        }

        const officer = result[0];
        res.json({
            success: true,
            user: {
                USER_ID: officer.STAFF_ID,
                NAME: officer.NAME,
                ROLE: 'officer',
                USERNAME: officer.USERNAME
            }
        });
    } catch (error) {
        console.error('Error PIN login:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
