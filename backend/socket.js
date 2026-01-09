const { Server } = require('socket.io');

let io;

module.exports = {
    init: (httpServer) => {
        io = new Server(httpServer, {
            cors: {
                origin: '*', // Allow all origins for simplicity in development; refine for production
                methods: ['GET', 'POST']
            }
        });

        const connectedTerminals = new Map(); // socketId -> { info, allowed: true }

        io.on('connection', (socket) => {
            console.log('Client connected:', socket.id);

            // 1. Handshake: Client registers itself
            socket.on('register', (data) => {
                const terminalId = data.terminalId || 'UNKNOWN';

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
            });

            // 2. Dynamic Update: Terminal sends new info (e.g. Cashier Login)
            socket.on('terminal:update_info', (data) => {
                if (connectedTerminals.has(socket.id)) {
                    const currentInfo = connectedTerminals.get(socket.id);
                    const updatedInfo = { ...currentInfo, ...data };
                    connectedTerminals.set(socket.id, updatedInfo);

                    // Notify Admins
                    io.emit('admin:terminals_update', Array.from(connectedTerminals.values()));
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

            socket.on('disconnect', () => {
                console.log('Client disconnected:', socket.id);
                if (connectedTerminals.has(socket.id)) {
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
    }
};
