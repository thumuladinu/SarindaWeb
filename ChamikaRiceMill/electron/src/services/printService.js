import dayjs from 'dayjs';

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

    // Bill / Invoice Printer (A5 size pages)
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
                console.log(`[PrintService] Sending silent print (${options.isLabel ? 'Label 60x40' : 'Bill A5'}) to: "${printerName || 'System Default'}"`);
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

        const th = (ex = '') => `border: ${BDR}; padding: 4px 6px; font-weight: bold; font-size: 10.5px; background: #ddd; font-family: ${F}; ${ex}`;
        const td = (ex = '') => `border: ${BDR}; padding: 4px 6px; font-size: 10.5px; font-family: ${F}; ${ex}`;
        const grp = (ex = '') => `border: ${BDR}; padding: 3px 6px; font-weight: bold; font-size: 10.5px; background: #bbb; font-family: ${F}; ${ex}`;
        const tdHW = (ex = '') => `border: ${BDR}; padding: 0; height: 20px; font-family: ${F}; font-size: 10.5px; ${ex}`;
        const grpHW = (ex = '') => `border: ${BDR}; padding: 3px 6px; font-weight: bold; font-size: 10.5px; background: #e4e4e4; font-family: ${F}; ${ex}`;
        const dhr = `border: none; border-top: ${DBL}; margin: 3px 0;`;
        const hr = `border: none; border-top: ${BDR}; margin: 3px 0;`;

        const items = bill.ITEMS || bill.ITEMS_JSON || [];
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
                    <td style="padding: 4px 6px; text-align: right; font-size: 11px;">DISCOUNT :</td>
                    <td style="padding: 4px 6px; text-align: right; font-weight: bold; font-size: 11px; border-bottom: ${BDR};">- ${fmt(bill.DISCOUNT)}</td>
                </tr>` : '';

            return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                * { box-sizing: border-box; }
                @media print {
                    @page { size: A4 portrait; margin: 0; }
                    html, body { margin: 0 !important; padding: 0 !important; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            </style></head><body>
            <div style="font-family: ${F}; font-size: 11px; line-height: 1.4; color: #000; background: #fff; width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 10mm 12mm; margin: 0 auto; display: flex; flex-direction: column;">
                <div>
                    <hr style="${dhr}" />
                    <div style="text-align: center; font-weight: bold; font-size: 18px; letter-spacing: 2px; margin: 3px 0 1px;">CHAMIKA RICE MILLS</div>
                    <div style="text-align: center; font-size: 11px;">Sooriyawewa</div>
                    <div style="text-align: center; font-size: 10px; color: #333;">Tel: ${MILL_PHONE}</div>
                    <div style="text-align: center; font-weight: bold; font-size: 13px; margin: 4px 0 2px;">SALES RECEIPT / INVOICE</div>
                    <hr style="${dhr}" />
                </div>
                <div style="display: flex; justify-content: space-between; margin: 8px 0;">
                    <div>
                        <div style="margin-bottom: 4px;"><strong>INVOICE NO</strong> : <strong>${bill.INVOICE_NO}</strong></div>
                        <div style="margin-bottom: 4px;"><strong>CUSTOMER</strong>&nbsp;&nbsp;&nbsp;: <strong>${bill.CUSTOMER_NAME || 'Walk-in Customer'}</strong></div>
                        <div><strong>PHONE</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <strong>${bill.CUSTOMER_PHONE || '-'}</strong></div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 9px; color: #555; margin-bottom: 4px;">Printed: ${fmtPrint(printedAt)}</div>
                        <div style="margin-bottom: 4px;"><strong>DATE</strong> : <strong>${fmtDate(bill.DATE)}</strong></div>
                        <div><strong>PAYMENT</strong> : <strong style="text-transform: uppercase;">${bill.PAYMENT_METHOD || 'CASH'}</strong></div>
                    </div>
                </div>
                <hr style="${hr}" />
                <table style="width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 16px;">
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
                <div style="display: flex; justify-content: flex-end; margin-top: auto; padding-top: 12px;">
                    <table style="width: 45%; border-collapse: collapse;"><tbody>
                        <tr>
                            <td style="padding: 4px 6px; text-align: right; font-size: 11px;">TOTAL AMOUNT :</td>
                            <td style="padding: 4px 6px; text-align: right; font-weight: bold; font-size: 11px; border-bottom: ${BDR};">${fmt(bill.TOTAL_AMOUNT)}</td>
                        </tr>
                        ${discountRow}
                        <tr>
                            <td style="padding: 6px 6px; text-align: right; font-weight: bold; font-size: 13px;">NET TOTAL (RS) :</td>
                            <td style="padding: 6px 6px; text-align: right; font-weight: bold; font-size: 14px; border-bottom: ${DBL}; border-top: ${DBL};">${fmt(bill.FINAL_AMOUNT || bill.NET_AMOUNT || bill.TOTAL_AMOUNT)}</td>
                        </tr>
                    </tbody></table>
                </div>
                <hr style="${dhr}; margin-top: 20px;" />
                <div style="text-align: center; font-size: 11px; font-weight: bold; margin: 4px 0;">THANK YOU FOR YOUR BUSINESS!</div>
                <div style="text-align: center; font-size: 9px; color: #555; margin-top: 2px;">Added by: ${bill.ADDED_BY || 'System'} | Device: Desktop POS</div>
                <hr style="${dhr}" />
            </div></body></html>`;
        }

        // BULK MILL DISPATCH BILL — exact webapp layout
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
                <td style="${td('padding-left: 16px;')}"><strong>${w} kg</strong></td>
                <td style="${td('text-align: center; font-weight: bold;')}">${fmt(r.UNIT_PRICE)}</td>
                <td style="${td('text-align: center; font-weight: bold;')}">${r.BAG_COUNT || 0}</td>
                <td style="${td('text-align: right; font-weight: bold;')}">${fmt(r.TOTAL_PRICE)}</td>
            </tr>`;
        }).join('');

        const renderHwRows = () => [5, 10, 25].map(w => `<tr>
            <td style="${tdHW('padding-left: 16px; vertical-align: middle;')}">${w} kg</td>
            <td style="${tdHW()}">&nbsp;</td>
            <td style="${tdHW()}">&nbsp;</td>
            <td style="${tdHW()}">&nbsp;</td>
        </tr>`).join('');

        const totalsRows = [
            { label: 'PRINTED SUB TOTAL',    val: fmt(bill.PRINTED_SUB_TOTAL || bill.TOTAL_AMOUNT), bold: true,  big: false },
            { label: 'HANDWRITTEN SUB TOTAL', val: bill.IS_SETTLED ? fmt(bill.HANDWRITTEN_SUB_TOTAL) : '', bold: false, big: false },
            { label: 'DISCOUNT',              val: bill.IS_SETTLED ? fmt(bill.DISCOUNT) : '', bold: false, big: false },
            { label: 'FINAL AMOUNT',          val: bill.IS_SETTLED ? fmt(bill.FINAL_AMOUNT) : '', bold: true, big: true  },
        ].map(({ label, val, bold, big }) => `<tr>
            <td style="padding: 3px 6px; text-align: right; font-weight: ${big ? 'bold' : 'normal'}; font-size: ${big ? '12px' : '10.5px'};">${label} :</td>
            <td style="padding: 3px 8px; text-align: right; width: 28%; font-weight: ${bold || big ? 'bold' : 'normal'}; font-size: ${big ? '12px' : '10.5px'}; border-bottom: ${big ? DBL : BDR}; border-top: ${big ? DBL : 'none'};">${val}&nbsp;</td>
        </tr>`).join('');

        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            * { box-sizing: border-box; }
            @media print {
                @page { size: A4 portrait; margin: 0; }
                html, body { margin: 0 !important; padding: 0 !important; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
        </style></head><body>
        <div style="font-family: ${F}; font-size: 10.5px; line-height: 1.4; color: #000; background: #fff; width: 210mm; height: 297mm; box-sizing: border-box; padding: 8mm 10mm; margin: 0 auto; display: flex; flex-direction: column; overflow: hidden;">

            <div>
                <hr style="${dhr}" />
                <div style="text-align: center; font-weight: bold; font-size: 15px; letter-spacing: 3px; margin: 3px 0 1px;">CHAMIKA RICE MILLS</div>
                <div style="text-align: center; font-size: 11px;">Sooriyawewa</div>
                <div style="text-align: center; font-size: 10px; color: #333;">Tel: ${MILL_PHONE}</div>
                <hr style="${dhr}" />
            </div>

            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin: 4px 0;">
                <div>
                    <div style="margin-bottom: 3px;"><strong>BILL NO</strong>&nbsp;&nbsp;&nbsp;: <strong>${bill.INVOICE_NO}</strong></div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span><strong>BATCH NO</strong> : <strong>${bill.BATCH_NO || '....................'}</strong></span>
                        ${varietyTag ? `<span style="border: ${BDR}; padding: 1px 6px; font-weight: bold; font-size: 11px; background: #f0f0f0;">[ ${varietyTag} ]</span>` : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 9px; color: #000; font-weight: bold; margin-bottom: 2px;">Billed By: ${bill.CREATED_BY_NAME || bill.ADDED_BY || 'User'} | Terminal: ${bill.DEVICE_ID || 'AX832'}</div>
                    <div style="font-size: 8px; color: #555; margin-bottom: 2px;">Printed: ${fmtPrint(printedAt)}</div>
                    <div><strong>DATE</strong> : <strong>${fmtDate(bill.DATE)}</strong></div>
                </div>
            </div>

            <hr style="${hr}" />

            <div style="margin: 4px 0;">
                <div style="margin-bottom: 3px;"><strong>CUSTOMER</strong> :&nbsp;<strong>${bill.CUSTOMER_NAME || '..................................................................'}</strong></div>
                <div style="margin-bottom: 3px;"><strong>LOCATION</strong>&nbsp; :&nbsp;<strong>${bill.CUSTOMER_ADDRESS || '..................................................................'}</strong></div>
                <div><strong>PHONE</strong>&nbsp;&nbsp;&nbsp;&nbsp; :&nbsp;<strong>${bill.CUSTOMER_PHONE || '....................'}</strong></div>
            </div>

            <hr style="${dhr}" />

            <div style="font-weight: bold; font-size: 10.5px; margin: 2px 0;">[ PRINTED ORDER DETAILS ]</div>
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

            <div style="font-weight: bold; font-size: 10.5px; margin: 2px 0;">[ HANDWRITTEN EXTRA ORDERS &#8212; අමතර භාණ්ඩ ]</div>
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

            <table style="width: 100%; border-collapse: collapse; margin: 2px 0;"><tbody>${totalsRows}</tbody></table>

            <hr style="${dhr}" />

            <div style="font-weight: bold; font-size: 10.5px; margin: 2px 0 3px;">PAYMENT DETAILS</div>
            <div style="display: flex; gap: 48px; margin: 2px 0 4px; font-size: 11px;">
                <div>[ &nbsp; ] &nbsp;CASH</div>
                <div>[ &nbsp; ] &nbsp;CHEQUE</div>
            </div>

            <hr style="${dhr}" />

            <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <div style="font-weight: bold; font-size: 10px; margin: 2px 0 3px; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;">නීතිමය ප්‍රකාශය සහ එකඟතා කොන්දේසි</div>
                    <div style="font-size: 11px; line-height: 2.0; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;">
                        <div style="display: flex; gap: 4px; margin-bottom: 3px;">
                            <span style="min-width: 14px; font-weight: bold;">1.</span>
                            <span>ඉහත සඳහන් කළ භාණ්ඩ හොඳ තත්ත්වයෙන් සහ නිවැරදි ප්‍රමාණයෙන් මා වෙත ලැබුණු බව මෙයින් තහවුරු කරමි.</span>
                        </div>
                        <div style="display: flex; gap: 4px; margin-bottom: 3px;">
                            <span style="min-width: 14px; font-weight: bold;">2.</span>
                            <span>බිල්පතෙහි අතින් ලියා එකතු කර ඇති සියලුම අමතර භාණ්ඩ සහ මිල වෙනස්කම් මා විසින් එකඟ වූ ඒවා බව සහතික කරමි.</span>
                        </div>
                        <div style="display: flex; gap: 4px; margin-bottom: 3px;">
                            <span style="min-width: 14px; font-weight: bold;">3.</span>
                            <span>අතින් ලියන ලද අමතර එකතුව (Handwritten Sub Total) ඇතුළුව සියලුම මුදල් ක්‍ෂේත්‍ර සම්පූර්ණ කළ යුතු අතර, අමතර නොමැති නම් '0' ලෙස සටහන් කළ යුතුය.</span>
                        </div>
                        <div style="display: flex; gap: 4px;">
                            <span style="min-width: 14px; font-weight: bold;">4.</span>
                            <span>ඉහත සඳහන් කර ඇති මුළු මුදල (Final Amount), දක්වා ඇති ක්‍රමයට ගෙවීමට මෙයින් එකඟ වෙමි.</span>
                        </div>
                    </div>
                </div>
                <div>
                    <hr style="${dhr}; margin-top: 8px;" />
                    <div style="display: flex; justify-content: space-between; margin-top: 6px;">
                        <div>
                            <div style="font-size: 14px; font-weight: bold; margin-bottom: 4px; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;">රියදුරු / බලයලත් අත්සන :</div>
                            <div style="border: ${DBL}; width: 80mm; height: 24mm; box-sizing: border-box; margin-top: 4px;"></div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 14px; font-weight: bold; margin-bottom: 4px; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;">පාරිභෝගිකයාගේ අත්සන සහ මුද්‍රාව :</div>
                            <div style="border: ${DBL}; width: 80mm; height: 24mm; box-sizing: border-box; margin-top: 4px;"></div>
                            <div style="font-size: 8px; margin-top: 3px; font-family: 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;">(භාණ්ඩ ලැබුණු බව තහවුරු කිරීමට)</div>
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

        const th = (ex = '') => `border: ${BDR}; padding: 3px 4px; font-weight: bold; font-size: 9.5px; background: #ddd; font-family: ${F}; text-align: center; line-height: 1.3; ${ex}`;
        const td = (ex = '') => `border: ${BDR}; padding: 2px 4px; font-size: 10px; font-family: ${F}; ${ex}`;
        const grp = (ex = '') => `border: ${BDR}; padding: 3px 4px; font-weight: bold; font-size: 10px; background: #bbb; font-family: ${F}; ${ex}`;

        const riceLabel = (isTop) => `border: ${BDR}; ${isTop ? `border-bottom: ${HALF};` : `border-top: ${HALF};`} padding: 2px 4px; font-size: 11px; font-weight: bold; font-family: ${F}; text-align: center; background: #f5f5f5;`;
        const tdTop = (ex = '') => `border: ${BDR}; border-bottom: ${HALF}; padding: 1px 3px; font-size: 10px; font-family: ${F}; height: 18px; text-align: center; ${ex}`;
        const tdBot = (ex = '') => `border: ${BDR}; border-top: ${HALF}; padding: 1px 3px; font-size: 10px; font-family: ${F}; height: 18px; text-align: center; ${ex}`;

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

            return `
                <tr>
                    <td rowspan="2" style="${td('vertical-align: middle; font-weight: bold; font-size: 9.5px; text-align: left;')}">${bill ? bill.INVOICE_NO : ''}</td>
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

        const billRowsHtml = linkedBills.map(b => invoiceRow(b)).join('');
        const blankRows = [1, 2, 3, 4, 5].map(() => invoiceRow(null)).join('');

        const grandTotal = isSettled ? linkedBills.reduce((sum, b) => sum + (parseFloat(b.FINAL_AMOUNT || b.NET_AMOUNT || b.TOTAL_AMOUNT) || 0), 0) : 0;

        const printedAt = new Date();
        const printedStr = printedAt.toLocaleDateString('en-GB') + ' ' + printedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const dispatchedBy = note.CREATED_BY_NAME || note.STAFF_NAME || note.ADDED_BY || 'User';
        const device = note.DEVICE_ID || 'AX832';

        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; background: #fff !important; }
            @media print {
                @page { size: A4 portrait; margin: 8mm 6mm; }
                body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; }
            }
        </style></head><body>
        <div style="font-family: ${F}; font-size: 11px; padding: 8mm 6mm; background: #fff; color: #000;">

            <div style="text-align: center; margin-bottom: 5px;">
                <div style="font-size: 17px; font-weight: bold; letter-spacing: 2px; text-transform: uppercase; font-family: ${F};">CHAMIKA RICE MILLS</div>
                <div style="font-size: 10.5px; font-family: ${F};">Sooriyawewa</div>
                <div style="border-top: ${DBL}; border-bottom: ${DBL}; padding: 2px 0; margin-top: 4px; font-size: 11.5px; font-weight: bold; letter-spacing: 1px; font-family: ${F};">
                    ${isSettled ? 'SETTLED DISPATCH SUMMARY NOTE' : 'DELIVERY DISPATCH NOTE'}
                </div>
            </div>

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

            <table style="width: 100%; border-collapse: collapse;">
                <colgroup>
                    <col style="width: 11%;" />
                    <col style="width: 5%;" />
                    <col style="width: 6%;" /><col style="width: 6%;" />
                    <col style="width: 6%;" /><col style="width: 6%;" />
                    <col style="width: 6%;" /><col style="width: 6%;" />
                    <col style="width: 10%;" />
                    <col style="width: 8%;" />
                    <col style="width: 30%;" />
                </colgroup>
                <thead>
                    <tr>
                        <th style="${th('text-align: left;')}" rowspan="2">Invoice No</th>
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
                    ${billRowsHtml}
                    ${blankRows}
                    <tr>
                        <td colspan="8" style="${grp('text-align: right; font-size: 11px;')}">DISPATCH GRAND TOTAL :</td>
                        <td style="${grp('text-align: right; font-size: 11px;')}">Rs. ${fmt(grandTotal)}</td>
                        <td style="${grp()}"></td>
                        <td style="${grp('text-align: left;')}"></td>
                    </tr>
                </tbody>
            </table>

            <div style="margin-top: 8px; border-top: ${BDR}; padding-top: 3px; font-size: 9px; font-family: ${F}; color: #555; text-align: center;">
                Dispatch: ${note.DISPATCH_NO} &nbsp;|&nbsp; Date: ${fmtDate(note.DATE)} &nbsp;|&nbsp; Status: ${note.STATUS} &nbsp;|&nbsp; Total Bills: ${linkedBills.length}
                &nbsp;|&nbsp; Printed: ${printedStr}
            </div>

        </div></body></html>`;
    }

    generateTestPrintHtml(printerName = '', type = 'A5 Bill Printer') {
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
        const html = this.generateDispatchNoteHtml(note, linkedBills);
        return await this.printHtml(html, { ...options, isLabel: false });
    }

    async testPrintBill(printerName) {
        const targetPrinter = printerName !== undefined ? printerName : this.getBillPrinter();
        const html = this.generateTestPrintHtml(targetPrinter, 'A5 Bill Printer');
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
