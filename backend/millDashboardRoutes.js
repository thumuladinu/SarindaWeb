// millDashboardRoutes.js — Mill Operations Dashboard Analytics API
const express = require('express');
const router = express.Router();
const cors = require('cors');
const pool = require('./index');
const util = require('util');

router.use(cors());
pool.query = util.promisify(pool.query);

// ─── GET MILL DASHBOARD STATS ──────────────────────────────────
router.get('/api/mill/dashboard/stats', async (req, res) => {
    try {
        const today = new Date().toISOString().slice(0, 10);

        // 1. Today's Sales Calculation (Strictly for today's sales bills)
        const todaySalesRes = await pool.query(`
            SELECT COALESCE(SUM(COALESCE(FINAL_AMOUNT, NET_AMOUNT, TOTAL_AMOUNT, 0)), 0) as today_sales,
                   COUNT(BILL_ID) as bill_count
            FROM mill_bills
            WHERE (DATE(CREATED_DATE) = CURDATE() OR DATE(DATE) = CURDATE() OR DATE(CONVERT_TZ(CREATED_DATE, '+00:00', '+05:30')) = CURDATE())
        `);

        const salesAmt = parseFloat(todaySalesRes[0]?.today_sales || 0);
        const salesCount = todaySalesRes[0]?.bill_count || 0;

        // 2. Today's Paddy Inward Valuation (Sum TOTAL_PRICE or QUANTITY * PRICE_PER_UNIT across ALL inward types)
        const todayPurchaseRes = await pool.query(`
            SELECT COALESCE(SUM(COALESCE(TOTAL_PRICE, QUANTITY * COALESCE(PRICE_PER_UNIT, 0), 0)), 0) as today_purchase
            FROM mill_stock_inward
            WHERE (DATE(CREATED_DATE) = CURDATE() OR DATE(DATE) = CURDATE() OR DATE(CONVERT_TZ(CREATED_DATE, '+00:00', '+05:30')) = CURDATE())
        `).catch(() => [{ today_purchase: 0 }]);

        const buyingAmt = parseFloat(todayPurchaseRes[0]?.today_purchase || 0);

        // 3. Today's Expenses Calculation
        const expensesRes = await pool.query(`
            SELECT COALESCE(SUM(AMOUNT), 0) as total_expenses
            FROM mill_expenses
            WHERE (DATE(CREATED_DATE) = CURDATE() OR DATE(DATE) = CURDATE() OR DATE(CONVERT_TZ(CREATED_DATE, '+00:00', '+05:30')) = CURDATE())
        `).catch(() => [{ total_expenses: 0 }]);

        const expensesAmt = parseFloat(expensesRes[0]?.total_expenses || 0);

        // 4. Net Cash Flow & Average Profit Math for Today
        const netCashFlow = salesAmt - buyingAmt - expensesAmt;
        const avgProfit = salesAmt > 0 ? (salesAmt * 0.18) - expensesAmt : (buyingAmt > 0 ? (buyingAmt * 0.05) : 0);

        // 2. Today's Inward Paddy Summary
        const inwardStatsQuery = await pool.query(`
            SELECT 
                COALESCE(SUM(QUANTITY), 0) as today_inward_kg,
                COUNT(INWARD_ID) as today_inward_records
            FROM mill_stock_inward
            WHERE DATE(CREATED_DATE) = ?
        `, [today]);

        // 3. Today's Stock Movement (Item-wise Inward/Buy vs Sales/Sell vs Net Change)
        const stockItems = await pool.query(`SELECT ITEM_ID, CODE, NAME FROM mill_items WHERE IS_ACTIVE = 1`);
        
        let inwardMovement = await pool.query(`
            SELECT ITEM_ID, COALESCE(SUM(QUANTITY), 0) as buyQty
            FROM mill_stock_inward
            WHERE (DATE(CREATED_DATE) = ? OR DATE(DATE) = ?)
            GROUP BY ITEM_ID
        `, [today, today]);

        let salesMovement = await pool.query(`
            SELECT bi.ITEM_ID, COALESCE(SUM(COALESCE(bi.QUANTITY, bi.BAG_COUNT * bi.BAG_WEIGHT, 0)), 0) as sellQty
            FROM mill_bill_items bi
            JOIN mill_bills b ON bi.BILL_ID = b.BILL_ID
            WHERE (DATE(b.CREATED_DATE) = ? OR DATE(b.DATE) = ?) AND bi.IS_ARCHIVED = 0
            GROUP BY bi.ITEM_ID
        `, [today, today]);

        // Strictly calculate today's movements without all-time fallback

        const buyMap = {};
        inwardMovement.forEach(r => { buyMap[r.ITEM_ID] = parseFloat(r.buyQty || 0); });
        
        const sellMap = {};
        salesMovement.forEach(r => { sellMap[r.ITEM_ID] = parseFloat(r.sellQty || 0); });

        const stockMovement = stockItems.map(item => {
            const buyQty = buyMap[item.ITEM_ID] || 0;
            const sellQty = sellMap[item.ITEM_ID] || 0;
            return {
                id: item.ITEM_ID,
                code: item.CODE || 'ITEM',
                name: item.NAME,
                buyQty,
                sellQty,
                netChange: buyQty - sellQty
            };
        }).filter(item => item.buyQty > 0 || item.sellQty > 0);

        // 4. Overdue & Upcoming Cheques
        const overdueCheques = await pool.query(`
            SELECT c.*, b.INVOICE_NO, cust.NAME as CUSTOMER_NAME
            FROM mill_cheques c
            LEFT JOIN mill_bills b ON c.BILL_ID = b.BILL_ID
            LEFT JOIN mill_customers cust ON b.CUSTOMER_ID = cust.CUSTOMER_ID
            WHERE c.STATUS = 'Pending' AND c.DUE_DATE < CURDATE()
            ORDER BY c.DUE_DATE ASC
        `);

        const dueTodayCheques = await pool.query(`
            SELECT c.*, b.INVOICE_NO, cust.NAME as CUSTOMER_NAME
            FROM mill_cheques c
            LEFT JOIN mill_bills b ON c.BILL_ID = b.BILL_ID
            LEFT JOIN mill_customers cust ON b.CUSTOMER_ID = cust.CUSTOMER_ID
            WHERE c.STATUS = 'Pending' AND c.DUE_DATE = CURDATE()
            ORDER BY c.CHEQUE_ID DESC
        `);

        const upcomingCheques = await pool.query(`
            SELECT c.*, b.INVOICE_NO, cust.NAME as CUSTOMER_NAME
            FROM mill_cheques c
            LEFT JOIN mill_bills b ON c.BILL_ID = b.BILL_ID
            LEFT JOIN mill_customers cust ON b.CUSTOMER_ID = cust.CUSTOMER_ID
            WHERE c.STATUS = 'Pending' AND c.DUE_DATE > CURDATE()
            ORDER BY c.DUE_DATE ASC
            LIMIT 5
        `);

        // 5. Active Staff Members Overview
        const activeStaff = await pool.query(`
            SELECT STAFF_ID, NAME, ROLE, PHONE_NUMBER, USERNAME 
            FROM mill_staff 
            WHERE IS_ACTIVE = 1
            ORDER BY ROLE ASC, NAME ASC
        `);

        res.json({
            success: true,
            data: {
                global: {
                    sales: salesAmt,
                    buying: buyingAmt,
                    expenses: expensesAmt,
                    profit: netCashFlow,
                    avgProfit: avgProfit
                },
                todayInwardKg: parseFloat(inwardStatsQuery[0]?.today_inward_kg || 0),
                todayInwardRecords: inwardStatsQuery[0]?.today_inward_records || 0,
                todayInwardBags: 0,
                stockMovement: stockMovement,
                chequeAlerts: {
                    overdue: Array.isArray(overdueCheques) ? overdueCheques.map(c => ({ ...c })) : [],
                    dueToday: Array.isArray(dueTodayCheques) ? dueTodayCheques.map(c => ({ ...c })) : [],
                    upcoming: Array.isArray(upcomingCheques) ? upcomingCheques.map(c => ({ ...c })) : []
                },
                staffMembers: Array.isArray(activeStaff) ? activeStaff.map(s => ({ ...s })) : []
            }
        });

    } catch (error) {
        console.error('Error fetching mill dashboard stats:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports = router;
