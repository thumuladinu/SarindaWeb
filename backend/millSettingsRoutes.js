const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

router.use(cors());
pool.query = util.promisify(pool.query);

// GET all active store items and their corresponding mill mapping (if any)
router.get('/api/mill/settings/item-mappings', async (req, res) => {
    try {
        const query = `
            SELECT 
                si.ITEM_ID as STORE_ITEM_ID, 
                si.NAME as STORE_ITEM_NAME, 
                si.CODE as STORE_ITEM_CODE,
                m.mill_item_id as MILL_ITEM_ID,
                mi.NAME as MILL_ITEM_NAME,
                mi.CODE as MILL_ITEM_CODE
            FROM store_items si
            LEFT JOIN store_mill_item_mapping m ON si.ITEM_ID = m.store_item_id
            LEFT JOIN mill_items mi ON m.mill_item_id = mi.ITEM_ID
            WHERE si.IS_ACTIVE = 1
            ORDER BY si.NAME ASC
        `;
        const mappings = await pool.query(query);
        res.json({ success: true, mappings });
    } catch (error) {
        console.error('Error fetching item mappings:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// GET all active mill items (for dropdowns)
router.get('/api/mill/settings/mill-items', async (req, res) => {
    try {
        const query = `
            SELECT ITEM_ID, NAME, CODE, SYSTEM_CODE, CATEGORY 
            FROM mill_items 
            WHERE IS_ACTIVE = 1
            ORDER BY CATEGORY, NAME
        `;
        const items = await pool.query(query);
        res.json({ success: true, items });
    } catch (error) {
        console.error('Error fetching mill items:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// POST to save multiple mappings
router.post('/api/mill/settings/item-mappings', async (req, res) => {
    try {
        const { mappings } = req.body;
        
        if (!Array.isArray(mappings)) {
            return res.status(400).json({ success: false, message: 'Mappings array is required' });
        }

        for (const mapping of mappings) {
            const { STORE_ITEM_ID, MILL_ITEM_ID } = mapping;
            if (!STORE_ITEM_ID) continue;

            if (MILL_ITEM_ID) {
                // Upsert mapping
                await pool.query(
                    `INSERT INTO store_mill_item_mapping (store_item_id, mill_item_id) 
                     VALUES (?, ?) 
                     ON DUPLICATE KEY UPDATE mill_item_id = ?`,
                    [STORE_ITEM_ID, MILL_ITEM_ID, MILL_ITEM_ID]
                );
            } else {
                // Delete mapping if mill_item_id is null/cleared
                await pool.query(
                    `DELETE FROM store_mill_item_mapping WHERE store_item_id = ?`,
                    [STORE_ITEM_ID]
                );
            }
        }

        res.json({ success: true, message: 'Mappings updated successfully' });
    } catch (error) {
        console.error('Error updating item mappings:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
