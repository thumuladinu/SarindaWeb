import React from 'react';
import EAN13Barcode from './EAN13Barcode';
import QRCodeSVG from './QRCodeSVG';
import { buildEAN13, encryptBagQR } from '../../utils/labelUtils';

/**
 * Official Standard Rice Bag Label Component (Electron Compatible)
 */
export default function ProductBagLabel({
    brandName = 'CHAMIKA RICE MILLS',
    productName = 'KEERI SAMBA RICE',
    weight = '5 kg',
    mrp = '260.00',
    leavePriceEmpty = false,
    batchNo = 'B-2026-08A',
    packedBy = 'Chamika Rice Mills, Sooriyawewa, SL',
    mfgDate = '09/08/2026',
    expDate = '08/08/2027',
    companyCode = '000000',
    productCode = '001',
    customEan = '',
    customQr = '',
    scale = 1,
    className = ''
}) {
    const eanCode = customEan || buildEAN13(companyCode, productCode);

    const qrPayload = customQr || encryptBagQR({
        brand: brandName,
        product: productName,
        weight,
        mrp: leavePriceEmpty ? null : mrp,
        batchNo,
        packedBy,
        mfgDate,
        expDate,
        ean: eanCode,
        ts: Date.now()
    });

    const displayMrp = leavePriceEmpty || !mrp ? '________________' : `Rs. ${parseFloat(mrp || 0).toFixed(2)}`;

    return (
        <div
            className={`bg-white text-black font-sans border-2 border-black p-3 box-sizing-border-box flex flex-col justify-between select-none shadow-sm print:shadow-none print:m-0 print:border-2 ${className}`}
            style={{
                width: `${340 * scale}px`,
                height: `${440 * scale}px`,
                minWidth: `${340 * scale}px`,
                minHeight: `${440 * scale}px`,
            }}
        >
            {/* 1. BRAND & PRODUCT IDENTITY HEADER */}
            <div className="border-b-2 border-black pb-2 text-center">
                <div className="font-extrabold text-lg tracking-wider uppercase leading-tight font-serif text-black">
                    [ {brandName || 'CHAMIKA RICE MILLS'} ]
                </div>
                <div className="font-black text-xl tracking-widest uppercase mt-0.5 text-black">
                    {productName || 'KEERI SAMBA RICE'}
                </div>
            </div>

            {/* 2. SPECIFICATIONS & INTERNAL QR */}
            <div className="grid grid-cols-12 border-b-2 border-black py-2 gap-1 items-center">
                <div className="col-span-8 space-y-1 text-xs font-semibold leading-snug">
                    <div className="flex items-baseline">
                        <span className="w-24 font-bold text-gray-800">NET WEIGHT:</span>
                        <span className="font-extrabold text-sm text-black">{weight}</span>
                    </div>
                    <div className="flex items-baseline">
                        <span className="w-24 font-bold text-gray-800">MRP:</span>
                        <span className="font-extrabold text-sm text-black">{displayMrp}</span>
                    </div>
                    <div className="flex items-baseline">
                        <span className="w-24 font-bold text-gray-800">BATCH:</span>
                        <span className="font-mono font-bold text-xs bg-gray-100 px-1 border border-gray-400">{batchNo}</span>
                    </div>
                    <div className="flex items-baseline">
                        <span className="w-24 font-bold text-gray-800">PACKED BY:</span>
                        <span className="text-[10px] truncate max-w-[130px]" title={packedBy}>{packedBy}</span>
                    </div>
                </div>

                <div className="col-span-4 flex flex-col items-center justify-center pl-1 border-l border-gray-300">
                    <QRCodeSVG value={qrPayload} size={70} />
                    <span className="text-[7.5px] font-bold text-gray-600 mt-1 uppercase tracking-tighter text-center">
                        INTERNAL QR
                    </span>
                </div>
            </div>

            {/* 3. DATES */}
            <div className="grid grid-cols-2 border-b-2 border-black py-1.5 px-1 text-xs font-bold text-center bg-gray-50">
                <div className="border-r border-black pr-1">
                    <span className="text-[10px] text-gray-600 block">MFG DATE:</span>
                    <span className="font-mono text-sm text-black">{mfgDate}</span>
                </div>
                <div className="pl-1">
                    <span className="text-[10px] text-gray-600 block">EXP DATE (12M):</span>
                    <span className="font-mono text-sm text-black">{expDate}</span>
                </div>
            </div>

            {/* 4. OFFICIAL SUPERMARKET BARCODE (EAN-13) */}
            <div className="pt-2 flex flex-col items-center justify-center">
                <EAN13Barcode code={eanCode} width={260} height={62} />
                <div className="text-[9px] font-mono font-semibold text-gray-600 mt-0.5 tracking-wider">
                    GS1 LANKA OFFICIAL BARCODE
                </div>
            </div>
        </div>
    );
}
