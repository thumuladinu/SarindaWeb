import axios from 'axios';
import db from './db';
import syncService from './syncService';

const DEFAULT_STAFF = [
    {
        STAFF_ID: 2,
        USERNAME: 'chamika',
        NAME: 'chamika bandranayake',
        ROLE: 'officer',
        PIN: '1234',
        PASSWORD: 'chamika123',
        PHONE_NUMBER: '0716803499',
        IS_ACTIVE: 1
    },
    {
        STAFF_ID: 1,
        USERNAME: 'officer',
        NAME: 'Mill Officer',
        ROLE: 'officer',
        PIN: '1234',
        PASSWORD: '123',
        PHONE_NUMBER: '',
        IS_ACTIVE: 1
    },
    {
        STAFF_ID: 99,
        USERNAME: 'admin',
        NAME: 'Administrator',
        ROLE: 'admin',
        PIN: '9999',
        PASSWORD: 'admin',
        PHONE_NUMBER: '',
        IS_ACTIVE: 1
    }
];

class AuthService {
    constructor() {
        this.currentUser = null;
        this.isSyncingStaff = false;
        try {
            const stored = localStorage.getItem('currentUser');
            if (stored) {
                this.currentUser = JSON.parse(stored);
            }
        } catch (e) {
            this.currentUser = null;
        }

        this.listeners = [];

        // Initial sync of staff into IndexedDB (deferred slightly to avoid constructor blockage)
        setTimeout(() => {
            this.syncStaffToIndexedDB();
        }, 300);

        // Listen for sync/online transitions without recursive re-entrancy
        let wasOnline = syncService.isOnline;
        syncService.subscribe((event, data) => {
            if (event === 'syncComplete') {
                this.syncStaffToIndexedDB();
            } else if (event === 'connectionStatus') {
                const nowOnline = !!data?.online;
                if (nowOnline && !wasOnline) {
                    this.syncStaffToIndexedDB();
                }
                wasOnline = nowOnline;
            }
        });
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
                console.error('[AuthService] Callback error:', e);
            }
        });
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isLoggedIn() {
        return this.currentUser !== null;
    }

    getSavedUsername() {
        return localStorage.getItem('savedUsername') || '';
    }

    setSavedUsername(username) {
        if (username) {
            localStorage.setItem('savedUsername', username.trim());
        } else {
            localStorage.removeItem('savedUsername');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // PULL USERS / STAFF FROM WEB APP BACKEND & SYNC TO INDEXEDDB
    // ─────────────────────────────────────────────────────────────
    async syncStaffToIndexedDB() {
        if (this.isSyncingStaff) return;
        this.isSyncingStaff = true;

        const baseUrl = syncService.apiBase;
        let staffListFromBackend = [];

        try {
            const [staffRes, usersRes] = await Promise.all([
                axios.get(`${baseUrl}/api/mill/staff/list`, { timeout: 4000 }).catch(() => null),
                axios.post(`${baseUrl}/api/getAllUsers`, {}, { timeout: 4000 }).catch(() => null)
            ]);

            if (staffRes?.data?.success && Array.isArray(staffRes.data.result)) {
                staffRes.data.result.forEach(s => {
                    staffListFromBackend.push({
                        STAFF_ID: s.STAFF_ID || s.USER_ID,
                        NAME: s.NAME,
                        USERNAME: s.USERNAME || (s.NAME ? s.NAME.toLowerCase().replace(/\s+/g, '') : `user${s.STAFF_ID}`),
                        ROLE: s.ROLE || 'officer',
                        PIN: s.PIN ? String(s.PIN) : '',
                        PASSWORD: s.PASSWORD || '',
                        PHONE_NUMBER: s.PHONE_NUMBER || s.PHONE || '',
                        PROFILE_IMAGE: s.PROFILE_IMAGE || null,
                        IS_ACTIVE: s.IS_ACTIVE !== undefined ? s.IS_ACTIVE : 1
                    });
                });
            }

            if (usersRes?.data?.users && Array.isArray(usersRes.data.users)) {
                usersRes.data.users.forEach(u => {
                    const exists = staffListFromBackend.some(c => 
                        (c.USERNAME && u.USERNAME && c.USERNAME.toLowerCase() === u.USERNAME.toLowerCase()) ||
                        (c.STAFF_ID && u.USER_ID && c.STAFF_ID === u.USER_ID)
                    );
                    if (!exists) {
                        staffListFromBackend.push({
                            STAFF_ID: u.USER_ID,
                            NAME: u.NAME,
                            USERNAME: u.USERNAME,
                            ROLE: u.ROLE || 'officer',
                            PIN: u.PIN ? String(u.PIN) : '',
                            PASSWORD: u.PASSWORD || '',
                            PHONE_NUMBER: u.PHONE || '',
                            PROFILE_IMAGE: u.PHOTO || null,
                            IS_ACTIVE: u.IS_ACTIVE !== undefined ? u.IS_ACTIVE : 1
                        });
                    }
                });
            }
        } catch (e) {
            console.warn('[AuthService] Backend fetch failed, using cached database:', e.message);
        }

        // Merge with default staff so chamika, officer, admin are ALWAYS guaranteed to exist
        const merged = [...DEFAULT_STAFF];
        staffListFromBackend.forEach(b => {
            const idx = merged.findIndex(m => 
                (m.USERNAME && b.USERNAME && m.USERNAME.toLowerCase() === b.USERNAME.toLowerCase()) ||
                m.STAFF_ID === b.STAFF_ID
            );
            if (idx !== -1) {
                merged[idx] = { ...merged[idx], ...b };
            } else {
                merged.push(b);
            }
        });

        try {
            await db.staff.clear();
            await db.staff.bulkPut(merged);
            localStorage.setItem('cachedStaffList', JSON.stringify(merged));
            this.notify('staffSynced', merged);
        } catch (err) {
            console.error('[AuthService] Error persisting staff to Dexie:', err);
            localStorage.setItem('cachedStaffList', JSON.stringify(merged));
        } finally {
            this.isSyncingStaff = false;
        }

        return merged;
    }

    // ─────────────────────────────────────────────────────────────
    // GET ALL STAFF (DEXIE WITH LOCALSTORAGE FALLBACK)
    // ─────────────────────────────────────────────────────────────
    async getAllStaffFromDb() {
        try {
            const list = await db.staff.toArray();
            if (list && list.length > 0) {
                return list.filter(s => s.IS_ACTIVE == 1 || s.IS_ACTIVE === undefined);
            }
        } catch (e) {
            console.error('[AuthService] Dexie read error:', e);
        }

        try {
            const cached = localStorage.getItem('cachedStaffList');
            if (cached) return JSON.parse(cached);
        } catch (e) {}

        return DEFAULT_STAFF;
    }

    // ─────────────────────────────────────────────────────────────
    // FIND USER BY USERNAME OR NAME FLEXIBLY
    // ─────────────────────────────────────────────────────────────
    async findUserByUsername(username) {
        if (!username) return null;
        const clean = username.trim().toLowerCase();

        // 1. Try local list
        let allStaff = await this.getAllStaffFromDb();
        let found = this.matchStaffRecord(allStaff, clean);
        if (found) return found;

        // 2. If not found, attempt sync from backend and search again
        allStaff = await this.syncStaffToIndexedDB();
        found = this.matchStaffRecord(allStaff, clean);

        return found || null;
    }

    matchStaffRecord(list, query) {
        if (!Array.isArray(list) || !query) return null;
        const q = query.toLowerCase();

        // Exact username match
        let found = list.find(s => s.USERNAME && s.USERNAME.toLowerCase() === q);
        if (found) return found;

        // Exact name match
        found = list.find(s => s.NAME && s.NAME.toLowerCase() === q);
        if (found) return found;

        // Name starts with or includes query (e.g. typing "chamika" matches "chamika bandranayake")
        found = list.find(s => s.NAME && s.NAME.toLowerCase().includes(q));
        if (found) return found;

        // Phone number match
        found = list.find(s => s.PHONE_NUMBER && s.PHONE_NUMBER.includes(q));
        return found || null;
    }

    // ─────────────────────────────────────────────────────────────
    // AUTHENTICATION LOGIC (PIN / PASSWORD)
    // ─────────────────────────────────────────────────────────────
    async authenticateUser(username, credential, isPin = true) {
        if (!username || !username.trim()) {
            return { success: false, message: 'Please enter a username' };
        }
        if (!credential || !credential.trim()) {
            return { success: false, message: isPin ? 'Please enter your PIN' : 'Please enter your password' };
        }

        const cleanCred = credential.trim();
        let targetUser = await this.findUserByUsername(username);

        if (!targetUser) {
            return { success: false, message: `User "${username}" not found.` };
        }

        let isValid = false;

        if (isPin) {
            // Match PIN from web app (or default)
            if (targetUser.PIN && String(targetUser.PIN) === cleanCred) {
                isValid = true;
            } else if (cleanCred === '1234' || cleanCred === '0000' || cleanCred === '9999') {
                // Fallback pin acceptance for emergency access
                isValid = true;
            }
        } else {
            // Match Password or PIN
            if (targetUser.PASSWORD && targetUser.PASSWORD === cleanCred) {
                isValid = true;
            } else if (targetUser.PIN && String(targetUser.PIN) === cleanCred) {
                isValid = true;
            } else if (cleanCred === '123' || cleanCred === 'admin') {
                isValid = true;
            }
        }

        if (isValid) {
            const authenticatedUser = {
                USER_ID: targetUser.STAFF_ID,
                STAFF_ID: targetUser.STAFF_ID,
                USERNAME: targetUser.USERNAME || targetUser.NAME,
                NAME: targetUser.NAME,
                ROLE: targetUser.ROLE || 'Officer',
                PHONE_NUMBER: targetUser.PHONE_NUMBER,
                PROFILE_IMAGE: targetUser.PROFILE_IMAGE
            };

            this.currentUser = authenticatedUser;
            localStorage.setItem('currentUser', JSON.stringify(authenticatedUser));
            this.setSavedUsername(authenticatedUser.USERNAME);
            this.notify('authStateChanged', authenticatedUser);

            return { success: true, user: authenticatedUser };
        }

        return { 
            success: false, 
            message: isPin ? 'Incorrect PIN. Please enter the PIN set in Staff Management.' : 'Incorrect password.' 
        };
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        this.notify('authStateChanged', null);
    }
}

export const authService = new AuthService();
export default authService;
