/**
 * Core Milling Hardcoded Items (Electron version)
 * As requested by the user, item names are in Sinhala script.
 * Nadu items are marked with IS_FUTURE: true to be hidden by default.
 */

export const ITEM_CATEGORIES = {
    RAW_INPUT: 'raw_input',
    OUTPUT: 'output',
    BY_PRODUCT: 'by_product',
    SEASONAL: 'seasonal'
};

// Default weight variations every output item is seeded with.
// Each weight gets its own globally-unique 3-digit GS1 product code.
export const DEFAULT_WEIGHT_VARIATIONS = [5, 10, 25, 50];

export const RAW_ITEMS = [
    { SYSTEM_CODE: 'RAW_RATHU_KAKULU', NAME: 'වී රතු කැකුළු', CATEGORY: ITEM_CATEGORIES.RAW_INPUT },
    { SYSTEM_CODE: 'RAW_SUDU_KAKULU', NAME: 'වී සුදු කැකුළු', CATEGORY: ITEM_CATEGORIES.RAW_INPUT },
    { SYSTEM_CODE: 'RAW_NADU', NAME: 'වී නාඩු', CATEGORY: ITEM_CATEGORIES.RAW_INPUT, IS_FUTURE: true }
];

export const FINISHED_ITEMS = [
    // P = Polished, N = Niudu
    { SYSTEM_CODE: 'OUT_RATHU_KAKULU_P', NAME: 'රතු කැකුළු හාල් (P)', CATEGORY: ITEM_CATEGORIES.OUTPUT, VARIATION: 'P', BASE: 'රතු කැකුළු හාල්', GS1_CODE: '' },
    { SYSTEM_CODE: 'OUT_RATHU_KAKULU_N', NAME: 'රතු කැකුළු හාල් (N)', CATEGORY: ITEM_CATEGORIES.OUTPUT, VARIATION: 'N', BASE: 'රතු කැකුළු හාල්', GS1_CODE: '' },
    { SYSTEM_CODE: 'OUT_SUDU_KAKULU_P', NAME: 'සුදු කැකුළු හාල් (P)', CATEGORY: ITEM_CATEGORIES.OUTPUT, VARIATION: 'P', BASE: 'සුදු කැකුළු හාල්', GS1_CODE: '' },
    { SYSTEM_CODE: 'OUT_SUDU_KAKULU_N', NAME: 'සුදු කැකුළු හාල් (N)', CATEGORY: ITEM_CATEGORIES.OUTPUT, VARIATION: 'N', BASE: 'සුදු කැකුළු හාල්', GS1_CODE: '' },
    { SYSTEM_CODE: 'OUT_NADU_P', NAME: 'නාඩු හාල් (P)', CATEGORY: ITEM_CATEGORIES.OUTPUT, VARIATION: 'P', BASE: 'නාඩු හාල්', IS_FUTURE: true, GS1_CODE: '' },
    { SYSTEM_CODE: 'OUT_NADU_N', NAME: 'නාඩු හාල් (N)', CATEGORY: ITEM_CATEGORIES.OUTPUT, VARIATION: 'N', BASE: 'නාඩු හාල්', IS_FUTURE: true, GS1_CODE: '' }
];

export const BY_PRODUCTS = [
    { SYSTEM_CODE: 'OUT_KUDU', NAME: 'කුඩු (Kudu)', CATEGORY: ITEM_CATEGORIES.BY_PRODUCT },
    { SYSTEM_CODE: 'OUT_HUNSAL', NAME: 'හුන්සාල් (Hunsal)', CATEGORY: ITEM_CATEGORIES.BY_PRODUCT }
];

// Master list of all hardcoded items
export const ALL_HARDCODED_ITEMS = [
    ...RAW_ITEMS,
    ...FINISHED_ITEMS,
    ...BY_PRODUCTS
];

export const getHardcodedItemBySystemCode = (systemCode) => {
    return ALL_HARDCODED_ITEMS.find(item => item.SYSTEM_CODE === systemCode) || null;
};
