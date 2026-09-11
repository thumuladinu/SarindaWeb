const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    initAutoUpdates: () => ipcRenderer.invoke('init-auto-updates'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    onCheckingForUpdate: (callback) => ipcRenderer.on('checking_for_update', (event, ...args) => callback(event, ...args)),
    onUpdateAvailable: (callback) => ipcRenderer.on('update_available', (event, ...args) => callback(event, ...args)),
    onUpdateNotAvailable: (callback) => ipcRenderer.on('update_not_available', (event, ...args) => callback(event, ...args)),
    onDownloadProgress: (callback) => ipcRenderer.on('download_progress', (event, ...args) => callback(event, ...args)),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', (event, ...args) => callback(event, ...args)),
    onUpdateError: (callback) => ipcRenderer.on('update_error', (event, ...args) => callback(event, ...args)),
    restartApp: () => ipcRenderer.send('restart_app'),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    silentPrint: (htmlContent, printerName, options) => ipcRenderer.invoke('silent-print', htmlContent, printerName, options),
});

