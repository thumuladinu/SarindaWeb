const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

router.use(cors());
pool.query = util.promisify(pool.query);

// ─── INIT TABLES & SEED CATEGORIES ─────────────────────────────
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mill_expense_categories (
                CATEGORY_ID INT AUTO_INCREMENT PRIMARY KEY,
                NAME VARCHAR(100) NOT NULL UNIQUE,
                DESCRIPTION VARCHAR(255) NULL,
                IS_ACTIVE TINYINT(1) DEFAULT 1,
                CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS mill_expenses (
                EXPENSE_ID INT AUTO_INCREMENT PRIMARY KEY,
                EXPENSE_NO VARCHAR(50) NOT NULL UNIQUE,
                CATEGORY_ID INT NULL,
                CATEGORY_NAME VARCHAR(100) NOT NULL,
                AMOUNT DECIMAL(12,2) NOT NULL,
                PAYMENT_METHOD VARCHAR(50) DEFAULT 'cash',
                PAID_TO VARCHAR(150) NULL,
                REF_NO VARCHAR(100) NULL,
                DATE DATETIME NOT NULL,
                NOTES TEXT NULL,
                CALCULATION_DATA JSON NULL,
                DEVICE_ID VARCHAR(50) DEFAULT 'WEB',
                CREATED_BY INT NULL,
                CREATED_DATE TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed default categories
        const defaults = [
            'Driver Trip & Fuel',
            'Lorry Handling (Load Up/Down)',
            'Dryer Labor (Load Up/Down)',
            'Fuel & Transportation',
            'Electricity & Utilities',
            'Machinery Maintenance',
            'Office & Supplies',
            'Miscellaneous'
        ];

        for (const cat of defaults) {
            await pool.query(
                `INSERT IGNORE INTO mill_expense_categories (NAME) VALUES (?)`,
                [cat]
            );
        }
        console.log('[Expenses] Table schema & default categories verified');
    } catch (e) {
        console.error('[Expenses] Table init error:', e);
    }
})();

// Helper to generate expense number EXP-YYYYMMDD-XXXX
const generateExpenseNo = async () => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const countResult = await pool.query(`SELECT COUNT(*) as count FROM mill_expenses WHERE DATE(CREATED_DATE) = CURDATE()`);
    let seq = (countResult[0]?.count || 0) + 1;
    let candidate = `EXP-${dateStr}-${String(seq).padStart(4, '0')}`;
    let exists = await pool.query('SELECT EXPENSE_ID FROM mill_expenses WHERE EXPENSE_NO = ?', [candidate]);
    while (exists && exists.length > 0) {
        seq++;
        candidate = `EXP-${dateStr}-${String(seq).padStart(4, '0')}`;
        exists = await pool.query('SELECT EXPENSE_ID FROM mill_expenses WHERE EXPENSE_NO = ?', [candidate]);
    }
    return candidate;
};

