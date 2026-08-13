import Dexie from 'dexie';

const db = new Dexie('ChamikaRiceMillDB');

// Define Schema for offline-first operation
db.version(5).stores({
    sales_bills: '++LOCAL_ID, BILL_ID, INVOICE_NO, BATCH_NO, CUSTOMER_ID, IS_SETTLED, DATE, CREATED_DATE, IS_SYNCED',
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
    expense_categories: 'CATEGORY_ID, NAME, IS_ACTIVE'
});

export default db;
