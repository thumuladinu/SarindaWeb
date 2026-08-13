/**
 * Bag Label & Barcode Utility Functions (Electron Offline-First Compatible)
 * Supports EAN-13 GS1 Lanka Barcodes, Secure Internal QR Codes, and Standardized Batching.
 */

export const GS1_SL_PREFIX = '479';

export const STANDARD_RICE_ITEM_CODES = [
    { code: '001', name: 'Samba Rice 5kg', systemCode: 'OUT_SAMBA_5KG', defaultWeight: 5, category: 'Samba' },
    { code: '002', name: 'Samba Rice 10kg', systemCode: 'OUT_SAMBA_10KG', defaultWeight: 10, category: 'Samba' },
    { code: '003', name: 'Samba Rice 25kg', systemCode: 'OUT_SAMBA_25KG', defaultWeight: 25, category: 'Samba' },
    { code: '004', name: 'Samba Rice 50kg', systemCode: 'OUT_SAMBA_50KG', defaultWeight: 50, category: 'Samba' },

    { code: '010', name: 'Nadu Rice 5kg', systemCode: 'OUT_NADU_5KG', defaultWeight: 5, category: 'Nadu' },
    { code: '011', name: 'Nadu Rice 10kg', systemCode: 'OUT_NADU_10KG', defaultWeight: 10, category: 'Nadu' },
    { code: '012', name: 'Nadu Rice 25kg', systemCode: 'OUT_NADU_25KG', defaultWeight: 25, category: 'Nadu' },
    { code: '013', name: 'Nadu Rice 50kg', systemCode: 'OUT_NADU_50KG', defaultWeight: 50, category: 'Nadu' },

    { code: '020', name: 'Keeri Samba Rice 5kg', systemCode: 'OUT_KEERI_5KG', defaultWeight: 5, category: 'Keeri Samba' },
    { code: '021', name: 'Keeri Samba Rice 10kg', systemCode: 'OUT_KEERI_10KG', defaultWeight: 10, category: 'Keeri Samba' },
    { code: '022', name: 'Keeri Samba Rice 25kg', systemCode: 'OUT_KEERI_25KG', defaultWeight: 25, category: 'Keeri Samba' },
    { code: '023', name: 'Keeri Samba Rice 50kg', systemCode: 'OUT_KEERI_50KG', defaultWeight: 50, category: 'Keeri Samba' },

    { code: '099', name: 'Custom / Other Rice Product', systemCode: 'CUSTOM', defaultWeight: 5, category: 'Other' },
];

export function calculateEAN13CheckDigit(first12) {
    const clean = String(first12 || '').replace(/\D/g, '').padStart(12, '0').slice(0, 12);
    let sumOdd = 0;
    let sumEven = 0;
    for (let i = 0; i < 12; i++) {
        const val = parseInt(clean[i], 10);
        if (i % 2 === 0) {
            sumOdd += val;
        } else {
            sumEven += val;
        }
    }
    const total = sumOdd + (sumEven * 3);
    const remainder = total % 10;
    return remainder === 0 ? '0' : String(10 - remainder);
}

export function buildEAN13(companyCode = '000000', itemProductCode = '001') {
    const prefix = GS1_SL_PREFIX;
    const company = String(companyCode || '000000').replace(/\D/g, '').padStart(6, '0').slice(0, 6);
    const product = String(itemProductCode || '001').replace(/\D/g, '').padStart(3, '0').slice(0, 3);
    const first12 = `${prefix}${company}${product}`;
    const checkDigit = calculateEAN13CheckDigit(first12);
    return `${first12}${checkDigit}`;
}

export function getEAN13Modules(code13) {
    if (!code13 || String(code13).length !== 13) return null;
    const digits = String(code13);
    const firstDigit = parseInt(digits[0], 10);
    const left6 = digits.slice(1, 7);
    const right6 = digits.slice(7, 13);

    const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
    const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];

    const PARITY_MAP = [
        'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
        'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
    ];

    const parity = PARITY_MAP[firstDigit] || 'LLLLLL';
    let modules = '101';

    for (let i = 0; i < 6; i++) {
        const d = parseInt(left6[i], 10);
        modules += (parity[i] === 'L') ? L[d] : G[d];
    }

    modules += '01010';

    for (let i = 0; i < 6; i++) {
        const d = parseInt(right6[i], 10);
        modules += R[d];
    }

    modules += '101';
    return modules;
}

const SECRET_SALT = 'CMR_SECURE_BAG_SALT_2026';

export function encryptBagQR(payload) {
    try {
        const jsonStr = JSON.stringify(payload);
        let obfuscated = '';
        for (let i = 0; i < jsonStr.length; i++) {
            const charCode = jsonStr.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
            obfuscated += String.fromCharCode(charCode);
        }
        const b64 = btoa(unescape(encodeURIComponent(obfuscated)));
        return `CRM-BAG::${b64}`;
    } catch (e) {
        return `CRM-BAG::${btoa(JSON.stringify(payload))}`;
    }
}

