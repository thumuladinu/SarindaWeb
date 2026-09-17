import Dexie from 'dexie';

const db = new Dexie('ChamikaRiceMillDB');

// Define Schema for offline-first operation
// v7 — previous schema (no changes, required for migration chain)
db.version(7).stores({
    sales_bills: '++LOCAL_ID, BILL_ID, INVOICE_NO, BATCH_NO, DISPATCH_NO, CUSTOMER_ID, IS_SETTLED, DATE, CREATED_DATE, IS_SYNCED',
    dispatch_notes: '++LOCAL_ID, DISPATCH_ID, DISPATCH_NO, DATE, DRIVER_NAME, LORRY_NO, STATUS, IS_SYNCED, CREATED_DATE',
    stock_inwards: '++LOCAL_ID, INWARD_ID, DATE, ITEM_ID, VEHICLE_NO, IS_SYNCED, CREATED_DATE',
    sales_returns: '++LOCAL_ID, RETURN_ID, INVOICE_NO, CUSTOMER_ID, ITEM_ID, DATE, IS_SYNCED',
    items: 'ITEM_ID, CODE, SYSTEM_CODE, NAME, CATEGORY, IS_ACTIVE',
    customers: 'CUSTOMER_ID, NAME, PHONE, PHONE_NUMBER, IS_ACTIVE',
    vehicles: 'VEHICLE_ID, VEHICLE_NO, DRIVER_NAME, IS_ACTIVE',
    places: 'PLACE_ID, NAME, DISTRICT, IS_ACTIVE',
    staff: 'STAFF_ID, USERNAME, NAME, ROLE, PIN, IS_ACTIVE',
    yield_configs: 'ID',
    barcode_history: '++LOCAL_ID, BATCH_NO, INVOICE_NO, TOTAL_STICKERS, PRINTED_DATE',
    expenses: '++LOCAL_ID, EXPENSE_ID, EXPENSE_NO, CATEGORY_NAME, AMOUNT, DATE, IS_SYNCED',
    expense_categories: 'CATEGORY_ID, NAME, IS_ACTIVE',
    settings: 'key'
});

// v8 — adds CODE (permanent unique identifier for sync) and IS_SYNCED to customers
db.version(8).stores({
    sales_bills: '++LOCAL_ID, BILL_ID, INVOICE_NO, BATCH_NO, DISPATCH_NO, CUSTOMER_ID, IS_SETTLED, DATE, CREATED_DATE, IS_SYNCED',
    dispatch_notes: '++LOCAL_ID, DISPATCH_ID, DISPATCH_NO, DATE, DRIVER_NAME, LORRY_NO, STATUS, IS_SYNCED, CREATED_DATE',
    stock_inwards: '++LOCAL_ID, INWARD_ID, DATE, ITEM_ID, VEHICLE_NO, IS_SYNCED, CREATED_DATE',
    sales_returns: '++LOCAL_ID, RETURN_ID, INVOICE_NO, CUSTOMER_ID, ITEM_ID, DATE, IS_SYNCED',
    items: 'ITEM_ID, CODE, SYSTEM_CODE, NAME, CATEGORY, IS_ACTIVE',
    customers: 'CUSTOMER_ID, &CODE, NAME, PHONE, PHONE_NUMBER, IS_ACTIVE, IS_SYNCED',
    vehicles: 'VEHICLE_ID, VEHICLE_NO, DRIVER_NAME, IS_ACTIVE',
    places: 'PLACE_ID, NAME, DISTRICT, IS_ACTIVE',
    staff: 'STAFF_ID, USERNAME, NAME, ROLE, PIN, IS_ACTIVE',
    yield_configs: 'ID',
    barcode_history: '++LOCAL_ID, BATCH_NO, INVOICE_NO, TOTAL_STICKERS, PRINTED_DATE',
    expenses: '++LOCAL_ID, EXPENSE_ID, EXPENSE_NO, CATEGORY_NAME, AMOUNT, DATE, IS_SYNCED',
    expense_categories: 'CATEGORY_ID, NAME, IS_ACTIVE',
    settings: 'key'
}).upgrade(async tx => {
    // Backfill CODE for any existing customers that don't have one
    await tx.customers.toCollection().modify(cust => {
        if (!cust.CODE) {
            cust.CODE = `MCU-LOCAL-${String(cust.CUSTOMER_ID || Date.now()).slice(-4).padStart(4, '0')}`;
        }
        if (cust.IS_SYNCED === undefined) {
            // Customers already in Dexie came from server pull — mark them synced
            cust.IS_SYNCED = 1;
        }
    });
});

