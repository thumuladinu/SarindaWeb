const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    onUpdateAvailable: (callback) => ipcRenderer.on('update_available', callback),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', callback),
    restartApp: () => ipcRenderer.send('restart_app'),
    getPrinters: () => ipcRenderer.invoke('get-printers'),
    silentPrint: (htmlContent, printerName, options) => ipcRenderer.invoke('silent-print', htmlContent, printerName, options),
});

