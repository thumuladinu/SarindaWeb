import React from 'react';
import { Modal, Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

import printService from '../../services/printService';

// Exactly mirrors webapp's PrintableDispatchNote layout
export default function PrintableDispatchNote({ visible, onClose, note, linkedBills = [] }) {
    if (!visible || !note) return null;

    const F   = "'Courier New', Courier, monospace";
    const BDR = '1px solid #000';
    const DBL = '2px solid #000';
    const HALF = '1px solid #aaa';

    const th = (ex = {}) => ({ border: BDR, padding: '3px 4px', fontWeight: 'bold', fontSize: '9.5px', background: '#ddd', fontFamily: F, textAlign: 'center', lineHeight: '1.3', ...ex });
    const td = (ex = {}) => ({ border: BDR, padding: '2px 4px', fontSize: '10px', fontFamily: F, ...ex });
    const grp = (ex = {}) => ({ border: BDR, padding: '3px 4px', fontWeight: 'bold', fontSize: '10px', background: '#bbb', fontFamily: F, ...ex });

    const riceLabel = (isTop) => ({
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

    const tdTop = (ex = {}) => ({ border: BDR, borderBottom: HALF, padding: '1px 3px', fontSize: '10px', fontFamily: F, height: '18px', textAlign: 'center', ...ex });
    const tdBot = (ex = {}) => ({ border: BDR, borderTop: HALF, padding: '1px 3px', fontSize: '10px', fontFamily: F, height: '18px', textAlign: 'center', ...ex });

    const fmtDate = d => d ? dayjs(d).format('DD/MM/YYYY') : '-';
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

        return (
            <React.Fragment key={key}>
                <tr>
                    <td rowSpan={2} style={td({ verticalAlign: 'middle', fontWeight: 'bold', fontSize: '9.5px', textAlign: 'left' })}>{bill ? bill.INVOICE_NO : ''}</td>
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

    const grandTotal = isSettled ? linkedBills.reduce((sum, b) => sum + (parseFloat(b.FINAL_AMOUNT || b.NET_AMOUNT || b.TOTAL_AMOUNT) || 0), 0) : 0;

    const addedBy = note.ADDED_BY || (() => { try { return JSON.parse(localStorage.getItem('currentUser') || '{}')?.USERNAME || 'System'; } catch(e) { return 'System'; } })();
    const device = note.DEVICE_ID || 'Desktop POS';

    const handlePrint = () => {
        printService.printDispatchNote(note, linkedBills);
    };

    return (
        <Modal
            open={visible}
            onCancel={onClose}
            width={1100}
            footer={[
                <Button key="close" onClick={onClose}>Close</Button>,
                <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={handlePrint} className="!bg-blue-600">
                    Print Gate Pass
                </Button>
            ]}
            destroyOnClose
            centered
        >
            <div style={{ fontFamily: F, fontSize: '11px', padding: '8mm 6mm', background: '#fff', color: '#000', maxHeight: '80vh', overflowY: 'auto' }}>

                {/* HEADER */}
                <div style={{ textAlign: 'center', marginBottom: '5px' }}>
                    <div style={{ fontSize: '17px', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase', fontFamily: F }}>CHAMIKA RICE MILLS</div>
                    <div style={{ fontSize: '10.5px', fontFamily: F }}>Sooriyawewa</div>
                    <div style={{ borderTop: DBL, borderBottom: DBL, padding: '2px 0', marginTop: '4px', fontSize: '11.5px', fontWeight: 'bold', letterSpacing: '1px', fontFamily: F }}>
                        {isSettled ? 'SETTLED DISPATCH SUMMARY NOTE' : 'DELIVERY DISPATCH NOTE'}
                    </div>
                </div>

                {/* META */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px', border: BDR }}>
                    <tbody><tr>
                        <td style={td()}><b>Dispatch No :</b> {note.DISPATCH_NO}</td>
                        <td style={td()}><b>Date :</b> {fmtDate(note.DATE)}</td>
                        <td style={td()}><b>Driver :</b> {note.DRIVER_NAME || '-'}</td>
                        <td style={td()}><b>Lorry No :</b> {note.LORRY_NO || '-'}</td>
                    </tr></tbody>
                </table>

                {/* MAIN TABLE */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <colgroup>
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                        <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                        <col style={{ width: '6%' }} /><col style={{ width: '6%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '30%' }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th style={th({ textAlign: 'left' })} rowSpan={2}>Invoice No</th>
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
                        {linkedBills.map((bill) => invoiceRow(bill, `bill-${bill.LOCAL_ID || bill.BILL_ID}`))}
                        {!isSettled && linkedBills.length < 8 && [1, 2, 3, 4].slice(0, Math.max(0, 4 - linkedBills.length)).map(i => invoiceRow(null, `blank-${i}`))}
                        <tr>
                            <td colSpan={8} style={grp({ textAlign: 'right', fontSize: '11px' })}>DISPATCH GRAND TOTAL :</td>
                            <td style={grp({ textAlign: 'right', fontSize: '11px' })}>Rs. {fmt(grandTotal)}</td>
                            <td style={grp()}></td>
                            <td style={grp({ textAlign: 'left' })}></td>
                        </tr>
                    </tbody>
                </table>

                {/* FOOTER */}
                <div style={{ marginTop: '8px', borderTop: BDR, paddingTop: '3px', fontSize: '9px', fontFamily: F, color: '#555', textAlign: 'center' }}>
                    Dispatch: {note.DISPATCH_NO} &nbsp;|&nbsp; Date: {fmtDate(note.DATE)} &nbsp;|&nbsp; Status: {note.STATUS} &nbsp;|&nbsp; Total Bills: {linkedBills.length}
                    &nbsp;|&nbsp; Printed: {dayjs().format('DD/MM/YYYY HH:mm')}
                    <br />
                    Added by: {addedBy} | Device: {device}
                </div>
            </div>
        </Modal>
    );
}