export async function seedDefaultOfflineData() {
    try {
        // Only seed items catalog if empty (for default pricing matrix)
        const itemCount = await db.items.count();
        if (itemCount === 0) {
            const defaultItems = [
                { ITEM_ID: 101, CODE: 'RATHU_P', SYSTEM_CODE: 'OUT_RATHU_KAKULU_P', NAME: 'රතු කැකුළු හාල් (P)', CATEGORY: 'output', VARIATION: 'P', BASE: 'රතු කැකුළු හාල්', SELLING_PRICE: 150, BUYING_PRICE: 120, IS_ACTIVE: 1 },
                { ITEM_ID: 102, CODE: 'RATHU_N', SYSTEM_CODE: 'OUT_RATHU_KAKULU_N', NAME: 'රතු කැකුළු හාල් (N)', CATEGORY: 'output', VARIATION: 'N', BASE: 'රතු කැකුළු හාල්', SELLING_PRICE: 140, BUYING_PRICE: 115, IS_ACTIVE: 1 },
                { ITEM_ID: 103, CODE: 'SUDU_P', SYSTEM_CODE: 'OUT_SUDU_KAKULU_P', NAME: 'සුදු කැකුළු හාල් (P)', CATEGORY: 'output', VARIATION: 'P', BASE: 'සුදු කැකුළු හාල්', SELLING_PRICE: 150, BUYING_PRICE: 120, IS_ACTIVE: 1 },
                { ITEM_ID: 104, CODE: 'SUDU_N', SYSTEM_CODE: 'OUT_SUDU_KAKULU_N', NAME: 'සුදු කැකුළු හාල් (N)', CATEGORY: 'output', VARIATION: 'N', BASE: 'සුදු කැකුළු හාල්', SELLING_PRICE: 140, BUYING_PRICE: 115, IS_ACTIVE: 1 },
                { ITEM_ID: 105, CODE: 'NADU_P', SYSTEM_CODE: 'OUT_NADU_P', NAME: 'නාඩු හාල් (P)', CATEGORY: 'output', VARIATION: 'P', BASE: 'නාඩු හාල්', SELLING_PRICE: 160, BUYING_PRICE: 130, IS_ACTIVE: 1 },
                { ITEM_ID: 106, CODE: 'NADU_N', SYSTEM_CODE: 'OUT_NADU_N', NAME: 'නාඩු හාල් (N)', CATEGORY: 'output', VARIATION: 'N', BASE: 'නාඩු හාල්', SELLING_PRICE: 150, BUYING_PRICE: 125, IS_ACTIVE: 1 },
                { ITEM_ID: 107, CODE: 'KUDU', SYSTEM_CODE: 'OUT_KUDU', NAME: 'කුඩු (Kudu)', CATEGORY: 'by_product', SELLING_PRICE: 80, BUYING_PRICE: 60, IS_ACTIVE: 1 },
                { ITEM_ID: 108, CODE: 'HUNSAL', SYSTEM_CODE: 'OUT_HUNSAL', NAME: 'හුන්සාල් (Hunsal)', CATEGORY: 'by_product', SELLING_PRICE: 110, BUYING_PRICE: 90, IS_ACTIVE: 1 }
            ];
            await db.items.bulkPut(defaultItems);
        }
    } catch (e) {
        console.error('Error seeding default offline database data:', e);
    }
}

// Auto seed on DB ready
db.on('ready', () => {
    seedDefaultOfflineData();
});

export default db;
