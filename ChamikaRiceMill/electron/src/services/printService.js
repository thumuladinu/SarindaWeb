import dayjs from 'dayjs';
import BILL_LOGO_BASE64 from '../utils/billLogoBase64';
import db from './db';

const MILL_PHONE = '071-234 5678';
const AUTO_PRINT_KEY = 'chamika_auto_print_enabled';
const SELECTED_PRINTER_KEY = 'chamika_selected_printer';
const BILL_PRINTER_KEY = 'chamika_bill_printer';
const LABEL_PRINTER_KEY = 'chamika_label_printer';

const fmt = v => {
    const n = parseFloat(v);
    return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2 });
};
const fmtDate = d => dayjs(d).format('DD/MM/YYYY');
const fmtPrint = d => dayjs(d).format('DD/MM/YYYY HH:mm');

const F = "'Courier New', Courier, 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif";
const BDR = '1px solid #000';
const DBL = '2px solid #000';

class PrintService {
    // -------------------------------------------------------------
    // Configuration & Settings
    // -------------------------------------------------------------
    isAutoPrintEnabled() {
        try {
            return localStorage.getItem(AUTO_PRINT_KEY) === 'true';
        } catch (e) {
            return false;
        }
    }

    setAutoPrintEnabled(enabled) {
        try {
            localStorage.setItem(AUTO_PRINT_KEY, enabled ? 'true' : 'false');
        } catch (e) {
            console.error('Error saving auto print setting:', e);
        }
    }

    // Bill / Invoice Printer (A4/A5 size pages)
    getBillPrinter() {
        try {
            return localStorage.getItem(BILL_PRINTER_KEY) || localStorage.getItem(SELECTED_PRINTER_KEY) || '';
        } catch (e) {
            return '';
        }
    }

    setBillPrinter(printerName) {
        try {
            localStorage.setItem(BILL_PRINTER_KEY, printerName || '');
            localStorage.setItem(SELECTED_PRINTER_KEY, printerName || '');
        } catch (e) {
            console.error('Error saving bill printer:', e);
        }
    }

    // Barcode / Sticker Label Printer (60x40mm thermal stickers)
    getLabelPrinter() {
        try {
            return localStorage.getItem(LABEL_PRINTER_KEY) || '';
        } catch (e) {
            return '';
        }
    }

    setLabelPrinter(printerName) {
        try {
            localStorage.setItem(LABEL_PRINTER_KEY, printerName || '');
        } catch (e) {
            console.error('Error saving label printer:', e);
        }
    }

    // Backward compatibility aliases
    getSelectedPrinter() {
        return this.getBillPrinter();
    }

    setSelectedPrinter(printerName) {
        this.setBillPrinter(printerName);
    }

    async getPrinters() {
        try {
            if (window.electron && typeof window.electron.getPrinters === 'function') {
                return await window.electron.getPrinters();
            }
        } catch (e) {
            console.error('Error getting printers from Electron:', e);
        }
        return [];
    }

    // -------------------------------------------------------------
    // Print Execution Core
    // -------------------------------------------------------------
    async printHtml(htmlContent, options = {}) {
        const autoEnabled = options.forceSilent !== undefined ? options.forceSilent : this.isAutoPrintEnabled();
        const defaultPrinter = (options.isLabel || options.targetType === 'label') ? this.getLabelPrinter() : this.getBillPrinter();
        const printerName = options.printerName !== undefined ? options.printerName : defaultPrinter;

        // 1. Silent Print in Electron
        if (autoEnabled && window.electron && typeof window.electron.silentPrint === 'function') {
            try {
                console.log(`[PrintService] Sending silent print (${options.isLabel ? 'Label 60x40' : 'Bill A4/A5'}) to: "${printerName || 'System Default'}"`);
                const res = await window.electron.silentPrint(htmlContent, printerName, options);
                if (res && res.success) {
                    return { success: true, printer: res.printer, method: 'electron-silent' };
                }
                console.warn('[PrintService] Silent print failed or returned false, falling back to browser dialog:', res?.failureReason);
            } catch (e) {
                console.error('[PrintService] Silent print execution error:', e);
            }
        }

        // 2. Browser Print Dialog Fallback
        return this.browserPrintFallback(htmlContent);
    }

