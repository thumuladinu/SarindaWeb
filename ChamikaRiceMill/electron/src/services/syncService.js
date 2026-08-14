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
            });

            this.socket.on('reconnect', () => {
                console.log('[SyncService] Mill Electron Socket Reconnected!');
                sendRegister();
            });

            if (this.socket.connected) {
                sendRegister();
            }
        } catch (e) {
            console.warn('[SyncService] Socket init error:', e);
        }
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
                if (bill.IS_SETTLED_UPDATE) {
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

                    if (res.data.success) {
                        await db.sales_bills.update(bill.LOCAL_ID, {
                            IS_SETTLED: 1,
                            IS_SETTLED_UPDATE: false,
                            IS_SYNCED: 1
                        });
                    }
                } else {
                    // Push New Sale
                    const res = await axios.post(`${baseUrl}/api/mill/sales/add`, {
                        CUSTOMER_ID: bill.CUSTOMER_ID || null,
                        BATCH_NO: bill.BATCH_NO,
                        DATE: dayjs(bill.DATE).format('YYYY-MM-DD'),
                        TOTAL_AMOUNT: bill.TOTAL_AMOUNT,
                        PRINTED_SUB_TOTAL: bill.PRINTED_SUB_TOTAL || bill.TOTAL_AMOUNT,
                        NET_AMOUNT: bill.NET_AMOUNT || bill.TOTAL_AMOUNT,
                        FINAL_AMOUNT: bill.FINAL_AMOUNT || bill.TOTAL_AMOUNT,
                        DISCOUNT: bill.DISCOUNT || 0,
                        PAYMENT_METHOD: bill.PAYMENT_METHOD || 'cash',
                        IS_SETTLED: bill.IS_SETTLED || 0,
                        REMARK: bill.REMARK || null,
                        DEVICE_ID: bill.DEVICE_ID || getTerminalDeviceCode(),
                        CREATED_BY_NAME: bill.CREATED_BY_NAME || bill.ADDED_BY || getCurrentUserName(),
                        ITEMS: bill.ITEMS_JSON || bill.ITEMS || []
                    }, { timeout: 8000 });

                    if (res.data.success) {
                        await db.sales_bills.update(bill.LOCAL_ID, {
                            BILL_ID: res.data.billId,
                            INVOICE_NO: res.data.invoiceNo || bill.INVOICE_NO,
                            IS_SYNCED: 1
                        });
                    }
                }
            } catch (err) {
                console.error(`Failed to push sale #${bill.INVOICE_NO || bill.LOCAL_ID}:`, err.message);
            }
        }
    }

    async pushPendingDispatch(baseUrl = this.apiBase) {
        const pending = await db.dispatch_notes.where('IS_SYNCED').equals(0).toArray();
        for (const note of pending) {
            try {
                const billIds = note.BILL_IDS_JSON || [];
                const res = await axios.post(`${baseUrl}/api/mill/dispatch/create`, {
                    BILL_IDS: billIds,
                    DATE: dayjs(note.DATE).format('YYYY-MM-DD'),
                    DRIVER_NAME: note.DRIVER_NAME || 'Main Driver',
                    LORRY_NO: note.LORRY_NO || note.VEHICLE_NO || 'Mill Lorry',
                    STAFF_NAME: note.STAFF_NAME || 'Officer',
                    DEVICE_ID: note.DEVICE_ID || getTerminalDeviceCode(),
                    CREATED_BY: note.ADDED_BY || note.CREATED_BY_NAME || getCurrentUserName(),
                    CREATED_BY_NAME: note.CREATED_BY_NAME || note.ADDED_BY || getCurrentUserName()
                }, { timeout: 8000 });

                if (res.data.success) {
                    await db.dispatch_notes.update(note.LOCAL_ID, {
                        DISPATCH_ID: res.data.dispatchId,
                        DISPATCH_NO: res.data.dispatchNo,
                        IS_SYNCED: 1
                    });
                }
            } catch (err) {
                console.error(`Failed to push dispatch note #${note.LOCAL_ID}:`, err.message);
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
                    DATE: dayjs(inward.DATE).format('YYYY-MM-DD HH:mm:ss'),
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
                await db.customers.bulkPut(custRes.data.result.map(c => ({
                    ...c,
                    PHONE: c.PHONE_NUMBER || c.PHONE
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
                    const existing = await db.sales_bills.where('BILL_ID').equals(bill.BILL_ID).first();
                    if (existing) {
                        await db.sales_bills.update(existing.LOCAL_ID, {
                            ...bill,
                            IS_SYNCED: 1
                        });
                    } else {
                        await db.sales_bills.add({
                            ...bill,
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
                    const existing = await db.dispatch_notes.where('DISPATCH_ID').equals(note.DISPATCH_ID).first();
                    if (existing) {
                        await db.dispatch_notes.update(existing.LOCAL_ID, {
                            ...note,
                            IS_SYNCED: 1
                        });
                    } else {
                        await db.dispatch_notes.add({
                            ...note,
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
                    const existing = await db.stock_inwards.where('INWARD_ID').equals(inward.INWARD_ID).first();
                    if (existing) {
                        await db.stock_inwards.update(existing.LOCAL_ID, {
                            ...inward,
                            IS_SYNCED: 1
                        });
                    } else {
                        await db.stock_inwards.add({
                            ...inward,
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
                    const existing = await db.sales_returns.where('RETURN_ID').equals(ret.RETURN_ID).first();
                    if (existing) {
                        await db.sales_returns.update(existing.LOCAL_ID, {
                            ...ret,
                            IS_SYNCED: 1
                        });
                    } else {
                        await db.sales_returns.add({
                            ...ret,
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
                        DATE: exp.DATE ? dayjs(exp.DATE).format('YYYY-MM-DD HH:mm:ss') : dayjs().format('YYYY-MM-DD HH:mm:ss'),
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
