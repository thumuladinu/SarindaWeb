const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');
const { ensureDefaultVariations, getNextGs1Code } = require('./variationSeeding');

// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Now you can use pool.query with async/await

// Columns that may be written to mill_items. Whitelisting keeps the
// VARIATIONS array (attached by MillgetAllItems) from ever reaching SQL,
// which would otherwise break the webapp status toggle's `{...record}` spread.
const ITEM_ALLOWED_COLUMNS = [
    'SYSTEM_CODE', 'CODE', 'NAME', 'CATEGORY', 'SUB_TYPE', 'UNIT',
    'BUYING_PRICE', 'SELLING_PRICE', 'STOCK', 'IS_ACTIVE', 'GS1_CODE', 'DESCRIPTION',
];

// Keep only whitelisted, non-empty-replaced fields from req.body
function pickItemFields(body) {
    const clean = {};
    for (const key of ITEM_ALLOWED_COLUMNS) {
        if (body[key] !== undefined && body[key] !== null) {
            clean[key] = body[key];
        }
    }
    return clean;
}

router.post('/api/MillgetAllItems', async (req, res) => {
    console.log('Get all Items request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }


        // Query to fetch all items
        const queryResult = await pool.query('SELECT * FROM mill_items');

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any items are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active items found' });
            }

            // Fetch active weight variations and group them by ITEM_ID
            const variationResult = await pool.query(
                'SELECT * FROM mill_item_variations WHERE IS_ACTIVE = 1'
            );
            const variationsByItem = {};
            (variationResult || []).forEach((v) => {
                if (!variationsByItem[v.ITEM_ID]) variationsByItem[v.ITEM_ID] = [];
                variationsByItem[v.ITEM_ID].push(v);
            });

            // Convert the query result to a new array without circular references
            const data = queryResult.map(items => ({
                ...items,
                VARIATIONS: variationsByItem[items.ITEM_ID] || [],
            }));

            data.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));

            return res.status(200).json({ success: true, result: data });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Bulk Update Selling Prices (from Price Calculator)
