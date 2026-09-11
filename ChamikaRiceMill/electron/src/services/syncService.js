import axios from 'axios';
import dayjs from 'dayjs';
import { io } from 'socket.io-client';
import db from './db';
import { getTerminalDeviceCode, getCurrentUserName } from '../utils/terminalHelper';

const DEFAULT_API_BASE = 'https://crm.bridgitalsolutions.com';

export function getStoredApiBase() {
    try {
        const stored = localStorage.getItem('millApiUrl') || localStorage.getItem('webApiUrl');
        if (stored && stored.trim()) {
            let url = stored.trim();
            if (url.endsWith('/')) url = url.slice(0, -1);
            // Ignore frontend dev server ports (5181, 5173, 5174, 5175, 3000)
            if (!url.includes(':5181') && !url.includes(':5173') && !url.includes(':5174') && !url.includes(':5175') && !url.includes(':3000')) {
                return url;
            }
        }
    } catch (e) {
        console.warn('[SyncService] Error reading API URL from storage:', e);
    }
    return DEFAULT_API_BASE;
}

export function saveStoredApiBase(url) {
    if (!url) url = DEFAULT_API_BASE;
    let cleanUrl = url.trim();
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    localStorage.setItem('millApiUrl', cleanUrl);
    return cleanUrl;
}

class SyncService {
    constructor() {
        this.isOnline = false;
        this.latency = null;
        this.lastChecked = null;
        this.lastSyncTime = localStorage.getItem('millLastSyncTime') || null;
        this.isSyncing = false;
        this.listeners = [];
        this.checkInterval = null;
        this.autoSyncInterval = null;
        this.socket = null;

        // Listen for standard browser network events
        window.addEventListener('online', () => {
            this.checkConnection();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.latency = null;
            this.notify('connectionStatus', { online: false, latency: null, url: this.apiBase });
        });

        // Initialize Socket.io terminal registration
        this.initSocket();
    }

    get currentCashier() {
        try {
            const userName = getCurrentUserName();
            if (userName && userName.trim() && userName.toLowerCase() !== 'null' && userName.toLowerCase() !== 'undefined' && userName.toLowerCase() !== 'user') {
                return userName.trim();
            }
            const stored = localStorage.getItem('millUser') || localStorage.getItem('currentUser') || localStorage.getItem('user');
            if (stored) {
                const user = JSON.parse(stored);
                if (user.NAME || user.USERNAME || user.NAME_FULL) {
                    return user.NAME || user.USERNAME || user.NAME_FULL;
                }
            }
        } catch (e) {}
        return 'Mill Desktop Officer';
    }

    registerSocket() {
        if (!this.socket) return;
        const deviceCode = getTerminalDeviceCode();
        const cashierName = this.currentCashier;

        console.log('[SyncService] Registering Mill Desktop Terminal as:', cashierName, deviceCode);
        this.socket.emit('register', {
            storeNo: 999,
            storeName: 'Chamika Rice Mill Desktop',
            terminalId: deviceCode,
            type: 'Mill Electron App',
            version: '1.0.0',
            cashier: cashierName
        });
    }

