const express = require('express');
const router = express.Router();
const cors = require('cors');
const util = require('util');
const fs = require('fs');
const path = require('path');
const pdf = require('html-pdf'); // Install this library: npm install html-pdf
const QRCode = require('qrcode'); // Install this library: npm install qrcode
const handlebars = require('handlebars');

const pool = require('./index');
router.use(cors());
pool.query = util.promisify(pool.query);

router.post('/api/generateInvoice', async (req, res) => {
    try {
        const { data } = req.body;
        const { CODE, TYPE, C_NAME,ITEM_CODE, DATE, METHOD, AMOUNT_SETTLED,AMOUNT,PAYMENT_AMOUNT,DUE_AMOUNT,PHONE_NUMBER } = data;

            const templatePath = path.join(__dirname, 'invoice-template.html');
        const htmlTemplate = fs.readFileSync(templatePath, 'utf-8');

        const renderedHtml = htmlTemplate.replace('{{code}}', CODE).replace('{{type}}', TYPE).replace('{{c_name}}', C_NAME).replace('{{item_code}}', ITEM_CODE).replace('{{date}}', DATE.split('T')[0]).replace('{{method}}', METHOD).replace('{{amount_settled}}', AMOUNT_SETTLED).replace('{{amount}}', AMOUNT).replace('{{payment_amount}}', PAYMENT_AMOUNT).replace('{{due_amount}}', DUE_AMOUNT).replace('{{phone_number}}', PHONE_NUMBER);

        pdf.create(renderedHtml).toBuffer((err, buffer) => {
            if (err) {
                console.error('Error generating PDF:', err);
                res.json({ success: false, message: err.message });
            } else {
                console.log('PDF generated successfully!');
                res.json({ success: true, data: buffer.toString('base64') });
            }
        });
    } catch (error) {
        console.error('Error generating PDF:', error.message);
        res.json({ success: false, message: error.message });
    }
});

router.post('/api/generateInvoiceByGenerator', async (req, res) => {
    try {
        const { TRANSACTION_ID } = req.body;
        console.log('Transaction ID:', TRANSACTION_ID);

        const invoiceDataQuery = `SELECT CODE,CUSTOMER,DATE,SUB_TOTAL,AMOUNT_SETTLED,DUE_AMOUNT FROM store_transactions WHERE TRANSACTION_ID = ${TRANSACTION_ID}`;
        const invoiceDataResult = await pool.query(invoiceDataQuery);

        const data = invoiceDataResult[0];
        data.DATE = data.DATE.split('T')[0];
        // Convert the SUB_TOTAL and DUE_AMOUNT to Number and round to 2 decimal places
        data.SUB_TOTAL = (parseFloat(data.SUB_TOTAL)).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        data.AMOUNT_SETTLED = (parseFloat(data.AMOUNT_SETTLED)).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        data.DUE_AMOUNT = (parseFloat(data.DUE_AMOUNT)).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

        if(data.CUSTOMER === null){
            data.C_NAME = 'N/A';
            data.PHONE_NUMBER = 'N/A';
        }
        else{
            const customerNameGetQuery = `SELECT NAME,PHONE_NUMBER FROM store_customers WHERE CUSTOMER_ID = ${data.CUSTOMER}`;
            const customerNameGetResult = await pool.query(customerNameGetQuery);
            data.C_NAME = customerNameGetResult[0].NAME;
            data.PHONE_NUMBER = customerNameGetResult[0].PHONE_NUMBER;
        }

        const transactionItemsQuery = `SELECT sti.PRICE,sti.QUANTITY,sti.TOTAL,i.NAME FROM store_transactions_items sti INNER JOIN store_items i ON sti.ITEM_ID = i.ITEM_ID WHERE sti.TRANSACTION_ID = ${TRANSACTION_ID} AND sti.IS_ACTIVE = 1`;
        const transactionItemsResult = await pool.query(transactionItemsQuery);

        data.ITEMS = transactionItemsResult;

        if (data.ITEMS.length > 0) {
            data.ITEMS.forEach((item) => {
                item.PRICE = (parseFloat(item.PRICE)).toFixed(1);
                item.QUANTITY = (parseFloat(item.QUANTITY)).toFixed(1);
                item.TOTAL = (parseFloat(item.TOTAL)).toFixed(1);
                item.ITEM_NAME = item.NAME;
            });
            //if Same Item is repeated in the bill then Set ITEM_NAME to null after first same item and arrange same items in to close to each other
            for (let i = 0; i < data.ITEMS.length; i++) {
                const currentItem = data.ITEMS[i];
                if (currentItem.ITEM_NAME !== null) {
                    for (let j = i + 1; j < data.ITEMS.length; j++) {
                        const nextItem = data.ITEMS[j];
                        if (nextItem.ITEM_NAME === currentItem.ITEM_NAME) {
                            // If the next item is the same as the current one, set its ITEM_NAME to null
                            nextItem.ITEM_NAME = null;
                            // Swap the repeated item with the next non-repeated item
                            data.ITEMS[j] = data.ITEMS[i + 1];
                            data.ITEMS[i + 1] = nextItem;
                            // Increment i to skip the repeated item in the next iteration
                            i++;
                        }
                    }
                }
            }
        }

        console.log('Invoice data:', data);


        const templatePath = path.join(__dirname, 'gen-invoice-template.html');
        const htmlTemplate = fs.readFileSync(templatePath, 'utf-8');

        // Compile the template
        const compiledTemplate = handlebars.compile(htmlTemplate);

        // Render the template with data
        const renderedHtml = compiledTemplate(data);

        pdf.create(renderedHtml).toBuffer((err, buffer) => {
            if (err) {
                console.error('Error generating PDF:', err);
                res.json({ success: false, message: err.message });
            } else {
                console.log('PDF generated successfully!');
                res.json({ success: true, data: buffer.toString('base64') });
            }
        });
    } catch (error) {
        console.error('Error generating PDF:', error.message);
        res.json({ success: false, message: error.message });
    }
});

