// Timezone utility — All data stored in UTC, all UI displays in SL time (Asia/Colombo, UTC+5:30)
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const SL_TIMEZONE = 'Asia/Colombo';

// Convert UTC date to SL display string
export const toSLTime = (utcDate) => {
    if (!utcDate) return '';
    const str = String(utcDate).trim();
    if (str.endsWith('Z') || str.endsWith('z')) {
        return dayjs(str).add(5, 'hour').add(30, 'minute').format('YYYY-MM-DD HH:mm:ss');
    }
    return dayjs(str).format('YYYY-MM-DD HH:mm:ss');
};

export const toSLDate = (utcDate) => {
    if (!utcDate) return '';
    const str = String(utcDate).trim();
    if (str.endsWith('Z') || str.endsWith('z')) {
        return dayjs(str).add(5, 'hour').add(30, 'minute').format('YYYY-MM-DD');
    }
    return dayjs(str).format('YYYY-MM-DD');
};

export const toSLTimeShort = (utcDate) => {
    if (!utcDate) return '';
    const str = String(utcDate).trim();
    if (str.endsWith('Z') || str.endsWith('z')) {
        return dayjs(str).add(5, 'hour').add(30, 'minute').format('MMM DD, HH:mm');
    }
    return dayjs(str).format('MMM DD, HH:mm');
};

export const toSLDateDisplay = (utcDate) => {
    if (!utcDate) return '';
    const str = String(utcDate).trim();
    if (str.endsWith('Z') || str.endsWith('z')) {
        return dayjs(str).add(5, 'hour').add(30, 'minute').format('MMM DD, YYYY');
    }
    return dayjs(str).format('MMM DD, YYYY');
};

export const formatSLDateTime = (rawDate, record = {}) => {
    let dateVal = rawDate;
    if (!dateVal || (typeof dateVal === 'string' && dateVal.length <= 10)) {
        dateVal = record?.CREATED_DATE || record?.CREATED_AT || record?.TIMESTAMP || record?.DATE || rawDate;
    }

    const addedBy = record?.ADDED_BY || record?.CREATED_BY_NAME || record?.ADDED_BY_NAME || record?.CASHIER_NAME || record?.USER_NAME || record?.RECEIVED_BY || record?.STAFF_NAME;

    if (!dateVal) return { dateStr: '-', timeStr: '-', addedBy };

    let d;
    if (typeof dateVal === 'string') {
        const str = dateVal.trim();
        // Add 5:30 ONLY if string explicitly ends with 'Z' or 'z' (UTC string from server)
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

    // Fallback: If time was 00:00:00 (e.g. date-only string) AND record has CREATED_AT/CREATED_DATE with actual time
    if (d.hour() === 0 && d.minute() === 0 && d.second() === 0) {
        const alt = record?.CREATED_DATE || record?.CREATED_AT || record?.TIMESTAMP;
        if (alt && alt !== dateVal) {
            const altStr = typeof alt === 'string' ? alt.trim() : '';
            let altD = (altStr.endsWith('Z') || altStr.endsWith('z'))
                ? dayjs(altStr).add(5, 'hour').add(30, 'minute')
                : dayjs(altStr);
            if (altD.isValid() && (altD.hour() !== 0 || altD.minute() !== 0)) {
                d = altD;
            }
        }
    }

    const dateStr = d.isValid() ? d.format('YYYY-MM-DD') : '-';
    const isDateOnly = (typeof rawDate === 'string' && rawDate.length <= 10) && (d.hour() === 0 && d.minute() === 0 && d.second() === 0);
    const timeStr = d.isValid() && !isDateOnly ? d.format('hh:mm A') : '-';

    return { dateStr, timeStr, addedBy };
};

// Get current date in SL timezone (for default form values)
export const getSLToday = () => {
    return dayjs().tz(SL_TIMEZONE).format('YYYY-MM-DD');
};

export const getSLNow = () => {
    return dayjs().tz(SL_TIMEZONE);
};

// Convert SL local input to UTC for storage
export const toUTC = (slDate) => {
    if (!slDate) return null;
    return dayjs.tz(slDate, SL_TIMEZONE).utc().format('YYYY-MM-DD HH:mm:ss');
};

export const toUTCDate = (slDate) => {
    if (!slDate) return null;
    return dayjs.tz(slDate, SL_TIMEZONE).utc().format('YYYY-MM-DD');
};

// Format number with commas
export const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatWeight = (num) => {
    if (num === null || num === undefined) return '0';
    return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
};

export const formatCurrency = (num) => {
    if (num === null || num === undefined) return 'Rs. 0.00';
    return 'Rs. ' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Role checking utilities — supports comma-separated multi-role (e.g., "user,mill")
export const getUserRoles = (roleString) => {
    if (!roleString) return [];
    return roleString.toLowerCase().split(',').map(r => r.trim()).filter(Boolean);
};

export const hasRole = (roleString, targetRole) => {
    return getUserRoles(roleString).includes(targetRole.toLowerCase());
};

export const hasAnyRole = (roleString, targetRoles) => {
    const roles = getUserRoles(roleString);
    return targetRoles.some(t => roles.includes(t.toLowerCase()));
};

// Check if user can modify (add/edit/delete) — monitor cannot
export const canModify = (roleString) => {
    return hasAnyRole(roleString, ['dev', 'admin', 'mill']);
};

export default dayjs;
