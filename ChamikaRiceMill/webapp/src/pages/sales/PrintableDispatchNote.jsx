import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

export default function PrintableDispatchNote() {
    const { id } = useParams();
    const [note, setNote] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { fetchDispatchNote(); }, [id]);

    const fetchDispatchNote = async () => {
        try {
            const res = await axios.get(`/api/mill/dispatch/${id}`, { withCredentials: true });
            if (res.data.success) {
                setNote(res.data.result);
                setTimeout(() => window.print(), 800);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    if (loading) return <div style={{ fontFamily: 'Courier New', padding: 40, background: '#fff', minHeight: '100vh' }}>Loading Dispatch Note...</div>;
    if (!note)   return <div style={{ fontFamily: 'Courier New', padding: 40, background: '#fff', minHeight: '100vh' }}>Dispatch Note Not Found</div>;

    const F   = "'Courier New', Courier, monospace";
    const BDR = '1px solid #000';
    const DBL = '2px solid #000';
    const HALF = '1px solid #aaa'; // lighter divider for sub-row split

    const th = (ex = {}) => ({
        border: BDR, padding: '3px 4px', fontWeight: 'bold',
        fontSize: '9.5px', background: '#ddd', fontFamily: F,
        textAlign: 'center', lineHeight: '1.3', ...ex
    });
    const td = (ex = {}) => ({
        border: BDR, padding: '2px 4px', fontSize: '10px', fontFamily: F, ...ex
    });
    const grp = (ex = {}) => ({
        border: BDR, padding: '3px 4px', fontWeight: 'bold',
        fontSize: '10px', background: '#bbb', fontFamily: F, ...ex
    });

    const riceLabel = (letter, isTop) => ({
        border: BDR,
        borderBottom: isTop ? HALF : BDR,
        borderTop: isTop ? BDR : HALF,
        padding: '2px 4px',
        fontSize: '11px',
        fontWeight: 'bold',
        fontFamily: F,
        textAlign: 'center',
        background: '#f5f5f5',
    });

    const tdTop = (ex = {}) => ({
        border: BDR, borderBottom: HALF, padding: '1px 3px',
        fontSize: '10px', fontFamily: F, height: '18px', textAlign: 'center', ...ex
    });
    const tdBot = (ex = {}) => ({
        border: BDR, borderTop: HALF, padding: '1px 3px',
        fontSize: '10px', fontFamily: F, height: '18px', textAlign: 'center', ...ex
    });

    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB') : '-';
    const fmt = v => {
        const n = parseFloat(v);
        return isNaN(n) || n === 0 ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2 });
    };

    const getItemData = (items, systemCode, weight) => {
        const defaultRet = isSettled ? { price: '0.00', bags: '0' } : { price: '', bags: '' };
        if (!items || !Array.isArray(items)) return defaultRet;
        
        const match = items.find(i => {
            const isSamba = systemCode === 'OUT_SAMBA' && (i.SYSTEM_CODE === 'OUT_SAMBA' || i.ITEM_NAME?.toLowerCase().includes('samba') || i.ITEM_CODE?.toLowerCase().includes('samba'));
            const isNadu = systemCode === 'OUT_NADU' && (i.SYSTEM_CODE === 'OUT_NADU' || i.ITEM_NAME?.toLowerCase().includes('nadu') || i.ITEM_CODE?.toLowerCase().includes('nadu'));
            const isExactCode = i.SYSTEM_CODE === systemCode;

            const codeMatch = isExactCode || isSamba || isNadu;
            return codeMatch && Number(i.BAG_WEIGHT) === weight;
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

    const isSettled = note.STATUS === 'SETTLED';

    const invoiceRow = (bill, key) => {
        const p5 = isSettled ? getItemData(bill?.ITEMS, 'OUT_SAMBA', 5) : { price: '', bags: '' };
        const p10 = isSettled ? getItemData(bill?.ITEMS, 'OUT_SAMBA', 10) : { price: '', bags: '' };
        const p25 = isSettled ? getItemData(bill?.ITEMS, 'OUT_SAMBA', 25) : { price: '', bags: '' };

        const n5 = isSettled ? getItemData(bill?.ITEMS, 'OUT_NADU', 5) : { price: '', bags: '' };
        const n10 = isSettled ? getItemData(bill?.ITEMS, 'OUT_NADU', 10) : { price: '', bags: '' };
        const n25 = isSettled ? getItemData(bill?.ITEMS, 'OUT_NADU', 25) : { price: '', bags: '' };

        const totalAmount = (isSettled && bill) ? (bill.FINAL_AMOUNT || bill.NET_AMOUNT || bill.TOTAL_AMOUNT) : '';

        let chequeInfo = '';
        if (isSettled && bill?.CHEQUES && bill.CHEQUES.length > 0) {
            chequeInfo = bill.CHEQUES.map(c => `#${c.CHEQUE_NUMBER} (${c.DUE_DATE ? fmtDate(c.DUE_DATE) : ''})`).join(', ');
        }

        const payMethod = isSettled && bill ? (bill.PAYMENT_METHOD || 'CASH').toUpperCase() : '';

        return (
            <React.Fragment key={key}>
                {/* Sub-row 1 – P (Samba) / Price */}
                <tr>
                    <td rowSpan={2} style={td({ verticalAlign: 'middle', fontWeight: 'bold', fontSize: '9.5px', textAlign: 'left' })}>
                        {bill ? bill.INVOICE_NO : ''}
                    </td>
                    <td style={riceLabel('P', true)}>P</td>
                    <td style={tdTop({ fontWeight: 'bold' })}>{p5.price}</td>
                    <td style={tdTop()}>{p5.bags}</td>
                    <td style={tdTop({ fontWeight: 'bold' })}>{p10.price}</td>
                    <td style={tdTop()}>{p10.bags}</td>
                    <td style={tdTop({ fontWeight: 'bold' })}>{p25.price}</td>
                    <td style={tdTop()}>{p25.bags}</td>
                    <td rowSpan={2} style={td({ verticalAlign: 'middle', textAlign: 'right', fontWeight: 'bold' })}>
                        {totalAmount ? `Rs.${fmt(totalAmount)}` : ''}
                    </td>
                    <td rowSpan={2} style={td({ verticalAlign: 'middle', textAlign: 'center', fontSize: '9px', fontWeight: 'bold' })}>
                        {payMethod}
                    </td>
                    <td rowSpan={2} style={td({ verticalAlign: 'middle', fontSize: '9px' })}>
                        {chequeInfo}
                    </td>
                </tr>
                {/* Sub-row 2 – N (Nadu) / Bags */}
                <tr>
                    <td style={riceLabel('N', false)}>N</td>
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

    const grandTotal = isSettled ? (note.BILLS || []).reduce((sum, b) => sum + (parseFloat(b.FINAL_AMOUNT || b.NET_AMOUNT || b.TOTAL_AMOUNT) || 0), 0) : 0;

    return (
        <div style={{ fontFamily: F, fontSize: '11px', padding: '8mm 6mm', background: '#fff', color: '#000' }}>
            <style>{`
                * { box-sizing: border-box; }
                html, body { margin: 0; padding: 0; background: #fff !important; }
                @media print {
                    @page { size: A4 portrait; margin: 8mm 6mm; }
                    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #fff !important; }
                }
            `}</style>

            {/* ── HEADER ── */}
            <div style={{ textAlign: 'center', marginBottom: '5px' }}>
                <div style={{ fontSize: '17px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: F }}>
                    CHAMIKA RICE MILLS
                </div>
                <div style={{ fontSize: '10.5px', fontFamily: F }}>Sooriyawewa</div>
                <div style={{ borderTop: DBL, borderBottom: DBL, padding: '2px 0', marginTop: '4px', fontSize: '11.5px', fontWeight: 'bold', letterSpacing: '1px', fontFamily: F }}>
                    {isSettled ? 'SETTLED DISPATCH SUMMARY NOTE' : 'DELIVERY DISPATCH NOTE'}
                </div>
            </div>

            {/* ── META ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px', border: BDR }}>
                <tbody>
                    <tr>
                        <td style={{ border: BDR, padding: '3px 6px', fontSize: '10px', fontFamily: F }}><b>Dispatch No :</b> {note.DISPATCH_NO}</td>
                        <td style={{ border: BDR, padding: '3px 6px', fontSize: '10px', fontFamily: F }}><b>Date :</b> {fmtDate(note.DATE)}</td>
                        <td style={{ border: BDR, padding: '3px 6px', fontSize: '10px', fontFamily: F }}><b>Driver :</b> {note.DRIVER_NAME || '-'}</td>
                        <td style={{ border: BDR, padding: '3px 6px', fontSize: '10px', fontFamily: F }}><b>Lorry No :</b> {note.LORRY_NO || '-'}</td>
                    </tr>
                    <tr>
                        <td colSpan={2} style={{ border: BDR, padding: '3px 6px', fontSize: '10px', fontFamily: F }}><b>Dispatched By :</b> {note.CREATED_BY_NAME || note.STAFF_NAME || getCurrentUserName()}</td>
                        <td colSpan={2} style={{ border: BDR, padding: '3px 6px', fontSize: '10px', fontFamily: F }}><b>Terminal Code :</b> {note.DEVICE_ID || getTerminalDeviceCode()}</td>
                    </tr>
                </tbody>
            </table>

            {/* ── MAIN TABLE ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <colgroup>
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '5%' }} />
                    {/* 5kg: price + bags */}
                    <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                    {/* 10kg */}
                    <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                    {/* 25kg */}
                    <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                    {/* Total */}
                    <col style={{ width: '10%' }} />
                    {/* Cash/Cheque */}
                    <col style={{ width: '8%' }} />
                    {/* Cheque details */}
                    <col style={{ width: '30%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th style={th({ textAlign: 'left' })} rowSpan={2}>Invoice No</th>
                        <th style={th()} rowSpan={2}>Rice<br/>Type</th>
                        <th style={th()} colSpan={2}>
                            5 kg<br/><span style={{ fontSize: '8px', fontWeight: 'normal' }}>Price / Bags</span>
                        </th>
                        <th style={th()} colSpan={2}>
                            10 kg<br/><span style={{ fontSize: '8px', fontWeight: 'normal' }}>Price / Bags</span>
                        </th>
                        <th style={th()} colSpan={2}>
                            25 kg<br/><span style={{ fontSize: '8px', fontWeight: 'normal' }}>Price / Bags</span>
                        </th>
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
                    {(note.BILLS || []).map((bill) => invoiceRow(bill, `bill-${bill.BILL_ID}`))}

                    {/* ALWAYS render 5 extra blank handwriting rows for additional delivery invoices */}
                    {[1, 2, 3, 4, 5].map(i => invoiceRow(null, `blank-${i}`))}

                    {/* Total row */}
                    <tr>
                        <td colSpan={8} style={grp({ textAlign: 'right', fontSize: '11px' })}>DISPATCH GRAND TOTAL :</td>
                        <td style={grp({ textAlign: 'right', fontSize: '11px' })}>Rs. {fmt(grandTotal)}</td>
                        <td style={grp()}></td>
                        <td style={grp({ textAlign: 'left' })}></td>
                    </tr>
                </tbody>
            </table>

            {/* ── FOOTER ── */}
            <div style={{ marginTop: '8px', borderTop: BDR, paddingTop: '3px', fontSize: '9px', fontFamily: F, color: '#555', textAlign: 'center' }}>
                Dispatch: {note.DISPATCH_NO} &nbsp;|&nbsp; Date: {fmtDate(note.DATE)} &nbsp;|&nbsp; Status: {note.STATUS} &nbsp;|&nbsp; Total Bills: {note.BILLS?.length || 0}
                &nbsp;|&nbsp; Printed: {new Date().toLocaleDateString('en-GB')} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>
        </div>
    );
}