// ─── LIST EXPENSES ──────────────────────────────────────────────
router.get('/api/mill/expenses/list', async (req, res) => {
    try {
        const { startDate, endDate, category } = req.query;
        let query = `SELECT * FROM mill_expenses WHERE 1=1`;
        const params = [];

        if (category && category !== 'ALL') {
            query += ` AND CATEGORY_NAME = ?`;
            params.push(category);
        }

        if (startDate && endDate) {
            query += ` AND DATE >= ? AND DATE <= ?`;
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
        }

        query += ` ORDER BY DATE DESC, CREATED_DATE DESC`;
        const expenses = await pool.query(query, params);

        res.json({ success: true, result: expenses });
    } catch (error) {
        console.error('Error fetching expenses:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── ADD EXPENSE ────────────────────────────────────────────────
router.post('/api/mill/expenses/add', async (req, res) => {
    try {
        const { CATEGORY_NAME, AMOUNT, PAYMENT_METHOD, PAID_TO, REF_NO, DATE, NOTES, CALCULATION_DATA, DEVICE_ID, CREATED_BY } = req.body;

        if (!CATEGORY_NAME || !AMOUNT || parseFloat(AMOUNT) <= 0) {
            return res.status(400).json({ success: false, message: 'Category and positive amount are required' });
        }

        const expNo = await generateExpenseNo();

        const insertData = {
            EXPENSE_NO: expNo,
            CATEGORY_NAME: CATEGORY_NAME,
            AMOUNT: parseFloat(AMOUNT),
            PAYMENT_METHOD: PAYMENT_METHOD || 'cash',
            PAID_TO: PAID_TO || null,
            REF_NO: REF_NO || null,
            DATE: DATE || new Date().toISOString().slice(0, 19).replace('T', ' '),
            CREATED_DATE: req.body.CREATED_DATE ? new Date(req.body.CREATED_DATE) : new Date(),
            NOTES: NOTES || null,
            CALCULATION_DATA: CALCULATION_DATA ? JSON.stringify(CALCULATION_DATA) : null,
            DEVICE_ID: DEVICE_ID || 'WEB',
            CREATED_BY: CREATED_BY || null,
        };

        const result = await pool.query('INSERT INTO mill_expenses SET ?', insertData);

        res.json({
            success: true,
            expenseNo: expNo,
            expenseId: result.insertId,
            message: 'Expense recorded successfully'
        });
    } catch (error) {
        console.error('Error adding expense:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UPDATE EXPENSE ─────────────────────────────────────────────
router.put('/api/mill/expenses/:id', async (req, res) => {
    try {
        const { CATEGORY_NAME, AMOUNT, PAYMENT_METHOD, PAID_TO, REF_NO, DATE, NOTES } = req.body;
        const updateData = {};
        if (CATEGORY_NAME !== undefined) updateData.CATEGORY_NAME = CATEGORY_NAME;
        if (AMOUNT !== undefined) updateData.AMOUNT = parseFloat(AMOUNT);
        if (PAYMENT_METHOD !== undefined) updateData.PAYMENT_METHOD = PAYMENT_METHOD;
        if (PAID_TO !== undefined) updateData.PAID_TO = PAID_TO;
        if (REF_NO !== undefined) updateData.REF_NO = REF_NO;
        if (DATE !== undefined) updateData.DATE = DATE ? new Date(DATE).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
        if (NOTES !== undefined) updateData.NOTES = NOTES;

        await pool.query('UPDATE mill_expenses SET ? WHERE EXPENSE_ID = ?', [updateData, req.params.id]);
        res.json({ success: true, message: 'Expense updated successfully' });
    } catch (error) {
        console.error('Error updating expense:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── DELETE EXPENSE ─────────────────────────────────────────────
router.delete('/api/mill/expenses/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM mill_expenses WHERE EXPENSE_ID = ?', [req.params.id]);
        res.json({ success: true, message: 'Expense record deleted' });
    } catch (error) {
        console.error('Error deleting expense:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── LIST CATEGORIES ────────────────────────────────────────────
router.get('/api/mill/expenses/categories', async (req, res) => {
    try {
        const categories = await pool.query('SELECT * FROM mill_expense_categories WHERE IS_ACTIVE = 1 ORDER BY NAME ASC');
        res.json({ success: true, result: categories });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── ADD CATEGORY ───────────────────────────────────────────────
router.post('/api/mill/expenses/categories/add', async (req, res) => {
    try {
        const { NAME, DESCRIPTION } = req.body;
        if (!NAME || !NAME.trim()) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        const catName = NAME.trim();
        await pool.query(
            'INSERT INTO mill_expense_categories (NAME, DESCRIPTION) VALUES (?, ?) ON DUPLICATE KEY UPDATE IS_ACTIVE = 1',
            [catName, DESCRIPTION || null]
        );

        res.json({ success: true, message: 'Expense category saved' });
    } catch (error) {
        console.error('Error adding category:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
