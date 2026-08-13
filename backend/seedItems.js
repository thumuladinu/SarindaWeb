const mysql = require('mysql2/promise');
const { ensureDefaultVariationsOnConnection } = require('./variationSeeding');

const ITEM_CATEGORIES = {
    RAW_INPUT: 'raw_input',
    OUTPUT: 'output',
    BY_PRODUCT: 'by_product'
};

const ALL_HARDCODED_ITEMS = [
    // RAW ITEMS
    { SYSTEM_CODE: 'RAW_RATHU_KAKULU', NAME: 'වී රතු කැකුළු', CATEGORY: ITEM_CATEGORIES.RAW_INPUT, IS_ACTIVE: 1 },
    { SYSTEM_CODE: 'RAW_SUDU_KAKULU', NAME: 'වී සුදු කැකුළු', CATEGORY: ITEM_CATEGORIES.RAW_INPUT, IS_ACTIVE: 1 },
    { SYSTEM_CODE: 'RAW_NADU', NAME: 'වී නාඩු', CATEGORY: ITEM_CATEGORIES.RAW_INPUT, IS_ACTIVE: 0 },
    
    // FINISHED ITEMS
    { SYSTEM_CODE: 'OUT_RATHU_KAKULU_P', NAME: 'රතු කැකුළු හාල් (P)', CATEGORY: ITEM_CATEGORIES.OUTPUT, IS_ACTIVE: 1 },
    { SYSTEM_CODE: 'OUT_RATHU_KAKULU_N', NAME: 'රතු කැකුළු හාල් (N)', CATEGORY: ITEM_CATEGORIES.OUTPUT, IS_ACTIVE: 1 },
    { SYSTEM_CODE: 'OUT_SUDU_KAKULU_P', NAME: 'සුදු කැකුළු හාල් (P)', CATEGORY: ITEM_CATEGORIES.OUTPUT, IS_ACTIVE: 1 },
    { SYSTEM_CODE: 'OUT_SUDU_KAKULU_N', NAME: 'සුදු කැකුළු හාල් (N)', CATEGORY: ITEM_CATEGORIES.OUTPUT, IS_ACTIVE: 1 },
    { SYSTEM_CODE: 'OUT_NADU_P', NAME: 'නාඩු හාල් (P)', CATEGORY: ITEM_CATEGORIES.OUTPUT, IS_ACTIVE: 0 },
    { SYSTEM_CODE: 'OUT_NADU_N', NAME: 'නාඩු හාල් (N)', CATEGORY: ITEM_CATEGORIES.OUTPUT, IS_ACTIVE: 0 },
    
    // BY PRODUCTS
    { SYSTEM_CODE: 'OUT_KUDU', NAME: 'කුඩු (Kudu)', CATEGORY: ITEM_CATEGORIES.BY_PRODUCT, IS_ACTIVE: 1 },
    { SYSTEM_CODE: 'OUT_HUNSAL', NAME: 'හුන්සාල් (Hunsal)', CATEGORY: ITEM_CATEGORIES.BY_PRODUCT, IS_ACTIVE: 1 }
];

async function seedItems() {
    console.log('Connecting to database...');
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: '',
        database: 'chamika_rice_mill'
    });

    try {
        console.log('Wiping old mill_items...');
        await connection.query('DELETE FROM mill_items');

        console.log('Inserting new core items with IS_ACTIVE status...');
        for (const item of ALL_HARDCODED_ITEMS) {
            await connection.query(
                `INSERT INTO mill_items (SYSTEM_CODE, CODE, CATEGORY, NAME, UNIT, BUYING_PRICE, SELLING_PRICE, IS_ACTIVE) 
                 VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
                [
                    item.SYSTEM_CODE, 
                    item.SYSTEM_CODE, // use SYSTEM_CODE as CODE too
                    item.CATEGORY, 
                    item.NAME, 
                    'kg',
                    item.IS_ACTIVE
                ]
            );
        }
        
        console.log('Successfully re-seeded database with IS_ACTIVE status!');

        // Restore the 4 default weight variations (5/10/25/50 KG) with GS1 codes
        // for every output item. mill_item_variations has ON DELETE CASCADE, so
        // the DELETE above removed old rows; this repopulates them.
        const { created } = await ensureDefaultVariationsOnConnection(connection);
        console.log(`Seeded ${created} default weight variations for output items`);
    } catch (e) {
        console.error('Error during seeding:', e);
    } finally {
        await connection.end();
    }
}

seedItems();
