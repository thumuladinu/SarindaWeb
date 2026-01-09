const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');

// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Now you can use pool.query with async/await

router.post('/api/getAllCutPolish', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active cp
        const queryResult = await pool.query('SELECT cp.*, i.WEIGHT_AFTER_CP,i.CODE AS ITEM_CODE,i.ITEM_ID_AI, i.CP_BY, i.CP_COLOR, i.SHAPE, i.CP_TYPE, i.TOTAL_COST, c.NAME AS CP_BY_NAME,c.CUSTOMER_ID FROM cp cp INNER JOIN items i ON cp.REFERENCE = i.ITEM_ID_AI INNER JOIN customers c ON i.CP_BY = c.CUSTOMER_ID WHERE cp.IS_ACTIVE=1');

        // const queryResult2 = await pool.query('SELECT cp.CP_ID,i.CODE AS REFERENCE_ITEM_CODE,i.ITEM_ID_AI AS REFERENCE_ITEM_ID FROM cp cp INNER JOIN items i ON cp.OLD_REFERENCE = i.ITEM_ID_AI WHERE cp.IS_ACTIVE=1');

        for(let i=0; i<queryResult.length; i++){
            if(queryResult[i].IS_GROUP){
                const groupID = queryResult[i].OLD_REFERENCE;
                const referenceIdLots = await pool.query('SELECT CODE FROM treatment_group WHERE HT_ID = ?', [groupID]);
                queryResult[i].REFERENCE_GROUP_CODE = referenceIdLots[0].CODE;
            }
            else {
                const oldReference = queryResult[i].OLD_REFERENCE;
                const referenceIdLots = await pool.query('SELECT CODE FROM items WHERE ITEM_ID_AI = ?', [oldReference]);
                queryResult[i].REFERENCE_ITEM_CODE = referenceIdLots[0].CODE;
            }
        }

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any cp are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active cp found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(cp => ({ ...cp }));
            // const data2 = queryResult2.map(cp => ({ ...cp }));

            console.log('data:', data);

            //combine two arrays
            // for(let i=0; i<data.length; i++){
            //     if(data[i].CP_ID === data2[i].CP_ID){
            //         data[i].REFERENCE_ITEM_CODE = data2[i].REFERENCE_ITEM_CODE;
            //         data[i].REFERENCE_ITEM_ID = data2[i].REFERENCE_ITEM_ID;
            //     }
            // }
            data.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));

            // console.log('data:', data);

            // Process each reference and perform the query for each number
            return res.status(200).json({ success: true, result: data});
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/getAllSortLots', async (req, res) => {
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active sort lots with additional information
        const queryResult = await pool.query(`
            SELECT sl.*, i.WEIGHT, i.CODE AS ITEM_CODE, i.ITEM_ID_AI, i.PERFORMER, 
                   i.REFERENCE_ID_LOTS, i.FULL_LOT_COST, i.SORTED_LOT_TYPE, 
                   c.NAME AS SL_BY_NAME, c.CUSTOMER_ID , i.STATUS
            FROM sort_lots sl 
            INNER JOIN items i ON sl.REFERENCE = i.ITEM_ID_AI 
            INNER JOIN customers c ON i.PERFORMER = c.CUSTOMER_ID 
            WHERE sl.IS_ACTIVE = 1
        `);

        // Process each sort lot and retrieve information about reference items
        for (let i = 0; i < queryResult.length; i++) {
            const referenceIdLots = queryResult[i].REFERENCE_ID_LOTS.split(',').map(Number);

            // Query to fetch additional information about reference items
            const queryResult2 = await pool.query(`
                SELECT CODE AS REFERENCE_ITEM_CODE, ITEM_ID_AI AS REFERENCE_ITEM_ID 
                FROM items 
                WHERE IS_ACTIVE = 1 AND ITEM_ID_AI IN (?)
            `, [referenceIdLots]);

            // Assign the additional information to the sort lot
            queryResult[i].REF_ITEMS = queryResult2;
        }
        queryResult.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));

        return res.status(200).json({ success: true, result: queryResult });
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