router.post('/api/generateBillByGenerator', async (req, res) => {
    try {
        const { TRANSACTION_ID } = req.body;
        console.log('Transaction ID:', TRANSACTION_ID);

        const invoiceDataQuery = `SELECT CODE,SUB_TOTAL FROM store_transactions WHERE TRANSACTION_ID = ${TRANSACTION_ID}`;
        const invoiceDataResult = await pool.query(invoiceDataQuery);

        const data = invoiceDataResult[0];
        data.DATE = new Date().toLocaleDateString();
        data.SUB_TOTAL = (parseFloat(data.SUB_TOTAL)).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        data.TIME = new Date().toLocaleTimeString();

        const transactionItemsQuery = `SELECT sti.PRICE,sti.QUANTITY,sti.TOTAL,i.NAME FROM store_transactions_items sti INNER JOIN store_items i ON sti.ITEM_ID = i.ITEM_ID WHERE sti.TRANSACTION_ID = ${TRANSACTION_ID} AND sti.IS_ACTIVE = 1`;
        data.ITEMS = await pool.query(transactionItemsQuery);

        // if(data.ITEMS.length > 0){
        //     data.ITEMS.forEach((item) => {
        //         item.PRICE = (parseFloat(item.PRICE)).toFixed(1);
        //         item.QUANTITY = (parseFloat(item.QUANTITY)).toFixed(1);
        //         item.TOTAL = (parseFloat(item.TOTAL)).toFixed(1);
        //     });
        // }

        if (data.ITEMS.length > 0) {
            data.ITEMS.forEach((item) => {
                item.PRICE = (parseFloat(item.PRICE)).toFixed(1);
                item.QUANTITY = (parseFloat(item.QUANTITY)).toFixed(1);
                item.TOTAL = (parseFloat(item.TOTAL)).toFixed(1);
                item.ITEM_NAME = item.NAME;
            });
            //if Same Item is repeated in the bill then Set ITEM_NAME to null after first same item and arrange same items in to close to each other
            for (let i = 0; i < data.ITEMS.length; i++) {
                const currentItem = data.ITEMS[i];
                if (currentItem.ITEM_NAME !== null) {
                    for (let j = i + 1; j < data.ITEMS.length; j++) {
                        const nextItem = data.ITEMS[j];
                        if (nextItem.ITEM_NAME === currentItem.ITEM_NAME) {
                            // If the next item is the same as the current one, set its ITEM_NAME to null
                            nextItem.ITEM_NAME = null;
                            // Swap the repeated item with the next non-repeated item
                            data.ITEMS[j] = data.ITEMS[i + 1];
                            data.ITEMS[i + 1] = nextItem;
                            // Increment i to skip the repeated item in the next iteration
                            i++;
                        }
                    }
                }
            }
        }

        // console.log('Invoice data:', data);

        const templatePath = path.join(__dirname, 'bill_format.html');
        const htmlTemplate = fs.readFileSync(templatePath, 'utf-8');

        // Compile the template
        const compiledTemplate = handlebars.compile(htmlTemplate);

        // Render the template with data
        const renderedHtml = compiledTemplate(data);

        const pdfOptions = {
            // Set the page size to 80mm width and auto height
            width: '76mm',
            height: '297mm', // Assuming standard A4 size (297mm height)
        };

        pdf.create(renderedHtml, pdfOptions).toBuffer((err, buffer) => {
            if (err) {
                console.error('Error generating PDF:', err);
                res.json({ success: false, message: err.message });
            } else {
                console.log('PDF generated successfully!');
                res.json({ success: true, data: buffer.toString('base64') });
            }
        });


    } catch (error) {
        console.error('Error generating PDF:', error.message);
        res.json({ success: false, message: error.message });
    }
});




module.exports = router;
