import React, { useState, useEffect } from 'react';
import { Modal, Button, message } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatSLDateTime } from '../../utils/terminalHelper';
import db from '../../services/db';
import printService from '../../services/printService';
import BILL_LOGO_BASE64 from '../../utils/billLogoBase64';

// Exactly mirrors webapp's PrintableDispatchNote layout
export default function PrintableDispatchNote({ visible, onClose, note, linkedBills = [] }) {
    const [billsList, setBillsList] = useState(linkedBills || []);
    const [millName, setMillName] = useState('CHAMIKA RICE MILLS');
    const [millAddr, setMillAddr] = useState('Sooriyawewa');
    const [millPhone, setMillPhone] = useState('071-234 5678');

    useEffect(() => {
        const name = localStorage.getItem('mill_name') || 'CHAMIKA RICE MILLS';
        const addr = localStorage.getItem('mill_address') || 'Sooriyawewa';
        const phone = localStorage.getItem('mill_phone') || '071-234 5678';
        setMillName(name);
        setMillAddr(addr);
        setMillPhone(phone);
    }, []);

    useEffect(() => {
        if (visible && note) {
            db.sales_bills.toArray().then(allBills => {
                let matched = [];

                // Priority 1: Match by global INVOICE_NOS_JSON array
                let invNos = note.INVOICE_NOS_JSON || note.INVOICE_NOS || [];
                if (typeof invNos === 'string') {
                    try { invNos = JSON.parse(invNos); } catch(e) { invNos = invNos.split(',').map(s => s.trim()); }
                }
                if (Array.isArray(invNos) && invNos.length > 0) {
                    const cleanInvNos = invNos.map(s => String(s).trim()).filter(Boolean);
                    matched = allBills.filter(b => b.INVOICE_NO && cleanInvNos.includes(String(b.INVOICE_NO).trim()));
                }

                // Priority 2: Match by DISPATCH_ID
                if (matched.length === 0) {
                    const noteDispatchId = note.DISPATCH_ID || note.LOCAL_ID;
                    matched = allBills.filter(b => b.DISPATCH_ID && (String(b.DISPATCH_ID) === String(noteDispatchId) || String(b.DISPATCH_ID) === String(note.LOCAL_ID)));
                }

                // Priority 3: Match by BILL_ID or LOCAL_ID
                if (matched.length === 0) {
                    let ids = note.BILL_IDS_JSON || note.BILL_IDS || [];
                    if (typeof ids === 'string') {
                        try { ids = JSON.parse(ids); } catch(e) { ids = ids.split(',').map(s => s.trim()); }
                    }
                    if (Array.isArray(ids) && ids.length > 0) {
                        const numericIds = ids.map(i => Number(i)).filter(i => !isNaN(i));
                        const matchedByBillId = allBills.filter(b => b.BILL_ID && numericIds.includes(Number(b.BILL_ID)));
                        if (matchedByBillId.length > 0) {
                            matched = matchedByBillId;
                        } else {
                            matched = allBills.filter(b => b.LOCAL_ID && numericIds.includes(Number(b.LOCAL_ID)));
                        }
                    }
                }
                setBillsList(matched.length > 0 ? matched : (linkedBills || []));
            }).catch(() => {
                setBillsList(linkedBills || []);
            });
        }
    }, [visible, note, linkedBills]);

    if (!visible || !note) return null;

    const F   = "'Courier New', Courier, monospace";
    const BDR = '1px solid #000';
    const DBL = '2px solid #000';
    const HALF = '1px solid #aaa';

    const th = (ex = {}) => ({ border: BDR, padding: '4.5px 5px', fontWeight: 'bold', fontSize: '9.5px', background: '#ddd', fontFamily: F, textAlign: 'center', lineHeight: '1.4', ...ex });
    const td = (ex = {}) => ({ border: BDR, padding: '3.5px 5px', fontSize: '10px', fontFamily: F, ...ex });
    const grp = (ex = {}) => ({ border: BDR, padding: '4.5px 5px', fontWeight: 'bold', fontSize: '10px', background: '#bbb', fontFamily: F, ...ex });

    const riceLabel = (isTop) => ({
        border: BDR,
        borderBottom: isTop ? HALF : BDR,
        borderTop: isTop ? BDR : HALF,
        padding: '3px 5px',
        fontSize: '11px',
        fontWeight: 'bold',
        fontFamily: F,
        textAlign: 'center',
        background: '#f5f5f5',
        height: '27px'
    });

    const tdTop = (ex = {}) => ({ border: BDR, borderBottom: HALF, padding: '2px 4px', fontSize: '10px', fontFamily: F, height: '27px', textAlign: 'center', ...ex });
    const tdBot = (ex = {}) => ({ border: BDR, borderTop: HALF, padding: '2px 4px', fontSize: '10px', fontFamily: F, height: '27px', textAlign: 'center', ...ex });

    const fmtDate = d => d ? formatSLDateTime(d, note).dateStr : '-';
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

    const invoiceRow = (bill, key) => {
        const billItems = bill ? (bill.ITEMS || bill.ITEMS_JSON || []) : [];
        const p5  = isSettled ? getItemData(billItems, 'OUT_SAMBA', 5)  : { price: '', bags: '' };
        const p10 = isSettled ? getItemData(billItems, 'OUT_SAMBA', 10) : { price: '', bags: '' };
        const p25 = isSettled ? getItemData(billItems, 'OUT_SAMBA', 25) : { price: '', bags: '' };
        const n5  = isSettled ? getItemData(billItems, 'OUT_NADU', 5)   : { price: '', bags: '' };
        const n10 = isSettled ? getItemData(billItems, 'OUT_NADU', 10)  : { price: '', bags: '' };
        const n25 = isSettled ? getItemData(billItems, 'OUT_NADU', 25)  : { price: '', bags: '' };

        const totalAmount = (isSettled && bill) ? (bill.FINAL_AMOUNT || bill.NET_AMOUNT || bill.TOTAL_AMOUNT) : '';

        let chequeInfo = '';
        const cheques = bill?.CHEQUES || bill?.CHEQUES_JSON || [];
        if (isSettled && cheques.length > 0) {
            chequeInfo = cheques.map(c => `#${c.CHEQUE_NUMBER}${c.DUE_DATE ? ` (${fmtDate(c.DUE_DATE)})` : ''}`).join(', ');
        }

        const payMethod = isSettled && bill ? (bill.PAYMENT_METHOD || 'CASH').toUpperCase() : '';

        const shortInv = bill ? getShortInv(bill.INVOICE_NO) : '';
        const rawCust = bill ? (bill.CUSTOMER_NAME || bill.NAME || '') : '';
        const custName = (rawCust && rawCust !== 'Walk-in Customer' && rawCust !== 'Walk-in') ? rawCust : '....................';
        const custLoc = bill ? (bill.CUSTOMER_ADDRESS || bill.LOCATION || '') : '';

        return (
            <React.Fragment key={key}>
                <tr>
                    <td rowSpan={2} style={td({ verticalAlign: 'middle', fontSize: '9px', textAlign: 'left', lineHeight: '1.2' })}>
                        {bill ? (
                            <div>
                                <div><b>Inv: #{shortInv}</b></div>
                                <div style={{ fontSize: '8.5px', fontWeight: 'bold', marginTop: '1px', color: '#000' }}>{custName}</div>
                                {custLoc && <div style={{ fontSize: '8px', color: '#333', marginTop: '0.5px' }}>{custLoc}</div>}
                                <div style={{ fontSize: '7.5px', color: '#666', marginTop: '2px' }}>Note: ..................</div>
                            </div>
                        ) : (
                            <div>
                                <div style={{ fontSize: '8.5px', color: '#444' }}>Inv: ........</div>
                                <div style={{ fontSize: '8px', color: '#555' }}>Cust: ....................</div>
                                <div style={{ fontSize: '7.5px', color: '#666', marginTop: '2px' }}>Note: ..................</div>
                            </div>
                        )}
                    </td>
                    <td style={riceLabel(true)}>P</td>
                    <td style={tdTop({ fontWeight: 'bold' })}>{p5.price}</td>
                    <td style={tdTop()}>{p5.bags}</td>
                    <td style={tdTop({ fontWeight: 'bold' })}>{p10.price}</td>
                    <td style={tdTop()}>{p10.bags}</td>
                    <td style={tdTop({ fontWeight: 'bold' })}>{p25.price}</td>
                    <td style={tdTop()}>{p25.bags}</td>
                    <td rowSpan={2} style={td({ verticalAlign: 'middle', textAlign: 'right', fontWeight: 'bold' })}>{totalAmount ? `Rs.${fmt(totalAmount)}` : ''}</td>
                    <td rowSpan={2} style={td({ verticalAlign: 'middle', textAlign: 'center', fontSize: '9px', fontWeight: 'bold' })}>{payMethod}</td>
                    <td rowSpan={2} style={td({ verticalAlign: 'middle', fontSize: '9px' })}>{chequeInfo}</td>
                </tr>
                <tr>
                    <td style={riceLabel(false)}>N</td>
                    <td style={tdBot({ fontWeight: 'bold' })}>{n5.price}</td>
                    <td style={tdBot()}>{n5.bags}</td>
                    <td style={tdBot({ fontWeight: 'bold' })}>{n10.price}</td>
                    <td style={tdBot()}>{n10.bags}</td>
                    <td style={tdBot({ fontWeight: 'bold' })}>{n25.price}</td>
                    <td style={tdBot()}>{n25.bags}</td>
                </tr>
            </React.Fragment>
        );
    };

    const allBillsList = billsList.length > 0 ? billsList : linkedBills;
    const pages = [];
    if (allBillsList.length === 0) {
        pages.push([]);
    } else {
        pages.push(allBillsList.slice(0, 8));
        let rem = allBillsList.slice(8);
        while (rem.length > 0) {
            pages.push(rem.slice(0, 9));
            rem = rem.slice(9);
        }
    }
    const totalPages = pages.length;

    let tot5kg = 0, tot10kg = 0, tot25kg = 0, totBags = 0, totAmt = 0;
    if (Array.isArray(allBillsList) && allBillsList.length > 0) {
        allBillsList.forEach(b => {
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

    const addedBy = note.ADDED_BY || (() => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}')?.USERNAME || 'System'; } catch(e) { return 'System'; } })();
    const device = note.DEVICE_ID || 'Desktop POS';

    return (
        <div style={{ background: '#fff', color: '#000', width: '100%', maxWidth: '10.5in', margin: '0 auto' }}>
            <style>{`
                * { box-sizing: border-box; }
                html, body { margin: 0; padding: 0; background: #fff !important; }
                @media print {
                    @page { size: 11in 8.5in; margin: 4mm; }
                    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; }
                    .dispatch-preview-page { page-break-inside: avoid; break-inside: avoid; margin-bottom: 0 !important; padding: 4mm 3mm !important; }
                }
            `}</style>

            {pages.map((pageBills, pageIdx) => {
                const isFirstPage = pageIdx === 0;
                const isLastPage = pageIdx === totalPages - 1;
                const maxCapacity = isFirstPage ? 8 : 9;
                const blankCount = isLastPage ? Math.min(4, maxCapacity - pageBills.length) : Math.max(0, maxCapacity - pageBills.length);

                return (
                    <div key={`page-${pageIdx}`} className="dispatch-preview-page" style={{ fontFamily: F, fontSize: '11px', padding: '4mm 3mm', background: '#fff', color: '#000', marginBottom: isLastPage ? '0' : '20px', pageBreakAfter: isLastPage ? 'avoid' : 'always', breakAfter: isLastPage ? 'avoid' : 'page' }}>

                        {/* HEADER */}
                        <div style={{ marginBottom: '5px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 0' }}>
                                <div style={{ width: '60px', textAlign: 'left', display: 'flex', alignItems: 'center' }}>
                                    <img src={BILL_LOGO_BASE64} style={{ maxHeight: '44px', maxWidth: '55px', objectFit: 'contain', filter: 'grayscale(100%) contrast(150%)', WebkitFilter: 'grayscale(100%) contrast(150%)' }} alt="Logo" onError={e => { e.target.src = './bill_logo.png'; }} />
                                </div>
                                <div style={{ flex: 1, textAlign: 'center' }}>
                                    <div style={{ fontSize: '17px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: F }}>{millName}</div>
                                    <div style={{ fontSize: '10.5px', fontFamily: F }}>{millAddr}</div>
                                    {millPhone && <div style={{ fontSize: '9.5px', color: '#333', fontFamily: F }}>Tel: {millPhone}</div>}
                                </div>
                                <div style={{ width: '60px' }}></div>
                            </div>
                            <div style={{ borderTop: DBL, borderBottom: DBL, padding: '2px 0', marginTop: '4px', fontSize: '11.5px', fontWeight: 'bold', letterSpacing: '1px', fontFamily: F, textAlign: 'center' }}>
                                {isSettled ? 'SETTLED DISPATCH SUMMARY NOTE' : 'DELIVERY DISPATCH NOTE'} {totalPages > 1 ? `(Page ${pageIdx + 1} of ${totalPages})` : ''}
                            </div>
                        </div>

                        {/* META */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px', border: BDR }}>
                            <tbody><tr>
                                <td style={td()}><span style={{ fontWeight: 'bold' }}>Dispatch No:</span> {note.DISPATCH_NO}</td>
                                <td style={td()}><span style={{ fontWeight: 'bold' }}>Date:</span> {fmtDate(note.DATE)}</td>
                                <td style={td()}><span style={{ fontWeight: 'bold' }}>Lorry No:</span> {note.LORRY_NO || note.VEHICLE_NO || '................'}</td>
                                <td style={td()}><span style={{ fontWeight: 'bold' }}>Driver:</span> {note.DRIVER_NAME || '................'}</td>
                            </tr></tbody>
                        </table>

                        {/* SUMMARY TOTALS TABLE (PAGE 1 ONLY) */}
                        {isFirstPage && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px', border: BDR }}>
                                <thead>
                                    <tr style={{ background: '#e8e8e8' }}>
                                        <th style={th({ textAlign: 'center', fontSize: '9.5px', width: '25%' })}>TOTAL 5 KG BAGS</th>
                                        <th style={th({ textAlign: 'center', fontSize: '9.5px', width: '25%' })}>TOTAL 10 KG BAGS</th>
                                        <th style={th({ textAlign: 'center', fontSize: '9.5px', width: '25%' })}>TOTAL 25 KG BAGS</th>
                                        <th style={th({ textAlign: 'center', fontSize: '9.5px', width: '25%' })}>TOTAL DISPATCH BAGS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={td({ textAlign: 'center', fontWeight: 'bold', fontSize: '11px' })}>{str5kg}</td>
                                        <td style={td({ textAlign: 'center', fontWeight: 'bold', fontSize: '11px' })}>{str10kg}</td>
                                        <td style={td({ textAlign: 'center', fontWeight: 'bold', fontSize: '11px' })}>{str25kg}</td>
                                        <td style={td({ textAlign: 'center', fontWeight: 'bold', fontSize: '12px', background: '#f4f4f4' })}>{strBags}</td>
                                    </tr>
                                </tbody>
                            </table>
                        )}

                        {/* MAIN TABLE */}
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <colgroup>
                                <col style={{ width: '24%' }} />
                                <col style={{ width: '4.5%' }} />
                                <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                                <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                                <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                                <col style={{ width: '10%' }} />
                                <col style={{ width: '7.5%' }} />
                                <col style={{ width: '18%' }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th style={th({ textAlign: 'left' })} rowSpan={2}>Invoice &amp; Customer Details</th>
                                    <th style={th()} rowSpan={2}>Rice<br/>Type</th>
                                    <th style={th()} colSpan={2}>5 kg<br/><span style={{ fontSize: '8px', fontWeight: 'normal' }}>Price / Bags</span></th>
                                    <th style={th()} colSpan={2}>10 kg<br/><span style={{ fontSize: '8px', fontWeight: 'normal' }}>Price / Bags</span></th>
                                    <th style={th()} colSpan={2}>25 kg<br/><span style={{ fontSize: '8px', fontWeight: 'normal' }}>Price / Bags</span></th>
                                    <th style={th()} rowSpan={2}>Total<br/>(Rs)</th>
                                    <th style={th()} rowSpan={2}>Cash /<br/>Cheque</th>
                                    <th style={th({ textAlign: 'left' })} rowSpan={2}>Cheque No &amp; Due Date</th>
                                </tr>
                                <tr>
                                    <th style={th({ fontSize: '8px', background: '#e8e8e8' })}>Price</th>
                                    <th style={th({ fontSize: '8px', background: '#e8e8e8' })}>Bags</th>
                                    <th style={th({ fontSize: '8px', background: '#e8e8e8' })}>Price</th>
                                    <th style={th({ fontSize: '8px', background: '#e8e8e8' })}>Bags</th>
                                    <th style={th({ fontSize: '8px', background: '#e8e8e8' })}>Price</th>
                                    <th style={th({ fontSize: '8px', background: '#e8e8e8' })}>Bags</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pageBills.map((bill) => invoiceRow(bill, `bill-${bill.LOCAL_ID || bill.BILL_ID}`))}
                                {Array.from({ length: blankCount }).map((_, i) => invoiceRow(null, `blank-p${pageIdx}-${i}`))}
                                {isLastPage && (
                                    <tr>
                                        <td colSpan={2} style={grp({ textAlign: 'right', fontSize: '10.5px' })}>DISPATCH GRAND TOTAL :</td>
                                        <td style={grp({ textAlign: 'center', fontSize: '9.5px' })}></td>
                                        <td style={grp({ textAlign: 'center', fontSize: '10.5px', fontWeight: 'bold' })}></td>
                                        <td style={grp({ textAlign: 'center', fontSize: '9.5px' })}></td>
                                        <td style={grp({ textAlign: 'center', fontSize: '10.5px', fontWeight: 'bold' })}></td>
                                        <td style={grp({ textAlign: 'center', fontSize: '9.5px' })}></td>
                                        <td style={grp({ textAlign: 'center', fontSize: '10.5px', fontWeight: 'bold' })}></td>
                                        <td style={grp({ textAlign: 'right', fontSize: '11px', fontWeight: 'bold' })}></td>
                                        <td style={grp({ textAlign: 'center', fontSize: '10.5px', fontWeight: 'bold' })}></td>
                                        <td style={grp({ textAlign: 'left' })}></td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* FOOTER */}
                        <div style={{ marginTop: '8px', borderTop: BDR, paddingTop: '3px', fontSize: '9px', fontFamily: F, color: '#555', textAlign: 'center' }}>
                            Dispatch: {note.DISPATCH_NO} &nbsp;|&nbsp; Date: {fmtDate(note.DATE)} &nbsp;|&nbsp; Status: {note.STATUS} &nbsp;|&nbsp; Total Bills: {allBillsList.length}
                            &nbsp;|&nbsp; Page {pageIdx + 1} of {totalPages} &nbsp;|&nbsp; Printed: {dayjs().format('DD/MM/YYYY HH:mm')}
                            <br />
                            Added by: {addedBy} | Device: {device}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