router.post('/api/mill/items/update-prices', async (req, res) => {
    try {
        const { prices } = req.body; // e.g. { OUT_SAMBA: 220, OUT_NADU: 210, OUT_HUNSAL: 95, OUT_KUDU: 75 }
        if (!prices || typeof prices !== 'object') {
            return res.status(400).json({ success: false, message: 'Invalid price object provided' });
        }

        for (const [sysCodeOrId, newPrice] of Object.entries(prices)) {
            if (newPrice !== undefined && newPrice !== null && !isNaN(newPrice)) {
                await pool.query(
                    'UPDATE mill_items SET SELLING_PRICE = ? WHERE ITEM_ID = ? OR SYSTEM_CODE = ? OR CODE = ?',
                    [parseFloat(newPrice), sysCodeOrId, sysCodeOrId, sysCodeOrId]
                );
            }
        }

        res.json({ success: true, message: 'Catalog selling prices updated successfully' });
    } catch (error) {
        console.error('Error updating mill item prices:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});




router.post('/api/MilladdItem', async (req, res) => {
    console.log('Add items request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Replace empty strings with null in req.body
        Object.keys(req.body).forEach((key) => {
            if (req.body[key] === '') {
                req.body[key] = null;
            }
        });

        // Insert the new items data into the database (whitelisted columns only)
        const insertResult = await pool.query('INSERT INTO mill_items SET ?', pickItemFields(req.body));



        if (insertResult.affectedRows > 0) {
            const insertId = insertResult.insertId;

            // New output items start with the 4 default weight variations + GS1 codes
            if ((req.body.CATEGORY || '').toLowerCase() === 'output') {
                try {
                    const { created } = await ensureDefaultVariations(pool, { itemId: insertId });
                    console.log(`[MilladdItem] Seeded ${created} default variations for new output item ${insertId}`);
                } catch (seedErr) {
                    console.error('[MilladdItem] Failed to seed variations:', seedErr.message);
                }
            }

            return res.status(200).json({ success: true, message: 'Item added successfully', ITEM_ID: insertId });
        } else {
            console.error('Error: Failed to add items:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding items:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MillcheckForDuplicateName', async (req, res) => {
    //console.log('Check for duplicate items request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { CODE} = req.body;

        // Query to check for duplicate items
        const queryResult = await pool.query('SELECT COUNT(*) as count FROM mill_items WHERE IS_ACTIVE=1 AND CODE = ?', [CODE]);

        if (queryResult[0].count > 0) {
            return res.status(200).json({ duplicate: true });
        } else {
            return res.status(200).json({ duplicate: false });
        }
    } catch (error) {
        console.error('Error checking for duplicate items:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MillcheckForDuplicateNameUpdate', async (req, res) => {
    //console.log('Check for duplicate items request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { CODE,ITEM_ID } = req.body;


        // Query to check for duplicate items
        const queryResult = await pool.query('SELECT COUNT(*) as count FROM mill_items WHERE IS_ACTIVE=1 AND CODE = ? AND ITEM_ID != ?', [CODE, ITEM_ID]);

        if (queryResult[0].count > 0) {
            return res.status(200).json({ duplicate: true });
        } else {
            return res.status(200).json({ duplicate: false });
        }
    } catch (error) {
        console.error('Error checking for duplicate items:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

function generateCode(insertId) {
    return 'ITEM' + padWithZeros(insertId);
}

// Helper function to pad the insertId with zeros
function padWithZeros(insertId) {
    //console.log('Insert ID:', insertId);
    const zeros = '000';
    const paddedId = zeros + insertId;
    return paddedId.slice(-3);
}



router.post('/api/MillupdateItem', async (req, res) => {
    //console.log('Update items request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Replace empty strings with null in req.body
        Object.keys(req.body).forEach((key) => {
            if (req.body[key] === '') {
                req.body[key] = null;
            }
        });

        const id = req.body.ITEM_ID;
        // Whitelisted columns only — never let VARIATIONS (or unknown fields)
        // reach the UPDATE statement
        const updatedCustomerData = pickItemFields(req.body);



        // Update the items data in the database
        const updateResult = await pool.query('UPDATE mill_items SET ? WHERE ITEM_ID = ?', [
            updatedCustomerData,
            id
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Customer updated successfully' });
        } else {
            console.error('Error: Failed to update items:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error updating items:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MilldeactivateItem', async (req, res) => {
    //console.log('Deactivate items request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the items ID from the request body
        const { ITEM_ID } = req.body;

        // Update the IS_ACTIVE column to 0 to deactivate the items
        const updateResult = await pool.query('UPDATE mill_items SET IS_ACTIVE = 0 WHERE ITEM_ID = ?', [
            ITEM_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Customer deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate items:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating items:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MillgetItemsForReference', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active items
        const queryResult = await pool.query('SELECT ITEM_ID,CODE,NAME,EDITED_DATE,STOCK FROM mill_items WHERE IS_ACTIVE=1');

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any items are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active items found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(items => ({ ...items }));

            data.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));

            return res.status(200).json({ success: true, result: data });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MillgetItemsDetailsForTransaction', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active items
        const queryResult = await pool.query('SELECT CODE,NAME,STOCK,SELLING_PRICE,BUYING_PRICE FROM mill_items WHERE ITEM_ID = ?', [req.body.ITEM_ID]);

        // Check if queryResult > 0 and if its is send 1st row
        if (queryResult.length > 0) {
            return res.status(200).json({ success: true, result: queryResult[0] });
        }
        else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
    catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

/* =====================================================
   WEIGHT VARIATION ROUTES (GS1 product codes)
   Each output item can have multiple weight variations,
   each with its own globally-unique 3-digit GS1 code.
   ===================================================== */

// Add a weight variation to an item. GS1_CODE is optional — when empty the
// server assigns the next free code.
router.post('/api/MilladdVariation', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { ITEM_ID, WEIGHT_KG, BUYING_PRICE, SELLING_PRICE } = req.body;
        if (!ITEM_ID || WEIGHT_KG === undefined || WEIGHT_KG === null || WEIGHT_KG === '') {
            return res.status(400).json({ success: false, message: 'ITEM_ID and WEIGHT_KG are required' });
        }

        let code = String(req.body.GS1_CODE || '').trim();
        if (!code) {
            code = await getNextGs1Code(pool);
            if (!code) return res.status(400).json({ success: false, message: 'GS1 code space exhausted (999 max)' });
        }
        if (!/^\d{3}$/.test(code)) {
            return res.status(400).json({ success: false, message: 'GS1 code must be exactly 3 digits' });
        }

        // One variation per weight per item
        const dupWeight = await pool.query(
            'SELECT COUNT(*) AS count FROM mill_item_variations WHERE ITEM_ID = ? AND WEIGHT_KG = ? AND IS_ACTIVE = 1',
            [ITEM_ID, WEIGHT_KG]
        );
        if (dupWeight[0].count > 0) {
            return res.status(200).json({ success: false, message: `A ${WEIGHT_KG}kg variation already exists for this item` });
        }

        const insertResult = await pool.query(
            'INSERT INTO mill_item_variations (ITEM_ID, WEIGHT_KG, GS1_CODE, BUYING_PRICE, SELLING_PRICE) VALUES (?, ?, ?, ?, ?)',
            [ITEM_ID, WEIGHT_KG, code, BUYING_PRICE || 0, SELLING_PRICE || 0]
        );
        return res.status(200).json({
            success: true,
            message: 'Variation added successfully',
            VARIATION_ID: insertResult.insertId,
            GS1_CODE: code,
        });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(200).json({ success: false, message: 'GS1 code already in use' });
        }
        console.error('Error adding variation:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Update a weight variation (weight, GS1 code, prices, active state)
router.post('/api/MillupdateVariation', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { VARIATION_ID } = req.body;
        if (!VARIATION_ID) {
            return res.status(400).json({ success: false, message: 'VARIATION_ID is required' });
        }

        const fields = {};
        for (const key of ['WEIGHT_KG', 'GS1_CODE', 'BUYING_PRICE', 'SELLING_PRICE', 'IS_ACTIVE']) {
            if (req.body[key] !== undefined && req.body[key] !== null) {
                fields[key] = req.body[key];
            }
        }

        if (fields.GS1_CODE !== undefined) {
            const code = String(fields.GS1_CODE).trim();
            if (!/^\d{3}$/.test(code)) {
                return res.status(400).json({ success: false, message: 'GS1 code must be exactly 3 digits' });
            }
            fields.GS1_CODE = code;
            const dup = await pool.query(
                'SELECT COUNT(*) AS count FROM mill_item_variations WHERE GS1_CODE = ? AND VARIATION_ID != ?',
                [code, VARIATION_ID]
            );
            if (dup[0].count > 0) {
                return res.status(200).json({ success: false, message: 'GS1 code already in use' });
            }
        }

        if (fields.WEIGHT_KG !== undefined) {
            // One variation per weight per item (exclude self)
            const dupWeight = await pool.query(
                `SELECT COUNT(*) AS count FROM mill_item_variations
                 WHERE ITEM_ID = (SELECT ITEM_ID FROM mill_item_variations WHERE VARIATION_ID = ?)
                   AND WEIGHT_KG = ? AND VARIATION_ID != ? AND IS_ACTIVE = 1`,
                [VARIATION_ID, fields.WEIGHT_KG, VARIATION_ID]
            );
            if (dupWeight[0].count > 0) {
                return res.status(200).json({ success: false, message: `A ${fields.WEIGHT_KG}kg variation already exists for this item` });
            }
        }

        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        await pool.query('UPDATE mill_item_variations SET ? WHERE VARIATION_ID = ?', [fields, VARIATION_ID]);
        return res.status(200).json({ success: true, message: 'Variation updated successfully' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(200).json({ success: false, message: 'GS1 code already in use' });
        }
        console.error('Error updating variation:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Deactivate a weight variation (soft delete)
router.post('/api/MilldeactivateVariation', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        const { VARIATION_ID } = req.body;
        if (!VARIATION_ID) {
            return res.status(400).json({ success: false, message: 'VARIATION_ID is required' });
        }
        await pool.query(
            'UPDATE mill_item_variations SET IS_ACTIVE = 0 WHERE VARIATION_ID = ?',
            [VARIATION_ID]
        );
        return res.status(200).json({ success: true, message: 'Variation deactivated successfully' });
    } catch (error) {
        console.error('Error deactivating variation:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Server-authoritative next free GS1 product code
router.post('/api/MillgetNextGs1Code', async (req, res) => {
    try {
        const nextCode = await getNextGs1Code(pool);
        if (!nextCode) {
            return res.status(400).json({ success: false, message: 'GS1 code space exhausted (999 max)' });
        }
        return res.status(200).json({ success: true, nextCode });
    } catch (error) {
        console.error('Error getting next GS1 code:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});




module.exports = router;
