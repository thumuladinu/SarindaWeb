import React from 'react';
import EAN13Barcode from './EAN13Barcode';
import { buildBatchEAN13 } from '../../utils/labelUtils';

/**
 * Compact 60mm x 40mm Thermal Sticker Label (GS1 Lanka EAN-13 compliant).
 * Renders in real millimetres so label printers cut exactly on the sticker edge.
 * Uses batch-unique barcode (no QR code) for scanning and returns processing.
 */
export default function MiniBagLabel({
    brandName = 'CHAMIKA RICE MILLS',
    productName = 'KEERI SAMBA RICE',
    weight = '5 kg',
    mrp = '260.00',
    leavePriceEmpty = false,
    batchNo = 'B-2026-08A',
    packedBy = 'Chamika Rice Mills',
    mfgDate = '09/08/2026',
    expDate = '08/08/2027',
    productCode = '001',
    customEan = '',
    className = ''
}) {
    // Generate batch-unique EAN-13 barcode (replaces company code with batch identifier)
    const eanCode = customEan || buildBatchEAN13(batchNo, productCode);
    const displayMrp = leavePriceEmpty || !mrp ? '________________' : `Rs. ${parseFloat(mrp || 0).toFixed(2)}`;

    return (
        <div
            className={`bg-white text-black font-sans overflow-hidden select-none print:shadow-none ${className}`}
            style={{
                width: '60mm',
                minWidth: '60mm',
                maxWidth: '60mm',
                height: '40mm',
                minHeight: '40mm',
                maxHeight: '40mm',
                boxSizing: 'border-box',
                border: '1.5px solid #000',
                padding: '2.5mm 3mm',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                backgroundColor: '#ffffff',
                color: '#000000',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
            }}
        >
            {/* 1. BRAND + PRODUCT */}
            <div style={{ borderBottom: '1.5px solid #000', paddingBottom: '1mm', marginBottom: '1mm' }}>
                <div style={{ fontSize: '7.5px', fontWeight: 800, letterSpacing: '0.5px', color: '#000', textTransform: 'uppercase', lineHeight: 1 }}>
                    {brandName}
                </div>
                <div
                    style={{
                        fontSize: '11px',
                        fontWeight: 900,
                        letterSpacing: '0.3px',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: '0.8mm',
                        color: '#000',
                        lineHeight: 1.1,
                    }}
                >
                    {productName}
                </div>
            </div>

            {/* 2. NET WEIGHT + MRP */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    fontSize: '9px',
                    fontWeight: 700,
                    marginBottom: '1mm',
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                }}
            >
                <span>
                    <span style={{ color: '#333' }}>NET WT:</span>{' '}
                    <span style={{ fontWeight: 900, color: '#000' }}>{weight}</span>
                </span>
                <span>
                    <span style={{ color: '#333' }}>MRP:</span>{' '}
                    <span style={{ fontWeight: 900, color: '#000' }}>{displayMrp}</span>
                </span>
            </div>

            {/* 3. BATCH + MFG/EXP DATES (2 Micro Rows — Zero Truncation) */}
            <div
                style={{
                    fontSize: '7px',
                    fontWeight: 700,
                    borderTop: '1px solid #000',
                    borderBottom: '1px solid #000',
                    padding: '0.8mm 0',
                    marginBottom: '1mm',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.4mm',
                    color: '#000',
                    lineHeight: 1,
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>BATCH: <span style={{ fontFamily: 'monospace', fontWeight: 900 }}>{batchNo}</span></span>
                    <span>MFG: <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>{mfgDate}</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '6px', color: '#555', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '2mm' }}>{packedBy}</span>
                    <span>EXP: <span style={{ fontFamily: 'monospace', fontWeight: 800 }}>{expDate}</span></span>
                </div>
            </div>

            {/* 4. EAN-13 BARCODE (Batch-Unique) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <EAN13Barcode code={eanCode} width={200} height={38} />
            </div>
        </div>
    );
}
