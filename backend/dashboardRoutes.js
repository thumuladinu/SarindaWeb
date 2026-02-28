const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');

// pool.query = util.promisify(pool.query); // Removed to avoid double-wrapping since other routes already promisify it

// SQL Helper for selective SL Time conversion
// Server-created records (Actual UTC) -> Shift to SLT
// Synced records (Already SLT string) -> Keep as-is
const SL_TIME_SQL = (field = 'st.CREATED_DATE', codeField = 'st.CODE') => `
    CASE 
        WHEN ${codeField} IS NULL 
             OR ${codeField} LIKE 'ADJ-%' 
             OR ${codeField} LIKE 'STOCKOP-%' 
             OR ${codeField} LIKE 'SLO-%'
             OR ${codeField} LIKE 'WEB-%'
             OR ${codeField} LIKE '%-WEB-%'
             OR ${codeField} LIKE '%-SLO-%'
             OR ${codeField} LIKE 'RETURN-EXP-%'
        THEN CONVERT_TZ(${field}, '+00:00', '+05:30')
        ELSE ${field}
    END
`;

const OP_SL_TIME_SQL = (field = 'so.CREATED_DATE') => `CONVERT_TZ(${field}, '+00:00', '+05:30')`;

// Now you can use pool.query with async/await
router.post('/api/getItemCountData', async (req, res) => {
    //console.log('Get item count data request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch counts for Rough items
        const roughCountsQuery = await pool.query(
            'SELECT COUNT(*) AS COUNT, ROUGH_TYPE FROM items WHERE IS_ACTIVE=1 AND TYPE = "Rough" AND IS_IN_INVENTORY = 1 GROUP BY ROUGH_TYPE'
        );

        // Query to fetch counts for Lots items
        const lotsCountsQuery = await pool.query(
            'SELECT COUNT(*) AS COUNT, LOT_TYPE FROM items WHERE IS_ACTIVE=1 AND TYPE = "Lots" AND IS_IN_INVENTORY = 1 GROUP BY LOT_TYPE'
        );

        // Query to fetch counts for Sorted Lots items
        const sortedLotsCountsQuery = await pool.query(
            'SELECT COUNT(*) AS COUNT, SORTED_LOT_TYPE FROM items WHERE IS_ACTIVE=1 AND TYPE = "Sorted Lots" AND IS_IN_INVENTORY = 1 GROUP BY SORTED_LOT_TYPE'
        );

        // Query to fetch counts for Cut and Polished items
        const cutAndPolishedCountsQuery = await pool.query(
            'SELECT COUNT(*) AS COUNT, CP_TYPE FROM items WHERE IS_ACTIVE=1 AND TYPE = "Cut and Polished" AND IS_IN_INVENTORY = 1 GROUP BY CP_TYPE'
        );

        // Prepare the response data
        const result = {
            roughCounts: roughCountsQuery,
            lotsCounts: lotsCountsQuery,
            sortedLotsCounts: sortedLotsCountsQuery,
            cutAndPolishedCounts: cutAndPolishedCountsQuery,
        };
        //console.log('result:', result);

        return res.status(200).json({ success: true, result });
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/getExpiringCheques', (req, res) => {
    // Query to fetch expiring cheques within 15 days
    console.log('Get expiring cheques request received:');
    const query = `
        SELECT * FROM store_transactions 
        WHERE METHOD = 'Cheque' 
        AND IS_CHEQUE_COLLECTED = 0 
        AND IS_ACTIVE = 1 
        AND CHEQUE_EXPIRY < DATE_ADD(CURDATE(), INTERVAL 15 DAY)
    `;


    // Execute the query
    pool.query(query, (error, results) => {
        if (error) {
            console.error('Error executing MySQL query:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        console.log('results:', results);

        // Check each record and add IS_EXPIRED flag
        const result = results.map(record => {
            const chequeExpiryDate = new Date(record.CHEQUE_EXPIRY);
            const currentDate = new Date();
            record.IS_EXPIRED = chequeExpiryDate < currentDate ? 1 : 0;
            return record;
        });

        // Return the response with the result
        return res.status(200).json({ success: true, result });
    });
});

router.post('/api/markAsReceived', (req, res) => {
    // Get the transaction ID from the request body
    const { TRANSACTION_ID } = req.body;
    console.log('transactionId:', TRANSACTION_ID);

    // Update the transaction record to mark as cheque collected
    const query = 'UPDATE store_transactions SET IS_CHEQUE_COLLECTED = 1 WHERE TRANSACTION_ID = ?';

    // Execute the query
    pool.query(query, [TRANSACTION_ID], (error, results) => {
        if (error) {
            console.error('Error executing MySQL query:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Return the response with the success message
        return res.status(200).json({ success: true, message: 'Transaction marked as cheque collected' });
    });
}
);

router.post('/api/getTodayTransactions', async (req, res) => {
    //console.log('Get sold item count data request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Sum of buying transactions for today
        const buyTransactionsQuery = await pool.query(
            `SELECT SUM(PAYMENT_AMOUNT) AS AMOUNT FROM store_transactions st WHERE IS_ACTIVE = 1 AND DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) >= CURDATE() AND (TYPE = 'Buying' OR TYPE = 'Payment') AND STORE_NO = ? `, [req.body.STORE_NO]
        );

        // Sum of selling transactions for today
        const sellTransactionsQuery = await pool.query(
            `SELECT SUM(PAYMENT_AMOUNT) AS AMOUNT FROM store_transactions st WHERE IS_ACTIVE = 1 AND DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) >= CURDATE() AND TYPE = 'Selling' AND STORE_NO = ? `, [req.body.STORE_NO]
        );


        // Prepare the response data
        const result = [
            buyTransactionsQuery[0].AMOUNT ? buyTransactionsQuery[0].AMOUNT : 0,
            sellTransactionsQuery[0].AMOUNT ? sellTransactionsQuery[0].AMOUNT : 0
        ];
        //console.log('result:', result);
        console.log('result:', result);

        return res.status(200).json({ success: true, result });
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/getTransactionData', async (req, res) => {
    //console.log('Get transaction data request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Calculate the date for the beginning of the previous year
        const previousYearStartDate = new Date();
        previousYearStartDate.setFullYear(previousYearStartDate.getFullYear() - 1);
        previousYearStartDate.setMonth(previousYearStartDate.getMonth() + 1); // 1 month back
        previousYearStartDate.setDate(1); // 1st day

        // Format the date for MySQL format (YYYY-MM-DD)
        const formattedStartDate = previousYearStartDate.toISOString().split('T')[0];

        // console.log('formattedStartDate:', formattedStartDate);

        // Query to fetch buy transactions sum of amounts grouped by filtering months from DATE within the previous year
        const buyTransactionsQuery = await pool.query(`
    SELECT COALESCE(SUM(CASE WHEN transactions.TYPE IN ("Buying", "B Payment") THEN transactions.PAYMENT_AMOUNT ELSE 0 END), 0) AS AMOUNT, months.MONTH
    FROM (
        SELECT 1 AS MONTH
        UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7
        UNION SELECT 8 UNION SELECT 9 UNION SELECT 10
        UNION SELECT 11 UNION SELECT 12
    ) months
    LEFT JOIN transactions ON months.MONTH = MONTH(transactions.DATE)
    AND transactions.IS_ACTIVE = 1 AND transactions.DATE >= '${formattedStartDate}'
    GROUP BY months.MONTH
`);

        // console.log('buyTransactionsQuery:', buyTransactionsQuery);

        // Query to fetch sell transactions sum of amounts grouped by filtering months from DATE within the previous year
        const sellTransactionsQuery = await pool.query(`
    SELECT COALESCE(SUM(CASE WHEN transactions.TYPE IN ("Selling", "S Payment") THEN transactions.PAYMENT_AMOUNT ELSE 0 END), 0) AS AMOUNT, months.MONTH
    FROM (
        SELECT 1 AS MONTH
        UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7
        UNION SELECT 8 UNION SELECT 9 UNION SELECT 10
        UNION SELECT 11 UNION SELECT 12
    ) months
    LEFT JOIN transactions ON months.MONTH = MONTH(transactions.DATE)
    AND transactions.IS_ACTIVE = 1 AND transactions.DATE >= '${formattedStartDate}'
    GROUP BY months.MONTH
`);

        // console.log('sellTransactionsQuery:', sellTransactionsQuery);



        // Function to arrange transactions array with 12 values
        const arrangeTransactionsArrayWith12Values = (transactionsQuery, currentMonth) => {
            const arrangedArray = [];

            for (let i = 0; i < 12; i++) {
                const targetMonth = (currentMonth - i + 12) % 12 || 12; // Calculate the target month considering modulo for wrapping to 12
                const targetRow = transactionsQuery.find(row => row.MONTH === targetMonth);
                arrangedArray.push(targetRow ? targetRow.AMOUNT : 0);
            }

            //reverse the array
            arrangedArray.reverse();

            return arrangedArray;
        };

        // Prepare the response data
        const currentMonth = new Date().getMonth() + 1;
        // console.log('currentMonth:', currentMonth);
        const result = {
            buyTransactions: arrangeTransactionsArrayWith12Values(buyTransactionsQuery, currentMonth),
            sellTransactions: arrangeTransactionsArrayWith12Values(sellTransactionsQuery, currentMonth),
        };
        // console.log('result:', result);

        return res.status(200).json({ success: true, result });
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Function to arrange transactions array as per requirements
function arrangeTransactionsArray(transactionsQueryResult) {
    const arrangedArray = new Array(12).fill(0); // Initialize an array with 12 zeros

    transactionsQueryResult.forEach((transaction) => {
        // Use the MONTH value (1 to 12) as the index in the array
        const index = transaction.MONTH - 1;
        arrangedArray[index] = transaction.AMOUNT;
    });

    return arrangedArray;
}


router.post('/api/getCashDashboardData', async (req, res) => {
    //console.log('Get cash dashboard data request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }


        const buyCashOutTransactionsQuery = await pool.query(`
            SELECT SUM(PAYMENT_AMOUNT) AS AMOUNT
            FROM transactions
            WHERE IS_ACTIVE=1 AND (TYPE = "Buying" OR TYPE = "B Payment") AND METHOD = "Cash"
        `);

        const sellCashInTransactionsQuery = await pool.query(`
            SELECT SUM(PAYMENT_AMOUNT) AS AMOUNT
            FROM transactions
            WHERE IS_ACTIVE=1 AND (TYPE = "Selling" OR TYPE = "S Payment") AND METHOD = "Cash"
        `);

        const buyBankOutTransactionsQuery = await pool.query(`
            SELECT SUM(PAYMENT_AMOUNT) AS AMOUNT
            FROM transactions
            WHERE IS_ACTIVE=1 AND (TYPE = "Buying" OR TYPE = "B Payment") AND METHOD = "Bank"
        `);

        const sellBankInTransactionsQuery = await pool.query(`
            SELECT SUM(PAYMENT_AMOUNT) AS AMOUNT
            FROM transactions
            WHERE IS_ACTIVE=1 AND (TYPE = "Selling" OR TYPE = "S Payment") AND METHOD = "Bank"
        `);

        const totalExpensesQuery = await pool.query(`
            SELECT SUM(AMOUNT) AS AMOUNT
            FROM expenses
            WHERE IS_ACTIVE=1
        `);

        // Prepare the response data
        const result = {
            buyCashOutTransactions: buyCashOutTransactionsQuery[0].AMOUNT ? buyCashOutTransactionsQuery[0].AMOUNT : 0,
            sellCashInTransactions: sellCashInTransactionsQuery[0].AMOUNT ? sellCashInTransactionsQuery[0].AMOUNT : 0,
            cashBalance: sellCashInTransactionsQuery[0].AMOUNT - buyCashOutTransactionsQuery[0].AMOUNT,
            buyBankOutTransactions: buyBankOutTransactionsQuery[0].AMOUNT ? buyBankOutTransactionsQuery[0].AMOUNT : 0,
            sellBankInTransactions: sellBankInTransactionsQuery[0].AMOUNT ? sellBankInTransactionsQuery[0].AMOUNT : 0,
            bankBalance: sellBankInTransactionsQuery[0].AMOUNT - buyBankOutTransactionsQuery[0].AMOUNT,
            totalExpenses: totalExpensesQuery[0].AMOUNT ? totalExpensesQuery[0].AMOUNT : 0,
        };
        //console.log('result:', result);

        return res.status(200).json({ success: true, result });
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


router.post('/api/getCashBookSumData', async (req, res) => {
    //console.log('Get cash dashboard data request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }


        const buyCashOutTransactionsQuery = await pool.query(`
            SELECT SUM(PAYMENT_AMOUNT) AS AMOUNT
            FROM transactions
            WHERE IS_ACTIVE=1 AND (TYPE = "Buying" OR TYPE = "B Payment") AND METHOD = "Cash"
        `);

        const sellCashInTransactionsQuery = await pool.query(`
            SELECT SUM(PAYMENT_AMOUNT) AS AMOUNT
            FROM transactions
            WHERE IS_ACTIVE=1 AND (TYPE = "Selling" OR TYPE = "S Payment") AND METHOD = "Cash"
        `);

        const CashExpenses = await pool.query(`
            SELECT SUM(AMOUNT) AS AMOUNT
            FROM expenses
            WHERE IS_ACTIVE=1 AND METHOD = "Cash"
        `);

        const buyBankOutTransactionsQuery = await pool.query(`
            SELECT SUM(PAYMENT_AMOUNT) AS AMOUNT
            FROM transactions
            WHERE IS_ACTIVE=1 AND (TYPE = "Buying" OR TYPE = "B Payment") AND METHOD = "Bank"
        `);

        const sellBankInTransactionsQuery = await pool.query(`
            SELECT SUM(PAYMENT_AMOUNT) AS AMOUNT
            FROM transactions
            WHERE IS_ACTIVE=1 AND (TYPE = "Selling" OR TYPE = "S Payment") AND METHOD = "Bank"
        `);

        const BankExpenses = await pool.query(`
            SELECT SUM(AMOUNT) AS AMOUNT
            FROM expenses
            WHERE IS_ACTIVE=1 AND METHOD = "Bank"
        `);

        const buyCashOutTransactions = buyCashOutTransactionsQuery[0].AMOUNT && CashExpenses[0].AMOUNT ? buyCashOutTransactionsQuery[0].AMOUNT + CashExpenses[0].AMOUNT : buyCashOutTransactionsQuery[0].AMOUNT ? buyCashOutTransactionsQuery[0].AMOUNT : CashExpenses[0].AMOUNT ? CashExpenses[0].AMOUNT : 0;
        const sellCashInTransactions = sellCashInTransactionsQuery[0].AMOUNT ? sellCashInTransactionsQuery[0].AMOUNT : 0;

        const buyBankOutTransactions = buyBankOutTransactionsQuery[0].AMOUNT && BankExpenses[0].AMOUNT ? buyBankOutTransactionsQuery[0].AMOUNT + BankExpenses[0].AMOUNT : buyBankOutTransactionsQuery[0].AMOUNT ? buyBankOutTransactionsQuery[0].AMOUNT : BankExpenses[0].AMOUNT ? BankExpenses[0].AMOUNT : 0;
        const sellBankInTransactions = sellBankInTransactionsQuery[0].AMOUNT ? sellBankInTransactionsQuery[0].AMOUNT : 0;
        // Prepare the response data
        const result = {
            buyCashOutTransactions: buyCashOutTransactions,
            sellCashInTransactions: sellCashInTransactions,
            cashBalance: sellCashInTransactions - buyCashOutTransactions,
            buyBankOutTransactions: buyBankOutTransactions,
            sellBankInTransactions: sellBankInTransactions,
            bankBalance: sellBankInTransactions - buyBankOutTransactions,
        };
        console.log('result:', result);

        return res.status(200).json({ success: true, result });
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});




router.post('/api/getDailyDashboardStats', async (req, res) => {
    console.log("Dashboard Stats Request Received:", req.body);
    try {
        const { DATE } = req.body;
        const queryDate = DATE || new Date().toISOString().split('T')[0];
        console.log("Querying for Date:", queryDate);

        if (!pool) {
            console.error("Database pool is undefined!");
            return res.status(500).json({ success: false, message: 'Database connection failed' });
        }

        // 1. Get Global Stats
        console.log("Step 1: Fetching Global Stats...");
        const globalStatsQuery = `
            SELECT 
                COALESCE(SUM(CASE WHEN TYPE = 'Selling' THEN SUB_TOTAL ELSE 0 END), 0) as sales,
                COALESCE(SUM(CASE WHEN TYPE = 'Buying' THEN SUB_TOTAL ELSE 0 END), 0) as buying,
                COALESCE(SUM(CASE WHEN TYPE = 'Expenses' THEN SUB_TOTAL ELSE 0 END), 0) as expenses
            FROM store_transactions st
            WHERE IS_ACTIVE=1 AND DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) = ?
        `;
        const globalStats = await pool.query(globalStatsQuery, [queryDate]);

        // 2. Get All Users
        console.log("Step 2: Fetching Users...");
        const usersQuery = `SELECT USER_ID, NAME, USERNAME, ROLE, PHOTO FROM user_details WHERE IS_ACTIVE=1`;
        const users = await pool.query(usersQuery);

        // 3. Get Opening Floats - SUM all records for same user+date
        console.log("Step 3: Fetching Floats...");
        const floatsQuery = `SELECT USER_ID, SUM(OPENING_AMOUNT) as OPENING_AMOUNT FROM cash_floats WHERE DATE = ? GROUP BY USER_ID`;
        const floats = await pool.query(floatsQuery, [queryDate]);

        // 4. Get Transactions Grouped by User
        console.log("Step 4: Fetching User Transactions...");
        const userTransQuery = `
            SELECT CREATED_BY, TYPE, SUM(SUB_TOTAL) as total 
            FROM store_transactions st
            WHERE IS_ACTIVE=1 AND DATE(${SL_TIME_SQL('st.CREATED_DATE', 'st.CODE')}) = ?
            GROUP BY CREATED_BY, TYPE
        `;
        const userTrans = await pool.query(userTransQuery, [queryDate]);

        // 5. Get Today's Stock Movement (Item-wise and Store-wise)
        console.log("Step 5: Fetching Today's Stock Movement...");
        const stockMovementQuery = `
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
            WHERE t.IS_ACTIVE = 1 
            AND sti.IS_ACTIVE = 1
            AND t.TYPE IN ('Selling', 'Buying')
            AND DATE(${SL_TIME_SQL('t.CREATED_DATE', 't.CODE')}) = ?
            GROUP BY si.ITEM_ID, si.CODE, si.NAME, t.TYPE, t.STORE_NO
        `;
        const stockMovementRows = await pool.query(stockMovementQuery, [queryDate]);

        // Process Stock Movement into item map
        const stockMap = {};
        stockMovementRows.forEach(row => {
            if (!stockMap[row.ITEM_ID]) {
                stockMap[row.ITEM_ID] = {
                    id: row.ITEM_ID,
                    code: row.CODE,
                    name: row.NAME,
                    buyQtyS1: 0, sellQtyS1: 0,
                    buyQtyS2: 0, sellQtyS2: 0
                };
            }
            const item = stockMap[row.ITEM_ID];
            const qty = parseFloat(row.total_qty || 0);
            const store = String(row.STORE_NO);

            if (row.TYPE === 'Buying') {
                if (store === '1') item.buyQtyS1 += qty;
                else if (store === '2') item.buyQtyS2 += qty;
            } else if (row.TYPE === 'Selling') {
                if (store === '1') item.sellQtyS1 += qty;
                else if (store === '2') item.sellQtyS2 += qty;
            }
        });

        // Calculate totals and net changes
        const stockMovement = Object.values(stockMap).map(r => ({
            ...r,
            buyQty: r.buyQtyS1 + r.buyQtyS2,
            sellQty: r.sellQtyS1 + r.sellQtyS2,
            netS1: r.buyQtyS1 - r.sellQtyS1,
            netS2: r.buyQtyS2 - r.sellQtyS2,
            netChange: (r.buyQtyS1 + r.buyQtyS2) - (r.sellQtyS1 + r.sellQtyS2)
        })).sort((a, b) => b.sellQty - a.sellQty); // Sort by most sold

        console.log("All queries successful. Processing data...");

        // Process Global Stats
        const stats = globalStats[0]; // Assuming promisified query returns array of rows
        const globalResult = {
            sales: parseFloat(stats?.sales || 0),
            buying: parseFloat(stats?.buying || 0),
            expenses: parseFloat(stats?.expenses || 0),
            profit: parseFloat(stats?.sales || 0) - parseFloat(stats?.buying || 0) - parseFloat(stats?.expenses || 0)
        };

        // Process User Stats
        const userStats = users.map(user => {
            const userId = user.USER_ID;

            // Opening - now uses SUM from the query
            const userFloat = floats.find(f => f.USER_ID === userId);
            const opening = parseFloat(userFloat?.OPENING_AMOUNT || 0);

            // Transactions
            const userTxns = userTrans.filter(t => t.CREATED_BY === userId);
            const sales = parseFloat(userTxns.find(t => t.TYPE === 'Selling')?.total || 0);
            const buying = parseFloat(userTxns.find(t => t.TYPE === 'Buying')?.total || 0);
            const expenses = parseFloat(userTxns.find(t => t.TYPE === 'Expenses')?.total || 0);

            const balance = opening + sales - buying - expenses;

            return {
                ...user,
                opening,
                sales,
                buying,
                expenses,
                balance
            };
        });

        // Filter: Show only users with assigned money or transactions
        const activeUsers = userStats.filter(u =>
            u.opening > 0 || u.sales > 0 || u.buying > 0 || u.expenses > 0
        );

        console.log("Sending Response. Active Users:", activeUsers.length, "Stock Items:", stockMovement.length);

        return res.status(200).json({
            success: true,
            data: {
                global: globalResult,
                users: activeUsers,
                stockMovement: stockMovement
            }
        });

    } catch (error) {
        console.error('CRITICAL ERROR in getDailyDashboardStats:', error);
        return res.status(500).json({ success: false, message: 'Internal server error: ' + error.message });
    }
});

module.exports = router;
