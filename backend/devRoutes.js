const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');

router.use(cors());

// Promisified query helper
const queryAsync = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        pool.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
};

// ─── GET CONNECTED & REGISTERED TERMINALS METRICS ──────────────
router.get('/api/dev/terminals', async (req, res) => {
    try {
        // Fetch active/recent terminal sessions
        const sessions = await queryAsync(`
            SELECT 
                TS.terminalId,
                TS.storeName,
                TS.storeNo,
                TS.type,
                TS.cashier,
                TS.ip,
                TS.connectedAt,
                TS.disconnectedAt
            FROM terminal_sessions TS
            ORDER BY TS.connectedAt DESC
        `);

        // Fetch sales totals per DEVICE_ID
        const salesRes = await queryAsync(`
            SELECT 
                COALESCE(DEVICE_ID, 'UNKNOWN') as DEVICE_ID,
                COUNT(BILL_ID) as TOTAL_SALES,
                MAX(CREATED_DATE) as LAST_ACTIVITY,
                MAX(INVOICE_NO) as LAST_INVOICE
            FROM mill_bills
            GROUP BY COALESCE(DEVICE_ID, 'UNKNOWN')
        `);

        // Fetch dispatch totals per DEVICE_ID
        const dispatchRes = await queryAsync(`
            SELECT 
                COALESCE(DEVICE_ID, 'UNKNOWN') as DEVICE_ID,
                COUNT(DISPATCH_ID) as TOTAL_DISPATCH,
                MAX(CREATED_DATE) as LAST_DISPATCH_DATE
            FROM mill_dispatch_notes
            GROUP BY COALESCE(DEVICE_ID, 'UNKNOWN')
        `);

        const salesMap = {};
        salesRes.forEach(s => { salesMap[s.DEVICE_ID] = s; });

        const dispatchMap = {};
        dispatchRes.forEach(d => { dispatchMap[d.DEVICE_ID] = d; });

        const terminalMap = {};

        // 1. Populate from terminal_sessions
        sessions.forEach(sess => {
            const code = sess.terminalId || 'UNKNOWN';
            if (!terminalMap[code]) {
                const sales = salesMap[code] || {};
                const dispatch = dispatchMap[code] || {};
                terminalMap[code] = {
                    terminalCode: code,
                    storeName: sess.storeName || 'Chamika Rice Mill Desktop',
                    type: sess.type || 'Mill Electron App',
                    cashier: sess.cashier || 'Operator',
                    ip: sess.ip || 'Localhost',
                    totalSales: sales.TOTAL_SALES || 0,
                    totalDispatch: dispatch.TOTAL_DISPATCH || 0,
                    lastActivity: sess.connectedAt || sales.LAST_ACTIVITY,
                    lastInvoiceNo: sales.LAST_INVOICE || '-',
                    isActive: sess.disconnectedAt === null
                };
            }
        });

        // 2. Populate any distinct DEVICE_ID from mill_bills/mill_dispatch_notes not in sessions
        Object.keys(salesMap).forEach(code => {
            if (!terminalMap[code]) {
                const s = salesMap[code];
                const d = dispatchMap[code] || {};
                terminalMap[code] = {
                    terminalCode: code,
                    storeName: code === 'WEB' ? 'Central Web App' : 'POS Terminal Client',
                    type: code === 'WEB' ? 'Web Application' : 'Electron POS Client',
                    cashier: 'Registered Terminal',
                    ip: 'Network Terminal',
                    totalSales: s.TOTAL_SALES || 0,
                    totalDispatch: d.TOTAL_DISPATCH || 0,
                    lastActivity: s.LAST_ACTIVITY,
                    lastInvoiceNo: s.LAST_INVOICE || '-',
                    isActive: false
                };
            }
        });

        res.json({ success: true, result: Object.values(terminalMap) });
    } catch (error) {
        console.error('Error fetching dev terminals:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── GET SYSTEM HEALTH & ROW COUNTS ─────────────────────────────
router.get('/api/dev/health', async (req, res) => {
    try {
        const [sales, dispatch, inward, returns, items, customers, expenses, sessions] = await Promise.all([
            queryAsync('SELECT COUNT(*) as cnt FROM mill_bills'),
            queryAsync('SELECT COUNT(*) as cnt FROM mill_dispatch_notes'),
            queryAsync('SELECT COUNT(*) as cnt FROM mill_stock_inward'),
            queryAsync('SELECT COUNT(*) as cnt FROM mill_sales_returns'),
            queryAsync('SELECT COUNT(*) as cnt FROM mill_items'),
            queryAsync('SELECT COUNT(*) as cnt FROM mill_customers'),
            queryAsync('SELECT COUNT(*) as cnt FROM mill_expenses'),
            queryAsync('SELECT COUNT(*) as cnt FROM terminal_sessions WHERE disconnectedAt IS NULL')
        ]);

        res.json({
            success: true,
            counts: {
                salesBills: sales[0]?.cnt || 0,
                dispatchNotes: dispatch[0]?.cnt || 0,
                stockInwards: inward[0]?.cnt || 0,
                salesReturns: returns[0]?.cnt || 0,
                items: items[0]?.cnt || 0,
                customers: customers[0]?.cnt || 0,
                expenses: expenses[0]?.cnt || 0,
                activeSessions: sessions[0]?.cnt || 0
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error fetching dev health:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ─── GET TABLE RECORDS FOR DEV INSPECTION & EDITING ────────────
router.get('/api/dev/records', async (req, res) => {
    try {
        const { table = 'mill_bills', deviceId, limit = 50 } = req.query;
        const validTables = {
            'mill_bills': { pk: 'BILL_ID', order: 'BILL_ID DESC' },
            'mill_dispatch_notes': { pk: 'DISPATCH_ID', order: 'DISPATCH_ID DESC' },
            'mill_stock_inward': { pk: 'INWARD_ID', order: 'INWARD_ID DESC' },
            'mill_sales_returns': { pk: 'RETURN_ID', order: 'RETURN_ID DESC' },
            'mill_customers': { pk: 'CUSTOMER_ID', order: 'CUSTOMER_ID DESC' },
            'mill_items': { pk: 'ITEM_ID', order: 'ITEM_ID ASC' }
        };

        if (!validTables[table]) {
            return res.status(400).json({ success: false, message: 'Invalid target table' });
        }

        const tableInfo = validTables[table];
        let sql = `SELECT * FROM ${table}`;
        const params = [];

        if (deviceId && deviceId !== 'ALL') {
            sql += ` WHERE DEVICE_ID = ?`;
            params.push(deviceId);
        }

        sql += ` ORDER BY ${tableInfo.order} LIMIT ${parseInt(limit) || 50}`;

        const rows = await queryAsync(sql, params);
        res.json({ success: true, table, pk: tableInfo.pk, count: rows.length, result: rows });
    } catch (error) {
        console.error('Error fetching dev records:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ─── UPDATE RECORD IN MYSQL DATABASE (DEV MANUAL FIX) ────────────
router.post('/api/dev/update-record', async (req, res) => {
    try {
        const { table, pkField, pkValue, updates } = req.body;
        if (!table || !pkField || !pkValue || !updates || typeof updates !== 'object') {
            return res.status(400).json({ success: false, message: 'Missing table, pkField, pkValue or updates' });
        }

        const keys = Object.keys(updates);
        if (keys.length === 0) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => updates[k]);
        values.push(pkValue);

        const sql = `UPDATE ${table} SET ${setClause} WHERE ${pkField} = ?`;
        const result = await queryAsync(sql, values);

        res.json({ success: true, message: `Updated record in ${table}`, affectedRows: result.affectedRows });
    } catch (error) {
        console.error('Error updating dev record:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ─── DELETE CORRUPT RECORD (DEV PURGE) ───────────────────────────
router.post('/api/dev/delete-record', async (req, res) => {
    try {
        const { table, pkField, pkValue } = req.body;
        if (!table || !pkField || !pkValue) {
            return res.status(400).json({ success: false, message: 'Missing table, pkField, or pkValue' });
        }

        const sql = `DELETE FROM ${table} WHERE ${pkField} = ?`;
        const result = await queryAsync(sql, [pkValue]);

        res.json({ success: true, message: `Deleted record from ${table}`, affectedRows: result.affectedRows });
    } catch (error) {
        console.error('Error deleting dev record:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ─── EXECUTE SAFE SQL READ DIAGNOSTICS (DEV MODE ONLY) ──────────
router.post('/api/dev/query', async (req, res) => {
    try {
        const { sql } = req.body;
        if (!sql || typeof sql !== 'string') {
            return res.status(400).json({ success: false, message: 'SQL query string required' });
        }

        const trimmed = sql.trim();
        if (!/^(SELECT|SHOW|DESCRIBE)\s/i.test(trimmed)) {
            return res.status(403).json({ success: false, message: 'Only SELECT, SHOW, DESCRIBE read queries permitted' });
        }

        const rows = await queryAsync(trimmed);
        res.json({ success: true, count: rows.length, result: rows });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ─── REAL-TIME TERMINAL INDEXEDDB SOCKET BRIDGE ──────────────────────
router.post('/api/dev/terminal-idb', async (req, res) => {
    try {
        const { targetTerminalId, action, store = 'sales_bills', isLocalStorage = false, key, keys, updates } = req.body;
        if (!targetTerminalId || !action) {
            return res.status(400).json({ success: false, message: 'targetTerminalId and action required' });
        }

        const socketModule = require('./socket');
        const eventMap = {
            'SUMMARY': 'dev:get_idb_summary',
            'GET_RECORDS': 'dev:get_idb_records',
            'UPDATE': 'dev:update_idb_record',
            'DELETE': 'dev:delete_idb_record',
            'CLEAR_STORE': 'dev:clear_store',
            'FORCE_SYNC': 'dev:trigger_force_sync'
        };

        const eventName = eventMap[action];
        if (!eventName) {
            return res.status(400).json({ success: false, message: 'Invalid action' });
        }

        const responsePayload = await socketModule.sendDevCommandToTerminal(targetTerminalId, eventName, { store, isLocalStorage, key, keys, updates }, 10000);
        res.json(responsePayload);

    } catch (error) {
        console.error('Error in dev terminal idb bridge:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