    browserPrintFallback(htmlContent) {
        return new Promise((resolve) => {
            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow.document;
            doc.open();

            const isFullDoc = htmlContent.trim().toLowerCase().startsWith('<!doctype') || htmlContent.trim().toLowerCase().startsWith('<html');
            if (isFullDoc) {
                doc.write(htmlContent);
            } else {
                doc.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <title>Print Document</title>
                        <style>
                            @page { margin: 5mm; size: auto; }
                            body { margin: 0; padding: 0; font-family: ${F}; color: #000; background: #fff; }
                            * { box-sizing: border-box; }
                        </style>
                    </head>
                    <body>
                        ${htmlContent}
                    </body>
                    </html>
                `);
            }
            doc.close();

            setTimeout(() => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (e) {
                    console.error('Browser print error:', e);
                } finally {
                    setTimeout(() => {
                        try { document.body.removeChild(iframe); } catch (e) {}
                        resolve({ success: true, method: 'browser-dialog' });
                    }, 1000);
                }
            }, 300);
        });
    }

    // -------------------------------------------------------------
    // Document HTML Generators
    // -------------------------------------------------------------
    generateBillHtml(bill, printedAt = new Date()) {
        if (!bill) return '';

        const millName = (typeof localStorage !== 'undefined' && localStorage.getItem('mill_name')) || 'CHAMIKA RICE MILLS';
        const millAddr = (typeof localStorage !== 'undefined' && localStorage.getItem('mill_address')) || 'Sooriyawewa';
        const millPhone = (typeof localStorage !== 'undefined' && localStorage.getItem('mill_phone')) || '071-234 5678';

        const th = (ex = '') => `border: ${BDR}; padding: 3.5px 5px; font-weight: bold; font-size: 10.5px; background: #ddd; font-family: ${F}; ${ex}`;
        const td = (ex = '') => `border: ${BDR}; padding: 3.5px 5px; font-size: 10.5px; font-family: ${F}; ${ex}`;
        const grp = (ex = '') => `border: ${BDR}; padding: 3px 5px; font-weight: bold; font-size: 10.5px; background: #bbb; font-family: ${F}; ${ex}`;
        const tdHW = (ex = '') => `border: ${BDR}; padding: 0; height: 21px; font-family: ${F}; font-size: 10.5px; ${ex}`;
        const grpHW = (ex = '') => `border: ${BDR}; padding: 3px 5px; font-weight: bold; font-size: 10.5px; background: #e4e4e4; font-family: ${F}; ${ex}`;
        const dhr = `border: none; border-top: ${DBL}; margin: 3px 0;`;
        const hr = `border: none; border-top: ${BDR}; margin: 3px 0;`;

        const items = bill.ITEMS || bill.ITEMS_JSON || [];
        const vehicleStr = bill.VEHICLE_NO || bill.LORRY_NO || '';
        const driverStr = bill.DRIVER_NAME || '';
        const isRetailSale = Boolean(bill.REMARK && bill.REMARK.toLowerCase().includes('quick pos'));

        if (isRetailSale) {
            const itemRows = items.map((item, idx) => `
                <tr>
                    <td style="${td('text-align: left;')}">${idx + 1}</td>
                    <td style="${td('text-align: left;')}"><strong>${item.ITEM_NAME || item.NAME || 'Item'}</strong></td>
                    <td style="${td('text-align: center;')}">${item.BAG_WEIGHT ? item.BAG_WEIGHT + ' kg' : '-'}</td>
                    <td style="${td('text-align: center; font-weight: bold;')}">${item.BAG_COUNT || item.QUANTITY || 0}</td>
                    <td style="${td('text-align: right;')}">${fmt(item.UNIT_PRICE)}</td>
                    <td style="${td('text-align: right; font-weight: bold;')}">${fmt(item.TOTAL_PRICE)}</td>
                </tr>
            `).join('');

            const discountRow = parseFloat(bill.DISCOUNT || 0) > 0 ? `
                <tr>
                    <td style="padding: 3px 5px; text-align: right; font-size: 10.5px;">DISCOUNT :</td>
                    <td style="padding: 3px 5px; text-align: right; font-weight: bold; font-size: 10.5px; border-bottom: ${BDR};">- ${fmt(bill.DISCOUNT)}</td>
                </tr>` : '';

            const customerNameDisplay = (bill.CUSTOMER_NAME && bill.CUSTOMER_NAME !== 'Walk-in Customer' && bill.CUSTOMER_NAME !== 'Walk-in') ? bill.CUSTOMER_NAME : '................................................';

            return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                * { box-sizing: border-box; }
                @media print {
                    @page { size: 8.5in 11in; margin: 0; }
                    html, body { margin: 0 !important; padding: 0 !important; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style></head><body>
            <div style="font-family: ${F}; font-size: 11px; line-height: 1.4; color: #000; background: #fff; width: 100%; max-width: 7.9in; margin: 0 auto; box-sizing: border-box; padding: 4mm 3mm; display: flex; flex-direction: column;">
                <div>
                    <hr style="${dhr}" />
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0;">
                        <div style="width: 60px; text-align: left; display: flex; align-items: center;">
                            <img src="${BILL_LOGO_BASE64}" style="max-height: 44px; max-width: 55px; object-fit: contain; filter: grayscale(100%) contrast(150%); -webkit-filter: grayscale(100%) contrast(150%);" alt="Logo" onerror="this.src='./bill_logo.png';" />
                        </div>
                        <div style="flex: 1; text-align: center;">
                            <div style="font-weight: bold; font-size: 16px; letter-spacing: 2px; margin: 1px 0;">${millName}</div>
                            <div style="font-size: 10.5px;">${millAddr}</div>
                            <div style="font-size: 9.5px; color: #333;">Tel: ${millPhone}</div>
                        </div>
                        <div style="width: 60px;"></div>
                    </div>
                    <div style="text-align: center; font-weight: bold; font-size: 12px; margin: 2px 0 1px;">SALES RECEIPT / INVOICE</div>
                    <hr style="${dhr}" />
                </div>
                <div style="display: flex; justify-content: space-between; margin: 5px 0;">
                    <div>
                        <div style="margin-bottom: 3px;"><strong>INVOICE NO</strong> : <strong>${bill.INVOICE_NO}</strong></div>
                        <div style="margin-bottom: 3px;"><strong>CUSTOMER</strong>&nbsp;&nbsp;&nbsp;: <strong>${customerNameDisplay}</strong></div>
                        <div style="margin-bottom: 3px;"><strong>LOCATION</strong>&nbsp;&nbsp;&nbsp;: <strong>${bill.CUSTOMER_ADDRESS || bill.LOCATION || '..................................................................'}</strong></div>
                        <div><strong>PHONE</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <strong>${bill.CUSTOMER_PHONE || '....................'}</strong></div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 8.5px; color: #555; margin-bottom: 3px;">Printed: ${fmtPrint(printedAt)}</div>
                        <div style="margin-bottom: 3px;"><strong>DATE</strong> : <strong>${fmtDate(bill.DATE)}</strong></div>
                        <div style="margin-bottom: 3px;"><strong>VEHICLE / LORRY</strong> : <strong>${vehicleStr || '....................'}</strong></div>
                        <div style="margin-bottom: 3px;"><strong>DRIVER</strong> : <strong>${driverStr || '....................'}</strong></div>
                        <div><strong>PAYMENT</strong> : <strong style="text-transform: uppercase;">${bill.PAYMENT_METHOD || 'CASH'}</strong></div>
                    </div>
                </div>
                <hr style="${hr}" />
                <table style="width: 100%; border-collapse: collapse; margin-top: 5px; margin-bottom: 10px;">
                    <thead><tr>
                        <th style="${th('text-align: left;')}">#</th>
                        <th style="${th('text-align: left;')}">PRODUCT NAME</th>
                        <th style="${th('text-align: center;')}">BAG SIZE</th>
                        <th style="${th('text-align: center;')}">QTY (BAGS)</th>
                        <th style="${th('text-align: right;')}">UNIT PRICE (RS)</th>
                        <th style="${th('text-align: right;')}">TOTAL AMOUNT (RS)</th>
                    </tr></thead>
                    <tbody>${itemRows}</tbody>
                </table>
                <div style="display: flex; justify-content: flex-end; margin-top: auto; padding-top: 8px;">
                    <table style="width: 45%; border-collapse: collapse;"><tbody>
                        <tr>
                            <td style="padding: 3px 5px; text-align: right; font-size: 10.5px;">TOTAL AMOUNT :</td>
                            <td style="padding: 3px 5px; text-align: right; font-weight: bold; font-size: 10.5px; border-bottom: ${BDR};">${fmt(bill.TOTAL_AMOUNT)}</td>
                        </tr>
                        ${discountRow}
                        <tr>
                            <td style="padding: 5px 5px; text-align: right; font-weight: bold; font-size: 12px;">NET TOTAL (RS) :</td>
                            <td style="padding: 5px 5px; text-align: right; font-weight: bold; font-size: 13px; border-bottom: ${DBL}; border-top: ${DBL};">${fmt(bill.FINAL_AMOUNT || bill.NET_AMOUNT || bill.TOTAL_AMOUNT)}</td>
                        </tr>
                    </tbody></table>
                </div>
                <hr style="${dhr}; margin-top: 15px;" />
                <div style="text-align: center; font-size: 10.5px; font-weight: bold; margin: 3px 0;">THANK YOU FOR YOUR BUSINESS!</div>
                <div style="text-align: center; font-size: 8.5px; color: #555; margin-top: 2px;">Added by: ${bill.ADDED_BY || 'System'} | Device: Desktop POS</div>
                <hr style="${dhr}" />
            </div></body></html>`;
        }

        // BULK MILL DISPATCH BILL — exact webapp layout formatted for 21.5cm x 28cm single page
        const getRiceVarietyTag = (billItems = []) => {
            for (const item of billItems) {
                const code = (item.SYSTEM_CODE || item.ITEM_CODE || item.CODE || '').toUpperCase();
                const name = (item.ITEM_NAME || item.NAME || '');
                if (code.includes('RATHU_KAKULU') || name.includes('රතු')) return 'රතු කැකුළු';
                if (code.includes('SUDU_KAKULU') || name.includes('සුදු')) return 'සුදු කැකුළු';
                if (code.includes('NADU') || name.includes('නාඩු')) return 'නාඩු';
            }
            return '';
        };

        const varietyTag = getRiceVarietyTag(items);
        const pItems = items.filter(i => {
            const code = (i.SYSTEM_CODE || i.ITEM_CODE || i.CODE || '').toUpperCase();
            return code.endsWith('_P') || code === 'P' || code.includes('SAMBA') || (i.ITEM_NAME && i.ITEM_NAME.includes('පොලිෂ්'));
        });
        const nItems = items.filter(i => {
            const code = (i.SYSTEM_CODE || i.ITEM_CODE || i.CODE || '').toUpperCase();
            return code.endsWith('_N') || code === 'N' || code.includes('NADU') || (i.ITEM_NAME && i.ITEM_NAME.includes('නිවුඩු'));
        });
        const getRow = (itemList, w) => itemList.find(i => Number(i.BAG_WEIGHT) === w) || { UNIT_PRICE: 0, BAG_COUNT: 0, TOTAL_PRICE: 0 };

        const colGrp = `<colgroup>
            <col style="width: 34%;" />
            <col style="width: 23%;" />
            <col style="width: 19%;" />
            <col style="width: 24%;" />
        </colgroup>`;

        const renderPrintedRows = (itemList) => [5, 10, 25].map(w => {
            const r = getRow(itemList, w);
            return `<tr>
                <td style="${td('padding-left: 14px;')}"><strong>${w} kg</strong></td>
                <td style="${td('text-align: center; font-weight: bold;')}">${fmt(r.UNIT_PRICE)}</td>
                <td style="${td('text-align: center; font-weight: bold;')}">${r.BAG_COUNT || 0}</td>
                <td style="${td('text-align: right; font-weight: bold;')}">${fmt(r.TOTAL_PRICE)}</td>
            </tr>`;
        }).join('');

        const renderHwRows = () => [5, 10, 25].map(w => `<tr>
            <td style="${tdHW('padding-left: 14px; vertical-align: middle;')}">${w} kg</td>
            <td style="${tdHW()}">&nbsp;</td>
            <td style="${tdHW()}">&nbsp;</td>
            <td style="${tdHW()}">&nbsp;</td>
        </tr>`).join('');

        const totalsRows = [
            { label: 'PRINTED SUB TOTAL',    val: fmt(bill.PRINTED_SUB_TOTAL ?? bill.TOTAL_AMOUNT ?? 0), bold: true,  big: false },
            { label: 'HANDWRITTEN SUB TOTAL', val: fmt(bill.HANDWRITTEN_SUB_TOTAL ?? 0), bold: false, big: false },
            { label: 'DISCOUNT',              val: fmt(bill.DISCOUNT ?? 0), bold: false, big: false },
            { label: 'FINAL AMOUNT',          val: fmt(bill.FINAL_AMOUNT ?? bill.NET_AMOUNT ?? bill.TOTAL_AMOUNT ?? 0), bold: true, big: true  },
        ].map(({ label, val, bold, big }) => `<tr>
            <td style="padding: 2px 5px; text-align: right; font-weight: ${big ? 'bold' : 'normal'}; font-size: ${big ? '11.5px' : '10px'};">${label} :</td>
            <td style="padding: 2px 6px; text-align: right; width: 28%; font-weight: ${bold || big ? 'bold' : 'normal'}; font-size: ${big ? '11.5px' : '10px'}; border-bottom: ${big ? DBL : BDR}; border-top: ${big ? DBL : 'none'};">${val}&nbsp;</td>
        </tr>`).join('');

        const customerNameDisplay = (bill.CUSTOMER_NAME && bill.CUSTOMER_NAME !== 'Walk-in Customer' && bill.CUSTOMER_NAME !== 'Walk-in') ? bill.CUSTOMER_NAME : '................................................';

        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            * { box-sizing: border-box; }
            @media print {
                @page { size: 8.5in 11in; margin: 0; }
                html, body { margin: 0 !important; padding: 0 !important; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
        </style></head><body>
        <div style="font-family: ${F}; font-size: 10.5px; line-height: 1.4; color: #000; background: #fff; width: 100%; max-width: 7.9in; margin: 0 auto; box-sizing: border-box; padding: 4mm 3mm; display: flex; flex-direction: column;">

            <div>
                <hr style="${dhr}" />
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0;">
                    <div style="width: 60px; text-align: left; display: flex; align-items: center;">
                        <img src="${BILL_LOGO_BASE64}" style="max-height: 44px; max-width: 55px; object-fit: contain; filter: grayscale(100%) contrast(150%); -webkit-filter: grayscale(100%) contrast(150%);" alt="Logo" onerror="this.src='./bill_logo.png';" />
                    </div>
                    <div style="flex: 1; text-align: center;">
                        <div style="font-weight: bold; font-size: 16px; letter-spacing: 3px; margin: 1px 0;">${millName}</div>
                        <div style="font-size: 10.5px;">${millAddr}</div>
                        <div style="font-size: 9.5px; color: #333;">Tel: ${millPhone}</div>
                    </div>
                    <div style="width: 60px;"></div>
                </div>
                <hr style="${dhr}" />
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin: 3px 0;">
                <div>
                    <div style="margin-bottom: 2px;"><strong>BILL NO</strong>&nbsp;&nbsp;&nbsp;: <strong>${bill.INVOICE_NO}</strong></div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span><strong>BATCH NO</strong> : <strong>${bill.BATCH_NO || '....................'}</strong></span>
                        ${varietyTag ? `<span style="border: ${BDR}; padding: 0px 5px; font-weight: bold; font-size: 10.5px; background: #f0f0f0;">[ ${varietyTag} ]</span>` : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 8.5px; color: #000; font-weight: bold; margin-bottom: 1px;">Billed By: ${bill.CREATED_BY_NAME || bill.ADDED_BY || 'User'} | Terminal: ${bill.DEVICE_ID || 'AX832'}</div>
                    <div style="font-size: 8px; color: #555; margin-bottom: 1px;">Printed: ${fmtPrint(printedAt)}</div>
                    <div style="margin-bottom: 2px;"><strong>DATE</strong> : <strong>${fmtDate(bill.DATE)}</strong></div>
                </div>
            </div>

            <hr style="${hr}" />

            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin: 3px 0;">
                <div>
                    <div style="margin-bottom: 2px;"><strong>CUSTOMER</strong> :&nbsp;<strong>${customerNameDisplay}</strong></div>
                    <div style="margin-bottom: 2px;"><strong>LOCATION</strong>&nbsp; :&nbsp;<strong>${bill.CUSTOMER_ADDRESS || bill.LOCATION || '..................................................................'}</strong></div>
                    <div><strong>PHONE</strong>&nbsp;&nbsp;&nbsp;&nbsp; :&nbsp;<strong>${bill.CUSTOMER_PHONE || '....................'}</strong></div>
                </div>
                <div style="text-align: right;">
                    <div style="margin-bottom: 2px;"><strong>VEHICLE / LORRY</strong> :&nbsp;<strong>${vehicleStr || '....................'}</strong></div>
                    <div><strong>DRIVER</strong> :&nbsp;<strong>${driverStr || '....................'}</strong></div>
                </div>
            </div>

            <hr style="${dhr}" />

            <div style="font-weight: bold; font-size: 10px; margin: 1.5px 0;">[ PRINTED ORDER DETAILS ]</div>
            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                ${colGrp}
                <thead><tr>
                    <th style="${th()}">ITEM</th>
                    <th style="${th('text-align: center;')}">PRICE / BAG (RS)</th>
                    <th style="${th('text-align: center;')}">QTY (BAGS)</th>
                    <th style="${th('text-align: right;')}">TOTAL (RS)</th>
                </tr></thead>
                <tbody>
                    <tr><td colspan="4" style="${grp()}">P &#8212; Polished (පොලිෂ්)</td></tr>
                    ${renderPrintedRows(pItems)}
                    <tr><td colspan="4" style="${grp()}">N &#8212; Niudu (නිවුඩු)</td></tr>
                    ${renderPrintedRows(nItems)}
                </tbody>
            </table>

            <hr style="${dhr}" />

            <div style="font-weight: bold; font-size: 10px; margin: 1.5px 0;">[ HANDWRITTEN EXTRA ORDERS &#8212; අමතර භාණ්ඩ ]</div>
            <table style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                ${colGrp}
                <thead><tr>
                    <th style="${th()}">ITEM</th>
                    <th style="${th('text-align: center;')}">PRICE / BAG (RS)</th>
                    <th style="${th('text-align: center;')}">QTY (BAGS)</th>
                    <th style="${th('text-align: right;')}">TOTAL (RS)</th>
                </tr></thead>
                <tbody>
                    <tr><td colspan="4" style="${grpHW()}">P &#8212; Polished (පොලිෂ්)</td></tr>
                    ${renderHwRows()}
                    <tr><td colspan="4" style="${grpHW()}">N &#8212; Niudu (නිවුඩු)</td></tr>
                    ${renderHwRows()}
                </tbody>
            </table>

            <hr style="${dhr}" />

            <table style="width: 100%; border-collapse: collapse; margin: 1.5px 0;"><tbody>${totalsRows}</tbody></table>

            <hr style="${dhr}" />

            <div style="font-weight: bold; font-size: 10px; margin: 1px 0;">PAYMENT DETAILS</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin: 1px 0 2px; font-size: 10.5px;">
                <div style="display: flex; gap: 48px;">
                    <div>[ &nbsp; ] &nbsp;CASH</div>
                    <div>[ &nbsp; ] &nbsp;CHEQUE</div>
                </div>
                <div>
                    <strong>Details / Cheque No :</strong> ................................................................
                </div>
            </div>

            <hr style="${dhr}" />

            <div style="margin-top: 2px;">
                <div>
                    <div style="font-weight: bold; font-size: 13.5px; margin: 1px 0 2px; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;">නීතිමය ප්‍රකාශය සහ එකඟතා කොන්දේසි</div>
                    <div style="font-size: 13px; line-height: 1.3; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;">
                        <div style="display: flex; gap: 4px; margin-bottom: 1px;">
                            <span style="min-width: 16px; font-weight: bold;">1.</span>
                            <span>ඉහත සඳහන් කළ භාණ්ඩ හොඳ තත්ත්වයෙන් සහ නිවැරදි ප්‍රමාණයෙන් මා වෙත ලැබුණු බව මෙයින් තහවුරු කරමි.</span>
                        </div>
                        <div style="display: flex; gap: 4px; margin-bottom: 1px;">
                            <span style="min-width: 16px; font-weight: bold;">2.</span>
                            <span>බිල්පතෙහි අතින් ලියා එකතු කර ඇති සියලුම අමතර භාණ්ඩ සහ මිල වෙනස්කම් මා විසින් එකඟ වූ ඒවා බව සහතික කරමි.</span>
                        </div>
                        <div style="display: flex; gap: 4px; margin-bottom: 1px;">
                            <span style="min-width: 16px; font-weight: bold;">3.</span>
                            <span>අතින් ලියන ලද අමතර එකතුව (Handwritten Sub Total) ඇතුළුව සියලුම මුදල් ක්‍ෂේත්‍ර සම්පූර්ණ කළ යුතු අතර, අමතර නොමැති නම් '0' ලෙස සටහන් කළ යුතුය.</span>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <span style="min-width: 16px; font-weight: bold;">4.</span>
                            <span>ඉහත සඳහන් කර ඇති මුළු මුදල (Final Amount), දක්වා ඇති ක්‍රමයට ගෙවීමට මෙයින් එකඟ වෙමි.</span>
                        </div>
                    </div>
                </div>
                <div style="margin-top: 4px;">
                    <hr style="${dhr}; margin-top: 3px; margin-bottom: 3px;" />
                    <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                        <div>
                            <div style="font-size: 12px; font-weight: bold; margin-bottom: 2px; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;">රියදුරු / බලයලත් අත්සන :</div>
                            <div style="border: ${DBL}; width: 85mm; height: 22mm; box-sizing: border-box; margin-top: 2px;"></div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 12px; font-weight: bold; margin-bottom: 2px; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;">පාරිභෝගිකයාගේ අත්සන සහ මුද්‍රාව :</div>
                            <div style="border: ${DBL}; width: 80mm; height: 18mm; box-sizing: border-box; margin-top: 2px;"></div>
                            <div style="font-size: 8px; margin-top: 2px; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;">(භාණ්ඩ ලැබුණු බව තහවුරු කිරීමට)</div>
                        </div>
                    </div>
                </div>
            </div>

        </div></body></html>`;
    }
    generateDispatchNoteHtml(note, linkedBills = []) {
        if (!note) return '';

        const BDR = '1px solid #000';
        const DBL = '2px solid #000';
        const HALF = '1px solid #aaa';
        const F = "'Courier New', Courier, monospace";

        const th = (ex = '') => `border: ${BDR}; padding: 4.5px 5px; font-weight: bold; font-size: 9.5px; background: #ddd; font-family: ${F}; text-align: center; line-height: 1.4; ${ex}`;
        const td = (ex = '') => `border: ${BDR}; padding: 3.5px 5px; font-size: 10px; font-family: ${F}; ${ex}`;
        const grp = (ex = '') => `border: ${BDR}; padding: 4.5px 5px; font-weight: bold; font-size: 10px; background: #bbb; font-family: ${F}; ${ex}`;

        const riceLabel = (isTop) => `border: ${BDR}; ${isTop ? `border-bottom: ${HALF};` : `border-top: ${HALF};`} padding: 3px 5px; font-size: 11px; font-weight: bold; font-family: ${F}; text-align: center; background: #f5f5f5; height: 27px;`;
        const tdTop = (ex = '') => `border: ${BDR}; border-bottom: ${HALF}; padding: 2px 4px; font-size: 10px; font-family: ${F}; height: 27px; text-align: center; ${ex}`;
        const tdBot = (ex = '') => `border: ${BDR}; border-top: ${HALF}; padding: 2px 4px; font-size: 10px; font-family: ${F}; height: 27px; text-align: center; ${ex}`;

        const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB') : '-';
        const fmt = v => { const n = parseFloat(v); return isNaN(n) || n === 0 ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2 }); };

        const isSettled = note.STATUS === 'SETTLED';

        const getItemData = (items, systemCode, weight) => {
            const defaultRet = isSettled ? { price: '0.00', bags: '0' } : { price: '', bags: '' };
            if (!items || !Array.isArray(items)) return defaultRet;

            const match = items.find(i => {
                const isSamba = systemCode === 'OUT_SAMBA' && (i.SYSTEM_CODE === 'OUT_SAMBA' || i.ITEM_NAME?.toLowerCase().includes('samba') || i.ITEM_CODE?.toLowerCase().includes('samba') || i.CODE === 'P');
                const isNadu = systemCode === 'OUT_NADU' && (i.SYSTEM_CODE === 'OUT_NADU' || i.ITEM_NAME?.toLowerCase().includes('nadu') || i.ITEM_CODE?.toLowerCase().includes('nadu') || i.CODE === 'N');
                return (isSamba || isNadu) && Number(i.BAG_WEIGHT) === weight;
            });

            if (!match) return defaultRet;
            const uPrice = parseFloat(match.UNIT_PRICE || 0);
            let bagQty = 0;
            if (match.BAG_COUNT !== null && match.BAG_COUNT !== undefined && Number(match.BAG_COUNT) >= 0) {
                bagQty = parseFloat(match.BAG_COUNT);
            } else if (match.QUANTITY) {
                bagQty = parseFloat(match.QUANTITY) / weight;
            }

            return {
                price: isSettled ? uPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : (uPrice > 0 ? uPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : ''),
                bags: isSettled ? bagQty : (bagQty > 0 ? bagQty : '')
            };
        };

        const getShortInv = (invStr) => {
            if (!invStr) return '';
            const str = String(invStr).trim();
            const parts = str.split('-');
            const last = parts[parts.length - 1] || str;
            return last.length >= 4 ? last.slice(-4) : last;
        };

        const invoiceRow = (bill) => {
            const items = bill ? (bill.ITEMS || bill.ITEMS_JSON || []) : [];
            const p5  = isSettled ? getItemData(items, 'OUT_SAMBA', 5)  : { price: '', bags: '' };
            const p10 = isSettled ? getItemData(items, 'OUT_SAMBA', 10) : { price: '', bags: '' };
            const p25 = isSettled ? getItemData(items, 'OUT_SAMBA', 25) : { price: '', bags: '' };
            const n5  = isSettled ? getItemData(items, 'OUT_NADU', 5)   : { price: '', bags: '' };
            const n10 = isSettled ? getItemData(items, 'OUT_NADU', 10)  : { price: '', bags: '' };
            const n25 = isSettled ? getItemData(items, 'OUT_NADU', 25)  : { price: '', bags: '' };

            const totalAmount = (isSettled && bill) ? (bill.FINAL_AMOUNT || bill.NET_AMOUNT || bill.TOTAL_AMOUNT) : '';

            let chequeInfo = '';
            if (isSettled && bill?.CHEQUES && bill.CHEQUES.length > 0) {
                chequeInfo = bill.CHEQUES.map(c => '#' + c.CHEQUE_NUMBER + (c.DUE_DATE ? ' (' + fmtDate(c.DUE_DATE) + ')' : '')).join(', ');
            } else if (isSettled && bill?.CHEQUES_JSON && bill.CHEQUES_JSON.length > 0) {
                chequeInfo = bill.CHEQUES_JSON.map(c => '#' + c.CHEQUE_NUMBER + (c.DUE_DATE ? ' (' + fmtDate(c.DUE_DATE) + ')' : '')).join(', ');
            }

            const payMethod = isSettled && bill ? (bill.PAYMENT_METHOD || 'CASH').toUpperCase() : '';

            const shortInv = bill ? getShortInv(bill.INVOICE_NO) : '';
            const rawCust = bill ? (bill.CUSTOMER_NAME || bill.NAME || '') : '';
            const custName = (rawCust && rawCust !== 'Walk-in Customer' && rawCust !== 'Walk-in') ? rawCust : '....................';
            const custLoc = bill ? (bill.CUSTOMER_ADDRESS || bill.LOCATION || '') : '';

            const invCellHtml = bill 
                ? `<div><b>Inv: #${shortInv}</b></div><div style="font-size: 8.5px; font-weight: bold; margin-top: 1px; color: #000;">${custName}</div>` + (custLoc ? `<div style="font-size: 8px; color: #333; margin-top: 0.5px;">${custLoc}</div>` : '') + `<div style="font-size: 7.5px; color: #666; margin-top: 2px;">Note: ..................</div>`
                : `<div style="font-size: 8.5px; color: #444;">Inv: ........</div><div style="font-size: 8px; color: #555;">Cust: ....................</div><div style="font-size: 7.5px; color: #666; margin-top: 2px;">Note: ..................</div>`;

            return `
                <tr>
                    <td rowspan="2" style="${td('vertical-align: middle; font-size: 9px; text-align: left; line-height: 1.2;')}">${invCellHtml}</td>
                    <td style="${riceLabel(true)}">P</td>
                    <td style="${tdTop('font-weight: bold;')}">${p5.price}</td>
                    <td style="${tdTop()}">${p5.bags}</td>
                    <td style="${tdTop('font-weight: bold;')}">${p10.price}</td>
                    <td style="${tdTop()}">${p10.bags}</td>
                    <td style="${tdTop('font-weight: bold;')}">${p25.price}</td>
                    <td style="${tdTop()}">${p25.bags}</td>
                    <td rowspan="2" style="${td('vertical-align: middle; text-align: right; font-weight: bold;')}">${totalAmount ? 'Rs.' + fmt(totalAmount) : ''}</td>
                    <td rowspan="2" style="${td('vertical-align: middle; text-align: center; font-size: 9px; font-weight: bold;')}">${payMethod}</td>
                    <td rowspan="2" style="${td('vertical-align: middle; font-size: 9px;')}">${chequeInfo}</td>
                </tr>
                <tr>
                    <td style="${riceLabel(false)}">N</td>
                    <td style="${tdBot('font-weight: bold;')}">${n5.price}</td>
                    <td style="${tdBot()}">${n5.bags}</td>
                    <td style="${tdBot('font-weight: bold;')}">${n10.price}</td>
                    <td style="${tdBot()}">${n10.bags}</td>
                    <td style="${tdBot('font-weight: bold;')}">${n25.price}</td>
                    <td style="${tdBot()}">${n25.bags}</td>
                </tr>
            `;
        };

        const allBills = Array.isArray(linkedBills) ? linkedBills : [];
        const pages = [];
        if (allBills.length === 0) {
            pages.push([]);
        } else {
            pages.push(allBills.slice(0, 8));
            let rem = allBills.slice(8);
            while (rem.length > 0) {
                pages.push(rem.slice(0, 9));
                rem = rem.slice(9);
            }
        }
        const totalPages = pages.length;

        let tot5kg = 0;
        let tot10kg = 0;
        let tot25kg = 0;
        let totBags = 0;
        let totAmt = 0;

        if (allBills.length > 0) {
            allBills.forEach(b => {
                const bItems = b.ITEMS || b.ITEMS_JSON || [];
                bItems.forEach(i => {
                    const w = Number(i.BAG_WEIGHT);
                    const qty = Number(i.BAG_COUNT || (i.QUANTITY ? i.QUANTITY / w : 0)) || 0;
                    if (w === 5) tot5kg += qty;
                    else if (w === 10) tot10kg += qty;
                    else if (w === 25) tot25kg += qty;
                    totBags += qty;
                });
                totAmt += parseFloat(b.FINAL_AMOUNT || b.NET_AMOUNT || b.TOTAL_AMOUNT) || 0;
            });
        }
        const grandTotal = isSettled ? totAmt : (totAmt > 0 ? totAmt : 0);

        const val5kg = (note.TOTAL_5KG !== undefined && note.TOTAL_5KG !== null && note.TOTAL_5KG !== '') ? note.TOTAL_5KG : tot5kg;
        const val10kg = (note.TOTAL_10KG !== undefined && note.TOTAL_10KG !== null && note.TOTAL_10KG !== '') ? note.TOTAL_10KG : tot10kg;
        const val25kg = (note.TOTAL_25KG !== undefined && note.TOTAL_25KG !== null && note.TOTAL_25KG !== '') ? note.TOTAL_25KG : tot25kg;
        const valBags = (note.TOTAL_BAGS !== undefined && note.TOTAL_BAGS !== null && note.TOTAL_BAGS !== '') ? note.TOTAL_BAGS : (totBags || (Number(val5kg || 0) + Number(val10kg || 0) + Number(val25kg || 0)));

        const str5kg = (val5kg !== undefined && val5kg !== null && val5kg !== '' && Number(val5kg) >= 0) ? `${val5kg} Bags` : (tot5kg > 0 ? `${tot5kg} Bags` : '............');
        const str10kg = (val10kg !== undefined && val10kg !== null && val10kg !== '' && Number(val10kg) >= 0) ? `${val10kg} Bags` : (tot10kg > 0 ? `${tot10kg} Bags` : '............');
        const str25kg = (val25kg !== undefined && val25kg !== null && val25kg !== '' && Number(val25kg) >= 0) ? `${val25kg} Bags` : (tot25kg > 0 ? `${tot25kg} Bags` : '............');
        const strBags = (valBags !== undefined && valBags !== null && valBags !== '' && Number(valBags) >= 0) ? `${valBags} Bags` : (totBags > 0 ? `${totBags} Bags` : '............');
        const strAmt = (note.TOTAL_AMOUNT || totAmt > 0) ? `Rs. ${fmt(note.TOTAL_AMOUNT || totAmt)}` : '....................';

        const printedAt = new Date();
        const printedStr = printedAt.toLocaleDateString('en-GB') + ' ' + printedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const dispatchedBy = note.CREATED_BY_NAME || note.STAFF_NAME || note.ADDED_BY || 'User';
        const device = note.DEVICE_ID || (typeof localStorage !== 'undefined' && localStorage.getItem('terminal_code')) || 'Desktop POS';
        const millName = (typeof localStorage !== 'undefined' && localStorage.getItem('mill_name')) || 'CHAMIKA RICE MILLS';
        const millAddr = (typeof localStorage !== 'undefined' && localStorage.getItem('mill_address')) || 'Sooriyawewa';
        const millPhone = (typeof localStorage !== 'undefined' && localStorage.getItem('mill_phone')) || '071-234 5678';

        const pagesHtml = pages.map((pageBills, pageIdx) => {
            const isFirstPage = pageIdx === 0;
            const isLastPage = pageIdx === totalPages - 1;
            const maxCapacity = isFirstPage ? 8 : 9;
            const blankCount = isLastPage ? Math.min(4, maxCapacity - pageBills.length) : Math.max(0, maxCapacity - pageBills.length);

            const bRows = pageBills.map(b => invoiceRow(b)).join('');
            const emptyRows = Array.from({ length: blankCount }).map(() => invoiceRow(null)).join('');

            const pageBreakStyle = isLastPage ? 'page-break-after: avoid; break-after: avoid;' : 'page-break-after: always; break-after: page;';

            return `
            <div class="dispatch-page" style="font-family: ${F}; font-size: 11px; line-height: 1.4; padding: 4mm 3mm; background: #fff; color: #000; width: 100%; max-width: 10.5in; margin: 0 auto 10px; box-sizing: border-box; display: flex; flex-direction: column; ${pageBreakStyle}">

                <!-- HEADER -->
                <div style="margin-bottom: 5px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0;">
                        <div style="width: 60px; text-align: left; display: flex; align-items: center;">
                            <img src="${BILL_LOGO_BASE64}" style="max-height: 44px; max-width: 55px; object-fit: contain; filter: grayscale(100%) contrast(150%); -webkit-filter: grayscale(100%) contrast(150%);" alt="Logo" onerror="this.src='./bill_logo.png';" />
                        </div>
                        <div style="flex: 1; text-align: center;">
                            <div style="font-size: 17px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; font-family: ${F};">${millName}</div>
                            <div style="font-size: 10.5px; font-family: ${F};">${millAddr}</div>
                            ${millPhone ? `<div style="font-size: 9.5px; color: #333; font-family: ${F};">Tel: ${millPhone}</div>` : ''}
                        </div>
                        <div style="width: 60px;"></div>
                    </div>
                    <div style="border-top: ${DBL}; border-bottom: ${DBL}; padding: 2px 0; margin-top: 4px; font-size: 11.5px; font-weight: bold; letter-spacing: 1px; font-family: ${F}; text-align: center;">
                        ${isSettled ? 'SETTLED DISPATCH SUMMARY NOTE' : 'DELIVERY DISPATCH NOTE'} ${totalPages > 1 ? `(Page ${pageIdx + 1} of ${totalPages})` : ''}
                    </div>
                </div>

                <!-- META TABLE -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 5px; border: ${BDR};">
                    <tbody>
                        <tr>
                            <td style="${td()}"><b>Dispatch No :</b> ${note.DISPATCH_NO}</td>
                            <td style="${td()}"><b>Date :</b> ${fmtDate(note.DATE)}</td>
                            <td style="${td()}"><b>Driver :</b> ${note.DRIVER_NAME || '-'}</td>
                            <td style="${td()}"><b>Lorry No :</b> ${note.LORRY_NO || '-'}</td>
                        </tr>
                        <tr>
                            <td colspan="2" style="${td()}"><b>Dispatched By :</b> ${dispatchedBy}</td>
                            <td colspan="2" style="${td()}"><b>Terminal Code :</b> ${device}</td>
                        </tr>
                    </tbody>
                </table>

                ${isFirstPage ? `
                <!-- TOTAL BAGS SUMMARY TABLE (PAGE 1 ONLY) -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px; border: ${BDR};">
                    <thead>
                        <tr style="background: #e8e8e8;">
                            <th style="${th('text-align: center; font-size: 9.5px; width: 25%;')}">TOTAL 5 KG BAGS</th>
                            <th style="${th('text-align: center; font-size: 9.5px; width: 25%;')}">TOTAL 10 KG BAGS</th>
                            <th style="${th('text-align: center; font-size: 9.5px; width: 25%;')}">TOTAL 25 KG BAGS</th>
                            <th style="${th('text-align: center; font-size: 9.5px; width: 25%;')}">TOTAL DISPATCH BAGS</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="${td('text-align: center; font-weight: bold; font-size: 11px;')}">${str5kg}</td>
                            <td style="${td('text-align: center; font-weight: bold; font-size: 11px;')}">${str10kg}</td>
                            <td style="${td('text-align: center; font-weight: bold; font-size: 11px;')}">${str25kg}</td>
                            <td style="${td('text-align: center; font-weight: bold; font-size: 12px; background: #f4f4f4;')}">${strBags}</td>
                        </tr>
                    </tbody>
                </table>
                ` : ''}

                <!-- MAIN TABLE -->
                <table style="width: 100%; border-collapse: collapse;">
                    <colgroup>
                        <col style="width: 24%;" />
                        <col style="width: 4.5%;" />
                        <col style="width: 6%;" /><col style="width: 6%;" />
                        <col style="width: 6%;" /><col style="width: 6%;" />
                        <col style="width: 6%;" /><col style="width: 6%;" />
                        <col style="width: 10%;" />
                        <col style="width: 7.5%;" />
                        <col style="width: 18%;" />
                    </colgroup>
                    <thead>
                        <tr>
                            <th style="${th('text-align: left;')}" rowspan="2">Invoice &amp; Customer Details</th>
                            <th style="${th()}" rowspan="2">Rice<br/>Type</th>
                            <th style="${th()}" colspan="2">5 kg<br/><span style="font-size: 8px; font-weight: normal;">Price / Bags</span></th>
                            <th style="${th()}" colspan="2">10 kg<br/><span style="font-size: 8px; font-weight: normal;">Price / Bags</span></th>
                            <th style="${th()}" colspan="2">25 kg<br/><span style="font-size: 8px; font-weight: normal;">Price / Bags</span></th>
                            <th style="${th()}" rowspan="2">Total<br/>(Rs)</th>
                            <th style="${th()}" rowspan="2">Cash /<br/>Cheque</th>
                            <th style="${th('text-align: left;')}" rowspan="2">Cheque No &amp; Due Date</th>
                        </tr>
                        <tr>
                            <th style="${th('font-size: 8px; background: #e8e8e8;')}">Price</th>
                            <th style="${th('font-size: 8px; background: #e8e8e8;')}">Bags</th>
                            <th style="${th('font-size: 8px; background: #e8e8e8;')}">Price</th>
                            <th style="${th('font-size: 8px; background: #e8e8e8;')}">Bags</th>
                            <th style="${th('font-size: 8px; background: #e8e8e8;')}">Price</th>
                            <th style="${th('font-size: 8px; background: #e8e8e8;')}">Bags</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${bRows}
                        ${emptyRows}
                        ${isLastPage ? `
                        <tr>
                            <td colspan="2" style="${grp('text-align: right; font-size: 10.5px;')}">DISPATCH GRAND TOTAL :</td>
                            <td style="${grp('text-align: center; font-size: 9.5px;')}"></td>
                            <td style="${grp('text-align: center; font-size: 10.5px; font-weight: bold;')}"></td>
                            <td style="${grp('text-align: center; font-size: 9.5px;')}"></td>
                            <td style="${grp('text-align: center; font-size: 10.5px; font-weight: bold;')}"></td>
                            <td style="${grp('text-align: center; font-size: 9.5px;')}"></td>
                            <td style="${grp('text-align: center; font-size: 10.5px; font-weight: bold;')}"></td>
                            <td style="${grp('text-align: right; font-size: 11px; font-weight: bold;')}"></td>
                            <td style="${grp('text-align: center; font-size: 10.5px; font-weight: bold;')}"></td>
                            <td style="${grp('text-align: left;')}"></td>
                        </tr>
                        ` : ''}
                    </tbody>
                </table>

                <!-- FOOTER -->
                <div style="margin-top: 8px; border-top: ${BDR}; padding-top: 3px; font-size: 9px; font-family: ${F}; color: #555; text-align: center;">
                    Dispatch: ${note.DISPATCH_NO} &nbsp;|&nbsp; Date: ${fmtDate(note.DATE)} &nbsp;|&nbsp; Status: ${note.STATUS} &nbsp;|&nbsp; Total Bills: ${allBills.length}
                    &nbsp;|&nbsp; Page ${pageIdx + 1} of ${totalPages} &nbsp;|&nbsp; Printed: ${printedStr}
                </div>

            </div>`;
        }).join('');

        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: #fff !important; }
            @media print {
                @page { size: 11in 8.5in; margin: 4mm; }
                body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; }
                .dispatch-page { page-break-inside: avoid; break-inside: avoid; margin-bottom: 0 !important; padding: 4mm 3mm !important; }
            }
        </style></head><body>
        ${pagesHtml}
        </body></html>`;
    }

    generateTestPrintHtml(printerName = '', type = 'A4/A5 Bill Printer') {
        const dhr = `border: none; border-top: ${DBL}; margin: 4px 0;`;
        return `
            <div style="font-family: ${F}; font-size: 11px; line-height: 1.4; padding: 6px;">
                <hr style="${dhr}" />
                <div style="text-align: center; font-weight: bold; font-size: 16px; margin: 4px 0;">
                    CHAMIKA RICE MILLS
                </div>
                <div style="text-align: center; font-size: 11px;">Desktop POS & Printing Service</div>
                <div style="text-align: center; font-size: 10px; color: #333;">Sooriyawewa | Tel: ${MILL_PHONE}</div>
                <hr style="${dhr}" />
                <div style="text-align: center; font-weight: bold; font-size: 13px; margin: 8px 0;">
                    *** TEST PRINT (${type.toUpperCase()}) ***
                </div>
                <div style="margin: 8px 0; font-size: 11px;">
                    <div><strong>Date/Time :</strong> ${fmtPrint(new Date())}</div>
                    <div><strong>Printer   :</strong> ${printerName || 'System Default'}</div>
                    <div><strong>Target    :</strong> ${type}</div>
                    <div><strong>Mode      :</strong> Auto Silent Direct Print</div>
                    <div><strong>Status    :</strong> OK / Online</div>
                </div>
                <hr style="border: none; border-top: ${BDR}; margin: 6px 0;" />
                <div style="text-align: center; font-size: 10px; margin-top: 6px;">
                    Auto-print system is ready to print sales bills and document pages!
                </div>
                <hr style="${dhr}; margin-top: 10px;" />
            </div>
        `;
    }

    generateTestLabelHtml(printerName = '') {
        return `
            <div style="font-family: sans-serif; width: 60mm; height: 40mm; box-sizing: border-box; padding: 2mm 2.5mm; border: 1.5px solid #000; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff; color: #000000;">
                <div style="border-bottom: 1.5px solid #000; padding-bottom: 1mm; margin-bottom: 1mm;">
                    <div style="font-size: 7.5px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; line-height: 1;">
                        CHAMIKA RICE MILLS
                    </div>
                    <div style="font-size: 11px; font-weight: 900; letter-spacing: 0.3px; text-transform: uppercase; margin-top: 0.8mm; line-height: 1.1;">
                        TEST BARCODE STICKER
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: baseline; font-size: 9px; font-weight: 700; margin-bottom: 1mm;">
                    <span>NET WT: <span style="font-weight: 900;">25 kg</span></span>
                    <span>MRP: <span style="font-weight: 900;">Rs. 5,200.00</span></span>
                </div>
                <div style="font-size: 7px; font-weight: 700; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 0.8mm 0; margin-bottom: 1mm; display: flex; flex-direction: column; gap: 0.4mm;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>PRINTER: <span style="font-family: monospace; font-weight: 900;">${printerName || 'DEFAULT'}</span></span>
                        <span>STATUS: <span style="font-family: monospace; font-weight: 800;">READY</span></span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="font-size: 6px; color: #555;">60x40mm THERMAL LABEL TEST</span>
                        <span>DATE: <span style="font-family: monospace; font-weight: 800;">${fmtDate(new Date())}</span></span>
                    </div>
                </div>
                <div style="text-align: center; font-size: 8px; font-family: monospace; font-weight: bold; letter-spacing: 0.5px;">
                    ||||| ||||||| ||||||| |||
                    <div style="font-size: 7.5px;">4 796225 770052</div>
                </div>
            </div>
        `;
    }

    // -------------------------------------------------------------
    // Helper Print Actions
    // -------------------------------------------------------------
    async printBill(bill, options = {}) {
        const html = this.generateBillHtml(bill);
        return await this.printHtml(html, { ...options, isLabel: false });
    }

    async printDispatchNote(note, linkedBills = [], options = {}) {
        if (!note) return { success: false };

        let bills = Array.isArray(linkedBills) && linkedBills.length > 0 ? linkedBills : [];
        if (bills.length === 0) {
            try {
                const allBills = await db.sales_bills.toArray();
                
                // Priority 1: Match by global INVOICE_NOS_JSON array
                let invNos = note.INVOICE_NOS_JSON || note.INVOICE_NOS || [];
                if (typeof invNos === 'string') {
                    try { invNos = JSON.parse(invNos); } catch(e) { invNos = invNos.split(',').map(s => s.trim()); }
                }
                if (Array.isArray(invNos) && invNos.length > 0) {
                    const cleanInvNos = invNos.map(s => String(s).trim()).filter(Boolean);
                    const matchedByInvNo = allBills.filter(b => b.INVOICE_NO && cleanInvNos.includes(String(b.INVOICE_NO).trim()));
                    if (matchedByInvNo.length > 0) {
                        bills = matchedByInvNo;
                    }
                }

                // Priority 2: Match by DISPATCH_ID column on sales_bills
                if (bills.length === 0) {
                    const noteDispatchId = note.DISPATCH_ID || note.LOCAL_ID;
                    const matchedByDispatch = allBills.filter(b => b.DISPATCH_ID && (String(b.DISPATCH_ID) === String(noteDispatchId) || String(b.DISPATCH_ID) === String(note.LOCAL_ID)));
                    if (matchedByDispatch.length > 0) {
                        bills = matchedByDispatch;
                    }
                }

                // Priority 3: Match by BILL_ID (server ID) or LOCAL_ID
                if (bills.length === 0) {
                    let ids = note.BILL_IDS_JSON || note.BILL_IDS || [];
                    if (typeof ids === 'string') {
                        try { ids = JSON.parse(ids); } catch(e) { ids = ids.split(',').map(s => s.trim()); }
                    }
                    if (Array.isArray(ids) && ids.length > 0) {
                        const numericIds = ids.map(i => Number(i)).filter(i => !isNaN(i));
                        const matchedByBillId = allBills.filter(b => b.BILL_ID && numericIds.includes(Number(b.BILL_ID)));
                        if (matchedByBillId.length > 0) {
                            bills = matchedByBillId;
                        } else {
                            bills = allBills.filter(b => b.LOCAL_ID && numericIds.includes(Number(b.LOCAL_ID)));
                        }
                    }
                }
            } catch (e) {
                console.error('Error fetching linked bills in printDispatchNote:', e);
            }
        }

        const html = this.generateDispatchNoteHtml(note, bills);
        return await this.printHtml(html, { ...options, isLabel: false, landscape: true });
    }

    async testPrintBill(printerName) {
        const targetPrinter = printerName !== undefined ? printerName : this.getBillPrinter();
        const html = this.generateTestPrintHtml(targetPrinter, 'A4/A5 Bill Printer');
        return await this.printHtml(html, { forceSilent: true, printerName: targetPrinter, isLabel: false });
    }

    async testPrintLabel(printerName) {
        const targetPrinter = printerName !== undefined ? printerName : this.getLabelPrinter();
        const html = this.generateTestLabelHtml(targetPrinter);
        return await this.printHtml(html, { forceSilent: true, printerName: targetPrinter, isLabel: true, pageSize: '60mm 40mm', margin: '0mm' });
    }

    async testPrint(printerName, targetType = 'bill') {
        if (targetType === 'label') {
            return await this.testPrintLabel(printerName);
        }
        return await this.testPrintBill(printerName);
    }
}

const printService = new PrintService();
export default printService;
