const express = require('express');
const router = express.Router();
const pool = require('./index');

// ─── LIST CHEQUES ─────────────────────────────────────────────
router.get('/api/mill/cheques/list', async (req, res) => {
    try {
        const cheques = await pool.query(`
            SELECT 
                ch.*, 
                b.INVOICE_NO, 
                c.NAME as CUSTOMER_NAME, 
                c.PHONE_NUMBER as CUSTOMER_PHONE
            FROM mill_cheques ch
            LEFT JOIN mill_bills b ON ch.BILL_ID = b.BILL_ID
            LEFT JOIN mill_customers c ON b.CUSTOMER_ID = c.CUSTOMER_ID
            ORDER BY ch.DUE_DATE ASC
        `);
        res.json({ success: true, result: cheques });
    } catch (error) {
        console.error('Error fetching cheques:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── ADD CHEQUE ───────────────────────────────────────────────
router.post('/api/mill/cheques/add', async (req, res) => {
    try {
        const { BILL_ID, CHEQUE_NUMBER, BANK, DUE_DATE, AMOUNT, STATUS } = req.body;
        
        if (!BILL_ID || !CHEQUE_NUMBER || !AMOUNT || !DUE_DATE) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        await pool.query('INSERT INTO mill_cheques SET ?', {
            BILL_ID,
            CHEQUE_NUMBER,
            BANK: BANK || null,
            DUE_DATE,
            AMOUNT,
            STATUS: STATUS || 'PENDING'
        });

        res.json({ success: true, message: 'Cheque added successfully' });
    } catch (error) {
        console.error('Error adding cheque:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UPDATE CHEQUE ────────────────────────────────────────────
router.post('/api/mill/cheques/update', async (req, res) => {
    try {
        const { CHEQUE_ID, BILL_ID, CHEQUE_NUMBER, BANK, DUE_DATE, AMOUNT, STATUS } = req.body;

        if (!CHEQUE_ID) {
            return res.status(400).json({ success: false, message: 'Cheque ID is required' });
        }

        await pool.query(
            `UPDATE mill_cheques SET 
                BILL_ID = ?, 
                CHEQUE_NUMBER = ?, 
                BANK = ?, 
                DUE_DATE = ?, 
                AMOUNT = ?, 
                STATUS = ?
             WHERE CHEQUE_ID = ?`,
            [BILL_ID, CHEQUE_NUMBER, BANK || null, DUE_DATE, AMOUNT, STATUS || 'PENDING', CHEQUE_ID]
        );

        res.json({ success: true, message: 'Cheque updated successfully' });
    } catch (error) {
        console.error('Error updating cheque:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── UPDATE CHEQUE STATUS ONLY ─────────────────────────────────
router.post('/api/mill/cheques/update-status', async (req, res) => {
    try {
        const { CHEQUE_ID, STATUS } = req.body;
        if (!CHEQUE_ID || !STATUS) {
            return res.status(400).json({ success: false, message: 'CHEQUE_ID and STATUS required' });
        }
        await pool.query('UPDATE mill_cheques SET STATUS = ? WHERE CHEQUE_ID = ?', [STATUS, CHEQUE_ID]);
        res.json({ success: true, message: `Cheque marked as ${STATUS}` });
    } catch (error) {
        console.error('Error updating cheque status:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── DELETE CHEQUE ────────────────────────────────────────────
router.post('/api/mill/cheques/delete', async (req, res) => {
    try {
        const { CHEQUE_ID } = req.body;
        
        if (!CHEQUE_ID) {
            return res.status(400).json({ success: false, message: 'Cheque ID is required' });
        }

        await pool.query('DELETE FROM mill_cheques WHERE CHEQUE_ID = ?', [CHEQUE_ID]);

        res.json({ success: true, message: 'Cheque deleted successfully' });
    } catch (error) {
        console.error('Error deleting cheque:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
