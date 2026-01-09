const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');

// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Now you can use pool.query with async/await
router.post('/api/MillgetAllInvItems', async (req, res) => {
    console.log('Get all customers request receive11d:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active customers sorted by EDITED_DATE
        const queryResult = await pool.query('SELECT * FROM mill_inventory_items WHERE IS_ACTIVE=1 ORDER BY EDITED_DATE DESC');


        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any customers are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active customers found' });
            }

            // Convert the query result to a new array without circular references
            const customers = queryResult.map(customer => ({ ...customer }));
            console.log('Customers found:', customers);
            return res.status(200).json({ success: true, result: customers });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MillgetInvItemUnit', async (req, res) => {
    //console.log('Get item unit request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch item unit
        const queryResult = await pool.query('SELECT UNIT FROM mill_inventory_items WHERE INV_ITEM_ID = ?', [req.body.INV_ITEM_ID]);

        if (queryResult.length > 0) {
            return res.status(200).json({ success: true, result: queryResult });
        } else {
            console.error('Error: Item unit not found');
            return res.status(404).json({ success: false, message: 'Item unit not found' });
        }
    } catch (error) {
        console.error('Error fetching item unit:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
);


router.post('/api/MillgetAllInvRecords', async (req, res) => {
    console.log('Get all customers request receive2323d:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active customers sorted by EDITED_DATE
        const queryResult = await pool.query('SELECT * FROM mill_inventory_records WHERE IS_ACTIVE=1 ORDER BY EDITED_DATE DESC');

        //get ROW_ITEM_NAME and DRY_ITEM_NAME from mill_items ( only select 1 row )
        for (let i = 0; i < queryResult.length; i++) {
            const queryResult1 = await pool.query('SELECT CODE FROM mill_inventory_items WHERE INV_ITEM_ID = ?', [queryResult[i].INV_ITEM_ID]);
            queryResult[i].INV_ITEM_CODE = queryResult1[0].CODE;

            const queryResult2 = await pool.query('SELECT NAME FROM mill_inventory_items WHERE INV_ITEM_ID = ?', [queryResult[i].INV_ITEM_ID]);
            queryResult[i].INV_ITEM_NAME = queryResult2[0].NAME;

            const queryResult3 = await pool.query('SELECT UNIT FROM mill_inventory_items WHERE INV_ITEM_ID = ?', [queryResult[i].INV_ITEM_ID]);
            queryResult[i].INV_ITEM_UNIT = queryResult3[0].UNIT;
        }

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any customers are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active customers found' });
            }

            // Convert the query result to a new array without circular references
            const customers = queryResult.map(customer => ({ ...customer }));
            console.log('Customers found:', customers);
            return res.status(200).json({ success: true, result: customers });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MillInvcheckForDuplicateCode', async (req, res) => {
    //console.log('Check for duplicate code request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to check for duplicate code
        const queryResult = await pool.query('SELECT * FROM mill_inventory_items WHERE CODE = ? AND IS_ACTIVE=1', [req.body.CODE]);

        if (queryResult.length > 0) {
            return res.status(200).json({ success: true, message: 'Duplicate code found',duplicate: true });
        } else {
            return res.status(200).json({ success: false, message: 'No duplicate code found',duplicate: false });
        }
    } catch (error) {
        console.error('Error checking for duplicate code:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
);



router.post('/api/MilladdInvItem', async (req, res) => {
    console.log('Add customer request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Insert the new customer data into the database
        const insertResult = await pool.query('INSERT INTO mill_inventory_items SET ?', req.body);

        if (insertResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Inv Item added successfully' });
        } else {
            console.error('Error: Failed to add customer:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding customer:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MilladdInvRec', async (req, res) =>{
    console.log('Add customer request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Insert the new customer data into the database
        const insertResult = await pool.query('INSERT INTO mill_inventory_records SET ?', req.body);

        if (insertResult.affectedRows > 0) {
            // Update STOCK column in mill_inventory_items arcoding to TYPE (IN/OUT)
            if (req.body.TYPE === 'IN') {
                const updateResult = await pool.query('UPDATE mill_inventory_items SET STOCK = STOCK + ? WHERE INV_ITEM_ID = ?', [
                    req.body.QUANTITY,
                    req.body.INV_ITEM_ID,
                ]);
                if (updateResult.affectedRows > 0) {
                    return res.status(200).json({ success: true, message: 'Inv Rec added successfully' });
                } else {
                    console.error('Error: Failed to update stock:', updateResult.message);
                    return res.status(500).json({ success: false, message: 'Internal server error' });
                }
            }
            else if (req.body.TYPE === 'OUT') {
                const updateResult = await pool.query('UPDATE mill_inventory_items SET STOCK = STOCK - ? WHERE INV_ITEM_ID = ?', [
                    req.body.QUANTITY,
                    req.body.INV_ITEM_ID,
                ]);
                if (updateResult.affectedRows > 0) {
                    return res.status(200).json({ success: true, message: 'Inv Rec added successfully' });
                } else {
                    console.error('Error: Failed to update stock:', updateResult.message);
                    return res.status(500).json({ success: false, message: 'Internal server error' });
                }
            }
        } else {
            console.error('Error: Failed to add customer:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding customer:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
);


router.post('/api/MilldeactivateInvRec', async (req, res) => {
    //console.log('Deactivate customer request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the customer ID from the request body
        const { INV_REC_ID } = req.body;

        // Select TYPE and QUANTITY from mill_inventory_records and Restore STOCK column in mill_inventory_items arcoding to TYPE (IN/OUT)
        const queryResult = await pool.query('SELECT TYPE,QUANTITY,INV_ITEM_ID FROM mill_inventory_records WHERE INV_REC_ID = ?', [INV_REC_ID]);

        if (queryResult.length > 0) {
            const { TYPE, QUANTITY, INV_ITEM_ID } = queryResult[0];
            if (TYPE === 'IN') {
                const updateResult = await pool.query('UPDATE mill_inventory_items SET STOCK = STOCK - ? WHERE INV_ITEM_ID = ?', [
                    QUANTITY,
                    INV_ITEM_ID,
                ]);
            }
            else if (TYPE === 'OUT') {
                const updateResult = await pool.query('UPDATE mill_inventory_items SET STOCK = STOCK + ? WHERE INV_ITEM_ID = ?', [
                    QUANTITY,
                    INV_ITEM_ID,
                ]);
            }

            // Update the IS_ACTIVE column to 0
            const updateResult = await pool.query('UPDATE mill_inventory_records SET IS_ACTIVE = 0 WHERE INV_REC_ID = ?', [INV_REC_ID]);

            if (updateResult.affectedRows > 0) {
                return res.status(200).json({ success: true, message: 'Customer deactivated successfully' });
            } else {
                console.error('Error: Failed to deactivate customer:', updateResult.message);
                return res.status(500).json({ success: false, message: 'Internal server error' });
            }

        }
        else {
            console.error('Error: Inv Rec not found');
            return res.status(404).json({ success: false, message: 'Inv Rec not found' });
        }
        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Customer deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate customer:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating customer:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});




module.exports = router;
