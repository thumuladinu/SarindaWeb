const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');
const path = require("path");
const fs = require("fs");
const handlebars = require("handlebars");
const pdf = require("html-pdf");
const Printer = require('pdf-to-printer');
const { query } = require("express");
const { calculateCurrentStock } = require("./stockCalculator");


// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Now you can use pool.query with async/await

// Initialize Database Tables
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_floats (
                FLOAT_ID INT AUTO_INCREMENT PRIMARY KEY,
                USER_ID INT NOT NULL,
                DATE DATE NOT NULL,
                OPENING_AMOUNT DECIMAL(10,2) DEFAULT 0,
                NOTES_BREAKDOWN JSON,
                STATUS VARCHAR(20) DEFAULT 'OPEN',
                CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_date (USER_ID, DATE)
            )
        `);
        console.log("Verified 'cash_floats' table.");
    } catch (err) {
        console.error("Error initializing tables:", err);
    }
})();

// ==========================================
// BALANCE & CASH MANAGEMENT ENDPOINTS
// ==========================================
console.log(">>> BACKEND RELOADED: Balance Fix Applied <<<");

// Save Opening Float - INSERT new record (keeps all records, doesn't replace)
router.post('/api/saveOpeningFloat', async (req, res) => {
    try {
        const { DATE, USER_ID, AMOUNT, NOTES } = req.body;

        // INSERT: Always create a new record (multiple floats per day allowed)
        const sql = `
            INSERT INTO cash_floats (USER_ID, DATE, OPENING_AMOUNT, NOTES_BREAKDOWN, STATUS)
            VALUES (?, ?, ?, ?, 'OPEN')
        `;

        await pool.query(sql, [USER_ID, DATE, AMOUNT, JSON.stringify(NOTES || {})]);

        return res.json({ success: true, message: 'Opening float saved successfully' });
    } catch (error) {
        console.error('Error saving opening float:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Update Existing Opening Float - UPDATE by FLOAT_ID (for web app edits)
router.post('/api/updateOpeningFloat', async (req, res) => {
    try {
        const { FLOAT_ID, AMOUNT, NOTES } = req.body;

        if (!FLOAT_ID) {
            return res.json({ success: false, message: 'FLOAT_ID required for update' });
        }

        const sql = `
            UPDATE cash_floats 
            SET OPENING_AMOUNT = ?, NOTES_BREAKDOWN = ?
            WHERE FLOAT_ID = ?
        `;

        await pool.query(sql, [AMOUNT, JSON.stringify(NOTES || {}), FLOAT_ID]);

        return res.json({ success: true, message: 'Opening float updated successfully' });
    } catch (error) {
        console.error('Error updating opening float:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Get Daily Balance (Real-time)
router.post('/api/getDailyBalance', async (req, res) => {
    try {
        const { DATE, USER_ID } = req.body;

        if (!DATE || !USER_ID) {
            return res.json({ success: false, message: 'Date and User required' });
        }

        // 1. Get Opening Float(s) - Both SUM and individual records
        const sumRows = await pool.query(
            'SELECT SUM(OPENING_AMOUNT) as TOTAL_OPENING FROM cash_floats WHERE USER_ID = ? AND DATE = ?',
            [USER_ID, DATE]
        );
        const individualRows = await pool.query(
            'SELECT FLOAT_ID, OPENING_AMOUNT, NOTES_BREAKDOWN, CREATED_AT FROM cash_floats WHERE USER_ID = ? AND DATE = ? ORDER BY CREATED_AT ASC',
            [USER_ID, DATE]
        );

        const openingAmount = sumRows[0] ? parseFloat(sumRows[0].TOTAL_OPENING || 0) : 0;

        // Build individual floats array for slider UI
        const floats = individualRows.map(row => {
            let notes = {};
            if (row.NOTES_BREAKDOWN) {
                try {
                    notes = typeof row.NOTES_BREAKDOWN === 'string'
                        ? JSON.parse(row.NOTES_BREAKDOWN)
                        : row.NOTES_BREAKDOWN;
                } catch (e) { /* ignore */ }
            }
            return {
                id: row.FLOAT_ID,
                amount: parseFloat(row.OPENING_AMOUNT || 0),
                notes: notes,
                createdAt: row.CREATED_AT
            };
        });

        // Merge notes from all records for summary
        let mergedNotes = {};
        floats.forEach(f => {
            Object.entries(f.notes || {}).forEach(([denom, qty]) => {
                mergedNotes[denom] = (mergedNotes[denom] || 0) + (parseInt(qty) || 0);
            });
        });

        // 2. Get Total SALES (Cash In)
        // Note: Assuming 'Selling' is Cash In. Filtering by METHOD='Cash' if available, otherwise assuming all Selling is cash for now or strictly following user request "Selling" as incoming.
        // User said: "incoming(sell) and out goings(buying and expences)". 
        // IMPORTANT: We need to filter by User to track "money left with cashier".

        // 2. Get Total SALES (Cash In)
        console.log("Fetching Sales for User:", USER_ID, "Date:", DATE);
        const salesRows = await pool.query(`
            SELECT SUM(SUB_TOTAL) as total 
            FROM store_transactions 
            WHERE IS_ACTIVE = 1 
              AND TYPE = 'Selling' 
              AND CREATED_BY = ? 
              AND DATE(CREATED_DATE) = ?
        `, [USER_ID, DATE]);

        // 3. Get Total BUYING (Cash Out)
        // 3. Get Total BUYING (Cash Out)
        console.log("Fetching Buying...");
        const buyingRows = await pool.query(`
            SELECT SUM(SUB_TOTAL) as total 
            FROM store_transactions 
            WHERE IS_ACTIVE = 1 
              AND TYPE = 'Buying' 
              AND CREATED_BY = ? 
              AND DATE(CREATED_DATE) = ?
        `, [USER_ID, DATE]);

        // 4. Get Total EXPENSES (Cash Out)
        // 4. Get Total EXPENSES (Cash Out)
        console.log("Fetching Expenses...");
        const expensesRows = await pool.query(`
            SELECT SUM(SUB_TOTAL) as total 
            FROM store_transactions 
            WHERE IS_ACTIVE = 1 
              AND TYPE = 'Expenses' 
              AND CREATED_BY = ? 
              AND DATE(CREATED_DATE) = ?
        `, [USER_ID, DATE]);

        const sales = parseFloat((salesRows && salesRows[0]?.total) || 0);
        const buying = parseFloat((buyingRows && buyingRows[0]?.total) || 0);
        const expenses = parseFloat((expensesRows && expensesRows[0]?.total) || 0);

        console.log("Calculated Balance Elements:", { openingAmount, sales, buying, expenses });

        // 5. Calculate Balance
        const currentBalance = openingAmount + sales - buying - expenses;

        return res.json({
            success: true,
            data: {
                opening: openingAmount,
                notes: mergedNotes,
                floats: floats,  // Individual records for slider UI
                sales: sales,
                buying: buying,
                expenses: expenses,
                balance: currentBalance
            }
        });

    } catch (error) {
        console.error('Error fetching balance:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});


router.post('/api/getAllSellingTransactions', async (req, res) => {
    //console.log('Get all Cash Transaction request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT t.*,i.ITEM_ID_AI, i.CODE as ITEM_CODE, c.NAME as C_NAME,c.CUSTOMER_ID,c.PHONE_NUMBER  FROM transactions t JOIN items i ON t.REFERENCE = i.ITEM_ID_AI LEFT JOIN customers c ON t.CUSTOMER = c.CUSTOMER_ID WHERE t.IS_ACTIVE = 1 AND t.TYPE = "Selling"');


        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {

            for (let i = 0; i < queryResult.length; i++) {
                queryResult[i].REF_CODE = await pool.query('SELECT CODE as REF_CODE,AMOUNT as REF_AMOUNT , PAYMENT_AMOUNT as REF_PAYMENT_AMOUNT, AMOUNT_SETTLED as REF_AMOUNT_SETTLED, DUE_AMOUNT as REF_DUE_AMOUNT FROM transactions WHERE IS_ACTIVE=1 AND TRANSACTION_ID= ?', [queryResult[i].REFERENCE_TRANSACTION]);
                queryResult[i].PAYMENTS = await pool.query('SELECT * FROM transactions WHERE IS_ACTIVE=1 AND REFERENCE_TRANSACTION= ?', [queryResult[i].TRANSACTION_ID]);
                // console.log('queryResult[i].PAYMENT_ETA_END:', queryResult[i].PAYMENT_ETA_END);
                // console.log('new Date():', new Date());



                if (queryResult[i].DUE_AMOUNT > 0 && queryResult[i].PAYMENT_ETA_END !== null && new Date(queryResult[i].PAYMENT_ETA_END) < new Date()) {
                    // console.log('queryResult[i].PAYMENT_ETA_END:', queryResult[i].PAYMENT_ETA_END);
                    queryResult[i].DUE = true;
                    queryResult[i].NO_OF_LATE_DAYS = Math.floor((new Date() - new Date(queryResult[i].PAYMENT_ETA_END)) / (1000 * 60 * 60 * 24));
                }
            }

            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));
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

router.post('/api/getAllTransactionsCashBook', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Pagination params
        const page = parseInt(req.body.page) || 1;
        const limit = parseInt(req.body.limit) || 50;
        const offset = (page - 1) * limit;

        // Filter params
        const storeNo = req.body.STORE_NO || null;
        const type = req.body.type || null; // 'Buying', 'Selling', etc.
        const search = req.body.search || null;
        const minAmount = req.body.minAmount || null;
        const maxAmount = req.body.maxAmount || null;
        const startDate = req.body.startDate || null;
        const endDate = req.body.endDate || null;
        const itemIds = req.body.itemIds || (req.body.itemId ? [req.body.itemId] : []);

        // Build WHERE clause dynamically
        // STRICT FILTER: Only show Buying, Selling, and Expenses (Financials)
        let whereConditions = [
            'st.IS_ACTIVE = 1',
            "st.TYPE IN ('Buying', 'Selling', 'Expenses')"
        ];
        let queryParams = [];

        if (storeNo) {
            whereConditions.push('st.STORE_NO = ?');
            queryParams.push(storeNo);
        }
        if (type) {
            whereConditions.push('st.TYPE = ?');
            queryParams.push(type);
        }
        if (search) {
            whereConditions.push('(st.CODE LIKE ? OR sc.NAME LIKE ?)');
            queryParams.push(`%${search}%`, `%${search}%`);
        }
        if (minAmount) {
            whereConditions.push('st.SUB_TOTAL >= ?');
            queryParams.push(parseFloat(minAmount));
        }
        if (maxAmount) {
            whereConditions.push('st.SUB_TOTAL <= ?');
            queryParams.push(parseFloat(maxAmount));
        }
        if (startDate) {
            whereConditions.push('DATE(st.CREATED_DATE) >= ?');
            queryParams.push(startDate);
        }
        if (endDate) {
            whereConditions.push('DATE(st.CREATED_DATE) <= ?');
            queryParams.push(endDate);
        }
        if (itemIds && itemIds.length > 0) {
            // Create placeholders for IN clause: ?,?,?
            const placeholders = itemIds.map(() => '?').join(',');
            whereConditions.push(`st.TRANSACTION_ID IN (SELECT TRANSACTION_ID FROM store_transactions_items WHERE ITEM_ID IN (${placeholders}) AND IS_ACTIVE = 1)`);
            queryParams.push(...itemIds);
        }

        const whereClause = whereConditions.join(' AND ');

        // Count total for pagination (without LIMIT)
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM store_transactions st 
            LEFT JOIN store_customers sc ON st.CUSTOMER = sc.CUSTOMER_ID
            WHERE ${whereClause}
        `;
        const countResult = await pool.query(countQuery, queryParams);
        const total = countResult[0]?.total || 0;

        // Main query with pagination - JOIN customer name directly (no N+1)
        const mainQuery = `
            SELECT 
                st.*,
                sc.NAME as C_NAME
            FROM store_transactions st
            LEFT JOIN store_customers sc ON st.CUSTOMER = sc.CUSTOMER_ID
            WHERE ${whereClause}
            ORDER BY st.TRANSACTION_ID DESC
            LIMIT ? OFFSET ?
        `;
        const queryResult = await pool.query(mainQuery, [...queryParams, limit, offset]);

        if (Array.isArray(queryResult)) {
            // Calculate due status (lightweight, no additional queries)
            const data = queryResult.map(row => {
                const transaction = { ...row };
                transaction.C_NAME = transaction.C_NAME || 'N/A';

                if (transaction.TYPE === 'Selling' && transaction.DUE_AMOUNT > 0 &&
                    transaction.DUE_DATE && new Date(transaction.DUE_DATE) < new Date()) {
                    transaction.DUE = true;
                    transaction.NO_OF_LATE_DAYS = Math.floor((new Date() - new Date(transaction.DUE_DATE)) / (1000 * 60 * 60 * 24));
                }

                return transaction;
            });

            return res.status(200).json({
                success: true,
                result: data,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } else {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});



// Get transaction details (items) - called on demand when editing
router.get('/api/getTransactionDetails/:id', async (req, res) => {
    try {
        if (!pool) {
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const transactionId = req.params.id;

        // Get transaction items
        const items = await pool.query(`
            SELECT sti.*, si.CODE as ITEM_CODE, si.NAME as ITEM_NAME 
            FROM store_transactions_items sti 
            LEFT JOIN store_items si ON sti.ITEM_ID = si.ITEM_ID 
            WHERE sti.TRANSACTION_ID = ? AND sti.IS_ACTIVE = 1
        `, [transactionId]);

        // Get transaction basic info with customer
        const transaction = await pool.query(`
            SELECT st.*, sc.NAME as C_NAME 
            FROM store_transactions st 
            LEFT JOIN store_customers sc ON st.CUSTOMER = sc.CUSTOMER_ID 
            WHERE st.TRANSACTION_ID = ?
        `, [transactionId]);

        if (transaction.length === 0) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        return res.status(200).json({
            success: true,
            transaction: transaction[0],
            items: items
        });
    } catch (error) {
        console.error('Error fetching transaction details:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/getAllTransactionsCashBookByUser', async (req, res) => {
    //console.log('Get all Cash Transaction request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch active transactions today and yersterday (exclude weight measurements and inventory adjustments)
        const queryResult = await pool.query(
            "SELECT * FROM store_transactions WHERE IS_ACTIVE = 1 AND TYPE != 'WeightMeasure' AND TYPE NOT IN ('AdjIn', 'AdjOut', 'Opening', 'StockTake', 'Adjustment') AND CREATED_DATE >= CURDATE() - INTERVAL 1 DAY AND STORE_NO = ?",
            [req.body.STORE_NO]
        );


        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {

            for (let i = 0; i < queryResult.length; i++) {
                if (queryResult[i].CUSTOMER !== null) {
                    const c_name = await pool.query('SELECT NAME FROM store_customers WHERE CUSTOMER_ID= ?', [queryResult[i].CUSTOMER]);
                    queryResult[i].C_NAME = c_name[0].NAME;
                }
                else {
                    queryResult[i].C_NAME = 'N/A'
                }

                if (queryResult[i].TYPE === 'Selling' && queryResult[i].DUE_AMOUNT > 0 && queryResult[i].DUE_DATE !== null && new Date(queryResult[i].DUE_DATE) < new Date()) {
                    queryResult[i].DUE = true;
                    queryResult[i].NO_OF_LATE_DAYS = Math.floor((new Date() - new Date(queryResult[i].DUE_DATE)) / (1000 * 60 * 60 * 24));
                }

                //get items realated to the transaction
                queryResult[i].ITEMS = await pool.query('SELECT sti.*,si.CODE as ITEM_CODE,si.NAME as ITEM_NAME FROM store_transactions_items sti JOIN store_items si ON sti.ITEM_ID = si.ITEM_ID WHERE sti.TRANSACTION_ID= ? AND sti.IS_ACTIVE=1', [queryResult[i].TRANSACTION_ID]);
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




router.post('/api/getTodayTransactionData', async (req, res) => {
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions with today's date
        const queryResult = await pool.query(`
            SELECT t.CODE, t.PAYMENT_AMOUNT,t.TYPE,t.DATE, i.CODE AS ITEM_CODE, c.NAME AS C_NAME
            FROM transactions t
            JOIN items i ON t.REFERENCE = i.ITEM_ID_AI
            LEFT JOIN customers c ON t.CUSTOMER = c.CUSTOMER_ID
            WHERE t.IS_ACTIVE = 1 AND DATE(t.CREATED_DATE) = CURDATE() AND t.PAYMENT_AMOUNT > 0
        `);

        queryResult.sort((a, b) => new Date(b.CREATED_DATE) - new Date(a.CREATED_DATE));

        if (queryResult.length !== 0) {
            return res.status(200).json({ success: true, result: queryResult });
        } else {
            return res.status(404).json({ success: false, message: 'No transactions found for today' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/getAllBankTransactions', async (req, res) => {
    //console.log('Get all Bank Transaction request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT t.*,i.ITEM_ID_AI, i.CODE as ITEM_CODE, c.NAME as C_NAME,c.PHONE_NUMBER,c.COMPANY,c.CUSTOMER_ID FROM transactions t JOIN items i ON t.REFERENCE = i.ITEM_ID_AI JOIN customers c ON t.CUSTOMER = c.CUSTOMER_ID WHERE t.IS_ACTIVE = 1 AND t.METHOD = "Bank"');


        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {

            for (let i = 0; i < queryResult.length; i++) {
                queryResult[i].REF_CODE = await pool.query('SELECT CODE as REF_CODE,AMOUNT as REF_AMOUNT , PAYMENT_AMOUNT as REF_PAYMENT_AMOUNT, AMOUNT_SETTLED as REF_AMOUNT_SETTLED, DUE_AMOUNT as REF_DUE_AMOUNT FROM transactions WHERE IS_ACTIVE=1 AND TRANSACTION_ID= ?', [queryResult[i].REFERENCE_TRANSACTION]);
                queryResult[i].PAYMENTS = await pool.query('SELECT * FROM transactions WHERE IS_ACTIVE=1 AND REFERENCE_TRANSACTION= ? AND (TYPE="B Payment" OR TYPE="S Payment")', [queryResult[i].TRANSACTION_ID]);
            }

            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));

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

router.post('/api/getAllTransactions', async (req, res) => {
    // console.log('Get all Cash Transaction request received:req.body:', req.body);
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        const { id } = req.body;

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT t.*,i.ITEM_ID_AI, i.CODE as ITEM_CODE, c.NAME as C_NAME,c.PHONE_NUMBER,c.COMPANY,c.CUSTOMER_ID FROM transactions t JOIN items i ON t.REFERENCE = i.ITEM_ID_AI JOIN customers c ON t.CUSTOMER = c.CUSTOMER_ID WHERE t.IS_ACTIVE = 1 AND t.REFERENCE = ? AND (t.TYPE="Buying" OR t.TYPE="Selling")', [id]);


        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            //console.log('queryResult:', queryResult);

            for (let i = 0; i < queryResult.length; i++) {
                queryResult[i].REF_CODE = await pool.query('SELECT CODE as REF_CODE,AMOUNT as REF_AMOUNT , PAYMENT_AMOUNT as REF_PAYMENT_AMOUNT, AMOUNT_SETTLED as REF_AMOUNT_SETTLED, DUE_AMOUNT as REF_DUE_AMOUNT FROM transactions WHERE IS_ACTIVE=1 AND TRANSACTION_ID= ?', [queryResult[i].REFERENCE_TRANSACTION]);
                queryResult[i].PAYMENTS = await pool.query('SELECT * FROM transactions WHERE IS_ACTIVE=1 AND REFERENCE_TRANSACTION= ?', [queryResult[i].TRANSACTION_ID]);
            }

            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));
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


router.post('/api/searchCash', async (req, res) => {
    //console.log('Search Cash request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { code, status, itemId, startDate, endDate } = req.body;

        // Construct the WHERE clause based on the search criteria
        const whereClause = [];
        if (code) {
            whereClause.push(`t.CODE LIKE '%${code}%'`);
        }
        if (status) {
            whereClause.push(`t.STATUS = '${status}'`);
        }
        if (startDate && endDate) {
            whereClause.push(`t.DATE BETWEEN '${startDate}' AND '${endDate}'`);
        }

        // Query to search for transactions based on the search criteria
        const queryString = `
            SELECT t.*,i.ITEM_ID_AI, i.CODE as ITEM_CODE, c.NAME as C_NAME c.PHONE_NUMBER,c.COMPANY,c.CUSTOMER_ID
            FROM transactions t
            JOIN items i ON t.REFERENCE = i.ITEM_ID_AI
            JOIN customers c ON t.CUSTOMER = c.CUSTOMER_ID
            WHERE t.IS_ACTIVE = 1 AND t.METHOD = "Cash" ${whereClause.length > 0 ? 'AND ' + whereClause.join(' AND ') : ''}
        `;

        const queryResult = await pool.query(queryString);

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            for (let i = 0; i < queryResult.length; i++) {
                queryResult[i].REF_CODE = await pool.query('SELECT CODE as REF_CODE, AMOUNT as REF_AMOUNT , PAYMENT_AMOUNT as REF_PAYMENT_AMOUNT, AMOUNT_SETTLED as REF_AMOUNT_SETTLED, DUE_AMOUNT as REF_DUE_AMOUNT FROM transactions WHERE IS_ACTIVE=1 AND TRANSACTION_ID= ?', [queryResult[i].REFERENCE_TRANSACTION]);
                queryResult[i].PAYMENTS = await pool.query('SELECT * FROM transactions WHERE IS_ACTIVE=1 AND REFERENCE_TRANSACTION= ? AND (TYPE="B Payment" OR TYPE="S Payment")', [queryResult[i].TRANSACTION_ID]);
            }

            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));

            return res.status(200).json({ success: true, result: data, message: 'Transactions found matching the search criteria' });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/searchBuying', async (req, res) => {
    //console.log('Search Cash request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { code, status, itemId, startDate, endDate } = req.body;

        // Construct the WHERE clause based on the search criteria
        const whereClause = [];
        if (code) {
            whereClause.push(`t.CODE LIKE '%${code}%'`);
        }
        if (status) {
            whereClause.push(`t.METHOD = '${status}'`);
        }
        if (startDate && endDate) {
            whereClause.push(`t.DATE BETWEEN '${startDate}' AND '${endDate}'`);
        }

        // Query to search for transactions based on the search criteria
        const queryString = `
            SELECT t.*, i.ITEM_ID_AI, i.CODE as ITEM_CODE, c.NAME as C_NAME, c.PHONE_NUMBER, c.COMPANY, c.CUSTOMER_ID
            FROM transactions t
            JOIN items i ON t.REFERENCE = i.ITEM_ID_AI
            JOIN customers c ON t.CUSTOMER = c.CUSTOMER_ID
            WHERE t.IS_ACTIVE = 1 AND t.TYPE = "Buying" ${whereClause.length > 0 ? 'AND ' + whereClause.join(' AND ') : ''}
        `;

        const queryResult = await pool.query(queryString);

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            for (let i = 0; i < queryResult.length; i++) {
                queryResult[i].REF_CODE = await pool.query('SELECT CODE as REF_CODE, AMOUNT as REF_AMOUNT , PAYMENT_AMOUNT as REF_PAYMENT_AMOUNT, AMOUNT_SETTLED as REF_AMOUNT_SETTLED, DUE_AMOUNT as REF_DUE_AMOUNT FROM transactions WHERE IS_ACTIVE=1 AND TRANSACTION_ID= ?', [queryResult[i].REFERENCE_TRANSACTION]);
                queryResult[i].PAYMENTS = await pool.query('SELECT * FROM transactions WHERE IS_ACTIVE=1 AND REFERENCE_TRANSACTION= ? AND (TYPE="B Payment" OR TYPE="S Payment")', [queryResult[i].TRANSACTION_ID]);

                if (queryResult[i].DUE_AMOUNT > 0 && queryResult[i].PAYMENT_ETA_END !== null && new Date(queryResult[i].PAYMENT_ETA_END) < new Date()) {
                    queryResult[i].DUE = true;
                    queryResult[i].NO_OF_LATE_DAYS = Math.floor((new Date() - new Date(queryResult[i].PAYMENT_ETA_END)) / (1000 * 60 * 60 * 24));
                }
            }

            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));
            data.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));

            return res.status(200).json({ success: true, result: data, message: 'Transactions found matching the search criteria' });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/searchSelling', async (req, res) => {
    //console.log('Search Cash request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { code, status, itemId, startDate, endDate } = req.body;

        // Construct the WHERE clause based on the search criteria
        const whereClause = [];
        if (code) {
            whereClause.push(`t.CODE LIKE '%${code}%'`);
        }
        if (status) {
            whereClause.push(`t.METHOD = '${status}'`);
        }
        if (startDate && endDate) {
            whereClause.push(`t.DATE BETWEEN '${startDate}' AND '${endDate}'`);
        }

        // Query to search for transactions based on the search criteria
        const queryString = `
            SELECT t.*, i.ITEM_ID_AI, i.CODE as ITEM_CODE, c.NAME as C_NAME, c.PHONE_NUMBER, c.COMPANY, c.CUSTOMER_ID
            FROM transactions t
            JOIN items i ON t.REFERENCE = i.ITEM_ID_AI
            JOIN customers c ON t.CUSTOMER = c.CUSTOMER_ID
            WHERE t.IS_ACTIVE = 1 AND t.TYPE = "Selling" ${whereClause.length > 0 ? 'AND ' + whereClause.join(' AND ') : ''}
        `;

        const queryResult = await pool.query(queryString);

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            for (let i = 0; i < queryResult.length; i++) {
                queryResult[i].REF_CODE = await pool.query('SELECT CODE as REF_CODE, AMOUNT as REF_AMOUNT , PAYMENT_AMOUNT as REF_PAYMENT_AMOUNT, AMOUNT_SETTLED as REF_AMOUNT_SETTLED, DUE_AMOUNT as REF_DUE_AMOUNT FROM transactions WHERE IS_ACTIVE=1 AND TRANSACTION_ID= ?', [queryResult[i].REFERENCE_TRANSACTION]);
                queryResult[i].PAYMENTS = await pool.query('SELECT * FROM transactions WHERE IS_ACTIVE=1 AND REFERENCE_TRANSACTION= ? AND (TYPE="B Payment" OR TYPE="S Payment")', [queryResult[i].TRANSACTION_ID]);

                if (queryResult[i].DUE_AMOUNT > 0 && queryResult[i].PAYMENT_ETA_END !== null && new Date(queryResult[i].PAYMENT_ETA_END) < new Date()) {
                    queryResult[i].DUE = true;
                    queryResult[i].NO_OF_LATE_DAYS = Math.floor((new Date() - new Date(queryResult[i].PAYMENT_ETA_END)) / (1000 * 60 * 60 * 24));
                }
            }

            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));
            data.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));

            return res.status(200).json({ success: true, result: data, message: 'Transactions found matching the search criteria' });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


router.post('/api/searchBank', async (req, res) => {
    //console.log('Search Bank request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { code, status, itemId, startDate, endDate } = req.body;

        // Construct the WHERE clause based on the search criteria
        const whereClause = [];
        if (code) {
            whereClause.push(`t.CODE LIKE '%${code}%'`);
        }
        if (status) {
            whereClause.push(`t.STATUS = '${status}'`);
        }
        if (startDate && endDate) {
            whereClause.push(`t.DATE BETWEEN '${startDate}' AND '${endDate}'`);
        }

        // Query to search for transactions based on the search criteria
        const queryString = `
            SELECT t.*,i.ITEM_ID_AI, i.CODE as ITEM_CODE, c.NAME as C_NAME, c.PHONE_NUMBER, c.COMPANY,c.CUSTOMER_ID
            FROM transactions t
            JOIN items i ON t.REFERENCE = i.ITEM_ID_AI
            JOIN customers c ON t.CUSTOMER = c.CUSTOMER_ID
            WHERE t.IS_ACTIVE = 1 AND t.METHOD = "Bank" ${whereClause.length > 0 ? 'AND ' + whereClause.join(' AND ') : ''}
        `;

        const queryResult = await pool.query(queryString);

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            for (let i = 0; i < queryResult.length; i++) {
                queryResult[i].REF_CODE = await pool.query('SELECT CODE as REF_CODE, AMOUNT as REF_AMOUNT , PAYMENT_AMOUNT as REF_PAYMENT_AMOUNT, AMOUNT_SETTLED as REF_AMOUNT_SETTLED, DUE_AMOUNT as REF_DUE_AMOUNT FROM transactions WHERE IS_ACTIVE=1 AND TRANSACTION_ID= ?', [queryResult[i].REFERENCE_TRANSACTION]);
                queryResult[i].PAYMENTS = await pool.query('SELECT * FROM transactions WHERE IS_ACTIVE=1 AND REFERENCE_TRANSACTION= ? AND (TYPE="B Payment" OR TYPE="S Payment")', [queryResult[i].TRANSACTION_ID]);
            }

            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));

            return res.status(200).json({ success: true, result: data, message: 'Transactions found matching the search criteria' });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


router.post('/api/addTransaction', async (req, res) => {
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



        // Resolve CREATED_BY if it's a string (e.g. 'Admin')
        let createdBy = req.body.CREATED_BY;
        if (createdBy && isNaN(createdBy)) {
            // Try to find user by Name or Username
            const userRes = await pool.query('SELECT USER_ID FROM user_details WHERE NAME = ? OR USERNAME = ? LIMIT 1', [createdBy, createdBy]);
            if (userRes.length > 0) {
                createdBy = userRes[0].USER_ID;
            } else {
                // Determine a fallback or let it fail? 
                // Better to set to null or 1 (usually admin) if not found? 
                // Let's try 1 if 'Admin'
                if (createdBy === 'Admin') createdBy = 1;
                // Or just keep it and let DB error if no match found
            }
        }

        const re = {
            TYPE: req.body.TYPE,
            CUSTOMER: req.body.CUSTOMER ? req.body.CUSTOMER : null,
            METHOD: req.body.METHOD ? req.body.METHOD : null,
            DATE: req.body.DATE,
            SUB_TOTAL: req.body.SUB_TOTAL,
            PAYMENT_AMOUNT: req.body.AMOUNT_SETTLED ? req.body.AMOUNT_SETTLED : req.body.SUB_TOTAL,
            AMOUNT_SETTLED: req.body.AMOUNT_SETTLED ? req.body.AMOUNT_SETTLED : req.body.SUB_TOTAL,
            DUE_AMOUNT: req.body.DUE_AMOUNT ? req.body.DUE_AMOUNT : 0,
            DUE_DATE: req.body.DUE_DATE ? req.body.DUE_DATE : null,
            CHEQUE_NO: req.body.CHEQUE_NO ? req.body.CHEQUE_NO : null,
            CHEQUE_EXPIRY: req.body.CHEQUE_EXPIRY ? req.body.CHEQUE_EXPIRY : null,
            BANK_NAME: req.body.BANK_NAME ? req.body.BANK_NAME : null,
            IS_CHEQUE_COLLECTED: req.body.IS_CHEQUE_COLLECTED ? req.body.IS_CHEQUE_COLLECTED : 0,
            BANK_TRANS_DATETIME: req.body.BANK_TRANS_DATETIME ? req.body.BANK_TRANS_DATETIME : null,
            COMMENTS: req.body.COMMENTS,
            CREATED_BY: createdBy,
            STORE_NO: req.body.STORE_NO,
        }

        console.log('re:', re);

        // Insert the new transactions data into the database
        const insertResult = await pool.query('INSERT INTO store_transactions SET ?', re);

        if (insertResult.affectedRows > 0) {
            const insertId = insertResult.insertId;
            const type = req.body.TYPE;
            const storeNo = req.body.STORE_NO;

            // const code = generateCode(insertId, type, storeNo);
            const code = req.body.CODE ? req.body.CODE : generateCode(insertId, type, storeNo);

            // billPrinter(req.body.ITEMS,code,req.body.SUB_TOTAL,res);

            const updateArry = {
                CODE: code,
                REFERENCE_TRANSACTION: insertId,
            }

            // Update the CODE column with the generated code
            await pool.query('UPDATE store_transactions SET ? WHERE TRANSACTION_ID = ?', [updateArry, insertId]);




            if (req.body.ITEMS && req.body.ITEMS.length > 0) {
                const items = req.body.ITEMS;
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const itemObj = {
                        TRANSACTION_ID: insertId,
                        ITEM_ID: item.ITEM_ID,
                        PRICE: item.PRICE,
                        QUANTITY: item.QUANTITY,
                        TOTAL: item.TOTAL,
                        CREATED_BY: createdBy,
                    };
                    await pool.query('INSERT INTO store_transactions_items SET ?', itemObj);

                    //update stocks of items
                    const quantity = parseFloat(item.QUANTITY) || 0;
                    let delta = 0;

                    if (type === 'Selling') {
                        delta = -quantity;
                    } else if (type === 'Buying') {
                        delta = quantity;
                    }

                    await adjustStock(item.ITEM_ID, item.STORE_NO || storeNo || req.body.STORE_NO, delta);
                }
            }

            if (type === 'Return') {
                const { createNotification } = require('./notificationService');
                const itemName = req.body.ITEMS && req.body.ITEMS.length > 0 ? req.body.ITEMS[0].ITEM_NAME : 'items';
                const qty = req.body.ITEMS && req.body.ITEMS.length > 0 ? req.body.ITEMS[0].QUANTITY : '';
                await createNotification(
                    'RETURN',
                    insertId,
                    'New Return Registered',
                    `A return of ${qty} kg ${itemName} was recorded at Store ${storeNo}`
                );
            }

            return res.status(200).json({ success: true, message: 'transactions added successfully', transactionId: insertId, code: code });
        }

    } catch (error) {
        console.error('Error adding transactions:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

function billPrinter(ITEMS, CODE, SUB_TOTAL, res) {
    try {
        const data = {};

        data.DATE = new Date().toLocaleDateString();
        // add SUB_TOTAL toFixed(1) and add space between each 3 digits
        data.SUB_TOTAL = (parseFloat(SUB_TOTAL)).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        data.TIME = new Date().toLocaleTimeString();
        data.CODE = CODE;

        if (ITEMS.length > 0) {
            ITEMS.forEach((item) => {
                item.PRICE = (parseFloat(item.PRICE)).toFixed(1);
                item.QUANTITY = (parseFloat(item.QUANTITY)).toFixed(1);
                item.TOTAL = (parseFloat(item.TOTAL)).toFixed(1);
            });
            //if Same Item is repeated in the bill then Set ITEM_NAME to null after first same item and arrange same items in to close to each other
            for (let i = 0; i < ITEMS.length; i++) {
                const currentItem = ITEMS[i];
                if (currentItem.ITEM_NAME !== null) {
                    for (let j = i + 1; j < ITEMS.length; j++) {
                        const nextItem = ITEMS[j];
                        if (nextItem.ITEM_NAME === currentItem.ITEM_NAME) {
                            // If the next item is the same as the current one, set its ITEM_NAME to null
                            nextItem.ITEM_NAME = null;
                            // Swap the repeated item with the next non-repeated item
                            ITEMS[j] = ITEMS[i + 1];
                            ITEMS[i + 1] = nextItem;
                            // Increment i to skip the repeated item in the next iteration
                            i++;
                        }
                    }
                }
            }
        }
        data.ITEMS = ITEMS;

        // Compile the template
        const templatePath = path.join(__dirname, 'bill_format.html');
        const htmlTemplate = fs.readFileSync(templatePath, 'utf-8');
        const compiledTemplate = handlebars.compile(htmlTemplate);

        // Render the template with data
        const renderedHtml = compiledTemplate(data);

        const pdfOptions = {
            // Set the page size to 80mm width and auto height
            width: '76mm',
            height: '297mm', // Assuming standard A4 size (297mm height)
        };

        pdf.create(renderedHtml, pdfOptions).toBuffer((err, buffer) => {
            if (err) {
                console.error('Error generating PDF:', err);
                res.json({ success: false, message: err.message });
            } else {
                console.log('PDF generated successfully!');
                // Print the pdf using Default printer
                const filename = path.join(__dirname, 'bill.pdf');
                fs.writeFileSync(filename, buffer);

                const printOptions = {
                    scale: "noscale",
                }

                Printer.print(filename, printOptions, (err) => {
                    if (err) {
                        console.error('Error printing PDF:', err);
                        res.json({ success: false, message: err.message });
                    } else {
                        console.log('PDF printed successfully!');
                        res.json({ success: true, message: 'PDF printed successfully' });
                    }
                }
                );
            }
        });

    } catch (error) {
        console.error('Error generating PDF:', error.message);
        res.json({ success: false, message: error.message });
    }
}


router.post('/api/updateTransaction', async (req, res) => {
    console.log('Update transactions request received:', req.body);

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
            TYPE: req.body.TYPE,
            CUSTOMER: req.body.CUSTOMER ? req.body.CUSTOMER : null,
            METHOD: req.body.METHOD ? req.body.METHOD : null,
            DATE: req.body.DATE,
            SUB_TOTAL: req.body.SUB_TOTAL,
            PAYMENT_AMOUNT: req.body.SUB_TOTAL,
            AMOUNT_SETTLED: req.body.AMOUNT_SETTLED ? req.body.AMOUNT_SETTLED : req.body.SUB_TOTAL,
            DUE_AMOUNT: req.body.DUE_AMOUNT ? req.body.DUE_AMOUNT : 0,
            DUE_DATE: req.body.DUE_DATE ? req.body.DUE_DATE : null,
            CHEQUE_NO: req.body.CHEQUE_NO ? req.body.CHEQUE_NO : null,
            CHEQUE_EXPIRY: req.body.CHEQUE_EXPIRY ? req.body.CHEQUE_EXPIRY : null,
            BANK_NAME: req.body.BANK_NAME ? req.body.BANK_NAME : null,
            IS_CHEQUE_COLLECTED: req.body.IS_CHEQUE_COLLECTED ? req.body.IS_CHEQUE_COLLECTED : 0,
            BANK_TRANS_DATETIME: req.body.BANK_TRANS_DATETIME ? req.body.BANK_TRANS_DATETIME : null,
            COMMENTS: req.body.COMMENTS,
            BILL_DATA: req.body.BILL_DATA ? (typeof req.body.BILL_DATA === 'object' ? JSON.stringify(req.body.BILL_DATA) : req.body.BILL_DATA) : null,
        }
        console.log('re:', re);

        // Update the transactions data into the database
        const updateResult = await pool.query('UPDATE store_transactions SET ? WHERE TRANSACTION_ID = ?', [re, req.body.TRANSACTION_ID]);

        if (updateResult.affectedRows > 0) {

            //undo the previous transaction STOCK update
            const prevItems = await pool.query('SELECT * FROM store_transactions_items WHERE TRANSACTION_ID = ? AND IS_ACTIVE = 1', [req.body.TRANSACTION_ID]);

            // Get original STORE_NO for reverting
            const [origTrans] = await pool.query('SELECT STORE_NO FROM store_transactions WHERE TRANSACTION_ID = ?', [req.body.TRANSACTION_ID]);
            const prevStoreNo = origTrans ? origTrans.STORE_NO : '1';

            // console.log('prevItems:', prevItems);
            for (let i = 0; i < prevItems.length; i++) {
                const item = prevItems[i];
                const quantity = parseFloat(item.QUANTITY) || 0;
                let delta = 0;

                if (req.body.TYPE === 'Selling') {
                    // Was Selling (-), so now we Add back (+)
                    delta = quantity;
                } else if (req.body.TYPE === 'Buying') {
                    // Was Buying (+), so now we Subtract (-)
                    delta = -quantity;
                }

                await adjustStock(item.ITEM_ID, prevStoreNo, delta);
            }
            //deactivate the previous transaction items
            await pool.query('UPDATE store_transactions_items SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [req.body.TRANSACTION_ID]);

            if (req.body.ITEMS && req.body.ITEMS.length > 0) {
                const items = req.body.ITEMS;
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const itemObj = {
                        TRANSACTION_ID: req.body.TRANSACTION_ID,
                        ITEM_ID: item.ITEM_ID,
                        PRICE: item.PRICE,
                        QUANTITY: item.QUANTITY,
                        TOTAL: item.TOTAL,
                        CREATED_BY: req.body.CREATED_BY,
                    };
                    await pool.query('INSERT INTO store_transactions_items SET ?', itemObj);

                    //update stocks of items
                    const quantity = parseFloat(item.QUANTITY) || 0;
                    let delta = 0;

                    if (req.body.TYPE === 'Selling') {
                        delta = -quantity;
                    } else if (req.body.TYPE === 'Buying') {
                        delta = quantity;
                    }

                    // Use new STORE_NO from body
                    await adjustStock(item.ITEM_ID, req.body.STORE_NO, delta);
                }
            }

            return res.status(200).json({ success: true, message: 'transactions updated successfully' });
        }

    } catch (error) {
        console.error('Error adding transactions:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});



// Function to generate CODE based on TYPE and additional fields
function generateCode(insertId, type, storeNo) {
    //console.log('Generating code for type:', type);
    let code = '';

    if (type === 'Selling') {
        code = storeNo + 'S' + padWithZeros(insertId);
    } else if (type === 'Buying') {
        code = storeNo + 'B' + padWithZeros(insertId);
    }
    return code;
}

// Helper function to pad the insertId with zeros
function padWithZeros(insertId) {
    //console.log('Insert ID:', insertId);
    const zeros = '00000000';
    const paddedId = zeros + insertId;
    return paddedId.slice(-8);
}

router.post('/api/addPayment', async (req, res) => {
    //console.log('Add Payment request received:', req.body);

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
            REFERENCE_TRANSACTION: req.body.TRANSACTION,
            TYPE: 'Payment',
            DATE: req.body.DATE,
            METHOD: req.body.METHOD,
            CUSTOMER: req.body.CUSTOMER,
            SUB_TOTAL: req.body.SUB_TOTAL,
            AMOUNT_SETTLED: Number(req.body.AMOUNT_SETTLED) + Number(req.body.PAYMENT_AMOUNT),
            DUE_AMOUNT: Number(req.body.DUE_AMOUNT) - Number(req.body.PAYMENT_AMOUNT),
            CREATED_BY: req.body.CREATED_BY,
            COMMENTS: req.body.COMMENTS,
            PAYMENT_AMOUNT: req.body.PAYMENT_AMOUNT,
            STORE_NO: req.body.STORE_NO,
        };

        // Insert the new transactions data into the database
        const insertResult = await pool.query('INSERT INTO store_transactions SET ?', re);

        if (insertResult.affectedRows > 0) {
            //console.log('payment added successfully');
            const insertId = insertResult.insertId;
            const type = req.body.TYPE;

            const code = generateCodeForPayment(insertId, type);
            //console.log('Generated code:', code);

            // Update the CODE column with the generated code
            await pool.query('UPDATE store_transactions SET CODE = ? WHERE TRANSACTION_ID = ?', [code, insertId]);

            await pool.query('UPDATE store_transactions SET AMOUNT_SETTLED = ?, DUE_AMOUNT = ? WHERE REFERENCE_TRANSACTION = ?', [re.AMOUNT_SETTLED, re.DUE_AMOUNT, req.body.TRANSACTION]);

            return res.status(200).json({ success: true, message: 'Payment added successfully' });
        } else {
            console.error('Error: Failed to add payment:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding payment:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/updatePayment', async (req, res) => {
    //console.log('Add Payment request received:', req.body);

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
            DATE: req.body.DATE,
            METHOD: req.body.METHOD,
            CUSTOMER: req.body.CUSTOMER,
            SUB_TOTAL: req.body.SUB_TOTAL,
            AMOUNT_SETTLED: Number(req.body.AMOUNT_SETTLED) + Number(req.body.PAYMENT_AMOUNT),
            DUE_AMOUNT: Number(req.body.DUE_AMOUNT) - Number(req.body.PAYMENT_AMOUNT),
            COMMENTS: req.body.COMMENTS,
            PAYMENT_AMOUNT: req.body.PAYMENT_AMOUNT,
        };

        // Insert the new transactions data into the database
        const updateResult = await pool.query('UPDATE store_transactions SET ? WHERE TRANSACTION_ID = ?', [re, req.body.TRANSACTION_ID]);

        if (updateResult.affectedRows > 0) {

            await pool.query('UPDATE store_transactions SET AMOUNT_SETTLED = ?, DUE_AMOUNT = ? WHERE REFERENCE_TRANSACTION = ?', [re.AMOUNT_SETTLED, re.DUE_AMOUNT, req.body.TRANSACTION]);

            return res.status(200).json({ success: true, message: 'Payment added successfully' });
        } else {
            console.error('Error: Failed to add payment:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding payment:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

function generateCodeForPayment(insertId, type) {
    //console.log('Generating code for type:', type);
    let code = 'P' + padWithZeros(insertId);
    return code;
}



router.post('/api/deactivateTransaction', async (req, res) => {
    //console.log('Deactivate transactions request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the transactions ID from the request body
        const { TRANSACTION_ID, ALL, ITEM_DEL } = req.body;

        let updateResult;

        // Update the IS_ACTIVE column to 0 to deactivate the transactions
        console.log('ALL:', ALL);
        if (ALL) {
            updateResult = await pool.query('UPDATE store_transactions SET IS_ACTIVE = 0 WHERE REFERENCE_TRANSACTION = ?', [
                TRANSACTION_ID,
            ]);
        }
        else {
            updateResult = await pool.query('UPDATE store_transactions SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [
                TRANSACTION_ID,
            ]);
        }

        if (ITEM_DEL) {
            //undo the previous transaction STOCK update
            const prevItems = await pool.query('SELECT * FROM store_transactions_items WHERE TRANSACTION_ID = ? AND IS_ACTIVE = 1', [TRANSACTION_ID]);

            // Get original STORE_NO for reverting
            const [origTrans] = await pool.query('SELECT STORE_NO FROM store_transactions WHERE TRANSACTION_ID = ?', [TRANSACTION_ID]);
            const prevStoreNo = origTrans ? origTrans.STORE_NO : '1';

            for (let i = 0; i < prevItems.length; i++) {
                const item = prevItems[i];
                const quantity = parseFloat(item.QUANTITY) || 0;
                let delta = 0;

                // For delete, we REVERT the action
                if (req.body.TYPE === 'Selling') {
                    // Was Selling (-), so we Add (+)
                    delta = quantity;
                } else if (req.body.TYPE === 'Buying') {
                    // Was Buying (+), so we Subtract (-)
                    delta = -quantity;
                }

                await adjustStock(item.ITEM_ID, prevStoreNo, delta);
            }

            const deactiveItemsQuery = await pool.query('UPDATE store_transactions_items SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [
                TRANSACTION_ID,
            ]);
        }

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'transactions deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate transactions:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating transactions:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/deletePayment', async (req, res) => {
    //console.log('Deactivate payment request received:', req.body);

    let newValues;
    let updateResult;
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the payment ID from the request body
        const { TRANSACTION_ID, PAYMENT_AMOUNT, AMOUNT_SETTLED, DUE_AMOUNT, REFERENCE_TRANSACTION } = req.body;

        newValues = {
            AMOUNT_SETTLED: Number(AMOUNT_SETTLED) - Number(PAYMENT_AMOUNT),
            DUE_AMOUNT: Number(DUE_AMOUNT) + Number(PAYMENT_AMOUNT),
        }

        updateResult = await pool.query('UPDATE transactions SET AMOUNT_SETTLED = ?, DUE_AMOUNT = ? WHERE TRANSACTION_ID = ?', [newValues.AMOUNT_SETTLED, newValues.DUE_AMOUNT, REFERENCE_TRANSACTION]);

        let updateResult1 = await pool.query('UPDATE transactions SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [TRANSACTION_ID]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'payment deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate payment:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating payment:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/getTransactionForReference', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT TRANSACTION_ID, CODE, EDITED_DATE FROM store_transactions WHERE IS_ACTIVE = 1 AND TYPE = "Selling" AND STORE_NO = ?', [req.body.STORE_NO]);

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any transactions are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));

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

router.post('/api/getAllTransactionForReference', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT t.TRANSACTION_ID, t.CODE, i.CODE as ITEM_CODE FROM transactions t JOIN items i ON t.REFERENCE = i.ITEM_ID_AI WHERE t.IS_ACTIVE = 1');

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any transactions are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));

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
router.post('/api/getTransactionDetails', async (req, res) => {
    //console.log('Get transactions Details request received:', req.body);
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT * FROM store_transactions WHERE TRANSACTION_ID = ?', [req.body.TRANSACTION_ID]);

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any transactions are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));

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

router.post('/api/getAllDueTransactions', async (req, res) => {
    console.log('Get all Cash Transaction request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT t.*,i.ITEM_ID_AI, i.CODE as ITEM_CODE, c.NAME as C_NAME,c.PHONE_NUMBER,c.COMPANY,c.CUSTOMER_ID  FROM transactions t JOIN items i ON t.REFERENCE = i.ITEM_ID_AI LEFT JOIN customers c ON t.CUSTOMER = c.CUSTOMER_ID WHERE t.IS_ACTIVE = 1 AND t.DUE_AMOUNT > 0 AND t.PAYMENT_ETA_END < NOW() AND (t.TYPE = "Selling" OR t.TYPE = "Buying")');


        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // console.log('queryResult:', queryResult);

            for (let i = 0; i < queryResult.length; i++) {
                queryResult[i].REF_CODE = await pool.query('SELECT CODE as REF_CODE,AMOUNT as REF_AMOUNT , PAYMENT_AMOUNT as REF_PAYMENT_AMOUNT, AMOUNT_SETTLED as REF_AMOUNT_SETTLED, DUE_AMOUNT as REF_DUE_AMOUNT FROM transactions WHERE IS_ACTIVE=1 AND TRANSACTION_ID= ?', [queryResult[i].REFERENCE_TRANSACTION]);
                queryResult[i].PAYMENTS = await pool.query('SELECT * FROM transactions WHERE IS_ACTIVE=1 AND REFERENCE_TRANSACTION= ? AND (TYPE="B Payment" OR TYPE="S Payment")', [queryResult[i].TRANSACTION_ID]);
            }

            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active transactions found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(transactions => ({ ...transactions }));

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



// --------------------------------------------------------------------------------------
// STOCK LEDGER & ADJUSTMENT ENDPOINTS
// --------------------------------------------------------------------------------------

// Robust Stock Adjustment Endpoint (Ledger-based)
router.post('/api/adjustInventory', async (req, res) => {
    try {
        console.log('[adjustInventory] Request body:', req.body);
        if (!pool) return res.status(500).json({ success: false, message: 'DB connection error' });

        const { ITEM_ID, STORE_NO, TYPE, QUANTITY, REASON, CREATED_BY } = req.body;
        // TYPE: 'AdjIn' (+), 'AdjOut' (-), 'Opening' (set to value), 'StockClear' (set to 0)
        // QUANTITY: float (value to adjust by or set to) - Optional for StockClear

        // StockClear doesn't need QUANTITY
        if (!ITEM_ID || !STORE_NO || !TYPE) {
            console.log('[adjustInventory] Missing basic fields:', { ITEM_ID, STORE_NO, TYPE });
            return res.json({ success: false, message: 'Missing required fields' });
        }

        // QUANTITY required for all types except StockClear
        if (TYPE !== 'StockClear' && (QUANTITY === undefined || QUANTITY === null || QUANTITY === '')) {
            console.log('[adjustInventory] Missing QUANTITY for non-StockClear:', { TYPE, QUANTITY });
            return res.json({ success: false, message: 'Quantity is required for this adjustment type' });
        }

        const qty = parseFloat(QUANTITY) || 0;
        let delta = 0;
        let transactionType = TYPE;
        let comment = REASON || 'Manual Adjustment';

        // Fetch Cache Stock (Store Items) - REMOVED due to STOCK column issues
        let cacheStock = 0;
        // Logic relying on cacheStock for 'StockClear' fallback is now disabled
        // relying solely on Ledger calculation below.

        // Get current stock from LEDGER (not cache) for accurate calculations
        let currentStock = 0;
        try {
            // Get current stock using Unified Calculator
            currentStock = await calculateCurrentStock(pool, ITEM_ID, STORE_NO);
            console.log(`[adjustInventory] Calculated Stock for Item ${ITEM_ID} Store ${STORE_NO}: ${currentStock}`);

            console.log('[adjustInventory] Calculated current stock from ledger:', currentStock);
        } catch (e) {
            console.log('[adjustInventory] Error calculating current stock from ledger:', e);
            currentStock = 0;
        }

        // Fallback: For StockClear, if Ledger says 0 but Cache shows stock, assume Cache is correct (Ghost Stock)
        if (TYPE === 'StockClear' && currentStock === 0 && cacheStock > 0) {
            console.log('[adjustInventory] Using Cache Stock as Ledger is 0. Cache:', cacheStock);
            currentStock = cacheStock;
        }

        console.log('[adjustInventory] Current stock:', currentStock, 'Target qty:', qty, 'Type:', TYPE);

        if (TYPE === 'AdjIn') {
            // Stock In: Add the quantity
            delta = qty;
            comment = `Stock Added: ${comment}`;
        } else if (TYPE === 'AdjOut') {
            // Stock Out: Subtract the quantity
            delta = -qty;
            comment = `Stock Removed: ${comment}`;
        } else if (TYPE === 'Opening') {
            // Opening Stock: Set stock TO this value (delta = target - current)
            delta = qty - currentStock;
            console.log('[adjustInventory] Opening: target=', qty, 'current=', currentStock, 'delta=', delta);
            comment = `Opening Stock set to ${qty} (was ${currentStock}): ${comment}`;
            // Use AdjIn/AdjOut based on delta sign for consistent ledger calculation
            if (delta >= 0) {
                transactionType = 'AdjIn';
            } else {
                transactionType = 'AdjOut';
            }
        } else if (TYPE === 'StockClear') {
            // Stock Clearance: Set stock to 0 (delta = 0 - current = -current)
            delta = -currentStock;

            // Check if user provided a specific "Cleared/Valid" quantity
            // QUANTITY here represents the "Good" stock we accounted for. The rest is waste.
            const hasUserQty = QUANTITY !== undefined && QUANTITY !== null && QUANTITY !== '';

            if (hasUserQty) {
                const validQty = parseFloat(QUANTITY) || 0;

                // Calculate waste
                // Waste = Current Stock - Valid Qty
                // Only relevant if current stock is positive
                if (currentStock > 0) {
                    const waste = currentStock - validQty;
                    // Prevent division by zero if currentStock is somehow 0 (though logic prevents this block)
                    const wastePerc = currentStock > 0 ? (waste / currentStock) * 100 : 0;

                    const percentStr = isFinite(wastePerc) ? wastePerc.toFixed(1) : '0.0';
                    const wasteStr = waste.toFixed(2);

                    comment = `Stock Cleared (was ${currentStock}). Valid: ${validQty}. Waste: ${wasteStr}kg (${percentStr}%): ${comment}`;
                } else {
                    // If stock is negative or zero, 'waste' calc is ambiguous, just log clear
                    comment = `Stock Cleared (was ${currentStock}): ${comment}`;
                }
            } else {
                comment = `Stock Cleared (was ${currentStock}): ${comment}`;
            }

            // Fix: Handle negative stock clearing (-10 -> 0 requires +10, aka AdjIn)
            if (delta >= 0) {
                transactionType = 'AdjIn';
            } else {
                transactionType = 'AdjOut';
            }
        } else {
            return res.json({ success: false, message: 'Invalid adjustment type' });
        }

        console.log('[adjustInventory] Final delta:', delta, 'Using type:', transactionType);

        // Skip if no change needed
        if (delta === 0) {
            return res.json({ success: true, message: 'No change needed (stock already at target)', delta: 0 });
        }


        // 2. Create Transaction Record (The Ledger Entry)
        // Use Date (DDMMYY) + random suffix for unique code
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = String(now.getFullYear()).slice(-2);
        const dateStr = `${day}${month}${year}`;

        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const txCode = `ADJ-${dateStr}-${randomSuffix}`;

        const txObj = {
            CODE: txCode,
            STORE_NO: STORE_NO,
            TYPE: transactionType,
            CREATED_BY: CREATED_BY || 1,
            CREATED_DATE: new Date(),
            SUB_TOTAL: 0,
            COMMENTS: comment,
            IS_ACTIVE: 1
        };

        const txRes = await pool.query('INSERT INTO store_transactions SET ?', txObj);
        const transactionId = txRes.insertId;
        console.log('[adjustInventory] Created transaction:', transactionId, txObj);

        // 3. Create Transaction Item Record - Store DELTA (absolute value), not target
        const txItemObj = {
            TRANSACTION_ID: transactionId,
            ITEM_ID: ITEM_ID,
            PRICE: 0,
            QUANTITY: Math.abs(delta),  // Store the actual change amount
            TOTAL: 0,
            CREATED_BY: CREATED_BY || 1
        };

        console.log('[adjustInventory] Inserting item:', txItemObj);
        const itemRes = await pool.query('INSERT INTO store_transactions_items SET ?', txItemObj);
        console.log('[adjustInventory] Item insert result:', itemRes);

        // 4. Update the Cache (store_items.QUANTITY)
        await adjustStock(ITEM_ID, STORE_NO, delta);
        console.log('[adjustInventory] Stock adjusted, delta:', delta);

        return res.json({ success: true, message: 'Stock adjusted successfully', transactionId, delta });

    } catch (error) {
        console.error('Error adjusting inventory:', error);
        // Respond with actual error for debugging
        return res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
    }
});

// Helper for Reconcile Check (Drift calc)
router.post('/api/getItemStockLedger', async (req, res) => {
    try {
        const { ITEM_ID, STORE_NO } = req.body;

        // 1. Calculate Ledger Total
        // Sum all transactions for this item & store
        // Buying, Opening, AdjustmentAdd = (+)
        // Selling, AdjustmentRemove = (-)

        const query = `
            SELECT 
                st.TYPE, 
                SUM(sti.QUANTITY) as total_qty
            FROM store_transactions st
            JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
            WHERE sti.ITEM_ID = ? AND st.STORE_NO = ? AND st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1
            GROUP BY st.TYPE
        `;

        const rows = await pool.query(query, [ITEM_ID, STORE_NO]);

        let ledgerStock = 0;
        rows.forEach(row => {
            const qty = parseFloat(row.total_qty || 0);
            if (['Buying', 'Opening', 'AdjIn', 'TransferIn', 'StockTake'].includes(row.TYPE)) {
                ledgerStock += qty;
            } else if (['Selling', 'AdjOut', 'StockClear', 'TransferOut', 'Wastage'].includes(row.TYPE)) {
                ledgerStock -= qty;
            }
        });

        // 2. Get Current Cache
        const [itemRes] = await pool.query('SELECT STOCK FROM store_items WHERE ITEM_ID = ?', [ITEM_ID]);
        let cachedStock = 0;
        if (itemRes && itemRes.STOCK) {
            try {
                const sData = typeof itemRes.STOCK === 'string' ? JSON.parse(itemRes.STOCK) : itemRes.STOCK;
                cachedStock = parseFloat(sData[STORE_NO] || 0);
            } catch (e) { }
        }

        return res.json({
            success: true,
            ledgerStock,
            cachedStock,
            drift: cachedStock - ledgerStock
        });

    } catch (e) {
        console.error("Error calculating ledger:", e);
        return res.status(500).json({ success: false, message: e.message });
    }
});

// --------------------------------------------------------------------------------------
// NEW: REAL-TIME INVENTORY ENDPOINTS
// --------------------------------------------------------------------------------------

// Calculate Stock Real-Time from Ledger (Source of Truth)
router.post('/api/getAllItemStocksRealTime', async (req, res) => {
    try {
        if (!pool) return res.status(500).json({ success: false, message: 'DB connection error' });

        // Query to sum up all stock movements per item per store
        // Only include items that exist in store_items with IS_ACTIVE=1
        // Positive: Buying, Opening, AdjIn
        // Negative: Selling, AdjOut

        const query = `
            SELECT 
                si.ITEM_ID,
                si.CODE,
                si.NAME,
                si.SELLING_PRICE,
                st.STORE_NO,
                st.TYPE,
                SUM(sti.QUANTITY) as total_qty
            FROM store_items si
            LEFT JOIN store_transactions_items sti ON si.ITEM_ID = sti.ITEM_ID AND sti.IS_ACTIVE = 1
            LEFT JOIN store_transactions st ON sti.TRANSACTION_ID = st.TRANSACTION_ID AND st.IS_ACTIVE = 1
            WHERE si.IS_ACTIVE = 1
            GROUP BY si.ITEM_ID, si.CODE, si.NAME, si.SELLING_PRICE, st.STORE_NO, st.TYPE
        `;

        const rows = await pool.query(query);

        // DEBUG: Check rows for Item 860
        const debugRows = rows.filter(r => r.ITEM_ID === 860);
        if (debugRows.length > 0) {
            console.log('[getAllItemStocksRealTime] DEBUG Item 860 rows:', debugRows);
        }

        // Process rows to build the result map
        // Map<ItemID, { CODE, NAME, "1": val, "2": val, total: val }>
        const stockMap = {};

        rows.forEach(row => {
            const itemId = row.ITEM_ID;
            const storeNo = row.STORE_NO;
            const type = row.TYPE;
            const qty = parseFloat(row.total_qty || 0);

            if (!stockMap[itemId]) {
                stockMap[itemId] = { CODE: row.CODE, NAME: row.NAME, SELLING_PRICE: row.SELLING_PRICE, 1: 0, 2: 0 };
            }

            // If no transactions yet, storeNo/type will be NULL, skip adjustment
            if (!type || !storeNo) return;

            let change = 0;
            if (['Buying', 'Opening', 'AdjIn', 'TransferIn', 'StockTake'].includes(type)) { // Added TransferIn, StockTake
                change = qty;
            } else if (['Selling', 'AdjOut', 'StockClear', 'TransferOut', 'Wastage'].includes(type)) { // Added TransferOut, Wastage
                change = -qty;
            }

            // Fallback for Store No if needed (though query groups by it)
            if (storeNo === '1' || storeNo === 1) {
                stockMap[itemId][1] += change;
            } else if (storeNo === '2' || storeNo === 2) {
                stockMap[itemId][2] += change;
            }
        });

        // Convert Map to Array format matching frontend expectation
        const result = Object.keys(stockMap).map(id => ({
            ITEM_ID: parseInt(id),
            CODE: stockMap[id].CODE,
            NAME: stockMap[id].NAME,
            SELLING_PRICE: stockMap[id].SELLING_PRICE,
            STOCK_S1: stockMap[id][1],
            STOCK_S2: stockMap[id][2],
            TOTAL_STOCK: stockMap[id][1] + stockMap[id][2]
        }));

        return res.json({ success: true, result });

    } catch (e) {
        console.error("Error calculating real-time stock:", e);
        return res.status(500).json({ success: false, message: e.message });
    }
});

// Get Inventory History (Audit Log) - Now includes Stock Operations as unified records
router.post('/api/getInventoryHistory', async (req, res) => {
    try {
        // 1. Fetch inventory-related transactions (EXCLUDE stock operation transactions)
        // Stock operation transactions have [OP-...] in their COMMENTS
        const transactionQuery = `
            SELECT 
                st.TRANSACTION_ID,
                st.CODE,
                st.TYPE,
                st.STORE_NO,
                st.COMMENTS,
                st.CREATED_DATE,
                st.CREATED_BY,
                sti.ITEM_ID,
                sti.QUANTITY as ITEM_QTY,
                i.NAME as ITEM_NAME,
                i.CODE as ITEM_CODE,
                u.NAME as CREATED_BY_NAME,
                'transaction' as SOURCE_TYPE
            FROM store_transactions st
            JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
            LEFT JOIN store_items i ON sti.ITEM_ID = i.ITEM_ID
            LEFT JOIN user_details u ON st.CREATED_BY = u.USER_ID
            WHERE st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1 
              AND st.TYPE IN ('AdjIn', 'AdjOut', 'Opening', 'StockTake', 'StockClear')
              AND (st.COMMENTS IS NULL OR (st.COMMENTS NOT LIKE '[OP-%' AND st.COMMENTS NOT LIKE '[S%-%-CLR-%'))
              ${req.body.startDate ? `AND st.CREATED_DATE >= '${req.body.startDate}'` : ''}
              ${req.body.endDate ? `AND st.CREATED_DATE <= '${req.body.endDate} 23:59:59'` : ''}
        `;

        const transactionRows = await pool.query(transactionQuery);

        // 2. Fetch stock operations from tables (these are unified records)
        const stockOpsQuery = `
            SELECT 
                so.OP_ID,
                so.OP_CODE as CODE,
                so.REFERENCE_OP_ID,
                parent_op.OP_CODE as REF_OP_CODE,
                parent_op.BILL_CODE as REF_BILL_CODE,
                so.OP_TYPE,
                so.CLEARANCE_TYPE,
                so.STORE_NO,
                so.COMMENTS,
                so.CREATED_DATE,
                so.CREATED_BY,
                so.CREATED_BY_NAME,
                so.WASTAGE_AMOUNT,
                so.SURPLUS_AMOUNT,
                so.CUSTOMER_NAME,
                so.LORRY_NAME,
                so.DRIVER_NAME,
                so.DESTINATION,
                so.BILL_CODE,
                so.BILL_AMOUNT,
                st_bill.SUB_TOTAL as TRANSACTION_BILL_AMOUNT,
                'stock_operation' as SOURCE_TYPE,
                CASE so.OP_TYPE
                    WHEN 1 THEN 'Full Clear (Standard)'
                    WHEN 2 THEN 'Partial Clear (Standard)'
                    WHEN 3 THEN 'Full Clear + Sales'
                    WHEN 4 THEN 'Partial Clear + Sales'
                    WHEN 5 THEN 'Transfer (Standard)'
                    WHEN 6 THEN 'Transfer + Full Clear'
                    WHEN 7 THEN 'Partial Clear + Lorry'
                    WHEN 8 THEN 'Full Clear + Lorry'
                    WHEN 9 THEN 'Item Conversion'
                    WHEN 10 THEN 'Cash Float Adjustment'
                    WHEN 11 THEN 'Stock Return'
                    ELSE 'Stock Operation'
                END AS OP_TYPE_NAME
            FROM store_stock_operations so
            LEFT JOIN store_stock_operations parent_op ON so.REFERENCE_OP_ID = parent_op.OP_ID
            LEFT JOIN store_transactions st_bill ON so.BILL_CODE COLLATE utf8mb4_unicode_ci = st_bill.CODE COLLATE utf8mb4_unicode_ci AND st_bill.IS_ACTIVE = 1
            WHERE so.IS_ACTIVE = 1
              ${req.body.startDate ? `AND so.CREATED_DATE >= '${req.body.startDate}'` : ''}
              ${req.body.endDate ? `AND so.CREATED_DATE <= '${req.body.endDate} 23:59:59'` : ''}
        `;

        let stockOpsRows = [];
        try {
            stockOpsRows = await pool.query(stockOpsQuery);

            // Fetch items, conversions, and calculate stock impact for each operation
            for (let op of stockOpsRows) {
                op.items = await pool.query(
                    'SELECT * FROM store_stock_operation_items WHERE OP_ID = ? AND IS_ACTIVE = 1',
                    [op.OP_ID]
                );
                op.conversions = await pool.query(
                    'SELECT * FROM store_stock_operation_conversions WHERE OP_ID = ? AND IS_ACTIVE = 1',
                    [op.OP_ID]
                );

                // Get actual stock adjustments made by this operation
                const txQuery = `
                    SELECT st.TYPE, sti.QUANTITY, sti.ITEM_ID, i.NAME as ITEM_NAME, i.CODE as ITEM_CODE
                    FROM store_transactions st
                    JOIN store_transactions_items sti ON st.TRANSACTION_ID = sti.TRANSACTION_ID
                    LEFT JOIN store_items i ON sti.ITEM_ID = i.ITEM_ID
                    WHERE st.IS_ACTIVE = 1 AND sti.IS_ACTIVE = 1 
                      AND st.COMMENTS LIKE ?
                `;
                op.stockAdjustments = await pool.query(txQuery, [`[${op.CODE}]%`]);
            }
        } catch (e) {
            console.log('[getInventoryHistory] Stock operations table may not exist yet:', e.message);
        }

        // 3. Process transaction rows (non-stock-operation adjustments)
        const transactionResult = transactionRows.map(row => {
            let displayType = row.TYPE;
            const comments = row.COMMENTS || '';

            if (comments.includes('Opening Stock')) {
                displayType = 'Opening';
            } else if (comments.includes('Stock Cleared')) {
                displayType = 'StockClear';
            } else if (comments.includes('Stock Added')) {
                displayType = 'AdjIn';
            } else if (comments.includes('Stock Removed')) {
                displayType = 'AdjOut';
            }

            return {
                ...row,
                DISPLAY_TYPE: displayType,
                SOURCE_TYPE: 'transaction'
            };
        });

        // 4. Process stock operations into unified records with breakdown
        const stockOpsResult = stockOpsRows.map(row => {
            const sourceItem = row.items?.[0] || {};
            const conversions = row.conversions || [];
            const adjustments = row.stockAdjustments || [];

            // Special handling for ops 3, 4 (Full/Partial + Sales)
            const isOpWithSales = [3, 4].includes(row.OP_TYPE);

            // For ops 3, 4: Use stored values from operation items
            let soldQty = parseFloat(sourceItem.SOLD_QUANTITY) || 0;
            let originalStock = parseFloat(sourceItem.ORIGINAL_STOCK) || 0;

            // Find Selling transaction
            const sellingTx = adjustments.find(a =>
                a.TYPE === 'Selling' &&
                (a.ITEM_ID === sourceItem.ITEM_ID || String(a.ITEM_ID) === String(sourceItem.ITEM_ID))
            );

            // Find the source item's adjustment (could be AdjIn for negative stock or AdjOut for positive)
            const sourceAdjOut = adjustments.find(a =>
                (a.TYPE === 'AdjOut' || a.TYPE === 'StockClear') &&
                (a.ITEM_ID === sourceItem.ITEM_ID || String(a.ITEM_ID) === String(sourceItem.ITEM_ID))
            );
            const sourceAdjIn = adjustments.find(a =>
                a.TYPE === 'AdjIn' &&
                (a.ITEM_ID === sourceItem.ITEM_ID || String(a.ITEM_ID) === String(sourceItem.ITEM_ID))
            );

            // Determine the source adjustment type and previous stock
            let adjustmentQty = 0;
            let adjustmentType = 'AdjOut';
            let previousStock = originalStock; // Use stored original stock for ops 3, 4

            if (isOpWithSales) {
                // For Op 3 (Full Clear): Net change is simply the previous stock (going to 0)
                // For Op 4 (Partial): Net change is what was sold + converted
                if (row.OP_TYPE === 3) {
                    adjustmentQty = previousStock;
                } else {
                    const convertedQty = conversions.reduce((sum, c) => sum + (parseFloat(c.DEST_QUANTITY) || 0), 0);
                    adjustmentQty = soldQty + convertedQty;
                }
                adjustmentType = 'AdjOut';

                // If original stock not stored, try to get from adjustment
                if (!previousStock && sourceAdjOut) {
                    previousStock = parseFloat(sourceAdjOut.QUANTITY) || 0;
                }
            } else if (sourceAdjOut) {
                // Previous stock was positive, we removed it
                adjustmentQty = parseFloat(sourceAdjOut.QUANTITY) || 0;
                adjustmentType = 'AdjOut';
                // Prefer stored ORIGINAL_STOCK, fallback to adjustment quantity
                if (!previousStock) {
                    previousStock = adjustmentQty; // e.g., +1000kg
                }
            } else if (row.OP_TYPE === 11) {
                // Op 11: Stock Return
                // If conversion return, sum of destinations is the added stock mass
                // If direct return, cleared_quantity is the added stock
                const totalDestQty = conversions.reduce((sum, c) => sum + (parseFloat(c.DEST_QUANTITY) || 0), 0);
                if (totalDestQty > 0) {
                    adjustmentQty = totalDestQty;
                } else {
                    adjustmentQty = parseFloat(sourceItem.CLEARED_QUANTITY) || 0;
                }
                adjustmentType = 'AdjIn';
                previousStock = parseFloat(sourceItem.ORIGINAL_STOCK) || 0;
            } else if (sourceAdjIn && !conversions.some(c =>
                c.DEST_ITEM_ID === sourceItem.ITEM_ID || String(c.DEST_ITEM_ID) === String(sourceItem.ITEM_ID)
            )) {
                // Previous stock was negative, we added to make it 0
                // (Make sure this AdjIn is not a destination item)
                adjustmentQty = parseFloat(sourceAdjIn.QUANTITY) || 0;
                adjustmentType = 'AdjIn';
                // Prefer stored ORIGINAL_STOCK, fallback to calculated value
                if (!previousStock) {
                    previousStock = -adjustmentQty; // e.g., -550kg
                }
            }

            // Sum of destination quantities
            const totalDestQty = conversions.reduce((sum, c) =>
                sum + (parseFloat(c.DEST_QUANTITY) || 0), 0
            );

            // Calculate wastage/surplus
            let wastage = parseFloat(row.WASTAGE_AMOUNT) || 0;
            let surplus = parseFloat(row.SURPLUS_AMOUNT) || 0;

            // If not stored, calculate from logic
            if (!wastage && !surplus && conversions.length > 0) {
                if (previousStock > 0) {
                    // For ops 3, 4: wastage = stock - sold - converted
                    const baseForCalc = isOpWithSales ? (previousStock - soldQty) : previousStock;
                    const diff = baseForCalc - totalDestQty;
                    if (diff > 0) wastage = diff;
                    else if (diff < 0) surplus = Math.abs(diff);
                } else if (previousStock < 0) {
                    surplus = Math.abs(previousStock) + totalDestQty;
                } else if (previousStock === 0 && totalDestQty > 0) {
                    surplus = totalDestQty;
                }
            }

            // Build breakdown for display
            // Determine dynamic source and target stores
            let sourceStoreNo = row.STORE_NO;
            let targetStoreNo = row.STORE_NO === 1 ? 2 : 1; // Default assumption for transfers

            // If we have items with different store numbers, we can be more precise
            const otherStoreItem = (row.items || []).find(i => i.STORE_NO !== row.STORE_NO);
            if (otherStoreItem) {
                targetStoreNo = otherStoreItem.STORE_NO;
            }

            const sourceItems = (row.items || []).filter(i => i.STORE_NO === sourceStoreNo);
            const targetItems = (row.items || []).filter(i => i.STORE_NO !== sourceStoreNo);

            // Determine main item cleared quantity
            let mainQty = 0;
            if (isOpWithSales) {
                // For Op 4 (Partial + Sales), main qty is the sold amount
                // For Op 3 (Full + Sales), main qty is effectively the whole stock, but we can display soldQty
                mainQty = soldQty;
            } else if (row.OP_TYPE === 2) {
                // For Op 2 (Partial Standard), main qty = total removed - converted
                mainQty = adjustmentQty - totalDestQty;
                if (mainQty < 0) mainQty = 0; // Should not happen with correct logic
            } else if (row.OP_TYPE === 1) {
                // Op 1 (Full Standard), main qty = total removed
                mainQty = adjustmentQty;
            }

            const breakdown = {
                source: {
                    itemId: sourceItem.ITEM_ID,
                    itemCode: sourceItem.ITEM_CODE,
                    itemName: sourceItem.ITEM_NAME,
                    adjustmentQty: adjustmentQty,
                    adjustmentType: adjustmentType,
                    previousStock: previousStock,
                    soldQty: soldQty,  // For ops 3, 4
                    mainQty: mainQty   // NEW: Explicit main item qty
                },
                destinations: conversions.map(c => ({
                    itemId: c.DEST_ITEM_ID,
                    itemCode: c.DEST_ITEM_CODE,
                    itemName: c.DEST_ITEM_NAME,
                    quantity: parseFloat(c.DEST_QUANTITY) || 0
                })),
                // Target items with before/after stock (historically called store2Items)
                targetItems: targetItems.map(i => ({
                    itemId: i.ITEM_ID,
                    itemCode: i.ITEM_CODE,
                    itemName: i.ITEM_NAME,
                    previousStock: parseFloat(i.ORIGINAL_STOCK) || 0,
                    addedQty: Math.abs(parseFloat(i.CLEARED_QUANTITY) || 0),
                    currentStock: parseFloat(i.REMAINING_STOCK) || 0,
                    storeNo: i.STORE_NO
                })),
                // Compatibility for older frontend versions that expect 'store2Items'
                store2Items: targetItems.map(i => ({
                    itemId: i.ITEM_ID,
                    itemCode: i.ITEM_CODE,
                    itemName: i.ITEM_NAME,
                    previousStock: parseFloat(i.ORIGINAL_STOCK) || 0,
                    addedQty: Math.abs(parseFloat(i.CLEARED_QUANTITY) || 0),
                    currentStock: parseFloat(i.REMAINING_STOCK) || 0
                })),
                sourceStore: sourceStoreNo,
                targetStore: targetStoreNo,
                isTransferOperation: [5, 6].includes(row.OP_TYPE),
                wastage: wastage,
                surplus: surplus,
                totalDestQty: totalDestQty,
                isSalesOperation: isOpWithSales,
                billCode: row.BILL_CODE,
                billAmount: parseFloat(row.TRANSACTION_BILL_AMOUNT) || parseFloat(row.BILL_AMOUNT) || 0,
                // Lorry details for ops 3, 4, 7, 8
                lorryName: row.LORRY_NAME || null,
                driverName: row.DRIVER_NAME || null,
                destination: row.DESTINATION || null,
                referenceOpId: row.REFERENCE_OP_ID,
                refOpCode: row.REF_OP_CODE,
                refBillCode: row.REF_BILL_CODE
            };


            return {
                TRANSACTION_ID: `OP-${row.OP_ID}`,
                OP_ID: row.OP_ID,
                OP_CODE: row.CODE,
                CODE: row.CODE,
                TYPE: `OP_${row.OP_TYPE}`,
                STORE_NO: row.STORE_NO,
                COMMENTS: row.COMMENTS,
                CREATED_DATE: row.CREATED_DATE,
                CREATED_BY: row.CREATED_BY,
                CREATED_BY_NAME: row.CREATED_BY_NAME,
                ITEM_NAME: sourceItem.ITEM_NAME || 'Unknown Item',
                ITEM_CODE: sourceItem.ITEM_CODE || '',
                ITEM_ID: sourceItem.ITEM_ID || null,
                ITEM_QTY: adjustmentQty,
                DISPLAY_TYPE: row.OP_TYPE_NAME,
                SOURCE_TYPE: 'stock_operation',
                OP_TYPE: row.OP_TYPE,
                OP_TYPE_NAME: row.OP_TYPE_NAME,
                CLEARANCE_TYPE: row.CLEARANCE_TYPE,
                WASTAGE_AMOUNT: wastage,
                SURPLUS_AMOUNT: surplus,
                SOLD_QUANTITY: soldQty,
                CUSTOMER_NAME: row.CUSTOMER_NAME,
                LORRY_NAME: row.LORRY_NAME,
                BILL_CODE: row.BILL_CODE,
                BILL_AMOUNT: row.BILL_AMOUNT,
                items: row.items,
                conversions: row.conversions,
                breakdown: breakdown
            };
        });

        // 5. Combine and sort by date
        const allResults = [...transactionResult, ...stockOpsResult].sort((a, b) =>
            new Date(b.CREATED_DATE) - new Date(a.CREATED_DATE)
        );

        return res.json({ success: true, result: allResults });

    } catch (e) {
        console.error("Error fetching inventory history:", e);
        return res.status(500).json({ success: false, message: e.message });
    }
});


// Soft delete inventory transaction
// Soft delete inventory transaction
router.post('/api/deleteInventoryTransaction', async (req, res) => {
    try {
        const { TRANSACTION_ID } = req.body;

        if (!TRANSACTION_ID) {
            return res.json({ success: false, message: 'Transaction ID required' });
        }

        let numericId = TRANSACTION_ID;

        // Check if ID is likely a string code (e.g. "OP-79" or "S1-...") 
        // If so, lookup the numeric ID using CODE
        if (typeof TRANSACTION_ID === 'string' && isNaN(TRANSACTION_ID)) {
            const lookup = await pool.query('SELECT TRANSACTION_ID FROM store_transactions WHERE CODE = ? OR TRANSACTION_ID = ?', [TRANSACTION_ID, TRANSACTION_ID]);
            if (lookup && lookup.length > 0) {
                numericId = lookup[0].TRANSACTION_ID;
            } else {
                // If not found by CODE, maybe it's an OP_CODE in store_stock_operations? 
                // But this endpoint is for store_transactions. 
                // Let's assume if not found, we can't delete.
                console.warn(`[Delete] Could not find numeric ID for code: ${TRANSACTION_ID}`);
                return res.json({ success: false, message: 'Transaction not found for deletion' });
            }
        }

        // Soft delete - set IS_ACTIVE = 0
        await pool.query('UPDATE store_transactions SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [numericId]);
        await pool.query('UPDATE store_transactions_items SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [numericId]);

        return res.json({ success: true, message: 'Transaction deleted successfully' });

    } catch (e) {
        console.error("Error deleting inventory transaction:", e);
        return res.status(500).json({ success: false, message: e.message });
    }
});

// Helper to adjust stock (cache)
async function adjustStock(itemId, storeNo, delta) {
    return; // Stock update disabled by user request.
    // console.log(`[adjustStock] Adjusting stock for item ${itemId}, delta: ${delta}`);
    if (!itemId) return;

    // We only track global quantity now, or if we use store_items table:
    /*
      The previous code assumed a JSON 'STOCK' column.
      However, the error says 'Unknown column STOCK'.
      We will assume 'QUANTITY' exists in `store_items` as per typical schema,
      Or if we want to support per-store stock without JSON, we should check checks.
      
      For now, simpler fix: Just update QUANTITY blindly or check first.
    */

    try {
        const [rows] = await pool.query('SELECT QUANTITY FROM store_items WHERE ITEM_ID = ?', [itemId]);

        let currentQty = 0;
        if (rows && rows.length > 0) {
            currentQty = parseFloat(rows[0].QUANTITY || 0);
        } else {
            // Item likely doesn't exist in store_items or schema mismatch.
            // If critical, we should log. If just cache, ignore.
            // console.warn(`[adjustStock] Item ${itemId} not found in store_items`);
            return;
        }

        const newQty = currentQty + delta;
        await pool.query('UPDATE store_items SET QUANTITY = ? WHERE ITEM_ID = ?', [newQty, itemId]);

    } catch (e) {
        console.error("Error adjusting stock:", e);
        // Don't crash the transaction for stock cache error
    }
}


// ==========================================
// REPORTS ENDPOINTS
// ==========================================

// 1. Transaction Report (Profit/Loss & Details)
router.post('/api/reports/transactions', async (req, res) => {
    try {
        const { startDate, endDate, storeNo } = req.body;

        let whereClause = "st.IS_ACTIVE = 1 AND st.TYPE IN ('Selling', 'Buying', 'Expenses')";
        let params = [];

        if (startDate && endDate) {
            whereClause += " AND DATE(st.CREATED_DATE) BETWEEN ? AND ?";
            params.push(startDate, endDate);
        }

        if (storeNo) {
            whereClause += " AND st.STORE_NO = ?";
            params.push(storeNo);
        }

        // 1. Summary (Group by Type)
        const summaryRows = await pool.query(`
            SELECT TYPE, SUM(SUB_TOTAL) as total 
            FROM store_transactions st
            WHERE ${whereClause} 
            GROUP BY TYPE
        `, params);

        let income = 0;
        let buying = 0;
        let expenses = 0;

        summaryRows.forEach(row => {
            if (row.TYPE === 'Selling') income = parseFloat(row.total || 0);
            if (row.TYPE === 'Buying') buying = parseFloat(row.total || 0);
            if (row.TYPE === 'Expenses') expenses = parseFloat(row.total || 0);
        });

        // 2. Detailed List
        const detailsRows = await pool.query(`
            SELECT st.*, sc.NAME as C_NAME 
            FROM store_transactions st
            LEFT JOIN store_customers sc ON st.CUSTOMER = sc.CUSTOMER_ID 
            WHERE ${whereClause}
            ORDER BY st.CREATED_DATE DESC
        `, params);

        return res.json({
            success: true,
            summary: {
                income,
                buying,
                expenses,
                net: income - buying - expenses
            },
            details: detailsRows
        });

    } catch (error) {
        console.error("Error in Transaction Report:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 2. Item Profit Report (Cash Flow per Item)
router.post('/api/reports/items', async (req, res) => {
    try {
        const { startDate, endDate, itemIds, storeNo } = req.body; // itemIds array

        let whereClause = "t.IS_ACTIVE = 1 AND t.TYPE IN ('Selling', 'Buying')";
        let params = [];

        if (startDate && endDate) {
            whereClause += " AND DATE(t.CREATED_DATE) BETWEEN ? AND ?";
            params.push(startDate, endDate);
        }
        if (storeNo) {
            whereClause += " AND t.STORE_NO = ?";
            params.push(storeNo);
        }
        // Note: Filtering by itemIds happens better in HAVING or strict WHERE if we join items.
        // But let's fetch all relevant items first.

        // Query: Get Sales and Buys per Item
        // We need to join store_transactions_items
        let sql = `
            SELECT 
                si.ITEM_ID,
                si.CODE,
                si.NAME,
                si.BUYING_PRICE,
                si.SELLING_PRICE,
                t.TYPE,
                SUM(sti.QUANTITY) as total_qty,
                SUM(sti.TOTAL) as total_amount
            FROM store_transactions_items sti
            JOIN store_transactions t ON sti.TRANSACTION_ID = t.TRANSACTION_ID
            JOIN store_items si ON sti.ITEM_ID = si.ITEM_ID
            WHERE ${whereClause} AND sti.IS_ACTIVE = 1
            GROUP BY si.ITEM_ID, si.CODE, si.NAME, si.BUYING_PRICE, si.SELLING_PRICE, t.TYPE
        `;

        const rows = await pool.query(sql, params);

        // Process in JS to pivot
        const reportMap = {};

        rows.forEach(row => {
            if (!reportMap[row.ITEM_ID]) {
                reportMap[row.ITEM_ID] = {
                    id: row.ITEM_ID,
                    code: row.CODE,
                    name: row.NAME,
                    masterBuyPrice: parseFloat(row.BUYING_PRICE || 0),
                    masterSellPrice: parseFloat(row.SELLING_PRICE || 0),
                    soldQty: 0,
                    soldAmount: 0,
                    boughtQty: 0,
                    boughtAmount: 0
                };
            }
            const item = reportMap[row.ITEM_ID];
            if (row.TYPE === 'Selling') {
                item.soldQty += parseFloat(row.total_qty || 0);
                item.soldAmount += parseFloat(row.total_amount || 0);
            } else if (row.TYPE === 'Buying') {
                item.boughtQty += parseFloat(row.total_qty || 0);
                item.boughtAmount += parseFloat(row.total_amount || 0);
            }
        });

        let results = Object.values(reportMap);

        // Filter by selected items if requested
        if (itemIds && itemIds.length > 0) {
            const allowedIds = new Set(itemIds.map(id => parseInt(id)));
            results = results.filter(r => allowedIds.has(r.id));
        }

        // Calculate Profit (Net Cash Flow)
        results = results.map(r => ({
            ...r,
            profit: r.soldAmount - r.boughtAmount
        }));

        // Sort by Profit Descending
        results.sort((a, b) => b.profit - a.profit);

        return res.json({ success: true, result: results });

    } catch (error) {
        console.error("Error in Item Report:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// Stock Movement Report - Buy/Sell Quantities per Item with Store breakdown
router.post('/api/reports/stockMovement', async (req, res) => {
    try {
        const { startDate, endDate, itemIds, storeNo } = req.body;

        let whereClause = "t.IS_ACTIVE = 1 AND t.TYPE IN ('Selling', 'Buying')";
        let params = [];

        if (startDate && endDate) {
            whereClause += " AND DATE(t.CREATED_DATE) BETWEEN ? AND ?";
            params.push(startDate, endDate);
        }
        if (storeNo && storeNo !== 'all') {
            whereClause += " AND t.STORE_NO = ?";
            params.push(storeNo);
        }

        // Query: Get Buy/Sell quantities per Item per Store
        // Use STOCK_DATE for date filtering (handles Store 2 weighting date logic)
        let sql = `
            SELECT 
                si.ITEM_ID,
                si.CODE,
                si.NAME,
                t.TYPE,
                t.STORE_NO,
                SUM(sti.QUANTITY) as total_qty
            FROM store_transactions_items sti
            JOIN store_transactions t ON sti.TRANSACTION_ID = t.TRANSACTION_ID
            JOIN store_items si ON sti.ITEM_ID = si.ITEM_ID
            WHERE 
                t.IS_ACTIVE = 1 
                AND t.TYPE IN ('Buying', 'Opening', 'AdjIn', 'TransferIn', 'StockTake', 'Selling', 'AdjOut', 'StockClear', 'TransferOut', 'Wastage')
                AND sti.IS_ACTIVE = 1
                AND DATE(COALESCE(t.STOCK_DATE, t.CREATED_DATE)) BETWEEN ? AND ?
        `;

        if (storeNo && storeNo !== 'all') {
            sql += " AND t.STORE_NO = ?";
            params.push(storeNo);
        }

        sql += `
            GROUP BY si.ITEM_ID, si.CODE, si.NAME, t.TYPE, t.STORE_NO
        `;

        const rows = await pool.query(sql, params);

        // Process in JS to pivot categories per store
        const reportMap = {};

        rows.forEach(row => {
            if (!reportMap[row.ITEM_ID]) {
                reportMap[row.ITEM_ID] = {
                    id: row.ITEM_ID,
                    code: row.CODE,
                    name: row.NAME,
                    unit: 'KG',
                    // Store 1 breakdown
                    S1_Buying: 0, S1_Selling: 0, S1_Opening: 0, S1_Wastage: 0,
                    S1_AdjIn: 0, S1_AdjOut: 0, S1_StockTake: 0, S1_StockClear: 0,
                    S1_TransferIn: 0, S1_TransferOut: 0,
                    // Store 2 breakdown
                    S2_Buying: 0, S2_Selling: 0, S2_Opening: 0, S2_Wastage: 0,
                    S2_AdjIn: 0, S2_AdjOut: 0, S2_StockTake: 0, S2_StockClear: 0,
                    S2_TransferIn: 0, S2_TransferOut: 0,
                };
            }
            const item = reportMap[row.ITEM_ID];
            const qty = parseFloat(row.total_qty || 0);
            const store = String(row.STORE_NO);
            const type = row.TYPE;

            // Map TYPE to specific key
            if (store === '1' || store === '2') {
                const key = `S${store}_${type}`;
                if (item[key] !== undefined) {
                    item[key] += qty;
                }
            }
        });

        let results = Object.values(reportMap);

        // Filter by selected items if requested
        if (itemIds && itemIds.length > 0) {
            const allowedIds = new Set(itemIds.map(id => parseInt(id)));
            results = results.filter(r => allowedIds.has(r.id));
        }

        // Calculate Totals and Nets
        results = results.map(r => {
            // Helper to sum S1 and S2 for a type
            const sumType = (type) => (r[`S1_${type}`] || 0) + (r[`S2_${type}`] || 0);

            const totals = {
                Total_Buying: sumType('Buying'),
                Total_Selling: sumType('Selling'),
                Total_Opening: sumType('Opening'),
                Total_Wastage: sumType('Wastage'),
                Total_AdjIn: sumType('AdjIn'),
                Total_AdjOut: sumType('AdjOut'),
                Total_StockTake: sumType('StockTake'),
                Total_StockClear: sumType('StockClear'),
                Total_TransferIn: sumType('TransferIn'),
                Total_TransferOut: sumType('TransferOut')
            };

            // Calculate Net Change per Store
            // In: Buying, Opening, AdjIn, TransferIn, StockTake
            // Out: Selling, AdjOut, StockClear, TransferOut, Wastage
            const calcNet = (prefix) => {
                const i = (r[`${prefix}_Buying`] || 0) + (r[`${prefix}_Opening`] || 0) + (r[`${prefix}_AdjIn`] || 0) + (r[`${prefix}_TransferIn`] || 0) + (r[`${prefix}_StockTake`] || 0);
                const o = (r[`${prefix}_Selling`] || 0) + (r[`${prefix}_AdjOut`] || 0) + (r[`${prefix}_StockClear`] || 0) + (r[`${prefix}_TransferOut`] || 0) + (r[`${prefix}_Wastage`] || 0);
                return i - o;
            };

            const netS1 = calcNet('S1');
            const netS2 = calcNet('S2');

            return {
                ...r,
                ...totals,
                netS1,
                netS2,
                netChange: netS1 + netS2
            };
        });

        // Sort by net change (biggest decrease first)
        results.sort((a, b) => a.netChange - b.netChange);

        return res.json({ success: true, result: results });

    } catch (error) {
        console.error("Error in Stock Movement Report:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 3. Average Price Analysis (Weighted Avg)
router.post('/api/reports/averages', async (req, res) => {
    try {
        const { startDate, endDate, itemIds, storeNo } = req.body;

        // reuse similar logic to Item Report but focus on Avg
        let whereClause = "t.IS_ACTIVE = 1 AND t.TYPE IN ('Selling', 'Buying')";
        let params = [];

        if (startDate && endDate) {
            whereClause += " AND DATE(t.CREATED_DATE) BETWEEN ? AND ?";
            params.push(startDate, endDate);
        }
        if (storeNo) {
            whereClause += " AND t.STORE_NO = ?";
            params.push(storeNo);
        }

        let sql = `
            SELECT 
                si.ITEM_ID,
                si.CODE,
                si.NAME,
                t.TYPE,
                SUM(sti.PRICE * sti.QUANTITY) as weighted_sum, -- Price * Qty = Total usually, but safeguard
                SUM(sti.TOTAL) as total_amount, -- Should be same as weighted_sum
                SUM(sti.QUANTITY) as total_qty
            FROM store_transactions_items sti
            JOIN store_transactions t ON sti.TRANSACTION_ID = t.TRANSACTION_ID
            JOIN store_items si ON sti.ITEM_ID = si.ITEM_ID
            WHERE ${whereClause} AND sti.IS_ACTIVE = 1
            GROUP BY si.ITEM_ID, si.CODE, si.NAME, t.TYPE
        `;

        const rows = await pool.query(sql, params);

        const reportMap = {};

        rows.forEach(row => {
            if (!reportMap[row.ITEM_ID]) {
                reportMap[row.ITEM_ID] = {
                    id: row.ITEM_ID,
                    code: row.CODE,
                    name: row.NAME,
                    buyTotal: 0,
                    buyQty: 0,
                    sellTotal: 0,
                    sellQty: 0
                };
            }
            const item = reportMap[row.ITEM_ID];
            if (row.TYPE === 'Selling') {
                item.sellTotal += parseFloat(row.total_amount || 0);
                item.sellQty += parseFloat(row.total_qty || 0);
            } else if (row.TYPE === 'Buying') {
                item.buyTotal += parseFloat(row.total_amount || 0);
                item.buyQty += parseFloat(row.total_qty || 0);
            }
        });

        let results = Object.values(reportMap);

        if (itemIds && itemIds.length > 0) {
            const allowedIds = new Set(itemIds.map(id => parseInt(id)));
            results = results.filter(r => allowedIds.has(r.id));
        }

        // Calculate Averages
        results = results.map(r => ({
            ...r,
            avgBuyPrice: r.buyQty > 0 ? (r.buyTotal / r.buyQty) : 0,
            avgSellPrice: r.sellQty > 0 ? (r.sellTotal / r.sellQty) : 0,
            stockStatus: (r.buyQty - r.sellQty) // Rough stock movement
        }));

        return res.json({ success: true, result: results });

    } catch (error) {
        console.error("Error in Average Report:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
