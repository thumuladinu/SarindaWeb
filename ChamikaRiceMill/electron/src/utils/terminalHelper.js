import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import db from '../services/db';

dayjs.extend(utc);
dayjs.extend(timezone);

const SL_TIMEZONE = 'Asia/Colombo';

let cachedTerminalCode = null;

export async function initTerminalDeviceCode() {
    try {
        if (cachedTerminalCode && cachedTerminalCode.length === 5 && cachedTerminalCode !== 'MILL-POS' && cachedTerminalCode !== 'POS') {
            return cachedTerminalCode;
        }

        // 1. Try reading from IndexedDB settings table
        let record = await db.settings.get('terminal_device_code');
        if (record && record.value && record.value.length === 5 && record.value !== 'MILL-POS' && record.value !== 'POS') {
            cachedTerminalCode = record.value;
            localStorage.setItem('terminal_device_code', record.value);
            return record.value;
        }

        // 2. Try reading from localStorage
        let code = localStorage.getItem('terminal_device_code');
        if (code && code !== 'POS' && code !== 'MILL-POS' && code.length === 5) {
            cachedTerminalCode = code;
            await db.settings.put({ key: 'terminal_device_code', value: code });
            return code;
        }

        // 3. Generate permanent random 5-character code once
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let randomCode = '';
        for (let i = 0; i < 5; i++) {
            randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        cachedTerminalCode = randomCode;
        localStorage.setItem('terminal_device_code', randomCode);
        await db.settings.put({ key: 'terminal_device_code', value: randomCode });
        return randomCode;
    } catch (e) {
        console.error('[TerminalHelper] Error initializing device code:', e);
        if (!cachedTerminalCode) {
            cachedTerminalCode = localStorage.getItem('terminal_device_code') || 'C9Q62';
        }
        return cachedTerminalCode;
    }
}

// Pre-trigger async initialization
initTerminalDeviceCode().catch(() => {});

export function getTerminalDeviceCode() {
    if (cachedTerminalCode && cachedTerminalCode.length === 5 && cachedTerminalCode !== 'MILL-POS') {
        return cachedTerminalCode;
    }

    try {
        let code = localStorage.getItem('terminal_device_code');
        if (!code || code === 'POS' || code === 'MILL-POS' || code.length !== 5) {
            initTerminalDeviceCode().catch(() => {});
            return cachedTerminalCode || 'C9Q62';
        }
        cachedTerminalCode = code;
        return code;
    } catch (e) {
        return cachedTerminalCode || 'C9Q62';
    }
}

export function getCurrentUserName() {
    try {
        const stored = localStorage.getItem('currentUser') || localStorage.getItem('millUser');
        if (stored) {
            const parsed = JSON.parse(stored);
            return parsed.NAME || parsed.USERNAME || parsed.NAME_EN || 'User';
        }
    } catch (e) {}
    return 'User';
}

export function formatSLDateTime(rawDate, record = {}) {
    let dateVal = rawDate;
    if (!dateVal || (typeof dateVal === 'string' && dateVal.length <= 10)) {
        dateVal = record?.CREATED_DATE || record?.CREATED_AT || record?.TIMESTAMP || record?.DATE || rawDate;
    }

    const addedBy = record?.ADDED_BY || record?.CREATED_BY_NAME || record?.ADDED_BY_NAME || record?.CASHIER_NAME || record?.USER_NAME || record?.RECEIVED_BY || record?.STAFF_NAME;

    if (!dateVal) return { dateStr: '-', timeStr: '-', addedBy };

    let d;
    if (typeof dateVal === 'string') {
        const str = dateVal.trim();
        if (str.endsWith('Z') || str.endsWith('z')) {
            d = dayjs(str).add(5, 'hour').add(30, 'minute');
        } else {
            d = dayjs(str);
        }
    } else {
        d = dayjs(dateVal);
    }

    if (!d.isValid()) {
        d = dayjs();
    }

    return {
        dateStr: d.format('YYYY-MM-DD'),
        timeStr: d.format('hh:mm A'),
        addedBy
    };
}
