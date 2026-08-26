const { Server } = require('socket.io');

let io;
const connectedTerminals = new Map(); // socketId -> { info, allowed: true }

module.exports = {
    init: (httpServer) => {
        io = new Server(httpServer, {
            cors: {
                origin: '*', // Allow all origins for simplicity in development; refine for production
                methods: ['GET', 'POST']
            }
        });

        // Use index.js pool for DB operations
        const pool = require('./index');

        // On restart, close any sessions previously left dangling due to server crash or restart
        if (pool) {
            const formatDatetime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
            pool.query(
                `UPDATE terminal_sessions SET disconnectedAt = ? WHERE disconnectedAt IS NULL`,
                [formatDatetime(new Date())],
                (err) => {
                    if (err) console.error('Error closing dangling terminal sessions:', err);
                    else console.log('[Socket] Cleared dangling terminal sessions on startup');
                }
            );
        }

        io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            // 1. Handshake: Client registers itself
            socket.on('register', (data) => {
                const terminalId = data.terminalId || 'UNKNOWN';
                socket.terminalId = terminalId;

                // Deduplicate: Remove any existing connection with the same terminalId
                for (const [sId, info] of connectedTerminals.entries()) {
                    if (info.terminalId === terminalId) {
                        // Force disconnect the old socket to prevent ghosts
                        const oldSocket = io.sockets.sockets.get(sId);
                        if (oldSocket) {
                            oldSocket.disconnect(true);
                            console.log(`[Socket] Force disconnected duplicate terminal: ${terminalId} (${sId})`);
                        }
                        connectedTerminals.delete(sId);
                    }
                }

                const terminalInfo = {
                    id: socket.id,
                    storeNo: data.storeNo || 1,
                    storeName: data.storeName || `Store ${data.storeNo || 1}`,
                    terminalId: terminalId,
                    type: data.type || 'POS',
                    version: data.version || '1.0.0',
                    cashier: data.cashier || 'Not Logged In',
                    ip: socket.handshake.address,
                    connectedAt: new Date(),
                    allowed: true // Default allow
                };

                connectedTerminals.set(socket.id, terminalInfo);
                console.log(`[Socket] Terminal Registered: ${terminalInfo.type} - ${terminalInfo.terminalId}`);

                // Notify Admins
                io.emit('admin:terminals_update', Array.from(connectedTerminals.values()));

                // DB: Insert or Reconnect Session ONLY if real cashier is logged in
                const isRealCashier = (name) => {
                    if (!name) return false;
                    const lower = name.trim().toLowerCase();
                    return lower !== 'not logged in' && lower !== 'no cashier' && lower !== 'cashier';
                };

                if (pool && isRealCashier(terminalInfo.cashier)) {
                    // Check if there's a recently disconnected session (within last 30 seconds) for this terminal
                    const thirtySecondsAgo = new Date(Date.now() - 30000);
                    const formatDatetime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

                    pool.query(
                        `SELECT id FROM terminal_sessions 
                         WHERE terminalId = ? 
                         AND disconnectedAt IS NOT NULL 
                         AND disconnectedAt >= ? 
                         ORDER BY disconnectedAt DESC LIMIT 1`,
                        [terminalId, formatDatetime(thirtySecondsAgo)],
                        (err, results) => {
                            if (err) {
                                console.error('Error checking recent sessions:', err);
                            } else if (results && results.length > 0) {
                                // Resume recent session
                                const sessionId = results[0].id;
                                pool.query(
                                    `UPDATE terminal_sessions SET disconnectedAt = NULL, cashier = ? WHERE id = ?`,
                                    [terminalInfo.cashier, sessionId]
                                );
                                terminalInfo.dbSessionId = sessionId;
                                connectedTerminals.set(socket.id, terminalInfo);
                                console.log(`[Socket] Resumed recent DB session: ${sessionId}`);
                            } else {
                                // Create new session
                                pool.query(
                                    `INSERT INTO terminal_sessions 
                                     (terminalId, storeNo, storeName, type, cashier, ip, connectedAt) 
                                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                    [
                                        terminalInfo.terminalId,
                                        terminalInfo.storeNo,
                                        terminalInfo.storeName,
                                        terminalInfo.type,
                                        terminalInfo.cashier,
                                        terminalInfo.ip,
                                        formatDatetime(terminalInfo.connectedAt)
                                    ],
                                    (insertErr, insertResult) => {
                                        if (insertErr) {
                                            console.error('Error inserting terminal session:', insertErr);
                                        } else {
                                            terminalInfo.dbSessionId = insertResult.insertId;
                                            connectedTerminals.set(socket.id, terminalInfo);
                                            console.log(`[Socket] Created new DB session: ${insertResult.insertId}`);
                                        }
                                    }
                                );
                            }
                        }
                    );
                }
            });

            // 2. Dynamic Update: Terminal sends new info (e.g. Cashier Login / Logout)
            socket.on('terminal:update_info', (data) => {
                if (connectedTerminals.has(socket.id)) {
                    const currentInfo = connectedTerminals.get(socket.id);
                    const updatedInfo = { ...currentInfo, ...data };
                    connectedTerminals.set(socket.id, updatedInfo);

                    // Notify Admins
                    io.emit('admin:terminals_update', Array.from(connectedTerminals.values()));

                    const isRealCashier = (name) => {
                        if (!name) return false;
                        const lower = name.trim().toLowerCase();
                        return lower !== 'not logged in' && lower !== 'no cashier' && lower !== 'cashier';
                    };

                    const formatDatetime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

                    // If real cashier logged in
                    if (data.cashier && isRealCashier(data.cashier) && pool) {
                        if (updatedInfo.dbSessionId) {
                            pool.query(
                                `UPDATE terminal_sessions SET cashier = ? WHERE id = ?`,
                                [data.cashier, updatedInfo.dbSessionId],
                                (err) => {
                                    if (err) console.error('Error updating session cashier:', err);
                                }
                            );
                        } else {
                            // Create new DB session on cashier login
                            pool.query(
                                `INSERT INTO terminal_sessions 
                                 (terminalId, storeNo, storeName, type, cashier, ip, connectedAt) 
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    updatedInfo.terminalId,
                                    updatedInfo.storeNo,
                                    updatedInfo.storeName,
                                    updatedInfo.type,
                                    data.cashier,
                                    updatedInfo.ip,
                                    formatDatetime(new Date())
                                ],
                                (insertErr, insertResult) => {
                                    if (!insertErr) {
                                        updatedInfo.dbSessionId = insertResult.insertId;
                                        connectedTerminals.set(socket.id, updatedInfo);
                                        console.log(`[Socket] Created DB session on cashier login: ${insertResult.insertId}`);
                                    }
                                }
                            );
                        }
                    } else if (data.cashier && !isRealCashier(data.cashier) && updatedInfo.dbSessionId && pool) {
                        // Close DB session on logout
                        pool.query(
                            `UPDATE terminal_sessions SET disconnectedAt = ? WHERE id = ?`,
                            [formatDatetime(new Date()), updatedInfo.dbSessionId],
                            (err) => {
                                if (!err) {
                                    updatedInfo.dbSessionId = null;
                                    connectedTerminals.set(socket.id, updatedInfo);
                                }
                            }
                        );
                    }
                }
            });

            // 3. Admin: Get List
            socket.on('admin:get_terminals', () => {
                socket.emit('admin:terminals_update', Array.from(connectedTerminals.values()));
            });

            // 3. Admin: Block/Unblock
            socket.on('admin:toggle_block', (targetSocketId) => {
                const terminal = connectedTerminals.get(targetSocketId);
                if (terminal) {
                    terminal.allowed = !terminal.allowed;
                    connectedTerminals.set(targetSocketId, terminal);

                    // Notify everyone (Admins update UI)
                    io.emit('admin:terminals_update', Array.from(connectedTerminals.values()));

                    // Notify specific terminal
                    io.to(targetSocketId).emit('sync:status_change', { allowed: terminal.allowed });
                    console.log(`[Socket] Terminal ${terminal.terminalId} access set to ${terminal.allowed}`);
                }
            });

            // 4. Remote Cache Management (Dev Only)
            socket.on('admin:request_terminal_cache', (targetSocketId) => {
                console.log(`[Socket] Admin ${socket.id} requested cache for terminal ${targetSocketId}`);
                io.to(targetSocketId).emit('terminal:get_cache');
            });

            socket.on('terminal:cache_data', (data) => {
                // Return data to all admins
                const terminal = connectedTerminals.get(socket.id);
                console.log(`[Socket] Cache data received from terminal ${socket.id}`);
                io.emit('admin:terminal_cache_result', {
                    socketId: socket.id,
                    terminalId: terminal?.terminalId,
                    cache: data.cache,
                    storage: data.storage // New: Full localStorage dump
                });
            });

            socket.on('admin:delete_terminal_cache_item', (data) => {
                const { targetSocketId, itemCode } = data;
                console.log(`[Socket] Admin ${socket.id} requested deletion of ${itemCode} on terminal ${targetSocketId}`);
                io.to(targetSocketId).emit('terminal:delete_cache_item', { code: itemCode });
            });

            socket.on('admin:update_terminal_storage', (data) => {
                const { targetSocketId, key, value, action } = data;
                console.log(`[Socket] Admin ${socket.id} requested ${action} for key ${key} on terminal ${targetSocketId}`);
                io.to(targetSocketId).emit('terminal:update_storage', { key, value, action });
            });

            // ─── DEV TOOL REALTIME INDEXEDDB RELAY ───────────────────────
            socket.on('dev:idb_request', (payload) => {
                const { targetTerminalId, event, data, reqId } = payload || {};
                if (!targetTerminalId || !event) return;

                let targetSocketId = null;
                for (const [sId, info] of connectedTerminals.entries()) {
                    if (info.terminalId === targetTerminalId) {
                        targetSocketId = sId;
                        break;
                    }
                }

                if (targetSocketId) {
                    io.to(targetSocketId).emit(event, { ...data, senderSocketId: socket.id, reqId });
                } else {
                    socket.emit('dev:idb_response', {
                        reqId,
                        success: false,
                        message: `Terminal '${targetTerminalId}' is offline or not connected over socket.`
                    });
                }
            });

            socket.on('dev:idb_response', (payload) => {
                const { senderSocketId, reqId, result, success, message } = payload || {};
                if (senderSocketId) {
                    io.to(senderSocketId).emit('dev:idb_response', { reqId, result, success, message });
                }
            });

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
                if (connectedTerminals.has(socket.id)) {
                    const terminalInfo = connectedTerminals.get(socket.id);

                    // Disconnect logic for DB
                    if (terminalInfo.dbSessionId && pool) {
                        const formatDatetime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');
                        pool.query(
                            `UPDATE terminal_sessions SET disconnectedAt = ? WHERE id = ?`,
                            [formatDatetime(new Date()), terminalInfo.dbSessionId],
                            (err) => {
                                if (err) console.error('Error closing terminal session:', err);
                            }
                        );
                    }

                    connectedTerminals.delete(socket.id);
                    // Notify Admins
                    io.emit('admin:terminals_update', Array.from(connectedTerminals.values()));
                }
            });
        });

        return io;
    },
    getIO: () => {
        if (!io) {
            throw new Error('Socket.io not initialized!');
        }
        return io;
    },
    sendDevCommandToTerminal: (targetTerminalId, event, data, timeoutMs = 8000) => {
        return new Promise((resolve) => {
            if (!io) return resolve({ success: false, message: 'Socket.io server not initialized' });

            let targetSocket = null;
            // 1. Look up target socket ID from connectedTerminals map
            for (const [sId, info] of connectedTerminals.entries()) {
                if (info.terminalId === targetTerminalId) {
                    const s = io.sockets.sockets.get(sId);
                    if (s) {
                        targetSocket = s;
                        break;
                    }
                }
            }

            // 2. Fallback: Search active sockets list
            if (!targetSocket) {
                const sockets = io.sockets.sockets;
                for (const [sId, s] of sockets.entries()) {
                    if (s.terminalId === targetTerminalId || s.deviceCode === targetTerminalId) {
                        targetSocket = s;
                        break;
                    }
                }
            }

            if (!targetSocket) {
                return resolve({
                    success: false,
                    message: `Terminal '${targetTerminalId}' is currently offline or not connected over socket.`
                });
            }

            const reqId = 'dev_req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

            let resolved = false;
            const timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    targetSocket.off('dev:idb_response', responseListener);
                    resolve({
                        success: false,
                        message: `Terminal '${targetTerminalId}' response timed out after ${timeoutMs / 1000}s.`
                    });
                }
            }, timeoutMs);

            const responseListener = (payload) => {
                if (payload && payload.reqId === reqId && !resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    targetSocket.off('dev:idb_response', responseListener);
                    resolve(payload);
                }
            };

            targetSocket.on('dev:idb_response', responseListener);
            targetSocket.emit(event, { ...data, reqId });
        });
    }
};
