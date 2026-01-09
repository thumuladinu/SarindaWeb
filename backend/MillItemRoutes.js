const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');

// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Now you can use pool.query with async/await
router.post('/api/MillgetAllItems', async (req, res) => {
    console.log('Get all Items request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }


        // Query to fetch all active items
        const queryResult = await pool.query('SELECT * FROM mill_items WHERE IS_ACTIVE=1');

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

        // Insert the new items data into the database
        const insertResult = await pool.query('INSERT INTO mill_items SET ?', req.body);



        if (insertResult.affectedRows > 0) {
            const insertId = insertResult.insertId;

            //genarate code insertid from 3 digit and ITEM001
            // const code = generateCode(insertId);
            //
            // // Update the CODE column with the generated code
            // await pool.query('UPDATE mill_items SET CODE = ? WHERE ITEM_ID = ?', [code, insertId]);

            return res.status(200).json({ success: true, message: 'Item added successfully' });
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
        const updatedCustomerData = req.body;
        delete updatedCustomerData.ITEM_ID;



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







module.exports = router;