router.post('/api/getReferenceCPDetails', async (req, res) => {
    //console.log('Get all CP details request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const checkQuery = await pool.query('SELECT * FROM cp WHERE REFERENCE = ?', [req.body.ITEM_ID_AI]);
        let queryResult;

        if(checkQuery.length > 0){
            queryResult = await pool.query('SELECT cp.*,i.WEIGHT_AFTER_CP,i.CODE AS ITEM_CODE, i.CP_BY, i.CP_COLOR, i.SHAPE, i.CP_TYPE, i.TOTAL_COST FROM cp cp INNER JOIN items i ON cp.REFERENCE = i.ITEM_ID_AI WHERE cp.IS_ACTIVE=1 AND i.IS_ACTIVE=1 AND i.ITEM_ID_AI = ?', [req.body.ITEM_ID_AI]);
        }
        else{
            queryResult = await pool.query('SELECT WEIGHT_AFTER_CP,CODE AS ITEM_CODE,CP_BY,CP_COLOR,SHAPE,CP_TYPE,TOTAL_COST FROM items WHERE IS_ACTIVE=1 AND ITEM_ID_AI = ?', [req.body.ITEM_ID_AI]);
        }

        // Query to fetch all active cp_details

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active cp_details found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(cp_details => ({ ...cp_details }));

            // Process each reference and perform the query for each number
            return res.status(200).json({ success: true, result: data });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});



