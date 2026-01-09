const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');

// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Now you can use pool.query with async/await
router.post('/api/getAllExpenses', async (req, res) => {
    //console.log('Get all Expenses request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active Expenses
        const queryResult = await pool.query('SELECT e.*, i.CODE AS REFERENCE_CODE FROM expenses e INNER JOIN items i ON e.REFERENCE = i.ITEM_ID_AI WHERE e.IS_ACTIVE = 1');

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any Expenses are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active Expenses found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(Expenses => ({ ...Expenses }));

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

router.post('/api/addExpenses', async (req, res) => {
    //console.log('Add Expenses request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Insert the new Expenses data into the database
        const insertResult = await pool.query('INSERT INTO expenses SET ?', req.body);

        if (insertResult.affectedRows > 0) {
            // Generate CODE based on insert ID
            const insertId = insertResult.insertId;
            const code = generateCode(insertId);

            // Update the CODE column with the generated code
            await pool.query('UPDATE expenses SET CODE = ? WHERE EXPENSES_ID = ?', [code, insertId]);


            const queryResult = await pool.query('SELECT EXPENSE_AMOUNT FROM items WHERE ITEM_ID_AI=?',req.body.REFERENCE);
            const newAmount = queryResult[0].EXPENSE_AMOUNT + req.body.AMOUNT;
            await pool.query('UPDATE items SET EXPENSE_AMOUNT = ? WHERE ITEM_ID_AI = ?', [newAmount, req.body.REFERENCE]);

            return res.status(200).json({ success: true, message: 'expenses added successfully' });
        } else {
            console.error('Error: Failed to add Expenses:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding Expenses:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Function to generate CODE based on insert ID
function generateCode(insertId) {
    const paddedId = String(insertId).padStart(4, '0');
    return `EXP${paddedId}`;
}

router.post('/api/updateExpenses', async (req, res) => {
    //console.log('Update Expenses request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const queryResult = await pool.query('SELECT EXPENSE_AMOUNT FROM items WHERE ITEM_ID_AI=?',req.body.OLD_REFERENCE);
        const newAmount = queryResult[0].EXPENSE_AMOUNT - req.body.OLD_AMOUNT;
        await pool.query('UPDATE items SET EXPENSE_AMOUNT = ? WHERE ITEM_ID_AI = ?', [newAmount, req.body.OLD_REFERENCE]);

        const queryResult2 = await pool.query('SELECT EXPENSE_AMOUNT FROM items WHERE ITEM_ID_AI=?',req.body.REFERENCE);
        const newAmount2 = queryResult2[0].EXPENSE_AMOUNT + req.body.AMOUNT;
        await pool.query('UPDATE items SET EXPENSE_AMOUNT = ? WHERE ITEM_ID_AI = ?', [newAmount2, req.body.REFERENCE]);

        delete req.body.OLD_AMOUNT;
        delete req.body.OLD_REFERENCE;

        // Extract the Expenses ID from the request body
        const { EXPENSES_ID, ...updatedCustomerData } = req.body;

        // Update the expenses data in the database
        const updateResult = await pool.query('UPDATE expenses SET ? WHERE EXPENSES_ID = ?', [
            updatedCustomerData,
            EXPENSES_ID,
        ]);



        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Expenses updated successfully' });
        } else {
            console.error('Error: Failed to update Expenses:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error updating Expenses:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/deactivateExpenses', async (req, res) => {
    //console.log('Deactivate Expenses request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the Expenses ID from the request body
        const { EXPENSES_ID } = req.body;

        // Update the IS_ACTIVE column to 0 to deactivate the Expenses
        const updateResult = await pool.query('UPDATE expenses SET IS_ACTIVE = 0 WHERE EXPENSES_ID = ?', [
            EXPENSES_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Expenses deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate Expenses:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating Expenses:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});



module.exports = router;
