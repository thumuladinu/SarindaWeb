// millReturnRoutes.js — Sales Returns Operations & Audit Records
const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

router.use(cors());
pool.query = util.promisify(pool.query);

// Helper for Return No
const generateReturnNo = async () => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const countRes = await pool.query(
        `SELECT COUNT(*) as count FROM mill_sales_returns WHERE DATE(CREATED_DATE) = CURDATE()`
    );
    const seq = (countRes[0]?.count || 0) + 1;
    return `MSR-${dateStr}-${String(seq).padStart(4, '0')}`;
};

// Initialize Tables
const initReturnTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mill_sales_returns (
                RETURN_ID INT AUTO_INCREMENT PRIMARY KEY,
                RETURN_NO VARCHAR(50) NOT NULL UNIQUE,
                BILL_ID INT NOT NULL,
                INVOICE_NO VARCHAR(50) NOT NULL,
                CUSTOMER_ID INT DEFAULT NULL,
                REFUND_AMOUNT DECIMAL(12,2) DEFAULT 0,
                REFUND_METHOD VARCHAR(50) DEFAULT 'cash',
                REASON VARCHAR(255) DEFAULT NULL,
                DATE DATE NOT NULL,
                CREATED_BY INT DEFAULT NULL,
                CREATED_DATE DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS mill_sales_return_items (
                RETURN_ITEM_ID INT AUTO_INCREMENT PRIMARY KEY,
                RETURN_ID INT NOT NULL,
                ITEM_ID INT NOT NULL,
                BAG_WEIGHT DECIMAL(10,2) DEFAULT NULL,
                RETURNED_BAG_COUNT INT DEFAULT 0,
                RETURNED_QTY DECIMAL(10,2) DEFAULT 0,
                UNIT_PRICE DECIMAL(10,2) DEFAULT 0,
                REFUND_LINE_TOTAL DECIMAL(12,2) DEFAULT 0
            )
        `);
    } catch (e) {
        console.error('Error initializing sales return tables:', e);
    }
};
initReturnTables();

// ─── LIST ALL RETURNS ──────────────────────────────────────────
router.get('/api/mill/returns/list', async (req, res) => {
    try {
        const returns = await pool.query(`
            SELECT r.*, c.NAME as CUSTOMER_NAME, c.PHONE_NUMBER as CUSTOMER_PHONE
            FROM mill_sales_returns r
            LEFT JOIN mill_customers c ON r.CUSTOMER_ID = c.CUSTOMER_ID
            ORDER BY r.CREATED_DATE DESC
        `);

        res.json({ success: true, result: Array.isArray(returns) ? returns.map(r => ({ ...r })) : [] });
    } catch (error) {
        console.error('Error fetching sales returns:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── GET SINGLE RETURN DETAILS ──────────────────────────────────
router.get('/api/mill/returns/:id', async (req, res) => {
    try {
        const returnRes = await pool.query(`
            SELECT r.*, c.NAME as CUSTOMER_NAME, c.PHONE_NUMBER as CUSTOMER_PHONE
            FROM mill_sales_returns r
            LEFT JOIN mill_customers c ON r.CUSTOMER_ID = c.CUSTOMER_ID
            WHERE r.RETURN_ID = ?
        `, [req.params.id]);

        if (!returnRes || returnRes.length === 0) {
            return res.status(404).json({ success: false, message: 'Return record not found' });
        }

        const returnRecord = returnRes[0];
        const items = await pool.query(`
            SELECT ri.*, i.NAME as ITEM_NAME, i.CODE as ITEM_CODE
            FROM mill_sales_return_items ri
            JOIN mill_items i ON ri.ITEM_ID = i.ITEM_ID
            WHERE ri.RETURN_ID = ?
        `, [req.params.id]);

        returnRecord.ITEMS = items;
        res.json({ success: true, result: returnRecord });
    } catch (error) {
        console.error('Error fetching return details:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── CREATE SALES RETURN ────────────────────────────────────────
router.post('/api/mill/returns/add', async (req, res) => {
    try {
        const { BILL_ID, INVOICE_NO, CUSTOMER_ID, REFUND_AMOUNT, REFUND_METHOD, REASON, DATE, CREATED_BY, ITEMS } = req.body;

        if (!BILL_ID || !INVOICE_NO) {
            return res.status(400).json({ success: false, message: 'Invoice / Bill selection required' });
        }
        if (!ITEMS || !Array.isArray(ITEMS) || ITEMS.length === 0) {
            return res.status(400).json({ success: false, message: 'Must select at least one item to return' });
        }

        const returnNo = await generateReturnNo();

        // 1. Insert Sales Return Record
        const returnInsert = await pool.query('INSERT INTO mill_sales_returns SET ?', {
            RETURN_NO: returnNo,
            BILL_ID,
            INVOICE_NO,
            CUSTOMER_ID: CUSTOMER_ID || null,
            REFUND_AMOUNT: REFUND_AMOUNT || 0,
            REFUND_METHOD: REFUND_METHOD || 'cash',
            REASON: REASON || null,
            DATE: DATE || new Date().toISOString().slice(0, 10),
            CREATED_BY: CREATED_BY || null
        });

        const returnId = returnInsert.insertId;

        // 2. Insert Returned Items
        for (const item of ITEMS) {
            if (item.RETURNED_BAG_COUNT > 0 || item.RETURNED_QTY > 0) {
                await pool.query('INSERT INTO mill_sales_return_items SET ?', {
                    RETURN_ID: returnId,
                    ITEM_ID: item.ITEM_ID,
                    BAG_WEIGHT: item.BAG_WEIGHT || null,
                    RETURNED_BAG_COUNT: item.RETURNED_BAG_COUNT || 0,
                    RETURNED_QTY: item.RETURNED_QTY || item.RETURNED_BAG_COUNT || 0,
                    UNIT_PRICE: item.UNIT_PRICE || 0,
                    REFUND_LINE_TOTAL: item.REFUND_LINE_TOTAL || ((item.RETURNED_BAG_COUNT || 1) * (item.UNIT_PRICE || 0))
                });
            }
        }

        res.json({ success: true, message: 'Sales return recorded successfully', returnId, returnNo });
    } catch (error) {
        console.error('Error creating sales return:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UPDATE SALES RETURN ────────────────────────────────────────
router.put('/api/mill/returns/:id', async (req, res) => {
    try {
        const returnId = req.params.id;
        const { REFUND_AMOUNT, REFUND_METHOD, REASON } = req.body;

        const check = await pool.query('SELECT * FROM mill_sales_returns WHERE RETURN_ID = ?', [returnId]);
        if (!check || check.length === 0) {
            return res.status(404).json({ success: false, message: 'Sales return record not found' });
        }

        await pool.query(
            'UPDATE mill_sales_returns SET REFUND_AMOUNT = ?, REFUND_METHOD = ?, REASON = ? WHERE RETURN_ID = ?',
            [REFUND_AMOUNT || 0, REFUND_METHOD || 'cash', REASON || null, returnId]
        );

        res.json({ success: true, message: 'Sales return record updated successfully' });
    } catch (error) {
        console.error('Error updating sales return:', error);
        res.status(500).json({ success: false, message: 'Failed to update sales return record' });
    }
});

// ─── DELETE SALES RETURN ────────────────────────────────────────
router.delete('/api/mill/returns/:id', async (req, res) => {
    try {
        const returnId = req.params.id;
        const check = await pool.query('SELECT * FROM mill_sales_returns WHERE RETURN_ID = ?', [returnId]);
        if (!check || check.length === 0) {
            return res.status(404).json({ success: false, message: 'Sales return record not found' });
        }

        await pool.query('DELETE FROM mill_sales_return_items WHERE RETURN_ID = ?', [returnId]);
        await pool.query('DELETE FROM mill_sales_returns WHERE RETURN_ID = ?', [returnId]);

        res.json({ success: true, message: 'Sales return record deleted successfully' });
    } catch (error) {
        console.error('Error deleting sales return:', error);
        res.status(500).json({ success: false, message: 'Failed to delete sales return record' });
    }
});

module.exports = router;
