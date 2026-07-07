const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');

// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Now you can use pool.query with async/await
router.post('/api/getAllItems', async (req, res) => {
    // console.log('Get all Items request received:', req.body);
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }


        // CLEANUP: Automatically delete "Virtual" items if they exist
        // These are handled by POS logic and should not be displayed in Web App
        await pool.query("DELETE FROM store_items WHERE CODE IN ('RETURN', 'CONTAINER', 'TARE')");

        // Query to fetch all active items (items are now shared across stores)
        const queryResult = await pool.query("SELECT * FROM store_items WHERE IS_ACTIVE=1 AND CODE NOT IN ('CONTAINER', 'RETURN', 'TARE')");

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any items are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active items found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(items => ({ ...items }));

            data.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));
            // console.log('Items:', data);

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


router.post('/api/addItem', async (req, res) => {
    console.log('Add items request received:', req.body);

    try {
        // Force Uppercase for CODE
        if (req.body.CODE) req.body.CODE = req.body.CODE.toUpperCase();
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Helper to format date for MySQL in UTC
        const toMySQLDateTime = (isoStr) => {
            try {
                const date = isoStr ? new Date(isoStr) : new Date();
                if (isNaN(date.getTime())) return new Date().toISOString().slice(0, 19).replace('T', ' ');

                // Return UTC format: YYYY-MM-DD HH:mm:ss
                return date.toISOString().slice(0, 19).replace('T', ' ');
            } catch (e) {
                return new Date().toISOString().slice(0, 19).replace('T', ' ');
            }
        };

        // Format Date Fields if present
        if (req.body.EDITED_DATE) req.body.EDITED_DATE = toMySQLDateTime(req.body.EDITED_DATE);
        if (req.body.CREATED_DATE) req.body.CREATED_DATE = toMySQLDateTime(req.body.CREATED_DATE);

        // Replace empty strings with null in req.body
        Object.keys(req.body).forEach((key) => {
            if (req.body[key] === '') {
                req.body[key] = null;
            }
        });

        // Extract and Remove STORE_NO as it's not in store_items table (shared table)
        const storeNo = req.body.STORE_NO || '1';
        delete req.body.STORE_NO;

        // Remove STOCK from request - stock is managed locally on POS only
        delete req.body.STOCK;

        // UPSERT: Insert item or update if CODE already exists (prevents duplicates atomically)
        const editedDate = toMySQLDateTime(req.body.EDITED_DATE);
        const createdBy = req.body.CREATED_BY || null;
        const showInWeighing = req.body.SHOW_IN_WEIGHING !== undefined ? req.body.SHOW_IN_WEIGHING : 1;

        // STORE_VISIBILITY: JSON keyed by storeNo {"1":1,"2":0,...}
        // Accept from request, or derive from SHOW_IN_WEIGHING for back-compat.
        let storeVisibility = null;
        if (req.body.STORE_VISIBILITY) {
            try {
                storeVisibility = typeof req.body.STORE_VISIBILITY === 'string'
                    ? req.body.STORE_VISIBILITY
                    : JSON.stringify(req.body.STORE_VISIBILITY);
            } catch (_) { storeVisibility = null; }
        }
        if (!storeVisibility) {
            // Derive: visible in store 1 always; visible in store 2 = showInWeighing
            storeVisibility = JSON.stringify({ '1': 1, '2': showInWeighing });
        }

        // STORE_PRICES: JSON keyed by storeNo {"1":{"buying":100,"selling":120},...}
        // NULL means "use global price" for that store.
        let storePrices = null;
        if (req.body.STORE_PRICES) {
            try {
                storePrices = typeof req.body.STORE_PRICES === 'string'
                    ? req.body.STORE_PRICES
                    : JSON.stringify(req.body.STORE_PRICES);
            } catch (_) { storePrices = null; }
        }

        const upsertResult = await pool.query(`
            INSERT INTO store_items (CODE, NAME, BUYING_PRICE, SELLING_PRICE, IS_ACTIVE, EDITED_DATE, CREATED_BY, SHOW_IN_WEIGHING, STORE_VISIBILITY, STORE_PRICES)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                NAME = VALUES(NAME),
                BUYING_PRICE = VALUES(BUYING_PRICE),
                SELLING_PRICE = VALUES(SELLING_PRICE),
                IS_ACTIVE = 1,
                EDITED_DATE = VALUES(EDITED_DATE),
                CREATED_BY = VALUES(CREATED_BY),
                SHOW_IN_WEIGHING = VALUES(SHOW_IN_WEIGHING),
                STORE_VISIBILITY = VALUES(STORE_VISIBILITY),
                STORE_PRICES = VALUES(STORE_PRICES)
        `, [
            req.body.CODE,
            req.body.NAME,
            req.body.BUYING_PRICE,
            req.body.SELLING_PRICE,
            editedDate,
            createdBy,
            showInWeighing,
            storeVisibility,
            storePrices
        ]);

        // insertId is 0 if it was an update (duplicate key), otherwise it's the new ID
        let insertId;
        let isReactivation = false;

        if (upsertResult.insertId === 0) {
            // It was an update - get the existing ID
            const [existing] = await pool.query('SELECT ITEM_ID FROM store_items WHERE CODE = ?', [req.body.CODE]);
            insertId = existing ? existing.ITEM_ID : null;
            isReactivation = true;
            console.log(`[SmartAdd] Item code ${req.body.CODE} already exists (ID: ${insertId}). Updated/Reactivated.`);
        } else {
            insertId = upsertResult.insertId;
            console.log(`[SmartAdd] New item ${req.body.CODE} created (ID: ${insertId}).`);
        }

        if (insertId) {
            // LEDGER: Creating Opening Transaction if Initial Stock Provided
            // ... (Logic continues similarly, can rely on existing STOCK check logic or refactor)
            // For simplicity, we only trigger opening transaction if NEW stock was provided in this request
            // We need to re-parse the STOCK from req.body (which we just updated/set)

            if (req.body.STOCK) {
                try {
                    const stockData = typeof req.body.STOCK === 'string' ? JSON.parse(req.body.STOCK) : req.body.STOCK;
                    // Only process for the specific store we are dealing with?
                    // The sync logic sends stock as `{"STORE_NO": qty}`.
                    // So we iterate keys.
                    const stores = Object.keys(stockData);

                    for (const sNo of stores) {
                        // Only create transaction for the target store to avoid duplicates if re-syncing?
                        // Ideally, check if transaction exists, but for now simple insert is okay as per request.
                        const qty = parseFloat(stockData[sNo]);
                        if (qty > 0) {
                            // ... Transaction creation logic ...
                            const createdBy = req.body.CREATED_BY || 1;
                            try {
                                const txRes = await pool.query('INSERT INTO store_transactions SET ?', {
                                    CODE: `OPE-INIT-${insertId}-${Date.now()}`, // Unique code
                                    STORE_NO: sNo,
                                    TYPE: 'Opening',
                                    CREATED_BY: createdBy,
                                    CREATED_DATE: new Date(),
                                    COMMENTS: isReactivation ? 'Reactivation Stock' : 'Initial Stock',
                                    IS_ACTIVE: 1
                                });
                                await pool.query('INSERT INTO store_transactions_items SET ?', {
                                    TRANSACTION_ID: txRes.insertId,
                                    ITEM_ID: insertId,
                                    QUANTITY: qty,
                                    TOTAL: 0
                                });
                            } catch (err) {
                                console.warn('Failed to create ledger entry:', err.message);
                            }
                        }
                    }
                } catch (e) { console.error('Error parsing stock for ledger:', e); }
            }

            if (global.io) {
                let storeVisibility = null;
                let storePrices = null;
                try {
                    const sv = req.body.STORE_VISIBILITY;
                    storeVisibility = sv ? (typeof sv === 'string' ? JSON.parse(sv) : sv) : null;
                } catch (_) {}
                try {
                    const sp = req.body.STORE_PRICES;
                    storePrices = sp ? (typeof sp === 'string' ? JSON.parse(sp) : sp) : null;
                } catch (_) {}
                global.io.emit('item:updated', {
                    id: insertId,
                    code: req.body.CODE,
                    action: isReactivation ? 'reactivated' : 'added',
                    storeVisibility,
                    storePrices,
                    buyingPrice: req.body.BUYING_PRICE,
                    sellingPrice: req.body.SELLING_PRICE,
                });
            }

            return res.status(200).json({ success: true, message: isReactivation ? 'Item reactivated' : 'Item added successfully', insertId: insertId });
            // (End of successful operation)
        } else {
            return res.status(500).json({ success: false, message: 'Failed to insert/update item' });
        }
    } catch (error) {
        console.error('Error adding items:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/checkForDuplicateName', async (req, res) => {
    //console.log('Check for duplicate items request received:', req.body);

    try {
        // Force Uppercase for CODE
        if (req.body.CODE) req.body.CODE = req.body.CODE.toUpperCase();
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { CODE } = req.body;

        // Query to check for duplicate items (items are shared, no STORE_NO filter)
        const queryResult = await pool.query('SELECT COUNT(*) as count FROM store_items WHERE IS_ACTIVE=1 AND CODE = ?', [CODE]);

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

router.post('/api/checkForDuplicateNameUpdate', async (req, res) => {
    //console.log('Check for duplicate items request received:', req.body);

    try {
        // Force Uppercase for CODE
        if (req.body.CODE) req.body.CODE = req.body.CODE.toUpperCase();
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { CODE, ITEM_ID } = req.body;


        // Query to check for duplicate items (items are shared, no STORE_NO filter)
        const queryResult = await pool.query('SELECT COUNT(*) as count FROM store_items WHERE IS_ACTIVE=1 AND CODE = ? AND ITEM_ID != ?', [CODE, ITEM_ID]);

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



router.post('/api/updateItem', async (req, res) => {
    //console.log('Update items request received:', req.body);

    try {
        // Force Uppercase for CODE
        if (req.body.CODE) req.body.CODE = req.body.CODE.toUpperCase();
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const id = req.body.ITEM_ID;
        if (!id) {
            return res.status(400).json({ success: false, message: 'ITEM_ID is required' });
        }

        // Sanitize: Only allow valid columns to be updated
        // SHOW_IN_WEIGHING is always derived from STORE_VISIBILITY['2'] — never set directly
        const allowedFields = ['CODE', 'NAME', 'BUYING_PRICE', 'SELLING_PRICE', 'IS_ACTIVE', 'CREATED_BY'];
        const setClauses = [];
        const values = [];

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                setClauses.push(`${field} = ?`);
                values.push(req.body[field] === '' ? null : req.body[field]);
            }
        }

        // Handle STORE_VISIBILITY + sync SHOW_IN_WEIGHING from visibility['2']
        if (req.body.STORE_VISIBILITY !== undefined) {
            try {
                const sv = typeof req.body.STORE_VISIBILITY === 'string'
                    ? req.body.STORE_VISIBILITY
                    : JSON.stringify(req.body.STORE_VISIBILITY);
                setClauses.push('STORE_VISIBILITY = ?');
                values.push(sv);
                const parsed = JSON.parse(sv);
                const showW = parsed['2'] !== undefined ? (parsed['2'] ? 1 : 0) : 1;
                setClauses.push('SHOW_IN_WEIGHING = ?');
                values.push(showW);
            } catch (_) { /* ignore malformed */ }
        } else if (req.body.SHOW_IN_WEIGHING !== undefined) {
            // Legacy path: STORE_VISIBILITY not provided, update SHOW_IN_WEIGHING directly
            setClauses.push('SHOW_IN_WEIGHING = ?');
            values.push(req.body.SHOW_IN_WEIGHING);
        }

        // Handle STORE_PRICES: JSON keyed by storeNo {"1":{"buying":100,"selling":120},...}
        if (req.body.STORE_PRICES !== undefined) {
            try {
                const sp = typeof req.body.STORE_PRICES === 'string'
                    ? req.body.STORE_PRICES
                    : JSON.stringify(req.body.STORE_PRICES);
                setClauses.push('STORE_PRICES = ?');
                values.push(sp);
            } catch (_) { /* ignore malformed */ }
        }

        // Always update EDITED_DATE with UTC time
        setClauses.push('EDITED_DATE = UTC_TIMESTAMP()');

        // NOTE: STOCK column does not exist - stock is managed locally on POS only

        if (setClauses.length === 1) { // Only EDITED_DATE
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        values.push(id); // For WHERE clause

        const sql = `UPDATE store_items SET ${setClauses.join(', ')} WHERE ITEM_ID = ?`;
        console.log('[UpdateItem] SQL:', sql, 'Values:', values);

        const updateResult = await pool.query(sql, values);

        if (updateResult.affectedRows > 0) {
            if (global.io) {
                // Broadcast updated visibility + price maps so each POS can decide relevance
                // before issuing its own pullProducts() re-fetch.
                let storeVisibility = null;
                let storePrices = null;
                try {
                    const sv = req.body.STORE_VISIBILITY;
                    storeVisibility = sv ? (typeof sv === 'string' ? JSON.parse(sv) : sv) : null;
                } catch (_) {}
                try {
                    const sp = req.body.STORE_PRICES;
                    storePrices = sp ? (typeof sp === 'string' ? JSON.parse(sp) : sp) : null;
                } catch (_) {}
                global.io.emit('item:updated', {
                    id,
                    code: req.body.CODE,
                    action: 'updated',
                    storeVisibility,
                    storePrices,
                    buyingPrice: req.body.BUYING_PRICE,
                    sellingPrice: req.body.SELLING_PRICE,
                });
            }
            return res.status(200).json({ success: true, message: 'Item updated successfully' });
        } else {
            console.error('Error: Failed to update item, no rows affected');
            return res.status(404).json({ success: false, message: 'Item not found' });
        }
    } catch (error) {
        console.error('Error updating item:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/deactivateItem', async (req, res) => {
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
        // Also update EDITED_DATE so that the sync endpoint picks it up (UTC)
        const updateResult = await pool.query('UPDATE store_items SET IS_ACTIVE = 0, EDITED_DATE = UTC_TIMESTAMP() WHERE ITEM_ID = ?', [
            ITEM_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            // Emit Real-Time Event (Socket.io)
            if (global.io) {
                // Find the item code for the event
                try {
                    const [item] = await pool.query('SELECT CODE FROM store_items WHERE ITEM_ID = ?', [ITEM_ID]);
                    if (item) {
                        global.io.emit('item:updated', { id: ITEM_ID, code: item.CODE, action: 'deactivated', active: false });
                    }
                } catch (e) {
                    global.io.emit('item:updated', { id: ITEM_ID, action: 'deactivated', active: false });
                }
            }

            return res.status(200).json({ success: true, message: 'Item deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate items:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating items:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/getItemsForReference', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active items (items are shared, STOCK is JSON)
        const queryResult = await pool.query("SELECT ITEM_ID,CODE,NAME,EDITED_DATE,STOCK FROM store_items WHERE IS_ACTIVE=1 AND CODE NOT IN ('CONTAINER', 'RETURN', 'TARE')");

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

router.post('/api/getItemsDetailsForTransaction', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active items
        const queryResult = await pool.query('SELECT CODE,NAME,STOCK,SELLING_PRICE,BUYING_PRICE FROM store_items WHERE ITEM_ID = ?', [req.body.ITEM_ID]);

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







module.exports = router;
