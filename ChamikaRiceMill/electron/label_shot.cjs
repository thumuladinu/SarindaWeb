const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const HTML_PATH = 'file://' + path.resolve('/tmp/label_test.html');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { offscreen: false } });
  await win.loadURL(HTML_PATH);
  await new Promise(r => setTimeout(r, 1500));

  // Screen preview screenshot
  const img = await win.webContents.capturePage();
  fs.writeFileSync('/tmp/label_screen.png', img.toPNG());

  // Print to PDF with @media print honoring (uses @page CSS from the page)
  const pdf = await win.webContents.printToPDF({
    printBackground: true,
  });
  fs.writeFileSync('/tmp/label_print.pdf', pdf);

  console.log('done');
  app.quit();
});
