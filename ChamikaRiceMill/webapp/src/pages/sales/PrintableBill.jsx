import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Spin, Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { getTerminalDeviceCode, getCurrentUserName } from '../../utils/terminalHelper';

// ─── Config ────────────────────────────────────────────────────────────────
const MILL_PHONE = '071-234 5678';   // ← update to real number

export default function PrintableBill() {
    const { id } = useParams();
    const [bill, setBill] = useState(null);
    const [loading, setLoading] = useState(true);
    const [printedAt] = useState(new Date());

    useEffect(() => {
        const fetchBill = async () => {
            try {
                const res = await axios.get(`/api/mill/sales/${id}`, { withCredentials: true });
                if (res.data.success) setBill(res.data.result);
            } catch (e) {
                console.error('Failed to load bill:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchBill();
    }, [id]);

    useEffect(() => {
        if (!loading && bill) setTimeout(() => window.print(), 600);
    }, [loading, bill]);

    if (loading) return <div className="flex h-screen items-center justify-center"><Spin size="large" /></div>;
    if (!bill)   return <div style={{ textAlign: 'center', marginTop: 80, color: 'red', fontWeight: 'bold', fontSize: 20 }}>Bill not found!</div>;

    const fmt = v => {
        const n = parseFloat(v);
        return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2 });
    };
    const fmtDate  = d => new Date(d).toLocaleDateString('en-GB');
    const fmtPrint = d => d.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // ─── Style tokens ─────────────────────────────────────────────────────
    const F    = "'Courier New', Courier, 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif";
    const BDR  = '1px solid #000';
    const DBL  = '2px solid #000';

    const th = (ex = {}) => ({ border: BDR, padding: '4px 6px', fontWeight: 'bold', fontSize: '10.5px', background: '#ddd', fontFamily: F, ...ex });
    const td = (ex = {}) => ({ border: BDR, padding: '4px 6px', fontSize: '10.5px', fontFamily: F, ...ex });
    const grp = (ex = {}) => ({ border: BDR, padding: '3px 6px', fontWeight: 'bold', fontSize: '10.5px', background: '#bbb', fontFamily: F, ...ex });

    // Handwritten rows — taller for pen writing
    const tdHW = (ex = {}) => ({ border: BDR, padding: 0, height: '20px', fontFamily: F, fontSize: '10.5px', ...ex });
    const grpHW = (ex = {}) => ({ border: BDR, padding: '3px 6px', fontWeight: 'bold', fontSize: '10.5px', background: '#e4e4e4', fontFamily: F, ...ex });

    const dhr  = { border: 'none', borderTop: DBL, margin: '3px 0' };
    const hr   = { border: 'none', borderTop: BDR, margin: '3px 0' };

    const colGrp = (
        <colgroup>
            <col style={{ width: '34%' }} />
            <col style={{ width: '23%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '24%' }} />
        </colgroup>
    );

    // ─── 1. SIMPLE RETAIL INVOICE ONLY FOR QUICK POS ──────────
    const isRetailSale = Boolean(bill.REMARK && bill.REMARK.toLowerCase().includes('quick pos'));

    if (isRetailSale) {
        return (
            <>
                <style>{`
                    @media print {
                        @page { size: A4 portrait; margin: 0; }
                        html, body {
                            margin: 0 !important; padding: 0 !important;
                            background: white !important;
                            font-family: 'Courier New', Courier, 'Noto Sans Sinhala', 'Iskoola Pota', 'Abhaya Libre', sans-serif !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        #pab { display: none !important; }
                        #pw  { background: white !important; padding: 0 !important; }
                        #bp  {
                            box-shadow: none !important; margin: 0 !important;
                            width: 210mm !important; height: 297mm !important;
                            padding: 10mm 12mm !important;
                            page-break-after: avoid;
                            page-break-inside: avoid;
                        }
                    }
                    @media screen {
                        #pw { background: #999; padding: 24px; min-height: 100vh; }
                        #bp { box-shadow: 0 6px 32px rgba(0,0,0,0.3); }
                    }
                `}</style>

                <div id="pw">
                    {/* Screen toolbar */}
                    <div id="pab" style={{ display:'flex', justifyContent:'flex-end', maxWidth:'210mm', margin:'0 auto 12px' }}>
                        <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>Print Receipt</Button>
                    </div>

                    {/* A4 PAGE */}
                    <div id="bp" style={{
                        fontFamily: F, fontSize: '11px', lineHeight: '1.4', color: '#000', background: '#fff',
                        width: '210mm', minHeight: '297mm', boxSizing: 'border-box', padding: '10mm 12mm',
                        margin: '0 auto', display: 'flex', flexDirection: 'column',
                    }}>
                        {/* Header */}
                        <div>
                            <hr style={dhr} />
                            <div style={{ textAlign:'center', fontWeight:'bold', fontSize:'18px', letterSpacing:'2px', margin:'3px 0 1px' }}>
                                CHAMIKA RICE MILLS
                            </div>
                            <div style={{ textAlign:'center', fontSize:'11px' }}>Sooriyawewa</div>
                            <div style={{ textAlign:'center', fontSize:'10px', color:'#333' }}>
                                Tel: {MILL_PHONE}
                            </div>
                            <div style={{ textAlign:'center', fontWeight:'bold', fontSize:'13px', margin:'4px 0 2px' }}>
                                SALES RECEIPT / INVOICE
                            </div>
                            <hr style={dhr} />
                        </div>

                        {/* Bill & Customer Info */}
                        <div style={{ display:'flex', justifyContent:'space-between', margin:'8px 0' }}>
                            <div>
                                <div style={{ marginBottom:'4px' }}><strong>INVOICE NO</strong> : <strong>{bill.INVOICE_NO}</strong></div>
                                <div style={{ marginBottom:'4px' }}><strong>CUSTOMER</strong>&nbsp;&nbsp;&nbsp;: <strong>{bill.CUSTOMER_NAME || 'Walk-in Customer'}</strong></div>
                                <div><strong>PHONE</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;: <strong>{bill.CUSTOMER_PHONE || '-'}</strong></div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:'9px', color:'#555', marginBottom:'4px' }}>Printed: {fmtPrint(printedAt)}</div>
                                <div style={{ marginBottom:'4px' }}><strong>DATE</strong> : <strong>{fmtDate(bill.DATE)}</strong></div>
                                <div><strong>PAYMENT</strong> : <strong style={{ textTransform:'uppercase' }}>{bill.PAYMENT_METHOD || 'CASH'}</strong></div>
                            </div>
                        </div>

                        <hr style={hr} />

                        {/* Itemized Table */}
                        <table style={{ width:'100%', borderCollapse:'collapse', marginTop:'8px', marginBottom:'16px' }}>
                            <thead>
                                <tr>
                                    <th style={th({ textAlign:'left' })}>#</th>
                                    <th style={th({ textAlign:'left' })}>PRODUCT NAME</th>
                                    <th style={th({ textAlign:'center' })}>BAG SIZE</th>
                                    <th style={th({ textAlign:'center' })}>QTY (BAGS)</th>
                                    <th style={th({ textAlign:'right' })}>UNIT PRICE (RS)</th>
                                    <th style={th({ textAlign:'right' })}>TOTAL AMOUNT (RS)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(bill.ITEMS || []).map((item, idx) => (
                                    <tr key={idx}>
                                        <td style={td({ textAlign:'left' })}>{idx + 1}</td>
                                        <td style={td({ textAlign:'left' })}><strong>{item.ITEM_NAME || 'Item'}</strong></td>
                                        <td style={td({ textAlign:'center' })}>{item.BAG_WEIGHT ? `${item.BAG_WEIGHT} kg` : '-'}</td>
                                        <td style={td({ textAlign:'center', fontWeight:'bold' })}>{item.BAG_COUNT || item.QUANTITY}</td>
                                        <td style={td({ textAlign:'right' })}>{fmt(item.UNIT_PRICE)}</td>
                                        <td style={td({ textAlign:'right', fontWeight:'bold' })}>{fmt(item.TOTAL_PRICE)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Totals Summary */}
                        <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'auto', paddingTop:'12px' }}>
                            <table style={{ width:'45%', borderCollapse:'collapse' }}>
                                <tbody>
                                    <tr>
                                        <td style={{ padding:'4px 6px', textAlign:'right', fontSize:'11px' }}>TOTAL AMOUNT :</td>
                                        <td style={{ padding:'4px 6px', textAlign:'right', fontWeight:'bold', fontSize:'11px', borderBottom: BDR }}>{fmt(bill.TOTAL_AMOUNT)}</td>
                                    </tr>
                                    {parseFloat(bill.DISCOUNT || 0) > 0 && (
                                        <tr>
                                            <td style={{ padding:'4px 6px', textAlign:'right', fontSize:'11px' }}>DISCOUNT :</td>
                                            <td style={{ padding:'4px 6px', textAlign:'right', fontWeight:'bold', fontSize:'11px', borderBottom: BDR }}>- {fmt(bill.DISCOUNT)}</td>
                                        </tr>
                                    )}
                                    <tr>
                                        <td style={{ padding:'6px 6px', textAlign:'right', fontWeight:'bold', fontSize:'13px' }}>NET TOTAL (RS) :</td>
                                        <td style={{ padding:'6px 6px', textAlign:'right', fontWeight:'bold', fontSize:'14px', borderBottom: DBL, borderTop: DBL }}>
                                            {fmt(bill.FINAL_AMOUNT || bill.NET_AMOUNT)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <hr style={{ ...dhr, marginTop:'20px' }} />
                        <div style={{ textAlign:'center', fontSize:'11px', fontWeight:'bold', margin:'4px 0' }}>
                            THANK YOU FOR YOUR BUSINESS!
                        </div>
                        <div style={{ textAlign:'center', fontSize:'9px', color:'#555', marginTop:'2px' }}>
                            {`Added by: ${bill.ADDED_BY || JSON.parse(localStorage.getItem('currentUser'))?.USERNAME || 'System'} | Device: ${bill.DEVICE_ID || (navigator.userAgent.includes('Electron') ? 'Desktop POS' : 'Web App')}`}
                        </div>
                        <hr style={dhr} />
                    </div>
                </div>
            </>
        );
    }

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

    const varietyTag = getRiceVarietyTag(bill.ITEMS || []);
    const pItems = (bill.ITEMS || []).filter(i => {
        const code = (i.SYSTEM_CODE || i.ITEM_CODE || i.CODE || '').toUpperCase();
        return code.endsWith('_P') || code === 'P' || code.includes('SAMBA') || (i.ITEM_NAME && i.ITEM_NAME.includes('පොලිෂ්'));
    });
    const nItems = (bill.ITEMS || []).filter(i => {
        const code = (i.SYSTEM_CODE || i.ITEM_CODE || i.CODE || '').toUpperCase();
        return code.endsWith('_N') || code === 'N' || code.includes('NADU') || (i.ITEM_NAME && i.ITEM_NAME.includes('නිවුඩු'));
    });
    const getRow = (items, w) => items.find(i => i.BAG_WEIGHT === w) || { UNIT_PRICE: 0, BAG_COUNT: 0, TOTAL_PRICE: 0 };

    return (
        <>
            <style>{`
                @media print {
                    @page { size: A4 portrait; margin: 0; }
                    html, body {
                        margin: 0 !important; padding: 0 !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    #pab { display: none !important; }
                    #pw  { background: white !important; padding: 0 !important; }
                    #bp  {
                        box-shadow: none !important; margin: 0 !important;
                        width: 210mm !important; height: 297mm !important;
                        max-height: 297mm !important;
                        padding: 8mm 10mm !important;
                        page-break-after: avoid;
                        page-break-inside: avoid;
                        overflow: hidden !important;
                    }
                }
                @media screen {
                    #pw { background: #999; padding: 24px; min-height: 100vh; }
                    #bp { box-shadow: 0 6px 32px rgba(0,0,0,0.3); }
                }
            `}</style>

            <div id="pw">
                {/* Screen toolbar */}
                <div id="pab" style={{ display:'flex', justifyContent:'flex-end', maxWidth:'210mm', margin:'0 auto 12px' }}>
                    <Button type="primary" icon={<PrinterOutlined />} size="large" onClick={() => window.print()}>Print Bill</Button>
                </div>

                {/* ══════════════ A4 PAGE ══════════════ */}
                <div id="bp" style={{
                    fontFamily: F, fontSize: '10.5px', lineHeight: '1.4', color: '#000', background: '#fff',
                    width: '210mm', height: '297mm', boxSizing: 'border-box', padding: '8mm 10mm',
                    margin: '0 auto', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>

                    {/* ── HEADER ───────────────────────────────────────── */}
                    <div>
                        <hr style={dhr} />
                        <div style={{ textAlign:'center', fontWeight:'bold', fontSize:'15px', letterSpacing:'3px', margin:'3px 0 1px' }}>
                            CHAMIKA RICE MILLS
                        </div>
                        <div style={{ textAlign:'center', fontSize:'11px' }}>Sooriyawewa</div>
                        <div style={{ textAlign:'center', fontSize:'10px', color:'#333' }}>
                            Tel: {MILL_PHONE}
                        </div>
                        <hr style={dhr} />
                    </div>

                    {/* ── BILL INFO + PRINT DATE ────────────────────────── */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', margin:'4px 0' }}>
                        {/* Left */}
                        <div>
                            <div style={{ marginBottom:'3px' }}><strong>BILL NO</strong>&nbsp;&nbsp;&nbsp;: <strong>{bill.INVOICE_NO}</strong></div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span><strong>BATCH NO</strong> : <strong>{bill.BATCH_NO || '....................'}</strong></span>
                                {varietyTag && (
                                    <span style={{ border: BDR, padding: '1px 6px', fontWeight: 'bold', fontSize: '11px', background: '#f0f0f0' }}>
                                        [ {varietyTag} ]
                                    </span>
                                )}
                            </div>
                        </div>
                        {/* Right */}
                        <div style={{ textAlign:'right' }}>
                            <div style={{ fontSize:'9px', color:'#000', fontWeight:'bold', marginBottom:'2px' }}>
                                Billed By: {bill.CREATED_BY_NAME || bill.ADDED_BY || getCurrentUserName()} | Terminal: {bill.DEVICE_ID || getTerminalDeviceCode()}
                            </div>
                            <div style={{ fontSize:'8px', color:'#555', marginBottom:'2px' }}>
                                Printed: {fmtPrint(printedAt)}
                            </div>
                            <div><strong>DATE</strong> : <strong>{fmtDate(bill.DATE)}</strong></div>
                        </div>
                    </div>

                    <hr style={hr} />

                    {/* ── CUSTOMER ─────────────────────────────────────── */}
                    <div style={{ margin:'4px 0' }}>
                        <div style={{ marginBottom:'3px' }}>
                            <strong>CUSTOMER</strong> :&nbsp;
                            <strong>{bill.CUSTOMER_NAME || '..................................................................'}</strong>
                        </div>
                        <div style={{ marginBottom:'3px' }}>
                            <strong>LOCATION</strong>&nbsp; :&nbsp;
                            <strong>{bill.CUSTOMER_ADDRESS || '..................................................................'}</strong>
                        </div>
                        <div>
                            <strong>PHONE</strong>&nbsp;&nbsp;&nbsp;&nbsp; :&nbsp;
                            <strong>{bill.CUSTOMER_PHONE || '....................'}</strong>
                        </div>
                    </div>

                    <hr style={dhr} />

                    {/* ── PRINTED ORDER TABLE ──────────────────────────── */}
                    <div style={{ fontWeight:'bold', fontSize:'10.5px', margin:'2px 0' }}>[ PRINTED ORDER DETAILS ]</div>
                    <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                        {colGrp}
                        <thead>
                            <tr>
                                <th style={th()}>ITEM</th>
                                <th style={th({ textAlign:'center' })}>PRICE / BAG (RS)</th>
                                <th style={th({ textAlign:'center' })}>QTY (BAGS)</th>
                                <th style={th({ textAlign:'right' })}>TOTAL (RS)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colSpan="4" style={grp()}>P — Polished (පොලිෂ්)</td></tr>
                            {[5,10,25].map(w => {
                                const row = getRow(pItems, w);
                                return (
                                    <tr key={`p-${w}`}>
                                        <td style={td({ paddingLeft:'16px' })}><strong>{w} kg</strong></td>
                                        <td style={td({ textAlign:'center', fontWeight:'bold' })}>{fmt(row.UNIT_PRICE)}</td>
                                        <td style={td({ textAlign:'center', fontWeight:'bold' })}>{row.BAG_COUNT}</td>
                                        <td style={td({ textAlign:'right', fontWeight:'bold' })}>{fmt(row.TOTAL_PRICE)}</td>
                                    </tr>
                                );
                            })}
                            <tr><td colSpan="4" style={grp()}>N — Niudu (නිවුඩු)</td></tr>
                            {[5,10,25].map(w => {
                                const row = getRow(nItems, w);
                                return (
                                    <tr key={`n-${w}`}>
                                        <td style={td({ paddingLeft:'16px' })}><strong>{w} kg</strong></td>
                                        <td style={td({ textAlign:'center', fontWeight:'bold' })}>{fmt(row.UNIT_PRICE)}</td>
                                        <td style={td({ textAlign:'center', fontWeight:'bold' })}>{row.BAG_COUNT}</td>
                                        <td style={td({ textAlign:'right', fontWeight:'bold' })}>{fmt(row.TOTAL_PRICE)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <hr style={dhr} />

                    {/* ── HANDWRITTEN EXTRA TABLE ──────────────────────── */}
                    <div style={{ fontWeight:'bold', fontSize:'10.5px', margin:'2px 0' }}>[ HANDWRITTEN EXTRA ORDERS — අමතර භාණ්ඩ ]</div>
                    <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
                        {colGrp}
                        <thead>
                            <tr>
                                <th style={th()}>ITEM</th>
                                <th style={th({ textAlign:'center' })}>PRICE / BAG (RS)</th>
                                <th style={th({ textAlign:'center' })}>QTY (BAGS)</th>
                                <th style={th({ textAlign:'right' })}>TOTAL (RS)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td colSpan="4" style={grpHW()}>P — Polished (පොලිෂ්)</td></tr>
                            {[5,10,25].map(w => (
                                <tr key={`hw-p-${w}`}>
                                    <td style={tdHW({ paddingLeft:'16px', verticalAlign:'middle' })}>{w} kg</td>
                                    <td style={tdHW()}>&nbsp;</td>
                                    <td style={tdHW()}>&nbsp;</td>
                                    <td style={tdHW()}>&nbsp;</td>
                                </tr>
                            ))}
                            <tr><td colSpan="4" style={grpHW()}>N — Niudu (නිවුඩු)</td></tr>
                            {[5,10,25].map(w => (
                                <tr key={`hw-n-${w}`}>
                                    <td style={tdHW({ paddingLeft:'16px', verticalAlign:'middle' })}>{w} kg</td>
                                    <td style={tdHW()}>&nbsp;</td>
                                    <td style={tdHW()}>&nbsp;</td>
                                    <td style={tdHW()}>&nbsp;</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <hr style={dhr} />

                    {/* ── TOTALS ───────────────────────────────────────── */}
                    <table style={{ width:'100%', borderCollapse:'collapse', margin:'2px 0' }}>
                        <tbody>
                            {[
                                { label:'PRINTED SUB TOTAL',    val: fmt(bill.PRINTED_SUB_TOTAL), bold: true },
                                { label:'HANDWRITTEN SUB TOTAL', val: bill.IS_SETTLED ? fmt(bill.HANDWRITTEN_SUB_TOTAL) : '' },
                                { label:'DISCOUNT',              val: bill.IS_SETTLED ? fmt(bill.DISCOUNT) : '' },
                                { label:'FINAL AMOUNT',          val: bill.IS_SETTLED ? fmt(bill.FINAL_AMOUNT) : '', big: true },
                            ].map(({ label, val, bold, big }) => (
                                <tr key={label}>
                                    <td style={{ padding:'3px 6px', textAlign:'right', fontWeight: big?'bold':'normal', fontSize: big?'12px':'10.5px' }}>
                                        {label} :
                                    </td>
                                    <td style={{
                                        padding:'3px 8px', textAlign:'right', width:'28%',
                                        fontWeight: bold||big?'bold':'normal', fontSize: big?'12px':'10.5px',
                                        borderBottom: big ? DBL : BDR,
                                        borderTop:    big ? DBL : 'none',
                                    }}>
                                        {val}&nbsp;
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <hr style={dhr} />

                    {/* ── PAYMENT ──────────────────────────────────────── */}
                    <div style={{ fontWeight:'bold', fontSize:'10.5px', margin:'2px 0 3px' }}>PAYMENT DETAILS</div>
                    <div style={{ display:'flex', gap:'48px', margin:'2px 0 4px', fontSize:'11px' }}>
                        <div>[ &nbsp; ] &nbsp;CASH</div>
                        <div>[ &nbsp; ] &nbsp;CHEQUE</div>
                    </div>

                    <hr style={dhr} />

                    {/* ── LEGAL + SIGNATURES ───────────────────────────── */}
                    <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
                        <div>
                            <div style={{ fontWeight:'bold', fontSize:'10px', margin:'2px 0 3px' }}>
                                නීතිමය ප්‍රකාශය සහ එකඟතා කොන්දේසි
                            </div>
                            <div style={{ fontSize:'11px', lineHeight:'2.0' }}>
                                <div style={{ display:'flex', gap:'4px', marginBottom:'3px' }}>
                                    <span style={{ minWidth:'14px', fontWeight:'bold' }}>1.</span>
                                    <span>ඉහත සඳහන් කළ භාණ්ඩ හොඳ තත්ත්වයෙන් සහ නිවැරදි ප්‍රමාණයෙන් මා වෙත ලැබුණු බව මෙයින් තහවුරු කරමි.</span>
                                </div>
                                <div style={{ display:'flex', gap:'4px', marginBottom:'3px' }}>
                                    <span style={{ minWidth:'14px', fontWeight:'bold' }}>2.</span>
                                    <span>බිල්පතෙහි අතින් ලියා එකතු කර ඇති සියලුම අමතර භාණ්ඩ සහ මිල වෙනස්කම් මා විසින් එකඟ වූ ඒවා බව සහතික කරමි.</span>
                                </div>
                                <div style={{ display:'flex', gap:'4px', marginBottom:'3px' }}>
                                    <span style={{ minWidth:'14px', fontWeight:'bold' }}>3.</span>
                                    <span>අතින් ලියන ලද අමතර එකතුව (Handwritten Sub Total) ඇතුළුව සියලුම මුදල් ක්‍ෂේත්‍ර සම්පූර්ණ කළ යුතු අතර, අමතර නොමැති නම් '0' ලෙස සටහන් කළ යුතුය.</span>
                                </div>
                                <div style={{ display:'flex', gap:'4px' }}>
                                    <span style={{ minWidth:'14px', fontWeight:'bold' }}>4.</span>
                                    <span>ඉහත සඳහන් කර ඇති මුළු මුදල (Final Amount), දක්වා ඇති ක්‍රමයට ගෙවීමට මෙයින් එකඟ වෙමි.</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <hr style={{ ...dhr, marginTop:'8px' }} />
                            <div style={{ display:'flex', justifyContent:'space-between', marginTop:'6px' }}>
                                <div>
                                    <div style={{ fontSize:'14px', fontWeight:'bold', marginBottom:'4px' }}>
                                        රියදුරු / බලයලත් අත්සන :
                                    </div>
                                    <div style={{ border: DBL, width:'80mm', height:'24mm', boxSizing:'border-box', marginTop:'4px' }}></div>
                                </div>
                                <div style={{ textAlign:'right' }}>
                                    <div style={{ fontSize:'14px', fontWeight:'bold', marginBottom:'4px' }}>
                                        පාරිභෝගිකයාගේ අත්සන සහ මුද්‍රාව :
                                    </div>
                                    <div style={{ border: DBL, width:'80mm', height:'24mm', boxSizing:'border-box', marginTop:'4px' }}></div>
                                    <div style={{ fontSize:'8px', marginTop:'3px' }}>(භාණ්ඩ ලැබුණු බව තහවුරු කිරීමට)</div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}
