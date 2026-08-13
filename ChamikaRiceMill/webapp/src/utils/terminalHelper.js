// terminalHelper.js - Unique 5-Character Terminal Device Code Generator & User Helper

export function getTerminalDeviceCode() {
    try {
        let code = localStorage.getItem('terminal_device_code');
        if (!code) {
            code = 'WEB';
            localStorage.setItem('terminal_device_code', code);
        }
        return code;
    } catch (e) {
        return 'WEB';
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
