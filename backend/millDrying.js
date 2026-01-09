const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');

// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Now you can use pool.query with async/await
router.post('/api/MillgetAllDrying', async (req, res) => {
    console.log('Get all customers request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active customers sorted by EDITED_DATE
        const queryResult = await pool.query('SELECT * FROM mill_drying WHERE IS_ACTIVE=1 ORDER BY EDITED_DATE DESC');

        //get ROW_ITEM_NAME and DRY_ITEM_NAME from mill_items ( only select 1 row )
        for (let i = 0; i < queryResult.length; i++) {
            const queryResult1 = await pool.query('SELECT NAME FROM mill_items WHERE ITEM_ID = ?', [queryResult[i].ROW_ITEM]);
            queryResult[i].ROW_ITEM_NAME = queryResult1[0].NAME;

            const queryResult2 = await pool.query('SELECT NAME FROM mill_items WHERE ITEM_ID = ?', [queryResult[i].DRY_ITEM]);
            queryResult[i].DRY_ITEM_NAME = queryResult2[0].NAME;
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


router.post('/api/MilladdDrying', async (req, res) => {
    //console.log('Add customer request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Insert the new customer data into the database
        const insertResult = await pool.query('INSERT INTO mill_drying SET ?', req.body);

        if (insertResult.affectedRows > 0) {
            //dry CODE update using insert id like 'DRY000001'
            const updateResult = await pool.query('UPDATE mill_drying SET CODE = ? WHERE DRY_ID = ?', ['DRY' + ('000000' + insertResult.insertId).slice(-6), insertResult.insertId]);

            //reduce ROW_ITEM by ROW_WEIGHT mill_items STOCK and add DRY_ITEM by ROW_WEIGHT mill_items STOCK
            const updateResult1 = await pool.query('UPDATE mill_items SET STOCK = STOCK - ? WHERE ITEM_ID = ?', [req.body.ROW_WEIGHT, req.body.ROW_ITEM]);
            const updateResult2 = await pool.query('UPDATE mill_items SET STOCK = STOCK + ? WHERE ITEM_ID = ?', [req.body.ROW_WEIGHT, req.body.DRY_ITEM]);

            if (updateResult.affectedRows > 0 && updateResult2.affectedRows > 0 && updateResult1.affectedRows > 0) {
                console.log('Stock updated successfully');
                return res.status(200).json({ success: true, message: 'Drying added successfully' });
            }
        } else {
            console.error('Error: Failed to add customer:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding customer:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MillupdateDrying', async (req, res) => {
    //console.log('Update customer request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the customer ID from the request body
        const { DRY_ID } = req.body;

        const updatedCustomerData = {
            ROW_WEIGHT: req.body.ROW_WEIGHT,
            DATE: req.body.DATE,
        };

        // Update the customer data in the database
        const updateResult = await pool.query('UPDATE mill_drying SET ? WHERE DRY_ID = ?', [
            updatedCustomerData,
            DRY_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            //reduce DRY_ITEM by OLD_ROW_WEIGHT mill_items STOCK and add ROW_ITEM by OLD_ROW_WEIGHT mill_items STOCK
            const updateResult1 = await pool.query('UPDATE mill_items SET STOCK = STOCK - ? WHERE ITEM_ID = ?', [req.body.OLD_ROW_WEIGHT, req.body.DRY_ITEM]);
            const updateResult2 = await pool.query('UPDATE mill_items SET STOCK = STOCK + ? WHERE ITEM_ID = ?', [req.body.OLD_ROW_WEIGHT, req.body.ROW_ITEM]);

            //reduce ROW_ITEM by ROW_WEIGHT mill_items STOCK and add DRY_ITEM by ROW_WEIGHT mill_items STOCK
            const updateResult3 = await pool.query('UPDATE mill_items SET STOCK = STOCK - ? WHERE ITEM_ID = ?', [req.body.ROW_WEIGHT, req.body.ROW_ITEM]);
            const updateResult4 = await pool.query('UPDATE mill_items SET STOCK = STOCK + ? WHERE ITEM_ID = ?', [req.body.ROW_WEIGHT, req.body.DRY_ITEM]);

            if (updateResult1.affectedRows > 0 && updateResult2.affectedRows > 0 && updateResult3.affectedRows > 0 && updateResult4.affectedRows > 0) {
                console.log('Stock updated successfully');
                return res.status(200).json({ success: true, message: 'Drying updated successfully' });
            }
        } else {
            console.error('Error: Failed to update customer:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error updating customer:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MilldeactivateDrying', async (req, res) => {
    //console.log('Deactivate customer request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the customer ID from the request body
        const { DRY_ID } = req.body;

        // Update the IS_ACTIVE column to 0 to deactivate the customer
        const updateResult = await pool.query('UPDATE mill_drying SET IS_ACTIVE = 0 WHERE DRY_ID = ?', [
            DRY_ID,
        ]);

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
