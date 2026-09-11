const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Check if running in dev mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const distIndexPath = path.join(__dirname, 'dist', 'index.html');

let mainWindow;

// Configure auto-updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.autoRunAppAfterInstall = true;

try {
    autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'thumuladinu',
        repo: 'chamika-mill-releases',
    });
} catch (e) {
    console.warn('[AutoUpdater] Failed to set feed URL:', e.message);
}

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
    mainWindow?.webContents.send('checking_for_update');
});
autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info?.version);
    mainWindow?.webContents.send('update_available', info);
});
autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] App is up to date:', info?.version);
    mainWindow?.webContents.send('update_not_available', info);
});
autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Download progress: ${Math.round(progress?.percent || 0)}%`);
    mainWindow?.webContents.send('download_progress', progress);
});
autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded, ready to install');
    mainWindow?.webContents.send('update_downloaded', info);
});
autoUpdater.on('error', (error) => {
    console.error('[AutoUpdater] Error:', error?.message || error);
    mainWindow?.webContents.send('update_error', error?.message || String(error));
});

function checkForUpdates() {
    if (isDev) {
        console.log('[AutoUpdater] Skipping update check in dev mode');
        mainWindow?.webContents.send('update_not_available', { version: app.getVersion(), isDev: true });
        return;
    }
    try {
        console.log('[AutoUpdater] Executing checkForUpdatesAndNotify...');
        mainWindow?.webContents.send('checking_for_update');
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            console.log('[AutoUpdater] Update check failed:', err.message);
            mainWindow?.webContents.send('update_error', err.message);
        });
    } catch (error) {
        console.error('[AutoUpdater] Error checking for updates:', error);
        mainWindow?.webContents.send('update_error', error?.message || String(error));
    }
}

// IPC handler to manually trigger auto-update check from renderer
ipcMain.handle('init-auto-updates', () => {
    if (!isDev) {
        console.log('[AutoUpdater] Initializing auto-update check from IPC renderer...');
        checkForUpdates();
        return true;
    }
    return false;
});

ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall(false, true);
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false, // Don't show until ready-to-show
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'public', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.cjs'),
        },
    });

    // Handle load failures gracefully (e.g. dev server off -> fallback to dist/index.html)
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.warn(`[Electron] Failed to load URL ${validatedURL} (${errorCode}: ${errorDescription})`);
        if (validatedURL.includes('localhost:5181') && fs.existsSync(distIndexPath)) {
            console.log('[Electron] Falling back to built dist/index.html...');
            mainWindow.loadFile(distIndexPath);
        }
    });

    // Right-Click Context Menu for basic editing only (No Inspect Element / DevTools)
    mainWindow.webContents.on('context-menu', (e, props) => {
        Menu.buildFromTemplate([
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' }
        ]).popup(mainWindow);
    });

    // Load the app: preference to built dist/index.html unless explicitly in NODE_ENV=development without built files
    if (process.env.NODE_ENV === 'development' && !fs.existsSync(distIndexPath)) {
        mainWindow.loadURL('http://localhost:5181');
    } else if (fs.existsSync(distIndexPath)) {
        mainWindow.loadFile(distIndexPath);
    } else {
        mainWindow.loadURL('http://localhost:5181');
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
        
        // Trigger update check when window is visible
        if (!isDev) {
            setTimeout(() => {
                checkForUpdates();
            }, 2000);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Get available printers
ipcMain.handle('get-printers', async () => {
    try {
        if (!mainWindow) return [];
        const printers = await mainWindow.webContents.getPrintersAsync();
        return printers.map(p => ({
            name: p.name,
            displayName: p.displayName || p.name,
            description: p.description || '',
            status: p.status,
            isDefault: p.isDefault
        }));
    } catch (err) {
        console.error('[Electron] Error getting printers:', err);
        return [];
    }
});

// Silent print handler without prompt/dialog
ipcMain.handle('silent-print', async (event, htmlContent, printerName, options = {}) => {
    return new Promise((resolve) => {
        const printWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            }
        });

        const isLabel = Boolean(options.isLabel || options.pageSize === '60mm 40mm');
        const pageSizeCss = isLabel ? '60mm 40mm' : (options.pageSize || (options.landscape ? '11in 8.5in' : 'auto'));
        const marginCss = isLabel ? '0mm' : (options.margin || '4mm');

        const isFullDoc = htmlContent.trim().toLowerCase().startsWith('<!doctype') || htmlContent.trim().toLowerCase().startsWith('<html');
        const fullHtml = isFullDoc ? htmlContent : `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Print Document</title>
                <style>
                    @page {
                        margin: ${marginCss};
                        size: ${pageSizeCss};
                    }
                    html, body {
                        margin: 0;
                        padding: 0;
                        font-family: 'Courier New', Courier, monospace, sans-serif;
                        color: #000;
                        background: #fff;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        ${isLabel ? 'width: 60mm; height: 40mm; overflow: hidden;' : ''}
                    }
                    * {
                        box-sizing: border-box;
                    }
                </style>
            </head>
            <body>
                ${htmlContent}
            </body>
            </html>
        `;

        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);

        let hasPrinted = false;

        printWindow.webContents.on('did-finish-load', async () => {
            if (hasPrinted) return;
            hasPrinted = true;

            try {
                const printers = await printWindow.webContents.getPrintersAsync();
                let targetPrinter = null;
                if (printerName && printerName !== 'default' && printerName !== '') {
                    targetPrinter = printers.find(p => p.name === printerName || p.displayName === printerName);
                }
                if (!targetPrinter) {
                    targetPrinter = printers.find(p => p.isDefault) || printers[0];
                }

                const deviceName = targetPrinter ? targetPrinter.name : '';
                console.log('[Electron] Silent printing to printer:', deviceName || 'System Default', '| isLabel:', isLabel, '| landscape:', Boolean(options.landscape));

                const printSettings = {
                    silent: true,
                    printBackground: true,
                    deviceName: deviceName,
                    color: true,
                    landscape: Boolean(options.landscape),
                    margins: { marginType: isLabel ? 'none' : (options.marginType || 'printableArea') }
                };

                if (isLabel) {
                    printSettings.pageSize = { width: 60000, height: 40000 };
                }

                printWindow.webContents.print(printSettings, (success, failureReason) => {
                    try { printWindow.close(); } catch (e) {}
                    console.log('[Electron] Silent print result:', success, failureReason);
                    resolve({ success, failureReason, printer: deviceName });
                });
            } catch (e) {
                console.error('[Electron] Silent print error:', e);
                try { printWindow.close(); } catch (err) {}
                resolve({ success: false, failureReason: e.message });
            }
        });
    });
});



