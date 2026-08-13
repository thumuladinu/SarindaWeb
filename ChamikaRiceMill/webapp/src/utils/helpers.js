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
    return dayjs.utc(utcDate).tz(SL_TIMEZONE).format('YYYY-MM-DD HH:mm:ss');
};

export const toSLDate = (utcDate) => {
    if (!utcDate) return '';
    return dayjs.utc(utcDate).tz(SL_TIMEZONE).format('YYYY-MM-DD');
};

export const toSLTimeShort = (utcDate) => {
    if (!utcDate) return '';
    return dayjs.utc(utcDate).tz(SL_TIMEZONE).format('MMM DD, HH:mm');
};

export const toSLDateDisplay = (utcDate) => {
    if (!utcDate) return '';
    return dayjs.utc(utcDate).tz(SL_TIMEZONE).format('MMM DD, YYYY');
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