router.post('/api/addCutPolish', async (req, res) => {
    // console.log('Add cp request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        if(req.body.IS_GROUP){
            const newRefArray = [];
            //get Refference ID from Grops
            const referenceIdLots = await pool.query('SELECT REFERENCE FROM treatment_group WHERE HT_ID = ?', [req.body.REFERENCE_ID_CP]);
            // console.log('referenceIdLots:', referenceIdLots);
            const references = referenceIdLots[0].REFERENCE;

            // Split the string into an array of numbers
            const referenceNumbers = references.split(',').map(Number);

            // Iterate over the array of numbers
            for (let i = 0; i < referenceNumbers.length; i++) {
                await processGroupReference(req, newRefArray, referenceNumbers[i]);
            }

            cpData = {
                OLD_REFERENCE: req.body.REFERENCE_ID_CP,
                //convert array to string
                REFERENCE: newRefArray.join(','),
                PHOTO: req.body.PHOTO,
                IS_APPROVED: 0,
                REMARK: req.body.REMARK,
                CREATED_BY: req.body.CREATED_BY,
                IS_GROUP: 1,
            }
            const insertResult = await pool.query('INSERT INTO cp SET ?', cpData);
            if (insertResult.affectedRows > 0) {
                // Generate CODE based on insert ID
                const insertId = insertResult.insertId;
                const code = generateCodeCP(insertId);

                // Update the CODE column with the generated code
                await pool.query('UPDATE cp SET CODE = ? WHERE CP_ID = ?', [code, insertId]);

                return res.status(200).json({success: true, message: 'C & P added successfully'});
            } else {
                console.error('Error: Failed to add cp:', insertResult.message);
                return res.status(500).json({success: false, message: 'Internal server error'});
            }
        }

        else {

            const selectQuery = await pool.query('SELECT * FROM items WHERE ITEM_ID_AI = ?', [req.body.REFERENCE_ID_CP]);

            const statusChangeQuery = await pool.query('UPDATE items SET STATUS = ? WHERE ITEM_ID_AI = ?', [req.body.STATUS, req.body.REFERENCE_ID_CP]);

            delete selectQuery[0].ITEM_ID_AI;
            delete selectQuery[0].CODE;
            delete selectQuery[0].CP_BY;
            delete selectQuery[0].CP_COLOR;
            delete selectQuery[0].SHAPE;
            delete selectQuery[0].CP_TYPE;
            delete selectQuery[0].TOTAL_COST;
            delete selectQuery[0].STATUS;
            delete selectQuery[0].WEIGHT_AFTER_CP;
            delete selectQuery[0].TYPE;
            delete selectQuery[0].REFERENCE_ID_CP;
            delete selectQuery[0].IS_IN_INVENTORY;
            delete selectQuery[0].WEIGHT;
            delete selectQuery[0].PHOTO_LINK;
            delete selectQuery[0].DATE;
            delete selectQuery[0].IS_ACTIVE;


            reInsertData = {
                ...selectQuery[0],
                CODE: req.body.CODE_AFTER_CUTTING,
                TYPE: 'Cut and Polished',
                WEIGHT: req.body.WEIGHT_AFTER_CP,
                PHOTO_LINK: req.body.PHOTO,
                DATE: new Date(),
                CP_BY: req.body.CP_BY,
                CP_COLOR: req.body.CP_COLOR,
                SHAPE: req.body.SHAPE,
                CP_TYPE: req.body.CP_TYPE,
                TOTAL_COST: req.body.TOTAL_COST,
                STATUS: req.body.STATUS,
                WEIGHT_AFTER_CP: req.body.WEIGHT_AFTER_CP,
                REFERENCE_ID_CP: req.body.REFERENCE_ID_CP,
                IS_IN_INVENTORY: 0,
            }

            insertQuery = await pool.query('INSERT INTO items SET ?', reInsertData);

            if (req.body.IS_REFERENCE_DEACTIVATED) {
                await pool.query('UPDATE items SET IS_IN_INVENTORY = 0 WHERE ITEM_ID_AI = ?', [req.body.REFERENCE_ID_CP]);
            }

            cpData = {
                OLD_REFERENCE: req.body.REFERENCE_ID_CP,
                REFERENCE: insertQuery.insertId,
                PHOTO: req.body.PHOTO,
                IS_APPROVED: 0,
                IS_GROUP: 0,
                REMARK: req.body.REMARK,
                CREATED_BY: req.body.CREATED_BY,
            }
            // Insert the new cp data into the database
            const insertResult = await pool.query('INSERT INTO cp SET ?', cpData);

            if (insertResult.affectedRows > 0) {
                // Generate CODE based on insert ID
                const insertId = insertResult.insertId;
                const code = generateCodeCP(insertId);

                // Update the CODE column with the generated code
                await pool.query('UPDATE cp SET CODE = ? WHERE CP_ID = ?', [code, insertId]);

                return res.status(200).json({success: true, message: 'C & P added successfully'});
            } else {
                console.error('Error: Failed to add cp:', insertResult.message);
                return res.status(500).json({success: false, message: 'Internal server error'});
            }
        }
    } catch (error) {
        console.error('Error adding cp:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

async function processGroupReference(req, newRefArray, referenceNumber) {
    try {
        const selectQuery = await pool.query('SELECT * FROM items WHERE ITEM_ID_AI = ?', [referenceNumber]);
        const statusChangeQuery = await pool.query('UPDATE items SET STATUS = ? WHERE ITEM_ID_AI = ?', [req.body.STATUS, referenceNumber]);

        // Remove unwanted properties from selectQuery[0]
        delete selectQuery[0].ITEM_ID_AI;
        delete selectQuery[0].CODE;
        delete selectQuery[0].CP_BY;
        delete selectQuery[0].CP_COLOR;
        delete selectQuery[0].SHAPE;
        delete selectQuery[0].CP_TYPE;
        delete selectQuery[0].TOTAL_COST;
        delete selectQuery[0].STATUS;
        delete selectQuery[0].WEIGHT_AFTER_CP;
        delete selectQuery[0].TYPE;
        delete selectQuery[0].REFERENCE_ID_CP;
        delete selectQuery[0].IS_IN_INVENTORY;
        delete selectQuery[0].WEIGHT;
        delete selectQuery[0].PHOTO_LINK;
        delete selectQuery[0].DATE;
        delete selectQuery[0].IS_ACTIVE;

        const reInsertData = {
            ...selectQuery[0],
            TYPE: 'Cut and Polished',
            WEIGHT: req.body.WEIGHT_AFTER_CP,
            PHOTO_LINK: req.body.PHOTO,
            DATE: new Date(),
            CP_BY: req.body.CP_BY,
            CP_COLOR: req.body.CP_COLOR,
            SHAPE: req.body.SHAPE,
            CP_TYPE: req.body.CP_TYPE,
            TOTAL_COST: req.body.TOTAL_COST,
            STATUS: req.body.STATUS,
            WEIGHT_AFTER_CP: req.body.WEIGHT_AFTER_CP,
            REFERENCE_ID_CP: referenceNumber,
            IS_IN_INVENTORY: 0,
        };

        const insertQuery = await pool.query('INSERT INTO items SET ?', reInsertData);
        newRefArray.push(insertQuery.insertId);

        let code = generateCodeCPItem(insertQuery.insertId, req.body.CP_TYPE);
        await pool.query('UPDATE items SET CODE = ? WHERE ITEM_ID_AI = ?', [code, insertQuery.insertId]);

        if (req.body.IS_REFERENCE_DEACTIVATED) {
            await pool.query('UPDATE items SET IS_IN_INVENTORY = 0 WHERE ITEM_ID_AI = ?', [referenceNumber]);
        }
    } catch (error) {
        console.error('Error processing group reference:', error);
        // Handle error as needed
        throw error; // Re-throw the error to be caught by the calling function
    }
}


function generateCodeCPItem(insertId, type) {
    // console.log('type:', type);
    let code;
    const paddedId = String(insertId).padStart(4, '0');
    // console.log('paddedId:', paddedId);
    switch (type) {
        case 'Blue Sapphire Natural':
            code = 'BSN' + paddedId + 'CP';
            break;
        case 'Blue Sapphire Heated':
            code = 'BSHCP' + paddedId;
            break;
        case 'Yellow Sapphire':
            code = 'YSN' + paddedId + 'CP';
            break;
        case 'Pink Sapphire Natural':
            code = 'PISNCP' + paddedId;
            break;
        case 'Pink Sapphire Treated':
            code = 'PISHCP' + paddedId;
            break;
        case 'Purple Sapphire Natural':
            code = 'PSNCP' + paddedId;
            break;
        case 'Violet Sapphire Natural':
            code = 'VSN' + paddedId + 'CP';
            break;
        case 'Blue Sapphire Treated Lots':
            code = 'BSHLCP' + paddedId;
            break;
        case 'Padparadscha Sapphire Natural':
            code = 'PDSN' + paddedId + 'CP';
            break;
        default:
            break;
    }
    return code;
}


// Function to generate CODE based on insert ID
function generateCodeCP(insertId) {
    const paddedId = String(insertId).padStart(3, '0');
    return `CP${paddedId}`;
}

router.post('/api/addSortLot', async (req, res) => {
    // console.log('Add SL request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        const referenceIdLots = req.body.REFERENCE_ID_LOTS;

        for (let i = 0; i < referenceIdLots.length; i++) {
            await pool.query('UPDATE items SET STATUS = ?,PERFORMER=? WHERE ITEM_ID_AI = ?', ['With Preformer', req.body.PERFORMER, referenceIdLots[i]]);
        }

        const reInsertData = {
            TYPE: 'Sorted Lots',
            STATUS: req.body.STATUS,
            PIECES: referenceIdLots.length,
            WEIGHT: req.body.WEIGHT,
            PHOTO_LINK: req.body.PHOTO,
            SORTED_LOT_TYPE: req.body.SORTED_LOT_TYPE,
            REFERENCE_ID_LOTS: req.body.REFERENCE_ID_LOTS.join(','), // Convert array to comma-separated string
            FULL_LOT_COST: req.body.FULL_LOT_COST,
            COST: req.body.FULL_LOT_COST,
            PERFORMER: req.body.PERFORMER,
            DATE: new Date(),
            IS_IN_INVENTORY: 0,
            IS_ACTIVE: 1,
            CREATED_BY: req.body.CREATED_BY,
        }

        const insertQuery = await pool.query('INSERT INTO items SET ?', reInsertData);

        // Update the CODE based on insert ID
        const insertId = insertQuery.insertId;
        const code = generateCodeSLI(insertId, req.body.SORTED_LOT_TYPE);
        await pool.query('UPDATE items SET CODE = ? WHERE ITEM_ID_AI = ?', [code, insertId]);

        if (req.body.IS_REFERENCE_DEACTIVATED) {
            // Split REFERENCE_ID_LOTS by , AND convert each element into a number
            for (let i = 0; i < referenceIdLots.length; i++) {
                await pool.query('UPDATE items SET IS_IN_INVENTORY = 0 WHERE ITEM_ID_AI = ?', [referenceIdLots[i]]);
            }
        }

        const slData = {
            OLD_REFERENCE: req.body.REFERENCE_ID_LOTS.join(','), // Convert array to comma-separated string
            REFERENCE: insertQuery.insertId,
            PHOTO: req.body.PHOTO,
            IS_APPROVED: 0,
            REMARK: req.body.REMARK,
            CREATED_BY: req.body.CREATED_BY,
        }

        // Insert the new SL data into the database
        const insertResult = await pool.query('INSERT INTO sort_lots SET ?', slData);

        if (insertResult.affectedRows > 0) {
            // Generate CODE based on insert ID
            const slInsertId = insertResult.insertId;
            const slCode = generateCodeSL(slInsertId);

            // Update the CODE column with the generated code
            await pool.query('UPDATE sort_lots SET CODE = ? WHERE SL_ID = ?', [slCode, slInsertId]);

            return res.status(200).json({ success: true, message: 'SL added successfully' });
        } else {
            console.error('Error: Failed to add SL:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding SL:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


function generateCodeSLI(insertId, type) {
    switch (type) {
        case 'Lots Blue':
            code = 'BSL' + padWithZeros(insertId);
            break;
        case 'Lots Geuda':
            code = 'GSL' + padWithZeros(insertId);
            break;
        case 'Lots Yellow':
            code = 'YSL' + padWithZeros(insertId);
            break;
        case 'Lots Mix':
            code = 'MSL' + padWithZeros(insertId);
            break;
        default:
            break;
    }
    return code;
}

function padWithZeros(insertId) {
    //console.log('Insert ID:', insertId);
    const zeros = '0000';
    const paddedId = zeros + insertId;
    return paddedId.slice(-4);
}

function generateCodeSL(insertId) {
    const paddedId = String(insertId).padStart(3, '0');
    return `SL${paddedId}`;
}

router.post('/api/updateCutPolish', async (req, res) => {
    //console.log('Update cp request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        if(req.body.IS_GROUP){
            cpData = {
                PHOTO: req.body.PHOTO,
                REMARK: req.body.REMARK,
            }
            const updateResult1 = await pool.query('UPDATE cp SET ? WHERE CP_ID = ?', [
                cpData,
                req.body.CP_ID,
            ]);
            if (updateResult1.affectedRows > 0) {
                return res.status(200).json({success: true, message: 'CP updated successfully'});
            }
            else {
                console.error('Error: Failed to update cp:', updateResult1.message);
                return res.status(500).json({success: false, message: 'Internal server error'});
            }
        }

        else {
            // Extract the cp ID from the request body
            cpData = {
                PHOTO: req.body.PHOTO,
                REMARK: req.body.REMARK,
            }

            itemData = {
                WEIGHT_AFTER_CP: req.body.WEIGHT_AFTER_CP,
                CP_BY: req.body.CP_BY,
                CP_COLOR: req.body.CP_COLOR,
                SHAPE: req.body.SHAPE,
                CP_TYPE: req.body.CP_TYPE,
                TOTAL_COST: req.body.TOTAL_COST,
            }

            // Update the cp data in the database
            const updateResult1 = await pool.query('UPDATE cp SET ? WHERE CP_ID = ?', [
                cpData,
                req.body.CP_ID,
            ]);
            const updateResult2 = await pool.query('UPDATE items SET ? WHERE ITEM_ID_AI = ?', [
                itemData,
                req.body.REFERENCE,
            ]);
            if (updateResult1.affectedRows > 0 || updateResult2.affectedRows > 0) {
                return res.status(200).json({success: true, message: 'CP updated successfully'});
            } else {
                console.error('Error: Failed to update cp:', updateResult1.message);
                return res.status(500).json({success: false, message: 'Internal server error'});
            }
        }
    } catch (error) {
        console.error('Error updating cp:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});
router.post('/api/updateSortLot', async (req, res) => {
    //console.log('Update cp request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the cp ID from the request body
        cpData = {
            PHOTO: req.body.PHOTO,
            REMARK: req.body.REMARK,
        }

        itemData = {
            WEIGHT: req.body.WEIGHT,
            PERFORMER: req.body.PERFORMER,
            FULL_LOT_COST: req.body.FULL_LOT_COST,
            PHOTO_LINK: req.body.PHOTO,
        }

        // Update the cp data in the database
        const updateResult1 = await pool.query('UPDATE sort_lots SET ? WHERE SL_ID = ?', [
            cpData,
            req.body.SL_ID,
        ]);
        const updateResult2 = await pool.query('UPDATE items SET ? WHERE ITEM_ID_AI = ?', [
            itemData,
            req.body.REFERENCE,
        ]);
        if (updateResult1.affectedRows > 0 || updateResult2.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'SL updated successfully' });
        } else {
            console.error('Error: Failed to update SL:', updateResult1.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error updating SL:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/approveCutPolish', async (req, res) => {
    //console.log('Update cp request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        // console.log('req.body:', req.body);

        if(req.body.IS_GROUP){
            const referenceArray = req.body.REFERENCE.split(',').map(Number);
            // console.log('referenceArray:', referenceArray);

            itemData = {
                IS_IN_INVENTORY: 1,
                IS_ACTIVE: 1,
                STATUS: 'C&P',
            }

            for (let i = 0; i < referenceArray.length; i++) {
                const updateResult2 = await pool.query('UPDATE items SET ? WHERE ITEM_ID_AI = ?', [ itemData, referenceArray[i] ]);
                console.log('referenceArray[i]:', referenceArray[i]);
                if (updateResult2.affectedRows < 0) {
                    console.error('Error: Failed to Approve cp:', updateResult2.message);
                    return res.status(500).json({success: false, message: 'Internal server error'});
                }
            }

            cpData = {
                IS_APPROVED: 1,
            }

            const updateResult1 = await pool.query('UPDATE cp SET ? WHERE CP_ID = ?', [
                cpData,
                req.body.CP_ID,
            ]);
            if (updateResult1.affectedRows > 0) {
                return res.status(200).json({success: true, message: 'CP Approved successfully'});
            }
            else {
                console.error('Error: Failed to Approve cp:', updateResult1.message);
                return res.status(500).json({success: false, message: 'Internal server error'});
            }
        }
        else {
            // Extract the cp ID from the request body
            cpData = {
                IS_APPROVED: 1,
            }

            itemData = {
                IS_IN_INVENTORY: 1,
                IS_ACTIVE: 1,
                STATUS: 'C&P',
            }

            // Update the cp data in the database
            const updateResult1 = await pool.query('UPDATE cp SET ? WHERE CP_ID = ?', [
                cpData,
                req.body.CP_ID,
            ]);
            const updateResult2 = await pool.query('UPDATE items SET ? WHERE ITEM_ID_AI = ?', [
                itemData,
                req.body.REFERENCE,
            ]);
            if (updateResult1.affectedRows > 0 || updateResult2.affectedRows > 0) {
                return res.status(200).json({success: true, message: 'CP Approved successfully'});
            } else {
                console.error('Error: Failed to Approve cp:', updateResult1.message);
                return res.status(500).json({success: false, message: 'Internal server error'});
            }
        }
    } catch (error) {
        console.error('Error Approving cp:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/approveSortLot', async (req, res) => {
    //console.log('Update cp request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the cp ID from the request body
        cpData = {
            IS_APPROVED: 1,
        }

        itemData = {
            IS_IN_INVENTORY: 1,
            IS_ACTIVE: 1,
            STATUS: 'Preformed',
        }

        refItemData = {
            IS_IN_INVENTORY: 0,
            STATUS: 'Added to a lot',
        }

        // Update the cp data in the database
        const updateResult1 = await pool.query('UPDATE sort_lots SET ? WHERE SL_ID = ?', [
            cpData,
            req.body.SL_ID,
        ]);
        const updateResult2 = await pool.query('UPDATE items SET ? WHERE ITEM_ID_AI = ?', [
            itemData,
            req.body.REFERENCE,
        ]);

        oldRefIDs = req.body.OLD_REFERENCE.split(',').map(Number);
        for (let i = 0; i < oldRefIDs.length; i++) {
            await pool.query('UPDATE items SET ? WHERE ITEM_ID_AI = ?', [
                refItemData,
                oldRefIDs[i],
            ]);
        }
        if (updateResult1.affectedRows > 0 || updateResult2.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'CP Approved successfully' });
        } else {
            console.error('Error: Failed to Approve cp:', updateResult1.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error Approving cp:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});



router.post('/api/deactivateCP', async (req, res) => {
    //console.log('Deactivate cp request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the cp ID from the request body
        const { CP_ID } = req.body;

        // Update the IS_ACTIVE column to 0 to deactivate the cp
        const updateResult = await pool.query('UPDATE cp SET IS_ACTIVE = 0 WHERE CP_ID = ?', [
            CP_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Customer deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate cp:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating cp:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/deactivateSL', async (req, res) => {
    //console.log('Deactivate cp request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the cp ID from the request body
        const { SL_ID } = req.body;

        // Update the IS_ACTIVE column to 0 to deactivate the cp
        const updateResult = await pool.query('UPDATE sort_lots SET IS_ACTIVE = 0 WHERE SL_ID = ?', [
            SL_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Customer deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate Sl:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating sl:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});




module.exports = router;
