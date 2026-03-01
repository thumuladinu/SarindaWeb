const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index');

router.use(cors());

router.post('/api/getTerminalSessions', async (req, res) => {
    try {
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const { DATE } = req.body;
        // Default to today if no date is provided
        const targetDate = DATE || new Date().toISOString().split('T')[0];

        // Find all sessions that overlap with the targeted date (in Sri Lankan Time)
        // (Started on the date OR ended on the date OR started before and ended after the date OR currently active)
        const query = `
            SELECT TS.*, U.PHOTO as cashierPhoto 
            FROM terminal_sessions TS
            LEFT JOIN user_details U ON TS.cashier = U.NAME
            WHERE DATE(CONVERT_TZ(TS.connectedAt, '+00:00', '+05:30')) = ?
               OR DATE(CONVERT_TZ(TS.disconnectedAt, '+00:00', '+05:30')) = ?
               OR (DATE(CONVERT_TZ(TS.connectedAt, '+00:00', '+05:30')) < ? AND DATE(CONVERT_TZ(TS.disconnectedAt, '+00:00', '+05:30')) > ?)
               OR (DATE(CONVERT_TZ(TS.connectedAt, '+00:00', '+05:30')) <= ? AND TS.disconnectedAt IS NULL)
            ORDER BY TS.terminalId, TS.connectedAt ASC
        `;

        pool.query(query, [targetDate, targetDate, targetDate, targetDate, targetDate], (err, results) => {
            if (err) {
                console.error('Error fetching terminal sessions:', err);
                return res.status(500).json({ success: false, message: 'Internal server error' });
            }

            // Group by terminalId
            const terminals = {};
            results.forEach(session => {
                if (!terminals[session.terminalId]) {
                    terminals[session.terminalId] = {
                        terminalId: session.terminalId,
                        storeNo: session.storeNo,
                        storeName: session.storeName,
                        type: session.type,
                        sessions: []
                    };
                }

                const termSessions = terminals[session.terminalId].sessions;
                const newSession = {
                    id: session.id,
                    cashier: session.cashier,
                    cashierPhoto: session.cashierPhoto,
                    ip: session.ip,
                    connectedAt: session.connectedAt,
                    disconnectedAt: session.disconnectedAt,
                    isActive: session.disconnectedAt === null
                };

                // Merge with previous if gap is very small (< 30 seconds)
                if (termSessions.length > 0) {
                    const lastSession = termSessions[termSessions.length - 1];
                    // Only merge if it's the same cashier
                    if (lastSession.cashier === newSession.cashier && lastSession.disconnectedAt) {
                        const lastEnd = new Date(lastSession.disconnectedAt).getTime();
                        const nextStart = new Date(newSession.connectedAt).getTime();
                        const gapSeconds = (nextStart - lastEnd) / 1000;

                        if (gapSeconds <= 30) {
                            // Merge
                            lastSession.disconnectedAt = newSession.disconnectedAt;
                            lastSession.isActive = newSession.isActive;
                            return; // Skip pushing newSession
                        }
                    }
                }

                termSessions.push(newSession);
            });

            return res.status(200).json({
                success: true,
                date: targetDate,
                terminals: Object.values(terminals)
            });
        });

    } catch (error) {
        console.error('Error in getTerminalSessions:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