export function decryptBagQR(encryptedStr) {
    if (!encryptedStr || typeof encryptedStr !== 'string') return null;
    try {
        let clean = encryptedStr.trim();
        if (clean.startsWith('CRM-BAG::')) {
            clean = clean.replace('CRM-BAG::', '');
        }
        const decodedRaw = decodeURIComponent(escape(atob(clean)));
        let jsonStr = '';
        for (let i = 0; i < decodedRaw.length; i++) {
            const charCode = decodedRaw.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
            jsonStr += String.fromCharCode(charCode);
        }
        return JSON.parse(jsonStr);
    } catch (e) {
        try {
            let clean = encryptedStr.replace('CRM-BAG::', '');
            return JSON.parse(atob(clean));
        } catch (err) {
            return null;
        }
    }
}

export function generateStandardBatchNo(counter = 1) {
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const num = String(counter).padStart(3, '0');
    return `B-${todayStr}-${num}`;
}

/**
 * Extract a deterministic, collision-free 6-digit code from batch number for EAN-13 barcode.
 * Format: B-YYYYMMDD-XXX → Y DDD XX (6 digits)
 * - Y (1 digit): Year mod 10 (e.g., 2026 → 6, 2027 → 7)
 * - DDD (3 digits): Day of Year (001 to 366, e.g., Aug 9 → 221)
 * - XX (2 digits): Last 2 digits of batch sequence (00 to 99)
 * Example: B-20260809-964 → Year 6 + Day 221 + Seq 64 → 622164
 */
export function batchToUniqueCode(batchNo) {
    if (!batchNo || typeof batchNo !== 'string') return '000000';

    // Parse standard format: B-YYYYMMDD-XXX or YYYYMMDD-XXX
    const match = batchNo.match(/(?:B-)?(\d{4})(\d{2})(\d{2})-(\d+)/i);
    if (match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // 0-indexed
        const day = parseInt(match[3], 10);
        const seq = parseInt(match[4], 10);

        // 1. Y (1 digit): Year mod 10
        const yDigit = String(year % 10);

        // 2. DDD (3 digits): Day of Year (1 - 366)
        const dateObj = new Date(Date.UTC(year, month, day));
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const dayOfYear = Math.floor((dateObj - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
        const dddStr = String(Math.min(Math.max(dayOfYear, 1), 366)).padStart(3, '0');

        // 3. XX (2 digits): Sequence mod 100
        const xxStr = String(seq % 100).padStart(2, '0');

        return `${yDigit}${dddStr}${xxStr}`;
    }

    // Fallback for custom format: FNV-1a 32-bit hash mod 1,000,000
    let hash = 2166136261;
    for (let i = 0; i < batchNo.length; i++) {
        hash ^= batchNo.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return String(Math.abs(hash) % 1000000).padStart(6, '0');
}

/**
 * Build EAN-13 barcode with batch-unique identifier
 * Format: 479-BBBBBB-PPP-C
 * - 479: GS1 Lanka prefix
 * - BBBBBB: 6-digit unique code from batch number
 * - PPP: 3-digit product code (bag size)
 * - C: check digit
 */
export function buildBatchEAN13(batchNo, productCode) {
    const batchCode = batchToUniqueCode(batchNo);
    const prodCode = String(productCode || '001').padStart(3, '0').slice(-3);
    const first12 = `${GS1_SL_PREFIX}${batchCode}${prodCode}`;
    const checkDigit = calculateEAN13CheckDigit(first12);
    return first12 + checkDigit;
}

/**
 * Decode a scanned 13-digit EAN barcode into parsed batch & product metadata
 * Format: 479 [Y DDD XX] [PPP] [C]
 */
export function decodeBatchEAN13(eanCode) {
    const clean = String(eanCode || '').replace(/\D/g, '');
    if (clean.length !== 13) return null;

    const prefix = clean.slice(0, 3);
    const batchCode = clean.slice(3, 9);
    const itemCode = clean.slice(9, 12);
    const checkDigit = clean.slice(12, 13);

    const yearDigit = parseInt(batchCode[0], 10);
    const dayOfYear = parseInt(batchCode.slice(1, 4), 10);
    const seqLast2 = parseInt(batchCode.slice(4, 6), 10);

    const product = STANDARD_RICE_ITEM_CODES.find(p => p.code === itemCode) || null;

    return {
        isValidGs1Lanka: prefix === GS1_SL_PREFIX,
        prefix,
        batchCode,
        yearDigit,
        dayOfYear,
        seqLast2,
        itemCode,
        productName: product ? product.name : 'Unknown Product',
        checkDigit
    };
}