    initSocket() {
        try {
            if (this.socket) {
                this.socket.disconnect();
            }
            let url = this.apiBase || 'http://localhost:3001';
            if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
                url = 'http://localhost:3001';
            }
            console.log('[SyncService] Connecting Mill Electron Socket to:', url);
            this.socket = io(url, {
                reconnectionDelayMax: 5000,
                transports: ['websocket', 'polling'],
                autoConnect: true
            });

            const sendRegister = () => {
                this.registerSocket();
            };

            this.socket.on('connect', () => {
                console.log('[SyncService] Mill Electron Socket Connected! ID:', this.socket.id);
                sendRegister();
                this.setupDevSocketHandlers();
            });

            this.socket.on('reconnect', () => {
                console.log('[SyncService] Mill Electron Socket Reconnected!');
                sendRegister();
                this.setupDevSocketHandlers();
            });

            if (this.socket.connected) {
                sendRegister();
                this.setupDevSocketHandlers();
            }
        } catch (e) {
            console.warn('[SyncService] Socket init error:', e);
        }
    }

    setupDevSocketHandlers() {
        if (!this.socket) return;

        // Clean previous listeners to prevent duplicates
        this.socket.off('dev:get_idb_summary');
        this.socket.off('dev:get_idb_records');
        this.socket.off('dev:update_idb_record');
        this.socket.off('dev:delete_idb_record');
        this.socket.off('dev:clear_store');
        this.socket.off('dev:trigger_force_sync');

        // 1. Get complete storage tree (All Dexie IndexedDB tables + LocalStorage keys)
        this.socket.on('dev:get_idb_summary', async (data) => {
            const { reqId } = data || {};
            try {
                const tables = db.tables || [];
                const idbStores = [];
                for (const t of tables) {
                    const count = await t.count().catch(() => 0);
                    idbStores.push({ name: t.name, count, pk: t.schema.primKey.name });
                }

                const lsKeys = [];
                if (typeof localStorage !== 'undefined') {
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        lsKeys.push({ key, value: localStorage.getItem(key) });
                    }
                }

                this.socket.emit('dev:idb_response', {
                    reqId,
                    success: true,
                    result: {
                        terminalId: getTerminalDeviceCode(),
                        dbName: db.name || 'ChamikaRiceMillDB',
                        idbStores,
                        localStorageKeys: lsKeys
                    }
                });
            } catch (e) {
                this.socket.emit('dev:idb_response', { reqId, success: false, message: e.message });
            }
        });

        // 2. Fetch records from dynamic IndexedDB store or LocalStorage
        this.socket.on('dev:get_idb_records', async (data) => {
            const { reqId, store, isLocalStorage, limit } = data || {};
            try {
                if (isLocalStorage) {
                    const items = [];
                    if (typeof localStorage !== 'undefined') {
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            items.push({ KEY: key, VALUE: localStorage.getItem(key) });
                        }
                    }
                    return this.socket.emit('dev:idb_response', { reqId, success: true, result: items, pk: 'KEY' });
                }

                const table = db.table(store);
                if (!table) {
                    return this.socket.emit('dev:idb_response', { reqId, success: false, message: `Store '${store}' not found in IndexedDB` });
                }

                let records = (limit && Number(limit) > 0) ? await table.limit(Number(limit)).toArray() : await table.toArray();
                const pk = table.schema.primKey.name || 'LOCAL_ID';

                // Sort newest records first (CREATED_DATE / DATE / PK descending)
                records.sort((a, b) => {
                    const valA = a.CREATED_DATE || a.CREATED_AT || a.DATE || a.CREATED_TIME || a[pk] || 0;
                    const valB = b.CREATED_DATE || b.CREATED_AT || b.DATE || b.CREATED_TIME || b[pk] || 0;

                    if (typeof valA === 'string' && typeof valB === 'string') {
                        return valB.localeCompare(valA);
                    }
                    return (Number(valB) || 0) - (Number(valA) || 0);
                });

                this.socket.emit('dev:idb_response', { reqId, success: true, result: records, pk });
            } catch (e) {
                this.socket.emit('dev:idb_response', { reqId, success: false, message: e.message });
            }
        });

        // 3. Update/Edit record in terminal IndexedDB or LocalStorage
        this.socket.on('dev:update_idb_record', async (data) => {
            const { reqId, store, isLocalStorage, key, updates } = data || {};
            try {
                if (isLocalStorage) {
                    if (typeof localStorage !== 'undefined') {
                        localStorage.setItem(key, typeof updates.VALUE === 'string' ? updates.VALUE : JSON.stringify(updates.VALUE));
                    }
                    return this.socket.emit('dev:idb_response', { reqId, success: true, message: `LocalStorage key '${key}' updated` });
                }

                const table = db.table(store);
                if (!table) return this.socket.emit('dev:idb_response', { reqId, success: false, message: `Store '${store}' not found` });

                const pkValue = isNaN(Number(key)) ? key : Number(key);
                await table.update(pkValue, updates);

                // Notify UI components to reload data
                this.notify('syncComplete', { timestamp: new Date().toISOString() });

                this.socket.emit('dev:idb_response', {
                    reqId,
                    success: true,
                    message: `Terminal IndexedDB store '${store}' record #${key} updated`
                });
            } catch (e) {
                this.socket.emit('dev:idb_response', { reqId, success: false, message: e.message });
            }
        });

        // 4. Delete record or bulk delete records from terminal IndexedDB or LocalStorage
        this.socket.on('dev:delete_idb_record', async (data) => {
            const { reqId, store, isLocalStorage, key, keys } = data || {};
            try {
                const targetKeys = keys && Array.isArray(keys) ? keys : (key ? [key] : []);
                if (targetKeys.length === 0) {
                    return this.socket.emit('dev:idb_response', { reqId, success: false, message: 'No keys specified for deletion' });
                }

                if (isLocalStorage) {
                    if (typeof localStorage !== 'undefined') {
                        targetKeys.forEach(k => localStorage.removeItem(k));
                    }
                    return this.socket.emit('dev:idb_response', { reqId, success: true, message: `${targetKeys.length} LocalStorage keys deleted` });
                }

                const table = db.table(store);
                if (!table) return this.socket.emit('dev:idb_response', { reqId, success: false, message: `Store '${store}' not found` });

                const formattedKeys = targetKeys.map(k => (isNaN(Number(k)) ? k : Number(k)));
                await table.bulkDelete(formattedKeys);

                // Notify UI components to reload data
                this.notify('syncComplete', { timestamp: new Date().toISOString() });

                this.socket.emit('dev:idb_response', {
                    reqId,
                    success: true,
                    message: `${formattedKeys.length} records deleted from store '${store}'`
                });
            } catch (e) {
                this.socket.emit('dev:idb_response', { reqId, success: false, message: e.message });
            }
        });

        // 4.5. Clear entire store from terminal IndexedDB
        this.socket.on('dev:clear_store', async (data) => {
            const { reqId, store, isLocalStorage } = data || {};
            try {
                if (isLocalStorage) {
                    if (typeof localStorage !== 'undefined') localStorage.clear();
                    return this.socket.emit('dev:idb_response', { reqId, success: true, message: `LocalStorage cleared` });
                }

                const table = db.table(store);
                if (!table) return this.socket.emit('dev:idb_response', { reqId, success: false, message: `Store '${store}' not found` });

                await table.clear();

                // Notify UI components to reload data
                this.notify('syncComplete', { timestamp: new Date().toISOString() });

                this.socket.emit('dev:idb_response', { reqId, success: true, message: `Store '${store}' cleared entirely` });
            } catch (e) {
                this.socket.emit('dev:idb_response', { reqId, success: false, message: e.message });
            }
        });

        // 5. Remote Force Sync Trigger
        this.socket.on('dev:trigger_force_sync', async (data) => {
            const { reqId } = data || {};
            try {
                const pushRes = await this.pushPendingSales();
                this.socket.emit('dev:idb_response', {
                    reqId,
                    success: true,
                    message: `Force sync executed on terminal ${getTerminalDeviceCode()}`,
                    result: pushRes
                });
            } catch (e) {
                this.socket.emit('dev:idb_response', { reqId, success: false, message: e.message });
            }
        });
    }

    get apiBase() {
        return getStoredApiBase();
    }

    setApiUrl(newUrl) {
        saveStoredApiBase(newUrl);
        this.initSocket();
        return this.checkConnection();
    }

    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    notify(event, data) {
        this.listeners.forEach(cb => {
            try {
                cb(event, data);
            } catch (e) {
                console.error('Error in sync listener callback:', e);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // ACTIVE REAL-TIME HEALTH / CONNECTION CHECK
    // ─────────────────────────────────────────────────────────────
    async checkConnection() {
        const url = this.apiBase;
        const startTime = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);

            const response = await fetch(`${url}/api/health`, {
                method: 'GET',
                signal: controller.signal,
                headers: { 'Cache-Control': 'no-cache' }
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            const duration = Date.now() - startTime;

            const wasOffline = !this.isOnline;
            const nowOnline = response.ok && data?.status === 'ok';

            this.isOnline = nowOnline;
            this.latency = nowOnline ? duration : null;
            this.lastChecked = new Date();

            this.notify('connectionStatus', {
                online: this.isOnline,
                latency: this.latency,
                url: this.apiBase
            });

            // If we just recovered connectivity, trigger auto sync
            if (wasOffline && nowOnline && !this.isSyncing) {
                console.log(`[SyncService] Backend online (${this.latency}ms). Triggering sync...`);
                this.syncAll();
            }

            return { online: this.isOnline, latency: this.latency };
        } catch (err) {
            const wasOnline = this.isOnline;
            this.isOnline = false;
            this.latency = null;
            this.lastChecked = new Date();

            if (wasOnline) {
                console.warn(`[SyncService] Backend unreachable at ${url}:`, err.message);
            }

            this.notify('connectionStatus', {
                online: false,
                latency: null,
                url: this.apiBase,
                error: err.message
            });

            return { online: false, latency: null, error: err.message };
        }
    }

    startAutoSync(intervalMs = 30000, checkFreqMs = 5000) {
        // Initial health check & sync
        this.checkConnection().then(() => {
            if (this.isOnline) {
                this.syncAll();
            }
        });

        // 1. Regular Health Heartbeat
        if (this.checkInterval) clearInterval(this.checkInterval);
        this.checkInterval = setInterval(() => {
            this.checkConnection();
        }, checkFreqMs);

        // 2. Periodic sync when online
        if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = setInterval(() => {
            if (this.isOnline && !this.isSyncing) {
                this.syncAll();
            }
        }, intervalMs);
    }

    async updatePendingCount() {
        try {
            const [bills, dispatch, inwards, returns, expenses] = await Promise.all([
                db.sales_bills.where('IS_SYNCED').equals(0).count(),
                db.dispatch_notes.where('IS_SYNCED').equals(0).count(),
                db.stock_inwards.where('IS_SYNCED').equals(0).count(),
                db.sales_returns.where('IS_SYNCED').equals(0).count(),
                db.expenses.where('IS_SYNCED').equals(0).count()
            ]);
            const total = bills + dispatch + inwards + returns + expenses;
            this.notify('pendingCountChanged', {
                total,
                breakdown: { bills, dispatch, inwards, returns, expenses }
            });
            return total;
        } catch (e) {
            console.error('Error counting pending records:', e);
            return 0;
        }
    }

    async getPendingBreakdown() {
        try {
            const [bills, dispatch, inwards, returns, expenses] = await Promise.all([
                db.sales_bills.where('IS_SYNCED').equals(0).count(),
                db.dispatch_notes.where('IS_SYNCED').equals(0).count(),
                db.stock_inwards.where('IS_SYNCED').equals(0).count(),
                db.sales_returns.where('IS_SYNCED').equals(0).count(),
                db.expenses.where('IS_SYNCED').equals(0).count()
            ]);
            return {
                total: bills + dispatch + inwards + returns + expenses,
                bills,
                dispatch,
                inwards,
                returns,
                expenses
            };
        } catch (e) {
            return { total: 0, bills: 0, dispatch: 0, inwards: 0, returns: 0, expenses: 0 };
        }
    }

    // ─────────────────────────────────────────────────────────────
    // TWO-WAY SYNC MAIN ENTRY
    // ─────────────────────────────────────────────────────────────
    async syncAll() {
        // Run quick connection test first
        await this.checkConnection();
        if (!this.isOnline) {
            this.notify('syncError', { message: 'Server is unreachable. Offline mode active.' });
            return false;
        }
        if (this.isSyncing) return false;

        this.isSyncing = true;
        this.notify('syncStart');

        try {
            const baseUrl = this.apiBase;

            // 1. Push Offline Records to Cloud
            await this.pushPendingSales(baseUrl);
            await this.pushPendingDispatch(baseUrl);
            await this.pushPendingInward(baseUrl);
            await this.pushPendingReturns(baseUrl);
            await this.pushPendingExpenses(baseUrl);

            // 2. Pull Cloud Master Data into Dexie
            await this.pullReferenceData(baseUrl);

            // 3. Pull Cloud Transactional Records into Dexie
            await this.pullSalesBills(baseUrl);
            await this.pullDispatchNotes(baseUrl);
            await this.pullStockInwards(baseUrl);
            await this.pullSalesReturns(baseUrl);
            await this.pullExpenses(baseUrl);

            // 4. Purge Local Synced Data older than 30 Days
            await this.cleanupOldSyncedData();

            this.lastSyncTime = new Date().toISOString();
            localStorage.setItem('millLastSyncTime', this.lastSyncTime);

            await this.updatePendingCount();
            this.notify('syncComplete', { timestamp: this.lastSyncTime });
            return true;
        } catch (error) {
            console.error('Sync process error:', error);
            this.notify('syncError', error);
            return false;
        } finally {
            this.isSyncing = false;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 1. PUSH LOGIC (OFFLINE -> CLOUD)
    // ─────────────────────────────────────────────────────────────
    async pushPendingSales(baseUrl = this.apiBase) {
        const pending = await db.sales_bills.where('IS_SYNCED').equals(0).toArray();
        for (const bill of pending) {
            try {
                if (bill.IS_SETTLED_UPDATE && bill.BILL_ID) {
                    // Push Settlement
                    const res = await axios.post(`${baseUrl}/api/mill/sales/settle`, {
                        BILL_ID: bill.BILL_ID,
                        PAYMENT_METHOD: bill.PAYMENT_METHOD || 'cash',
                        PAID_AMOUNT: bill.PAID_AMOUNT || bill.FINAL_AMOUNT,
                        DISCOUNT: bill.DISCOUNT || 0,
                        FINAL_AMOUNT: bill.FINAL_AMOUNT,
                        HANDWRITTEN_SUB_TOTAL: bill.HANDWRITTEN_SUB_TOTAL || 0,
                        ITEMS: bill.HANDWRITTEN_ITEMS || [],
                        CHEQUES: bill.CHEQUES || []
                    }, { timeout: 8000 });

                    if (res.data && res.data.success) {
                        await db.sales_bills.update(bill.LOCAL_ID, {
                            IS_SETTLED: 1,
                            IS_SETTLED_UPDATE: false,
                            IS_SYNCED: 1
                        });
                    }
                } else if (bill.IS_EDIT_PENDING && bill.BILL_ID) {
                    // Push Edit Sale
                    let rawItems = bill.ITEMS || bill.ITEMS_JSON || [];
                    if (typeof rawItems === 'string') {
                        try { rawItems = JSON.parse(rawItems); } catch(e) { rawItems = []; }
                    }
                    if (!Array.isArray(rawItems)) rawItems = [];

                    const billDateStr = (bill.DATE && dayjs(bill.DATE).isValid()) 
                        ? dayjs(bill.DATE).format('YYYY-MM-DD') 
                        : ((bill.CREATED_DATE && dayjs(bill.CREATED_DATE).isValid()) ? dayjs(bill.CREATED_DATE).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));

                    const res = await axios.post(`${baseUrl}/api/mill/sales/edit`, {
                        BILL_ID: bill.BILL_ID,
                        INVOICE_NO: bill.INVOICE_NO,
                        BATCH_NO: bill.BATCH_NO || null,
                        CUSTOMER_ID: (bill.CUSTOMER_ID && !isNaN(Number(bill.CUSTOMER_ID))) ? Number(bill.CUSTOMER_ID) : null,
                        CUSTOMER_NAME: bill.CUSTOMER_NAME,
                        CUSTOMER_PHONE: bill.CUSTOMER_PHONE,
                        CUSTOMER_ADDRESS: bill.CUSTOMER_ADDRESS,
                        VEHICLE_NO: bill.VEHICLE_NO || bill.LORRY_NO || '',
                        DRIVER_NAME: bill.DRIVER_NAME || '',
                        TOTAL_AMOUNT: Number(bill.TOTAL_AMOUNT || 0),
                        PRINTED_SUB_TOTAL: Number(bill.PRINTED_SUB_TOTAL || 0),
                        NET_AMOUNT: Number(bill.NET_AMOUNT || 0),
                        FINAL_AMOUNT: Number(bill.FINAL_AMOUNT || 0),
                        DISCOUNT: Number(bill.DISCOUNT || 0),
                        DATE: billDateStr,
                        ITEMS: rawItems,
                        CREATED_BY: bill.CREATED_BY_NAME || getCurrentUserName()
                    }, { timeout: 8000 });

                    if (res.data && res.data.success) {
                        await db.sales_bills.update(bill.LOCAL_ID, {
                            IS_EDIT_PENDING: false,
                            IS_SYNCED: 1
                        });
                    }
                } else {
                    // Push New Sale
                    let rawItems = bill.ITEMS || bill.ITEMS_JSON || [];
                    if (typeof rawItems === 'string') {
                        try { rawItems = JSON.parse(rawItems); } catch(e) { rawItems = []; }
                    }
                    if (!Array.isArray(rawItems)) rawItems = [];

                    const billDateStr = (bill.DATE && dayjs(bill.DATE).isValid()) 
                        ? dayjs(bill.DATE).format('YYYY-MM-DD') 
                        : ((bill.CREATED_DATE && dayjs(bill.CREATED_DATE).isValid()) ? dayjs(bill.CREATED_DATE).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));

                    const res = await axios.post(`${baseUrl}/api/mill/sales/add`, {
                        INVOICE_NO: bill.INVOICE_NO,
                        CUSTOMER_ID: (bill.CUSTOMER_ID && !isNaN(Number(bill.CUSTOMER_ID))) ? Number(bill.CUSTOMER_ID) : null,
                        BATCH_NO: bill.BATCH_NO || null,
                        DATE: billDateStr,
                        CREATED_DATE: bill.CREATED_DATE || bill.CREATED_AT || dayjs().toISOString(),
                        TOTAL_AMOUNT: (bill.TOTAL_AMOUNT !== undefined && bill.TOTAL_AMOUNT !== null) ? Number(bill.TOTAL_AMOUNT) : 0,
                        PRINTED_SUB_TOTAL: (bill.PRINTED_SUB_TOTAL !== undefined && bill.PRINTED_SUB_TOTAL !== null) ? Number(bill.PRINTED_SUB_TOTAL) : 0,
                        NET_AMOUNT: (bill.NET_AMOUNT !== undefined && bill.NET_AMOUNT !== null) ? Number(bill.NET_AMOUNT) : 0,
                        FINAL_AMOUNT: (bill.FINAL_AMOUNT !== undefined && bill.FINAL_AMOUNT !== null) ? Number(bill.FINAL_AMOUNT) : 0,
                        DISCOUNT: Number(bill.DISCOUNT || 0),
                        PAYMENT_METHOD: bill.PAYMENT_METHOD || 'cash',
                        IS_SETTLED: (bill.IS_SETTLED !== undefined && bill.IS_SETTLED !== null) ? Number(bill.IS_SETTLED) : 0,
                        REMARK: bill.REMARK || null,
                        DEVICE_ID: bill.DEVICE_ID || getTerminalDeviceCode(),
                        CREATED_BY_NAME: bill.CREATED_BY_NAME || bill.ADDED_BY || getCurrentUserName(),
                        ITEMS: rawItems
                    }, { timeout: 8000 });

                    if (res.data && res.data.success) {
                        const newBillId = res.data.billId;
                        await db.sales_bills.update(bill.LOCAL_ID, {
                            BILL_ID: newBillId,
                            INVOICE_NO: res.data.invoiceNo || bill.INVOICE_NO,
                            IS_SYNCED: 1
                        });

                        if (bill.IS_SETTLED_UPDATE && newBillId) {
                            try {
                                await axios.post(`${baseUrl}/api/mill/sales/settle`, {
                                    BILL_ID: newBillId,
                                    PAYMENT_METHOD: bill.PAYMENT_METHOD || 'cash',
                                    PAID_AMOUNT: bill.PAID_AMOUNT || bill.FINAL_AMOUNT,
                                    DISCOUNT: bill.DISCOUNT || 0,
                                    FINAL_AMOUNT: bill.FINAL_AMOUNT,
                                    HANDWRITTEN_SUB_TOTAL: bill.HANDWRITTEN_SUB_TOTAL || 0,
                                    ITEMS: bill.HANDWRITTEN_ITEMS || [],
                                    CHEQUES: bill.CHEQUES || []
                                }, { timeout: 8000 });
                                await db.sales_bills.update(bill.LOCAL_ID, { IS_SETTLED_UPDATE: false });
                            } catch(e) { console.warn('Secondary settlement push failed:', e.message); }
                        }
                    }
                }
            } catch (err) {
                console.error(`Failed to push sale #${bill.INVOICE_NO || bill.LOCAL_ID}:`, err.message);
                if (err.response && err.response.status === 401) {
                    console.warn('Push paused: Unauthorized (401)');
                    break;
                }
            }
        }
    }

    async pushPendingDispatch(baseUrl = this.apiBase) {
        const pending = await db.dispatch_notes.where('IS_SYNCED').equals(0).toArray();
        for (const note of pending) {
            try {
                let billIds = note.BILL_IDS_JSON || [];
                if (typeof billIds === 'string') {
                    try { billIds = JSON.parse(billIds); } catch(e) { billIds = billIds.split(',').map(s => s.trim()); }
                }
                if (!Array.isArray(billIds)) billIds = [];

                let invoiceNos = note.INVOICE_NOS_JSON || [];
                if (typeof invoiceNos === 'string') {
                    try { invoiceNos = JSON.parse(invoiceNos); } catch(e) { invoiceNos = invoiceNos.split(',').map(s => s.trim()); }
                }
                if (!Array.isArray(invoiceNos)) invoiceNos = [];

                const res = await axios.post(`${baseUrl}/api/mill/dispatch/create`, {
                    DISPATCH_NO: note.DISPATCH_NO,
                    BILL_IDS: billIds,
                    INVOICE_NOS: invoiceNos,
                    DATE: dayjs(note.DATE).format('YYYY-MM-DD'),
                    CREATED_DATE: note.CREATED_DATE || note.CREATED_AT || dayjs().toISOString(),
                    DRIVER_NAME: note.DRIVER_NAME || 'Main Driver',
                    LORRY_NO: note.LORRY_NO || note.VEHICLE_NO || 'Mill Lorry',
                    STAFF_NAME: note.STAFF_NAME || 'Officer',
                    TOTAL_5KG: note.TOTAL_5KG,
                    TOTAL_10KG: note.TOTAL_10KG,
                    TOTAL_25KG: note.TOTAL_25KG,
                    TOTAL_BAGS: note.TOTAL_BAGS,
                    DEVICE_ID: note.DEVICE_ID || getTerminalDeviceCode(),
                    CREATED_BY: note.ADDED_BY || note.CREATED_BY_NAME || getCurrentUserName(),
                    CREATED_BY_NAME: note.CREATED_BY_NAME || note.ADDED_BY || getCurrentUserName()
                }, { timeout: 8000 });

                if (res.data && res.data.success) {
                    await db.dispatch_notes.update(note.LOCAL_ID, {
                        DISPATCH_ID: res.data.dispatchId,
                        DISPATCH_NO: res.data.dispatchNo || note.DISPATCH_NO,
                        IS_SYNCED: 1
                    });
                }
            } catch (err) {
                console.error(`Failed to push dispatch note #${note.LOCAL_ID}:`, err.message);
                if (err.response && err.response.status === 401) {
                    console.warn('Push dispatch paused: Unauthorized (401)');
                    break;
                }
            }
        }
    }

    async pushPendingInward(baseUrl = this.apiBase) {
        const pending = await db.stock_inwards.where('IS_SYNCED').equals(0).toArray();
        for (const inward of pending) {
            try {
                const res = await axios.post(`${baseUrl}/api/mill/inward/add`, {
                    INWARD_TYPE: inward.INWARD_TYPE || 'mill_purchase',
                    ITEM_ID: inward.ITEM_ID,
                    PLACE_ID: inward.PLACE_ID || null,
                    QUANTITY: inward.QUANTITY,
                    SOURCE_QUANTITY: inward.SOURCE_QUANTITY || inward.QUANTITY,
                    PRICE_PER_UNIT: inward.PRICE_PER_UNIT || 0,
                    TOTAL_PRICE: inward.TOTAL_PRICE || 0,
                    NO_OF_BAGS: inward.NO_OF_BAGS || null,
                    VEHICLE_NO: inward.VEHICLE_NO || '',
                    DRIVER_NAME: inward.DRIVER_NAME || '',
                    SUPPLIER_ID: inward.SUPPLIER_ID || null,
                    DATE: dayjs(inward.DATE).format('YYYY-MM-DD'),
                    CREATED_DATE: inward.CREATED_DATE || inward.CREATED_AT || dayjs().toISOString(),
                    NOTES: inward.NOTES || ''
                }, { timeout: 8000 });

                if (res.data.success) {
                    await db.stock_inwards.update(inward.LOCAL_ID, {
                        INWARD_ID: res.data.insertId || res.data.result?.INWARD_ID,
                        REFERENCE_NO: res.data.referenceNo,
                        IS_SYNCED: 1
                    });
                }
            } catch (err) {
                console.error(`Failed to push stock inward #${inward.LOCAL_ID}:`, err.message);
            }
        }
    }

    async pushPendingReturns(baseUrl = this.apiBase) {
        const pending = await db.sales_returns.where('IS_SYNCED').equals(0).toArray();
        for (const ret of pending) {
            try {
                if (ret.RETURN_ID) {
                    // Existing return record being updated (PUT)
                    const res = await axios.put(`${baseUrl}/api/mill/returns/${ret.RETURN_ID}`, {
                        REFUND_AMOUNT: ret.REFUND_AMOUNT || 0,
                        REFUND_METHOD: ret.REFUND_TYPE || ret.REFUND_METHOD || 'cash',
                        REASON: ret.REASON || ''
                    }, { timeout: 8000 });

                    if (res.data?.success) {
                        await db.sales_returns.update(ret.LOCAL_ID, {
                            IS_SYNCED: 1
                        });
                    }
                } else {
                    // New return record being created (POST)
                    const returnItems = ret.ITEMS || [{
                        ITEM_ID: ret.ITEM_ID,
                        BAG_WEIGHT: ret.BAG_WEIGHT || 25,
                        RETURNED_BAG_COUNT: ret.BAG_COUNT || 0,
                        RETURNED_QTY: ret.RETURN_QTY || 0,
                        UNIT_PRICE: ret.UNIT_PRICE || 0,
                        REFUND_LINE_TOTAL: ret.REFUND_AMOUNT || 0
                    }];

                    const res = await axios.post(`${baseUrl}/api/mill/returns/add`, {
                        BILL_ID: ret.BILL_ID || 0,
                        INVOICE_NO: ret.INVOICE_NO || `RET-${ret.LOCAL_ID}`,
                        CUSTOMER_ID: ret.CUSTOMER_ID || null,
                        REFUND_AMOUNT: ret.REFUND_AMOUNT || 0,
                        REFUND_METHOD: ret.REFUND_TYPE || ret.REFUND_METHOD || 'cash',
                        REASON: ret.REASON || '',
                        DATE: dayjs(ret.DATE).format('YYYY-MM-DD'),
                        CREATED_DATE: ret.CREATED_DATE || ret.CREATED_AT || dayjs().toISOString(),
                        ITEMS: returnItems
                    }, { timeout: 8000 });

                    if (res.data?.success) {
                        await db.sales_returns.update(ret.LOCAL_ID, {
                            RETURN_ID: res.data.returnId,
                            RETURN_NO: res.data.returnNo,
                            IS_SYNCED: 1
                        });
                    }
                }
            } catch (err) {
                console.error(`Failed to push sales return #${ret.LOCAL_ID}:`, err.message);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. PULL LOGIC (CLOUD -> DEXIE)
    // ─────────────────────────────────────────────────────────────
    async pullReferenceData(baseUrl = this.apiBase) {
        try {
            const [itemsRes, custRes, vehRes, staffRes, placesRes, yieldRes] = await Promise.all([
                axios.post(`${baseUrl}/api/MillgetAllItems`, {}, { timeout: 8000 }).catch(() => ({ data: { success: false } })),
                axios.post(`${baseUrl}/api/MillgetAllCustomers`, {}, { timeout: 8000 }).catch(() => ({ data: { success: false } })),
                axios.get(`${baseUrl}/api/mill/vehicles/list`, { timeout: 8000 }).catch(() => ({ data: { success: false } })),
                axios.get(`${baseUrl}/api/mill/staff/list`, { timeout: 8000 }).catch(() => ({ data: { success: false } })),
                axios.post(`${baseUrl}/api/mill/places`, {}, { timeout: 8000 }).catch(() => ({ data: { success: false } })),
                axios.get(`${baseUrl}/api/mill/yield-configs`, { timeout: 8000 }).catch(() => ({ data: { success: false } }))
            ]);

            if (itemsRes.data?.success && Array.isArray(itemsRes.data.result)) {
                await db.items.clear();
                await db.items.bulkPut(itemsRes.data.result);
            }
            if (custRes.data?.success && Array.isArray(custRes.data.result)) {
                await db.customers.clear();
                await db.customers.bulkPut(custRes.data.result.filter(c => c && c.CUSTOMER_ID).map(c => ({
                    ...c,
                    DISTANCE: Number(c.DISTANCE || c.DISTANCE_KM || 0),
                    PHONE: c.PHONE_NUMBER || c.PHONE,
                    LOCATION: c.LOCATION || c.ADDRESS,
                    BANK_DETAILS_JSON: typeof c.BANK_DETAILS_JSON === 'object' ? JSON.stringify(c.BANK_DETAILS_JSON) : (c.BANK_DETAILS_JSON || null)
                })));
            }
            if (vehRes.data?.success && Array.isArray(vehRes.data.result)) {
                await db.vehicles.clear();
                await db.vehicles.bulkPut(vehRes.data.result);
            }
            if (staffRes.data?.success && Array.isArray(staffRes.data.result)) {
                await db.staff.clear();
                await db.staff.bulkPut(staffRes.data.result);
            }
            if (placesRes.data?.success && Array.isArray(placesRes.data.result)) {
                await db.places.clear();
                await db.places.bulkPut(placesRes.data.result.map(p => ({
                    PLACE_ID: p.PLACE_ID,
                    NAME: p.NAME,
                    CODE: p.CODE || null,
                    DISTRICT: p.DISTRICT || null,
                    IS_ACTIVE: p.IS_ACTIVE !== undefined ? p.IS_ACTIVE : 1
                })));
            }
            if (yieldRes.data?.success && Array.isArray(yieldRes.data.result)) {
                await db.yield_configs.clear();
                await db.yield_configs.bulkPut(yieldRes.data.result);
            }

            this.notify('referenceDataUpdated');
        } catch (e) {
            console.error('Error pulling reference data:', e);
        }
    }

    async pullSalesBills(baseUrl = this.apiBase) {
        try {
            const res = await axios.get(`${baseUrl}/api/mill/sales/list`, { timeout: 8000 });
            if (res.data?.success && Array.isArray(res.data.result)) {
                for (const bill of res.data.result) {
                    if (!bill || !bill.INVOICE_NO) continue;
                    const existing = await db.sales_bills.where('INVOICE_NO').equals(bill.INVOICE_NO).first();
                    const cleanPayload = { ...bill };
                    delete cleanPayload.LOCAL_ID;
                    if (existing) {
                        if (existing.IS_SYNCED === 0 || existing.IS_EDIT_PENDING) {
                            continue; // Do not overwrite unsynced local edits
                        }
                        await db.sales_bills.update(existing.LOCAL_ID, {
                            ...cleanPayload,
                            IS_SYNCED: 1
                        });
                    } else {
                        await db.sales_bills.add({
                            ...cleanPayload,
                            IS_SYNCED: 1
                        });
                    }
                }
                this.notify('salesUpdated');
            }
        } catch (e) {
            console.error('Error pulling sales bills:', e);
        }
    }

    async pullDispatchNotes(baseUrl = this.apiBase) {
        try {
            const res = await axios.get(`${baseUrl}/api/mill/dispatch/list`, { timeout: 8000 });
            if (res.data?.success && Array.isArray(res.data.result)) {
                for (const note of res.data.result) {
                    if (!note || !note.DISPATCH_NO) continue;
                    const existing = await db.dispatch_notes.where('DISPATCH_NO').equals(note.DISPATCH_NO).first();
                    const cleanPayload = { ...note };
                    delete cleanPayload.LOCAL_ID;
                    if (existing) {
                        if (existing.IS_SYNCED === 0 || existing.IS_EDIT_PENDING) {
                            continue; // Do not overwrite unsynced local edits
                        }
                        await db.dispatch_notes.update(existing.LOCAL_ID, {
                            ...cleanPayload,
                            IS_SYNCED: 1
                        });
                    } else {
                        await db.dispatch_notes.add({
                            ...cleanPayload,
                            IS_SYNCED: 1
                        });
                    }
                }
                this.notify('dispatchUpdated');
            }
        } catch (e) {
            console.error('Error pulling dispatch notes:', e);
        }
    }

    async pullStockInwards(baseUrl = this.apiBase) {
        try {
            const res = await axios.post(`${baseUrl}/api/mill/inward/list`, {}, { timeout: 8000 });
            if (res.data?.success && Array.isArray(res.data.result)) {
                for (const inward of res.data.result) {
                    if (!inward || !inward.INWARD_ID) continue;
                    const existing = await db.stock_inwards.where('INWARD_ID').equals(inward.INWARD_ID).first();
                    const cleanPayload = { ...inward };
                    delete cleanPayload.LOCAL_ID;
                    if (existing) {
                        if (existing.IS_SYNCED === 0 || existing.IS_EDIT_PENDING) {
                            continue; // Do not overwrite unsynced local edits
                        }
                        await db.stock_inwards.update(existing.LOCAL_ID, {
                            ...cleanPayload,
                            IS_SYNCED: 1
                        });
                    } else {
                        await db.stock_inwards.add({
                            ...cleanPayload,
                            IS_SYNCED: 1
                        });
                    }
                }
                this.notify('inwardUpdated');
            }
        } catch (e) {
            console.error('Error pulling stock inwards:', e);
        }
    }

    async pullSalesReturns(baseUrl = this.apiBase) {
        try {
            const res = await axios.get(`${baseUrl}/api/mill/returns/list`, { timeout: 8000 });
            if (res.data?.success && Array.isArray(res.data.result)) {
                for (const ret of res.data.result) {
                    if (!ret || !ret.RETURN_ID) continue;
                    const existing = await db.sales_returns.where('RETURN_ID').equals(ret.RETURN_ID).first();
                    const cleanPayload = { ...ret };
                    delete cleanPayload.LOCAL_ID;
                    if (existing) {
                        await db.sales_returns.update(existing.LOCAL_ID, {
                            ...cleanPayload,
                            IS_SYNCED: 1
                        });
                    } else {
                        await db.sales_returns.add({
                            ...cleanPayload,
                            IS_SYNCED: 1
                        });
                    }
                }
                this.notify('returnsUpdated');
            }
        } catch (e) {
            console.error('Error pulling sales returns:', e);
        }
    }

    async pushPendingExpenses(baseUrl = this.apiBase) {
        const pending = await db.expenses.where('IS_SYNCED').equals(0).toArray();
        for (const exp of pending) {
            try {
                if (exp.EXPENSE_ID) {
                    const res = await axios.put(`${baseUrl}/api/mill/expenses/${exp.EXPENSE_ID}`, {
                        CATEGORY_NAME: exp.CATEGORY_NAME,
                        AMOUNT: exp.AMOUNT,
                        PAYMENT_METHOD: exp.PAYMENT_METHOD || 'cash',
                        PAID_TO: exp.PAID_TO || null,
                        REF_NO: exp.REF_NO || null,
                        DATE: exp.DATE ? dayjs(exp.DATE).format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss'),
                        NOTES: exp.NOTES || null
                    }, { timeout: 8000 });

                    if (res.data?.success) {
                        await db.expenses.update(exp.LOCAL_ID, {
                            IS_SYNCED: 1
                        });
                    }
                } else {
                    const res = await axios.post(`${baseUrl}/api/mill/expenses/add`, {
                        CATEGORY_NAME: exp.CATEGORY_NAME,
                        AMOUNT: exp.AMOUNT,
                        PAYMENT_METHOD: exp.PAYMENT_METHOD || 'cash',
                        PAID_TO: exp.PAID_TO || null,
                        REF_NO: exp.REF_NO || null,
                        DATE: exp.DATE ? dayjs(exp.DATE).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                        CREATED_DATE: exp.CREATED_DATE || exp.CREATED_AT || dayjs().toISOString(),
                        NOTES: exp.NOTES || null,
                        DEVICE_ID: exp.DEVICE_ID || 'ELECTRON'
                    }, { timeout: 8000 });

                    if (res.data?.success) {
                        await db.expenses.update(exp.LOCAL_ID, {
                            EXPENSE_ID: res.data.expenseId,
                            EXPENSE_NO: res.data.expenseNo || exp.EXPENSE_NO,
                            IS_SYNCED: 1
                        });
                    }
                }
            } catch (err) {
                console.error(`Failed to push expense #${exp.LOCAL_ID}:`, err.message);
            }
        }
    }

    async pullExpenses(baseUrl = this.apiBase) {
        try {
            const res = await axios.get(`${baseUrl}/api/mill/expenses/list`, { timeout: 8000 });
            if (res.data?.success && Array.isArray(res.data.result)) {
                for (const exp of res.data.result) {
                    const existing = await db.expenses.where('EXPENSE_ID').equals(exp.EXPENSE_ID).first();
                    if (existing) {
                        if (existing.IS_SYNCED !== 0) {
                            await db.expenses.update(existing.LOCAL_ID, {
                                ...exp,
                                IS_SYNCED: 1
                            });
                        }
                    } else {
                        await db.expenses.add({
                            ...exp,
                            IS_SYNCED: 1
                        });
                    }
                }
                this.notify('expensesUpdated');
            }
        } catch (e) {
            console.error('Error pulling expenses:', e);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. 30-DAY RETENTION CLEANUP
    // ─────────────────────────────────────────────────────────────
    async cleanupOldSyncedData() {
        try {
            const cutoffDate = dayjs().subtract(30, 'day').format('YYYY-MM-DD HH:mm:ss');

            // 1. Cleanup old synced sales bills (keeping all offline IS_SYNCED: 0)
            const oldSyncedBills = await db.sales_bills
                .where('IS_SYNCED').equals(1)
                .filter(b => dayjs(b.DATE || b.CREATED_DATE).isBefore(cutoffDate))
                .toArray();
            if (oldSyncedBills.length > 0) {
                await db.sales_bills.bulkDelete(oldSyncedBills.map(b => b.LOCAL_ID));
            }

            // 2. Cleanup old synced dispatch notes
            const oldSyncedDispatch = await db.dispatch_notes
                .where('IS_SYNCED').equals(1)
                .filter(n => dayjs(n.DATE || n.CREATED_DATE).isBefore(cutoffDate))
                .toArray();
            if (oldSyncedDispatch.length > 0) {
                await db.dispatch_notes.bulkDelete(oldSyncedDispatch.map(n => n.LOCAL_ID));
            }

            // 3. Cleanup old synced inward
            const oldSyncedInward = await db.stock_inwards
                .where('IS_SYNCED').equals(1)
                .filter(i => dayjs(i.DATE || i.CREATED_DATE).isBefore(cutoffDate))
                .toArray();
            if (oldSyncedInward.length > 0) {
                await db.stock_inwards.bulkDelete(oldSyncedInward.map(i => i.LOCAL_ID));
            }

            // 4. Cleanup old synced returns
            const oldSyncedReturns = await db.sales_returns
                .where('IS_SYNCED').equals(1)
                .filter(r => dayjs(r.DATE || r.CREATED_DATE).isBefore(cutoffDate))
                .toArray();
            if (oldSyncedReturns.length > 0) {
                await db.sales_returns.bulkDelete(oldSyncedReturns.map(r => r.LOCAL_ID));
            }
        } catch (e) {
            console.error('Error cleaning up 30-day old synced data:', e);
        }
    }
}

const syncService = new SyncService();
export default syncService;
