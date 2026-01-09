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
const {query} = require("express");


// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Now you can use pool.query with async/await


router.post('/api/MillgetAllSellingTransactions', async (req, res) => {
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

            for(let i = 0; i < queryResult.length; i++) {
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

router.post('/api/MillgetAllTransactionsCashBook', async (req, res) => {
    //console.log('Get all Cash Transaction request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT * FROM mill_transactions WHERE IS_ACTIVE = 1');


        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {

            for(let i = 0; i < queryResult.length; i++) {
                if(queryResult[i].CUSTOMER !== null){
                    const c_name = await pool.query('SELECT NAME FROM mill_customers WHERE CUSTOMER_ID= ?', [queryResult[i].CUSTOMER]);
                    queryResult[i].C_NAME = c_name[0].NAME;
                }
                else{
                    queryResult[i].C_NAME = 'N/A'
                }

                if(queryResult[i].TYPE === 'Selling' && queryResult[i].DUE_AMOUNT > 0 && queryResult[i].DUE_DATE !== null && new Date(queryResult[i].DUE_DATE) < new Date()){
                    queryResult[i].DUE = true;
                    queryResult[i].NO_OF_LATE_DAYS = Math.floor((new Date() - new Date(queryResult[i].DUE_DATE)) / (1000 * 60 * 60 * 24));
                }

                //get items realated to the transaction
                queryResult[i].ITEMS = await pool.query('SELECT sti.*,si.CODE as ITEM_CODE,si.NAME as ITEM_NAME FROM mill_transactions_items sti JOIN mill_items si ON sti.ITEM_ID = si.ITEM_ID WHERE sti.TRANSACTION_ID= ? AND sti.IS_ACTIVE=1', [queryResult[i].TRANSACTION_ID]);
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


router.post('/api/MillgetAllTransactionsCashBookByUser', async (req, res) => {
    //console.log('Get all Cash Transaction request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch active transactions today and yersterday
        const queryResult = await pool.query('SELECT * FROM mill_transactions WHERE IS_ACTIVE = 1 AND CREATED_DATE >= CURDATE() - INTERVAL 1 DAY');


        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {

            for(let i = 0; i < queryResult.length; i++) {
                if(queryResult[i].CUSTOMER !== null){
                    const c_name = await pool.query('SELECT NAME FROM mill_customers WHERE CUSTOMER_ID= ?', [queryResult[i].CUSTOMER]);
                    queryResult[i].C_NAME = c_name[0].NAME;
                }
                else{
                    queryResult[i].C_NAME = 'N/A'
                }

                if(queryResult[i].TYPE === 'Selling' && queryResult[i].DUE_AMOUNT > 0 && queryResult[i].DUE_DATE !== null && new Date(queryResult[i].DUE_DATE) < new Date()){
                    queryResult[i].DUE = true;
                    queryResult[i].NO_OF_LATE_DAYS = Math.floor((new Date() - new Date(queryResult[i].DUE_DATE)) / (1000 * 60 * 60 * 24));
                }

                //get items realated to the transaction
                queryResult[i].ITEMS = await pool.query('SELECT sti.*,si.CODE as ITEM_CODE,si.NAME as ITEM_NAME FROM mill_transactions_items sti JOIN mill_items si ON sti.ITEM_ID = si.ITEM_ID WHERE sti.TRANSACTION_ID= ? AND sti.IS_ACTIVE=1', [queryResult[i].TRANSACTION_ID]);
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




router.post('/api/MillgetTodayTransactionData', async (req, res) => {
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

router.post('/api/MillgetAllBankTransactions', async (req, res) => {
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

            for(let i = 0; i < queryResult.length; i++) {
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

router.post('/api/MillgetAllTransactions', async (req, res) => {
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

            for(let i = 0; i < queryResult.length; i++) {
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


router.post('/api/MillsearchCash', async (req, res) => {
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

router.post('/api/MillsearchBuying', async (req, res) => {
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

router.post('/api/MillsearchSelling', async (req, res) => {
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


router.post('/api/MillsearchBank', async (req, res) => {
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


router.post('/api/MilladdTransaction', async (req, res) => {
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
            CREATED_BY: req.body.CREATED_BY,
        }

        console.log('re:', re);

        // Insert the new transactions data into the database
        const insertResult = await pool.query('INSERT INTO mill_transactions SET ?', re);

        if (insertResult.affectedRows > 0) {
            const insertId = insertResult.insertId;
            const type = req.body.TYPE;

            const code = generateCode(insertId, type);

            // billPrinter(req.body.ITEMS,code,req.body.SUB_TOTAL,res);

            const updateArry = {
                CODE: code,
                REFERENCE_TRANSACTION: insertId,
            }

            // Update the CODE column with the generated code
            await pool.query('UPDATE mill_transactions SET ? WHERE TRANSACTION_ID = ?', [updateArry, insertId]);




            if(req.body.ITEMS && req.body.ITEMS.length > 0) {
                const items = req.body.ITEMS;
                for(let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const itemObj = {
                        TRANSACTION_ID: insertId,
                        ITEM_ID : item.ITEM_ID,
                        PRICE: item.PRICE,
                        QUANTITY: item.QUANTITY,
                        TOTAL: item.TOTAL,
                        CREATED_BY: req.body.CREATED_BY,
                    };
                    await pool.query('INSERT INTO mill_transactions_items SET ?', itemObj);

                    //update stocks of items
                    if(type === 'Selling') {
                        await pool.query('UPDATE mill_items SET STOCK = STOCK - ? WHERE ITEM_ID = ?', [item.QUANTITY, item.ITEM_ID]);
                    } else if(type === 'Buying') {
                        await pool.query('UPDATE mill_items SET STOCK = STOCK + ? WHERE ITEM_ID = ?', [item.QUANTITY, item.ITEM_ID]);
                    }
                }
            }

            return res.status(200).json({ success: true, message: 'transactions added successfully', transactionId: insertId });
        }

    } catch (error) {
        console.error('Error adding transactions:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

function billPrinter(ITEMS,CODE,SUB_TOTAL,res) {
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
        res.json({success: false, message: error.message});
    }
}


router.post('/api/MillupdateTransaction', async (req, res) => {
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
        }
        console.log('re:', re);

        // Update the transactions data into the database
        const updateResult = await pool.query('UPDATE mill_transactions SET ? WHERE TRANSACTION_ID = ?', [re, req.body.TRANSACTION_ID]);

        if (updateResult.affectedRows > 0) {

            //undo the previous transaction STOCK update
            const prevItems = await pool.query('SELECT * FROM mill_transactions_items WHERE TRANSACTION_ID = ? AND IS_ACTIVE = 1', [req.body.TRANSACTION_ID]);
            console.log('prevItems:', prevItems);
            for(let i = 0; i < prevItems.length; i++) {
                const item = prevItems[i];
                if(req.body.TYPE === 'Selling') {
                    await pool.query('UPDATE mill_items SET STOCK = STOCK + ? WHERE ITEM_ID = ?', [item.QUANTITY, item.ITEM_ID]);
                } else if(req.body.TYPE === 'Buying') {
                    await pool.query('UPDATE mill_items SET STOCK = STOCK - ? WHERE ITEM_ID = ?', [item.QUANTITY, item.ITEM_ID]);
                }
            }
            //deactivate the previous transaction items
            await pool.query('UPDATE mill_transactions_items SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [req.body.TRANSACTION_ID]);

            if(req.body.ITEMS && req.body.ITEMS.length > 0) {
                const items = req.body.ITEMS;
                for(let i = 0; i < items.length; i++) {
                    const item = items[i];
                    const itemObj = {
                        TRANSACTION_ID: req.body.TRANSACTION_ID,
                        ITEM_ID : item.ITEM_ID,
                        PRICE: item.PRICE,
                        QUANTITY: item.QUANTITY,
                        TOTAL: item.TOTAL,
                        CREATED_BY: req.body.CREATED_BY,
                    };
                    await pool.query('INSERT INTO mill_transactions_items SET ?', itemObj);

                    //update stocks of items
                    if(req.body.TYPE === 'Selling') {
                        await pool.query('UPDATE mill_items SET STOCK = STOCK - ? WHERE ITEM_ID = ?', [item.QUANTITY, item.ITEM_ID]);
                    } else if(req.body.TYPE === 'Buying') {
                        await pool.query('UPDATE mill_items SET STOCK = STOCK + ? WHERE ITEM_ID = ?', [item.QUANTITY, item.ITEM_ID]);
                    }
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
function generateCode(insertId, type) {
    //console.log('Generating code for type:', type);
    let code = '';

    if (type === 'Selling') {
        code = 'MS' + padWithZeros(insertId);
    } else if (type === 'Buying') {
        code = 'MB' + padWithZeros(insertId);
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

router.post('/api/MilladdPayment', async (req, res) => {
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
        };

        // Insert the new transactions data into the database
        const insertResult = await pool.query('INSERT INTO mill_transactions SET ?', re);

        if (insertResult.affectedRows > 0) {
            //console.log('payment added successfully');
            const insertId = insertResult.insertId;
            const type = req.body.TYPE;

            const code = generateCodeForPayment(insertId, type);
            //console.log('Generated code:', code);

            // Update the CODE column with the generated code
            await pool.query('UPDATE mill_transactions SET CODE = ? WHERE TRANSACTION_ID = ?', [code, insertId]);

            await pool.query('UPDATE mill_transactions SET AMOUNT_SETTLED = ?, DUE_AMOUNT = ? WHERE REFERENCE_TRANSACTION = ?', [re.AMOUNT_SETTLED, re.DUE_AMOUNT, req.body.TRANSACTION]);

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

router.post('/api/MillupdatePayment', async (req, res) => {
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
        const updateResult = await pool.query('UPDATE mill_transactions SET ? WHERE TRANSACTION_ID = ?', [re, req.body.TRANSACTION_ID]);

        if (updateResult.affectedRows > 0) {

            await pool.query('UPDATE mill_transactions SET AMOUNT_SETTLED = ?, DUE_AMOUNT = ? WHERE REFERENCE_TRANSACTION = ?', [re.AMOUNT_SETTLED, re.DUE_AMOUNT, req.body.TRANSACTION]);

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
    let code = 'MP' + padWithZeros(insertId);
    return code;
}



router.post('/api/MilldeactivateTransaction', async (req, res) => {
    //console.log('Deactivate transactions request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the transactions ID from the request body
        const { TRANSACTION_ID,ALL,ITEM_DEL } = req.body;

        let updateResult;

        // Update the IS_ACTIVE column to 0 to deactivate the transactions
        console.log('ALL:', ALL);
        if(ALL){
            updateResult = await pool.query('UPDATE mill_transactions SET IS_ACTIVE = 0 WHERE REFERENCE_TRANSACTION = ?', [
                TRANSACTION_ID,
            ]);
        }
        else{
            updateResult = await pool.query('UPDATE mill_transactions SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [
                TRANSACTION_ID,
            ]);
        }

        if(ITEM_DEL) {
            //undo the previous transaction STOCK update
            const prevItems = await pool.query('SELECT * FROM mill_transactions_items WHERE TRANSACTION_ID = ? AND IS_ACTIVE = 1', [TRANSACTION_ID]);

            for (let i = 0; i < prevItems.length; i++) {
                const item = prevItems[i];
                if (req.body.TYPE === 'Selling') {
                    await pool.query('UPDATE mill_items SET STOCK = STOCK + ? WHERE ITEM_ID = ?', [item.QUANTITY, item.ITEM_ID]);
                } else if (req.body.TYPE === 'Buying') {
                    await pool.query('UPDATE mill_items SET STOCK = STOCK - ? WHERE ITEM_ID = ?', [item.QUANTITY, item.ITEM_ID]);
                }
            }

            const deactiveItemsQuery = await pool.query('UPDATE mill_transactions_items SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [
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

router.post('/api/MilldeletePayment', async (req, res) => {
    //console.log('Deactivate payment request received:', req.body);

    let newValues;
    let updateResult;
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({success: false, message: 'Internal server error'});
        }

        // Extract the payment ID from the request body
        const {TRANSACTION_ID, PAYMENT_AMOUNT, AMOUNT_SETTLED, DUE_AMOUNT,REFERENCE_TRANSACTION} = req.body;

        newValues = {
            AMOUNT_SETTLED: Number(AMOUNT_SETTLED) - Number(PAYMENT_AMOUNT),
            DUE_AMOUNT: Number(DUE_AMOUNT) + Number(PAYMENT_AMOUNT),
        }

        updateResult = await pool.query('UPDATE transactions SET AMOUNT_SETTLED = ?, DUE_AMOUNT = ? WHERE TRANSACTION_ID = ?', [newValues.AMOUNT_SETTLED, newValues.DUE_AMOUNT, REFERENCE_TRANSACTION]);

        let updateResult1 = await pool.query('UPDATE transactions SET IS_ACTIVE = 0 WHERE TRANSACTION_ID = ?', [TRANSACTION_ID]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({success: true, message: 'payment deactivated successfully'});
        } else {
            console.error('Error: Failed to deactivate payment:', updateResult.message);
            return res.status(500).json({success: false, message: 'Internal server error'});
        }
    } catch (error) {
        console.error('Error deactivating payment:', error);
        return res.status(500).json({success: false, message: 'Internal server error'});
    }
});

router.post('/api/MillgetTransactionForReference', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT TRANSACTION_ID, CODE, EDITED_DATE FROM mill_transactions WHERE IS_ACTIVE = 1 AND TYPE = "Selling"');

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

router.post('/api/MillgetAllTransactionForReference', async (req, res) => {
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
router.post('/api/MillgetTransactionDetails', async (req, res) => {
    //console.log('Get transactions Details request received:', req.body);
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active transactions
        const queryResult = await pool.query('SELECT * FROM mill_transactions WHERE TRANSACTION_ID = ?', [req.body.TRANSACTION_ID]);

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

router.post('/api/MillgetAllDueTransactions', async (req, res) => {
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

            for(let i = 0; i < queryResult.length; i++) {
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



module.exports = router;
