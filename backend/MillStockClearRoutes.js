const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');

// Promisify the pool.query method
pool.query = util.promisify(pool.query);

router.post('/api/MilladdStockClear', async (req, res) => {
    console.log('Add transactions request received:', req.body);

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

        const re = {
            NAME: req.body.NAME,
            DATE: req.body.DATE,
            COMMENTS: req.body.COMMENTS,
            CREATED_BY: req.body.CREATED_BY,
            IS_ACTIVE: 1,
        };
        // Insert the new transactions data into the database
        const insertResult = await pool.query('INSERT INTO mill_stock_clearance SET ?', re);

        if (insertResult.affectedRows > 0) {
            const insertId = insertResult.insertId;

            if(req.body.ITEMS && req.body.ITEMS.length > 0) {
                const items = req.body.ITEMS;
                for(let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const itemObj = {
                        SC_ID: insertId,
                        ITEM_ID : item.ITEM_ID,
                        STOCK : item.STOCK,
                    };
                    await pool.query('INSERT INTO mill_stock_clearance_items SET ?', itemObj);

                    await pool.query('UPDATE mill_items SET STOCK = 0 WHERE ITEM_ID = ?', [item.ITEM_ID]);

                }
            }


            return res.status(200).json({ success: true, message: 'stock clearance added successfully' });
        }

    } catch (error) {
        console.error('Error adding transactions:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/MillgetAllStockClearance', async (req, res) => {
    //console.log('Get all Cash Transaction request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT * FROM mill_stock_clearance WHERE IS_ACTIVE = 1 ORDER BY CREATED_DATE DESC');


        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {

            for(let i = 0; i < queryResult.length; i++) {
                //get items realated to the transaction
                queryResult[i].ITEMS = await pool.query('SELECT sti.*,si.CODE as ITEM_CODE,si.NAME as ITEM_NAME FROM mill_stock_clearance_items sti JOIN mill_items si ON sti.ITEM_ID = si.ITEM_ID WHERE sti.SC_ID= ? AND sti.IS_ACTIVE=1', [queryResult[i].SC_ID]);
            }

            //if CREATED_DATE is older than 2 days, set IS_EDITABLE to 0 else 1
            for(let i = 0; i < queryResult.length; i++) {
                const date = new Date(queryResult[i].CREATED_DATE);
                const currentDate = new Date();
                const diffTime = Math.abs(currentDate - date);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if(diffDays > 2) {
                    queryResult[i].IS_EDITABLE = 0;
                } else {
                    queryResult[i].IS_EDITABLE = 1;
            }
        }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));

            // Sort the data array newest first
            data.sort((a, b) => new Date(b.CREATED_DATE) - new Date(a.CREATED_DATE));


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


router.post('/api/MilldeactivateStockClearance', async (req, res) => {
    console.log('Deactivate stock clearance request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        //restore stock from req.body.ITEMS
        if(req.body.ITEMS && req.body.ITEMS.length > 0) {
            const items = req.body.ITEMS;
            for(let i = 0; i < items.length; i++) {
                const item = items[i];
                await pool.query('UPDATE mill_items SET STOCK = STOCK + ? WHERE ITEM_ID = ?', [item.STOCK, item.ITEM_ID]);
            }
        }

        // Deactivate the selected stock clearance
        const updateResult = await pool.query('UPDATE mill_stock_clearance SET IS_ACTIVE = 0 WHERE SC_ID = ?', [req.body.SC_ID]);

        //set mill_stock_clearance_items to inactive
        await pool.query('UPDATE mill_stock_clearance_items SET IS_ACTIVE = 0 WHERE SC_ID = ?', [req.body.SC_ID]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Stock Clearance deactivated successfully' });
        } else {
            return res.status(404).json({ success: false, message: 'Stock Clearance not found' });
        }
    } catch (error) {
        console.error('Error deactivating stock clearance:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}
);


module.exports = router;
