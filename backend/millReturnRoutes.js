// millReturnRoutes.js — Sales Returns Operations & Audit Records
const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');
const { withTransaction, toSLDateTime, toSLDate, findBill, MillError, sendError } = require('./millShared');

router.use(cors());
pool.query = util.promisify(pool.query);

// Helper for Return No
// MSR-YYYYMMDD-NNNN (SL date), next number after the highest of the day
const generateReturnNo = async (q = pool.query.bind(pool)) => {
    const prefix = `MSR-${require('./millShared').slNow().slice(0, 10).replace(/-/g, '')}-`;
    const rows = await q('SELECT RETURN_NO FROM mill_sales_returns WHERE RETURN_NO LIKE ?', [`${prefix}%`]);
    let max = 0;
    rows.forEach(r => {
        const n = parseInt(String(r.RETURN_NO).slice(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
    });
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
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

        // One-time device reference: a re-sent return is recognised instead of recorded twice
        try { await pool.query('ALTER TABLE mill_sales_returns ADD COLUMN CLIENT_REF VARCHAR(100) NULL UNIQUE'); } catch (e) {}

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
        const body = req.body || {};
        const { CUSTOMER_ID, REFUND_AMOUNT, REFUND_METHOD, REASON, CREATED_BY, ITEMS } = body;

        if (!body.INVOICE_NO && !body.BILL_ID) {
            return res.status(400).json({ success: false, permanent: true, message: 'Invoice / Bill selection required' });
        }
        if (!ITEMS || !Array.isArray(ITEMS) || ITEMS.length === 0) {
            return res.status(400).json({ success: false, permanent: true, message: 'Must select at least one item to return' });
        }

        const result = await withTransaction(pool, async (q) => {
            if (body.CLIENT_REF) {
                const dup = await q('SELECT RETURN_ID, RETURN_NO FROM mill_sales_returns WHERE CLIENT_REF = ? LIMIT 1', [body.CLIENT_REF]);
                if (dup.length > 0) return { returnId: dup[0].RETURN_ID, returnNo: dup[0].RETURN_NO, existed: true };
            }
            // The bill is identified by its permanent INVOICE_NO (a desktop BILL_ID may be a local row number)
            const bill = await findBill(q, { INVOICE_NO: body.INVOICE_NO, BILL_ID: body.INVOICE_NO ? null : body.BILL_ID }, false);
            if (!bill) throw new MillError(404, `Bill ${body.INVOICE_NO || body.BILL_ID} not found on server`, { retryable: true });

            const returnNo = await generateReturnNo(q);
            const returnInsert = await q('INSERT INTO mill_sales_returns SET ?', {
                RETURN_NO: returnNo,
                BILL_ID: bill.BILL_ID,
                INVOICE_NO: bill.INVOICE_NO,
                CUSTOMER_ID: CUSTOMER_ID || bill.CUSTOMER_ID || null,
                REFUND_AMOUNT: REFUND_AMOUNT || 0,
                REFUND_METHOD: REFUND_METHOD || 'cash',
                REASON: REASON || null,
                DATE: toSLDate(body.DATE),
                CREATED_DATE: toSLDateTime(body.CREATED_DATE),
                CREATED_BY: CREATED_BY || null,
                CLIENT_REF: body.CLIENT_REF || null
            });
            const returnId = returnInsert.insertId;

            for (const item of ITEMS) {
                if (item.RETURNED_BAG_COUNT > 0 || item.RETURNED_QTY > 0) {
                    await q('INSERT INTO mill_sales_return_items SET ?', {
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
            return { returnId, returnNo, existed: false };
        });

        res.json({ success: true, message: result.existed ? 'Sales return already recorded' : 'Sales return recorded successfully', returnId: result.returnId, returnNo: result.returnNo });
    } catch (error) {
        sendError(res, error, 'Error creating sales return:');
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
