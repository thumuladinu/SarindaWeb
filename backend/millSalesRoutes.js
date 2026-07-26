const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

router.use(cors());
pool.query = util.promisify(pool.query);

// Generate Invoice Number: MIV-YYYYMMDD-XXXX
const generateInvoiceNo = async () => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM mill_bills WHERE DATE(CREATED_DATE) = CURDATE()`
    );
    const seq = (countResult[0]?.count || 0) + 1;
    return `MIV-${dateStr}-${String(seq).padStart(4, '0')}`;
};

// Helper function to update inventory (copied pattern from inward)
const updateInventoryLedger = async (itemId, placeId, quantity, type, refType, refId, date, notes, createdBy) => {
    // Get current balance
    const balanceResult = await pool.query(
        `SELECT COALESCE(SUM(CASE 
            WHEN TYPE IN ('IN','ADJ_IN') THEN QUANTITY 
            WHEN TYPE IN ('OUT','ADJ_OUT') THEN -QUANTITY 
            ELSE 0 END), 0) as balance 
        FROM mill_inventory_ledger 
        WHERE ITEM_ID = ? AND (PLACE_ID = ? OR (? IS NULL AND PLACE_ID IS NULL)) AND IS_ACTIVE = 1`,
        [itemId, placeId, placeId]
    );
    const currentBalance = parseFloat(balanceResult[0]?.balance || 0);
    const newBalance = type === 'IN' || type === 'ADJ_IN' 
        ? currentBalance + parseFloat(quantity) 
        : currentBalance - parseFloat(quantity);

    await pool.query('INSERT INTO mill_inventory_ledger SET ?', {
        ITEM_ID: itemId,
        PLACE_ID: placeId || null,
        TYPE: type,
        QUANTITY: quantity,
        BALANCE_AFTER: newBalance,
        REFERENCE_TYPE: refType,
        REFERENCE_ID: refId,
        DATE: date,
        NOTES: notes || null,
        CREATED_BY: createdBy || null,
    });

    // Also update STOCK in mill_items
    if (type === 'IN' || type === 'ADJ_IN') {
        await pool.query('UPDATE mill_items SET STOCK = COALESCE(STOCK, 0) + ? WHERE ITEM_ID = ?', [quantity, itemId]);
    } else {
        await pool.query('UPDATE mill_items SET STOCK = COALESCE(STOCK, 0) - ? WHERE ITEM_ID = ?', [quantity, itemId]);
    }
};

// ─── ADD SALE (BILLING) ──────────────────────────────────────
router.post('/api/mill/sales/add', async (req, res) => {
    try {
        const { CUSTOMER_ID, TOTAL_AMOUNT, DISCOUNT, NET_AMOUNT, DATE, PAYMENT_METHOD, CREATED_BY, ITEMS } = req.body;
        
        if (!ITEMS || !Array.isArray(ITEMS) || ITEMS.length === 0) {
            return res.status(400).json({ success: false, message: 'Bill must contain at least one item' });
        }

        const invoiceNo = await generateInvoiceNo();

        // 1. Create the Bill
        const billResult = await pool.query('INSERT INTO mill_bills SET ?', {
            INVOICE_NO: invoiceNo,
            CUSTOMER_ID: CUSTOMER_ID || null,
            TOTAL_AMOUNT: TOTAL_AMOUNT || 0,
            DISCOUNT: DISCOUNT || 0,
            NET_AMOUNT: NET_AMOUNT || 0,
            DATE: DATE,
            PAYMENT_METHOD: PAYMENT_METHOD || 'cash',
            CREATED_BY: CREATED_BY
        });

        const billId = billResult.insertId;

        // 2. Get Yield Configs & System Items for Milling Math
        const [yieldConfigRes] = await pool.query('SELECT * FROM mill_yield_configs LIMIT 1');
        const yieldConfig = yieldConfigRes && yieldConfigRes.length > 0 ? yieldConfigRes[0] : null;

        const systemItemsRes = await pool.query('SELECT ITEM_ID, SYSTEM_CODE FROM mill_items WHERE SYSTEM_CODE IS NOT NULL');
        const systemItems = {};
        systemItemsRes.forEach(i => {
            systemItems[i.SYSTEM_CODE] = i.ITEM_ID;
        });

        const dryWeeId = systemItems['RAW_WEE_DRY'];
        const halId = systemItems['OUT_HAL'];
        const kuduId = systemItems['OUT_KUDU'];
        const hunsalId = systemItems['OUT_HUNSAL'];

        // 3. Process each item in the bill
        for (const item of ITEMS) {
            let estimatedInputUsed = 0;
            let estimatedKudu = 0;
            let estimatedHunsal = 0;

            // Mathematical Estimation for Milling if they sold 'Hal'
            if (item.ITEM_ID == halId && yieldConfig) {
                // If they sold 100kg of Hal, and Hal yield is 65% (0.65)
                const halYieldFactor = parseFloat(yieldConfig.HAL_YIELD) / 100;
                const kuduYieldFactor = parseFloat(yieldConfig.KUDU_YIELD) / 100;
                const hunsalYieldFactor = parseFloat(yieldConfig.HUNSAL_YIELD) / 100;
                
                if (halYieldFactor > 0) {
                    // Reverse calculate how much Dry Wee was needed
                    estimatedInputUsed = parseFloat(item.QUANTITY) / halYieldFactor;
                    
                    // Estimate by-products generated from that input
                    estimatedKudu = estimatedInputUsed * kuduYieldFactor;
                    estimatedHunsal = estimatedInputUsed * hunsalYieldFactor;

                    // Update Inventory based on estimations
                    if (dryWeeId) {
                        await updateInventoryLedger(dryWeeId, null, estimatedInputUsed, 'OUT', 'sale_milling_est', billId, DATE, `Estimated milled for Invoice ${invoiceNo}`, CREATED_BY);
                    }
                    // Note: We don't necessarily add kudu/hunsal to inventory dynamically here unless requested, 
                    // user said "we dont count therese results items invtry", but we can log it in the bill items table.
                    // If we do want to add it to inventory, we could do it here. But usually, if they don't count it, we just deduct what they sell.
                }
            }

            // Insert Bill Item
            await pool.query('INSERT INTO mill_bill_items SET ?', {
                BILL_ID: billId,
                ITEM_ID: item.ITEM_ID,
                QUANTITY: item.QUANTITY,
                UNIT_PRICE: item.UNIT_PRICE,
                TOTAL_PRICE: item.TOTAL_PRICE,
                ESTIMATED_INPUT_USED: estimatedInputUsed,
                ESTIMATED_KUDU_GENERATED: estimatedKudu,
                ESTIMATED_HUNSAL_GENERATED: estimatedHunsal
            });

            // Deduct sold item from Inventory
            await updateInventoryLedger(item.ITEM_ID, null, item.QUANTITY, 'OUT', 'sale', billId, DATE, `Sale Invoice ${invoiceNo}`, CREATED_BY);
        }

        res.json({ success: true, message: 'Sale recorded successfully', invoiceNo: invoiceNo, billId: billId });

    } catch (error) {
        console.error('Error adding mill sale:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
