const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Check if running in dev mode
const isDev = process.env.NODE_ENV === 'development';
const distIndexPath = path.join(__dirname, 'dist', 'index.html');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false, // Don't show until ready-to-show
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

    // Enable Right-Click Context Menu with Inspect Element & DevTools
    mainWindow.webContents.on('context-menu', (e, props) => {
        const { x, y } = props;
        Menu.buildFromTemplate([
            {
                label: 'Inspect Element',
                click: () => {
                    mainWindow.webContents.inspectElement(x, y);
                }
            },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
            { type: 'separator' },
            {
                label: 'Toggle Developer Tools',
                click: () => {
                    mainWindow.webContents.toggleDevTools();
                }
            },
            {
                label: 'Reload Application',
                click: () => {
                    mainWindow.webContents.reload();
                }
            }
        ]).popup(mainWindow);
    });

    // Always enable DevTools shortcut (Cmd+Option+I / F12) and auto-open in dev mode
    mainWindow.webContents.openDevTools();

    // Load the app: preference to built dist/index.html unless explicitly in NODE_ENV=development without built files
    if (isDev && !fs.existsSync(distIndexPath)) {
        mainWindow.loadURL('http://localhost:5181');
    } else if (fs.existsSync(distIndexPath)) {
        mainWindow.loadFile(distIndexPath);
    } else {
        mainWindow.loadURL('http://localhost:5181');
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.maximize();
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Check for updates
    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify();
    }
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
        const pageSizeCss = isLabel ? '60mm 40mm' : (options.pageSize || 'auto');
        const marginCss = isLabel ? '0mm' : (options.margin || '4mm');

        const fullHtml = `
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
                console.log('[Electron] Silent printing to printer:', deviceName || 'System Default', '| isLabel:', isLabel);

                const printSettings = {
                    silent: true,
                    printBackground: true,
                    deviceName: deviceName,
                    color: true,
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

// Auto-updater events
autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update_available');
});
autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update_downloaded');
});
ipcMain.on('restart_app', () => {
    autoUpdater.quitAndInstall();
});

