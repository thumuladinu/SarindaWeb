// ============================================================
// storeRoutes.js — Stores master CRUD + POS configuration
// ------------------------------------------------------------
// Endpoints:
//   GET    /api/stores                           list active stores
//   POST   /api/stores                           create store (auto code)
//   PATCH  /api/stores/:storeNo                  update name/address/status
//   POST   /api/stores/:storeNo/regenerate-code  rotate code
//   POST   /api/stores/resolve                   { code } -> store info (POS first-run)
//   GET    /api/stores/:storeNo/trip-counter     read latest counter
//   POST   /api/stores/:storeNo/trip-counter     atomic increment, returns new value
// ============================================================

const express = require('express');
const router = express.Router();
const cors = require('cors');
const util = require('util');

const pool = require('./index');
pool.query = pool.query.length === 1 ? util.promisify(pool.query) : pool.query;

// Auto-migration: create stores table if missing, then seed legacy store rows and add COLOR/TRIP_COUNTER columns
(async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stores (
                STORE_NO            INT PRIMARY KEY,
                NAME                VARCHAR(100) NOT NULL,
                ADDRESS             VARCHAR(255),
                STORE_CODE          VARCHAR(8) NOT NULL UNIQUE,
                IS_ACTIVE           TINYINT DEFAULT 1,
                IS_WEIGHING_STATION TINYINT DEFAULT 0,
                COLOR               VARCHAR(20) DEFAULT 'blue',
                CREATED_DATE        DATETIME DEFAULT CURRENT_TIMESTAMP,
                EDITED_DATE         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                TRIP_COUNTER        INT DEFAULT 0
            )
        `);
        // Seed legacy stores so existing STORE_NO references stay valid
        await pool.query(`
            INSERT IGNORE INTO stores (STORE_NO, NAME, STORE_CODE, IS_WEIGHING_STATION, COLOR)
            VALUES
                (1, 'Main Store',       'STORE01', 0, 'blue'),
                (2, 'Weighing Station', 'WEIGH02', 1, 'violet')
        `);
        console.log("[Migration] stores table ready.");
    } catch (err) {
        console.log("[Migration] stores table check:", err.message);
    }
    // Additive column guards for older installs that may have an older schema
    for (const alter of [
        "ALTER TABLE stores ADD COLUMN COLOR VARCHAR(20) DEFAULT 'blue' AFTER IS_WEIGHING_STATION",
        "ALTER TABLE stores ADD COLUMN TRIP_COUNTER INT DEFAULT 0 AFTER EDITED_DATE",
        "ALTER TABLE stores ADD COLUMN TRANSFER_ENABLED TINYINT DEFAULT 1 AFTER TRIP_COUNTER",
        "ALTER TABLE stores ADD COLUMN QR_ENABLED TINYINT DEFAULT 1 AFTER TRANSFER_ENABLED",
    ]) {
        try { await pool.query(alter); } catch (e) { /* column already exists */ }
    }
})();

router.use(cors());

// Valid preset colors — 6 options shown in admin UI
const VALID_COLORS = ['blue', 'violet', 'emerald', 'amber', 'rose', 'cyan'];
const DEFAULT_COLOR = 'blue';

const emitStoresUpdated = () => { if (global.io) global.io.emit('stores:updated'); };

// ------------------------------------------------------------
// Code generator: 6 chars, unambiguous alphabet, retry on collision.
// ------------------------------------------------------------
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0,O,1,I,L
const CODE_LEN = 6;

const randomCode = () => {
    let s = '';
    for (let i = 0; i < CODE_LEN; i++) {
        s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return s;
};

const generateUniqueCode = async () => {
    for (let attempt = 0; attempt < 10; attempt++) {
        const code = randomCode();
        const rows = await pool.query('SELECT 1 FROM stores WHERE STORE_CODE = ? LIMIT 1', [code]);
        if (!rows.length) return code;
    }
    throw new Error('Could not generate unique store code after 10 attempts');
};

// ------------------------------------------------------------
// GET /api/stores — list (admin)
// ------------------------------------------------------------
router.get('/api/stores', async (req, res) => {
    try {
        const includeInactive = req.query.includeInactive === '1';
        const sql = includeInactive
            ? 'SELECT STORE_NO, NAME, ADDRESS, STORE_CODE, IS_ACTIVE, IS_WEIGHING_STATION, COLOR, TRANSFER_ENABLED, QR_ENABLED, CREATED_DATE FROM stores ORDER BY STORE_NO'
            : 'SELECT STORE_NO, NAME, ADDRESS, STORE_CODE, IS_ACTIVE, IS_WEIGHING_STATION, COLOR, TRANSFER_ENABLED, QR_ENABLED, CREATED_DATE FROM stores WHERE IS_ACTIVE = 1 ORDER BY STORE_NO';
        const rows = await pool.query(sql);
        console.log(`[storeRoutes] GET /api/stores (includeInactive=${includeInactive}) → ${rows.length} rows`);
        rows.forEach(r => console.log(`  Store ${r.STORE_NO} "${r.NAME}" QR_ENABLED=${r.QR_ENABLED} TRANSFER_ENABLED=${r.TRANSFER_ENABLED}`));
        return res.json({ success: true, stores: rows });
    } catch (err) {
        console.error('[storeRoutes] list error:', err);
        return res.status(500).json({ success: false, message: 'Failed to list stores' });
    }
});

// ------------------------------------------------------------
// POST /api/stores — create (admin)
// Body: { storeNo, name, address?, isWeighingStation? }
// STORE_NO=2 is reserved for weighing; reject unless isWeighingStation=1.
// ------------------------------------------------------------
router.post('/api/stores', async (req, res) => {
    try {
        const { storeNo, name, address, isWeighingStation, color } = req.body;

        if (!storeNo || !name) {
            return res.status(400).json({ success: false, message: 'storeNo and name are required' });
        }
        const num = parseInt(storeNo, 10);
        if (!Number.isInteger(num) || num < 1) {
            return res.status(400).json({ success: false, message: 'storeNo must be a positive integer' });
        }
        if (num === 2) {
            return res.status(400).json({ success: false, message: 'STORE_NO=2 is reserved for the weighing station and cannot be created manually' });
        }
        if (isWeighingStation) {
            return res.status(400).json({ success: false, message: 'Only STORE_NO=2 may be a weighing station' });
        }

        const existing = await pool.query('SELECT STORE_NO FROM stores WHERE STORE_NO = ? LIMIT 1', [num]);
        if (existing.length) {
            return res.status(409).json({ success: false, message: `Store ${num} already exists` });
        }

        const safeColor = VALID_COLORS.includes(color) ? color : DEFAULT_COLOR;
        const code = await generateUniqueCode();
        await pool.query(
            'INSERT INTO stores (STORE_NO, NAME, ADDRESS, STORE_CODE, IS_WEIGHING_STATION, COLOR) VALUES (?, ?, ?, ?, 0, ?)',
            [num, name, address || null, code, safeColor]
        );

        emitStoresUpdated();
        return res.json({
            success: true,
            store: { STORE_NO: num, NAME: name, ADDRESS: address || null, STORE_CODE: code, IS_ACTIVE: 1, COLOR: safeColor },
        });
    } catch (err) {
        console.error('[storeRoutes] create error:', err);
        return res.status(500).json({ success: false, message: 'Failed to create store' });
    }
});

// ------------------------------------------------------------
// PATCH /api/stores/:storeNo — update (admin)
// Body: { name?, address?, isActive? }
// ------------------------------------------------------------
router.patch('/api/stores/:storeNo', async (req, res) => {
    try {
        const num = parseInt(req.params.storeNo, 10);
        // Guard: weighing station cannot be modified via this endpoint
        const [target] = await pool.query('SELECT IS_WEIGHING_STATION FROM stores WHERE STORE_NO = ? LIMIT 1', [num]);
        if (target && target.IS_WEIGHING_STATION) {
            return res.status(403).json({ success: false, message: 'Weighing station cannot be modified' });
        }

        const { name, address, isActive, color, transferEnabled } = req.body;
        console.log(`[storeRoutes] PATCH /api/stores/${num} body:`, JSON.stringify(req.body));
        const sets = [];
        const vals = [];
        if (name !== undefined) { sets.push('NAME = ?'); vals.push(name); }
        if (address !== undefined) { sets.push('ADDRESS = ?'); vals.push(address); }
        if (isActive !== undefined) { sets.push('IS_ACTIVE = ?'); vals.push(isActive ? 1 : 0); }
        if (color !== undefined && VALID_COLORS.includes(color)) { sets.push('COLOR = ?'); vals.push(color); }
        if (transferEnabled !== undefined) { sets.push('TRANSFER_ENABLED = ?'); vals.push(transferEnabled ? 1 : 0); }
        if (req.body.qrEnabled !== undefined) { sets.push('QR_ENABLED = ?'); vals.push(req.body.qrEnabled ? 1 : 0); }
        if (!sets.length) {
            return res.status(400).json({ success: false, message: 'No fields to update' });
        }
        vals.push(num);

        const updateSql = `UPDATE stores SET ${sets.join(', ')} WHERE STORE_NO = ?`;
        console.log(`[storeRoutes] PATCH SQL: ${updateSql}  vals:`, vals);
        const result = await pool.query(updateSql, vals);
        console.log(`[storeRoutes] PATCH affectedRows=${result.affectedRows}`);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        emitStoresUpdated();
        console.log('[storeRoutes] stores:updated event emitted to all sockets');
        return res.json({ success: true });
    } catch (err) {
        console.error('[storeRoutes] update error:', err);
        return res.status(500).json({ success: false, message: 'Failed to update store' });
    }
});

// ------------------------------------------------------------
// POST /api/stores/:storeNo/regenerate-code — rotate code (admin)
// ------------------------------------------------------------
router.post('/api/stores/:storeNo/regenerate-code', async (req, res) => {
    try {
        const num = parseInt(req.params.storeNo, 10);
        // Guard: weighing station code cannot be regenerated
        const [tgt] = await pool.query('SELECT IS_WEIGHING_STATION FROM stores WHERE STORE_NO = ? LIMIT 1', [num]);
        if (tgt && tgt.IS_WEIGHING_STATION) {
            return res.status(403).json({ success: false, message: 'Weighing station code cannot be changed' });
        }
        const code = await generateUniqueCode();
        const result = await pool.query('UPDATE stores SET STORE_CODE = ? WHERE STORE_NO = ?', [code, num]);
        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        emitStoresUpdated();
        return res.json({ success: true, storeCode: code });
    } catch (err) {
        console.error('[storeRoutes] regenerate-code error:', err);
        return res.status(500).json({ success: false, message: 'Failed to regenerate code' });
    }
});

// ------------------------------------------------------------
// POST /api/stores/resolve — POS first-run lookup
// Body: { code }
// ------------------------------------------------------------
router.post('/api/stores/resolve', async (req, res) => {
    try {
        const code = (req.body.code || '').trim().toUpperCase();
        if (code.length !== CODE_LEN) {
            return res.status(400).json({ success: false, message: 'Code must be 6 characters' });
        }
        const rows = await pool.query(
            'SELECT STORE_NO, NAME, ADDRESS, IS_ACTIVE, IS_WEIGHING_STATION FROM stores WHERE STORE_CODE = ? LIMIT 1',
            [code]
        );
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Invalid store code' });
        }
        const s = rows[0];
        if (!s.IS_ACTIVE) {
            return res.status(403).json({ success: false, message: 'Store is inactive' });
        }
        return res.json({
            success: true,
            store: {
                storeNo: s.STORE_NO,
                name: s.NAME,
                address: s.ADDRESS,
                isWeighingStation: !!s.IS_WEIGHING_STATION,
            },
        });
    } catch (err) {
        console.error('[storeRoutes] resolve error:', err);
        return res.status(500).json({ success: false, message: 'Failed to resolve code' });
    }
});

// ------------------------------------------------------------
// GET /api/stores/:storeNo/trip-counter — read current counter
// ------------------------------------------------------------
router.get('/api/stores/:storeNo/trip-counter', async (req, res) => {
    try {
        const num = parseInt(req.params.storeNo, 10);
        const rows = await pool.query('SELECT TRIP_COUNTER FROM stores WHERE STORE_NO = ? LIMIT 1', [num]);
        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        return res.json({ success: true, counter: rows[0].TRIP_COUNTER || 0 });
    } catch (err) {
        console.error('[storeRoutes] get counter error:', err);
        return res.status(500).json({ success: false, message: 'Failed to get counter' });
    }
});

// ------------------------------------------------------------
// POST /api/stores/:storeNo/trip-counter — atomic increment
// MySQL UPDATE ... + SELECT in a single transaction-like pattern.
// Returns the new counter (1..) and the rolled value (1..99).
// ------------------------------------------------------------
router.post('/api/stores/:storeNo/trip-counter', async (req, res) => {
    try {
        const num = parseInt(req.params.storeNo, 10);
        const upd = await pool.query(
            'UPDATE stores SET TRIP_COUNTER = TRIP_COUNTER + 1 WHERE STORE_NO = ?',
            [num]
        );
        if (!upd.affectedRows) {
            return res.status(404).json({ success: false, message: 'Store not found' });
        }
        const rows = await pool.query('SELECT TRIP_COUNTER FROM stores WHERE STORE_NO = ? LIMIT 1', [num]);
        const counter = rows[0].TRIP_COUNTER;
        const rolled = ((counter - 1) % 99) + 1;
        return res.json({ success: true, counter, rolled });
    } catch (err) {
        console.error('[storeRoutes] increment counter error:', err);
        return res.status(500).json({ success: false, message: 'Failed to increment counter' });
    }
});

// ------------------------------------------------------------
// GET /api/stores/:storeNo/terminals — active/recent terminals per store
// ------------------------------------------------------------
router.get('/api/stores/:storeNo/terminals', async (req, res) => {
    try {
        const num = parseInt(req.params.storeNo, 10);
        const days = parseInt(req.query.days, 10) || 7;
        const rows = await pool.query(
            `SELECT terminalId, type,
                    MAX(cashier) as cashier,
                    MAX(connectedAt) as lastSeen,
                    MAX(CASE WHEN disconnectedAt IS NULL THEN 1 ELSE 0 END) as isActive
             FROM terminal_sessions
             WHERE storeNo = ? AND connectedAt >= NOW() - INTERVAL ? DAY
             GROUP BY terminalId, type
             ORDER BY isActive DESC, lastSeen DESC`,
            [num, days]
        );
        return res.json({ success: true, terminals: rows });
    } catch (err) {
        console.error('[storeRoutes] terminals error:', err);
        return res.status(500).json({ success: false, message: 'Failed to get terminals' });
    }
});

// ------------------------------------------------------------
// GET /api/stores/valid-colors — expose preset color list to frontend
// ------------------------------------------------------------
router.get('/api/stores/valid-colors', (_req, res) => {
    res.json({ success: true, colors: VALID_COLORS });
});

module.exports = router;
