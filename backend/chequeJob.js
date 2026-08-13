const cron = require('node-cron');
const pool = require('./index.js');
const { createNotification } = require('./notificationService');

// Function to check due cheques and send notifications
const checkDueCheques = async () => {
    try {
        console.log('[ChequeJob] Checking for due cheques today...');
        
        // Find cheques due today or overdue that are still PENDING
        const [dueCheques] = await pool.promise().query(`
            SELECT c.*, b.INVOICE_NO, cust.NAME as CUSTOMER_NAME
            FROM mill_cheques c
            JOIN mill_bills b ON c.BILL_ID = b.BILL_ID
            LEFT JOIN mill_customers cust ON b.CUSTOMER_ID = cust.CUSTOMER_ID
            WHERE c.DUE_DATE <= CURDATE() AND c.STATUS = 'PENDING'
        `);

        if (dueCheques && dueCheques.length > 0) {
            console.log(`[ChequeJob] Found ${dueCheques.length} due cheques.`);
            
            for (const chq of dueCheques) {
                const title = 'Cheque Due Today!';
                const message = `Cheque ${chq.CHEQUE_NUMBER} (Rs. ${chq.AMOUNT}) from ${chq.CUSTOMER_NAME || 'Customer'} for Invoice ${chq.INVOICE_NO} is due today!`;
                
                await createNotification(
                    'CHEQUE_DUE',
                    chq.CHEQUE_ID,
                    title,
                    message
                );
            }
        } else {
            console.log('[ChequeJob] No cheques due today.');
        }
    } catch (error) {
        console.error('[ChequeJob] Error checking due cheques:', error);
    }
};

// Schedule job to run at 9:00 AM and 7:00 PM every day
const initChequeJob = () => {
    console.log('[ChequeJob] Initializing cheque notification schedules...');
    
    // 09:00 AM Morning Reminder
    cron.schedule('0 9 * * *', () => {
        checkDueCheques();
    });

    // 05:00 PM (17:00) Evening Reminder
    cron.schedule('0 17 * * *', () => {
        checkDueCheques();
    });
};

module.exports = {
    initChequeJob,
    checkDueCheques // Exported for manual testing if needed
};
