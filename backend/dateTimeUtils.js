/**
 * Centralized utility for Sri Lankan Time (+05:30) handling.
 * Used for report boundaries and display conversions.
 */

const ASIA_COLOMBO = 'Asia/Colombo';

/**
 * Returns current Date object in Asia/Colombo.
 */
function getSLNow() {
    const now = new Date();
    // Use Intl.DateTimeFormat to get SL time string then parse it back if 
    // we need a "fake local" Date object, or just return the adjusted string.
    return new Date(now.toLocaleString('en-US', { timeZone: ASIA_COLOMBO }));
}

/**
 * Formats a date into YYYY-MM-DD HH:mm:ss in Sri Lankan Time.
 * Useful for MySQL queries and boundaries.
 */
function toSLMySQLDateTime(date = new Date()) {
    try {
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return null;

        return d.toLocaleString('sv-SE', {
            timeZone: ASIA_COLOMBO,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).replace('T', ' ');
    } catch (error) {
        console.error('[dateTimeUtils] toSLMySQLDateTime error:', error);
        return null;
    }
}

/**
 * Returns the end of today (23:59:59) in Sri Lankan Time as a MySQL string.
 */
function getSLTodayEndBoundary() {
    const now = getSLNow();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day} 23:59:59`;
}

module.exports = {
    getSLNow,
    toSLMySQLDateTime,
    getSLTodayEndBoundary
};
