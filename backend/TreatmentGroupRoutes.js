const express = require('express');
const router = express.Router();
const cors = require('cors');

const pool = require('./index'); // Assuming you have a proper MySQL connection pool module

router.use(cors());

const util = require('util');

// Promisify the pool.query method
pool.query = util.promisify(pool.query);

// Now you can use pool.query with async/await
router.post('/api/getAllHT', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active treatment_group
        const queryResult = await pool.query('SELECT * FROM treatment_group WHERE IS_ACTIVE=1');

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any treatment_group are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active treatment_group found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(treatment_group => ({ ...treatment_group }));
            data.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));

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

router.post('/api/getAllHeatT', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active treatment_group
        const queryResult = await pool.query('SELECT ht.*, htg.CODE AS GROUP_CODE, htg.REFERENCE AS GROUP_REFERENCE, c.NAME AS HT_BY_NAME,c.CUSTOMER_ID FROM heat_treatment ht INNER JOIN treatment_group htg ON ht.HT_ID = htg.HT_ID INNER JOIN customers c ON ht.HEAT_BY = c.CUSTOMER_ID WHERE ht.IS_ACTIVE=1');

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any treatment_group are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active treatment_group found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(treatment_group => ({ ...treatment_group }));
            data.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));

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

router.post('/api/getAllElecT', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active treatment_group
        const queryResult = await pool.query('SELECT ht.*, htg.CODE AS GROUP_CODE, htg.REFERENCE AS GROUP_REFERENCE, c.NAME AS HT_BY_NAME, c.CUSTOMER_ID FROM elec_treatment ht INNER JOIN treatment_group htg ON ht.HT_ID = htg.HT_ID INNER JOIN customers c ON ht.ELEC_BY = c.CUSTOMER_ID WHERE ht.IS_ACTIVE=1');

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            // Check if any treatment_group are found
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active treatment_group found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(treatment_group => ({ ...treatment_group }));
            data.sort((a, b) => new Date(b.EDITED_DATE) - new Date(a.EDITED_DATE));

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

router.post('/api/approveHeatT', async (req, res) => {
    // console.log('Update cp request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the cp ID from the request body
        const htData = {
            IS_APPROVED: 1,
        };

        const updateResult = await pool.query('UPDATE heat_treatment SET ? WHERE HEAT_ID = ?', [htData, req.body.HEAT_ID]);

        let referenceArray = req.body.referenceArray;

        for (const reference of referenceArray) {
            const itemData = {
                STATUS: 'Heat Treatment'
            };
            const updateResult2 = await pool.query('UPDATE items SET ? WHERE ITEM_ID_AI = ?', [
                itemData,
                reference,
            ]);
        }

        // The following block was missing in your code
        if (updateResult) {
            return res.status(200).json({ success: true, message: 'Heat Treatment approved successfully' });
        } else {
            console.error('Error: Failed to Approve cp:', updateResult2.message);
            return res.status(500).json({ success: false, message: 'Heat Treatment approval failed' });
        }
    } catch (error) {
        console.error('Error Approving heat_treatment:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/approveElecT', async (req, res) => {
    // console.log('Update cp request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the cp ID from the request body
        const htData = {
            IS_APPROVED: 1,
        };

        const updateResult = await pool.query('UPDATE elec_treatment SET ? WHERE ELEC_ID = ?', [htData, req.body.ELEC_ID]);

        let referenceArray = req.body.referenceArray;

        for (const reference of referenceArray) {
            const itemData = {
                STATUS: 'Electric Treatment'
            };
            const updateResult2 = await pool.query('UPDATE items SET ? WHERE ITEM_ID_AI = ?', [
                itemData,
                reference,
            ]);
        }

        // The following block was missing in your code
        if (updateResult) {
            return res.status(200).json({ success: true, message: 'Heat Treatment approved successfully' });
        } else {
            console.error('Error: Failed to Approve cp:', updateResult2.message);
            return res.status(500).json({ success: false, message: 'Heat Treatment approval failed' });
        }
    } catch (error) {
        console.error('Error Approving heat_treatment:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


router.post('/api/getReferenceFromHTGroup', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active treatment_group
        const queryResult = await pool.query('SELECT REFERENCE FROM treatment_group WHERE IS_ACTIVE=1 AND HT_ID = ?', [req.body.HT_ID]);

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active treatment_group found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(treatment_group => ({ ...treatment_group }));

            // Process each reference and perform the query for each number
            const resultArray = [];
            for (const treatment_group of data) {
                // Check if REFERENCE is not null
                if (treatment_group.REFERENCE !== null) {
                    const references = treatment_group.REFERENCE.split(',').map(Number);

                    for (const reference of references) {
                        const itemQueryResult = await pool.query('SELECT ITEM_ID_AI,STATUS,WEIGHT,PHOTO_LINK,IS_HEAT_TREATED,WEIGHT_AFTER_HT,HT_BY,PHOTOS_AFTER_HT_LINK FROM items WHERE IS_ACTIVE=1 AND ITEM_ID_AI = ?', [reference]);

                        if (Array.isArray(itemQueryResult) && itemQueryResult.length > 0) {
                            resultArray.push(...itemQueryResult);
                        }
                    }
                }
            }

            return res.status(200).json({ success: true, result: resultArray });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/getReferenceFromETGroup', async (req, res) => {
    //console.log('Get all HT request received:');
    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Query to fetch all active treatment_group
        const queryResult = await pool.query('SELECT REFERENCE FROM treatment_group WHERE IS_ACTIVE=1 AND HT_ID = ?', [req.body.HT_ID]);

        // Check if queryResult is an array before trying to use .map
        if (Array.isArray(queryResult)) {
            if (queryResult.length === 0) {
                return res.status(404).json({ success: false, message: 'No active treatment_group found' });
            }

            // Convert the query result to a new array without circular references
            const data = queryResult.map(treatment_group => ({ ...treatment_group }));

            // Process each reference and perform the query for each number
            const resultArray = [];
            for (const treatment_group of data) {
                // Check if REFERENCE is not null
                if (treatment_group.REFERENCE !== null) {
                    const references = treatment_group.REFERENCE.split(',').map(Number);

                    for (const reference of references) {
                        const itemQueryResult = await pool.query('SELECT ITEM_ID_AI,STATUS,WEIGHT,PHOTO_LINK,IS_ELEC_TREATED,WEIGHT_AFTER_ET,ET_BY,PHOTOS_AFTER_ET_LINK FROM items WHERE IS_ACTIVE=1 AND ITEM_ID_AI = ?', [reference]);

                        if (Array.isArray(itemQueryResult) && itemQueryResult.length > 0) {
                            resultArray.push(...itemQueryResult);
                        }
                    }
                }
            }

            return res.status(200).json({ success: true, result: resultArray });
        } else {
            console.error('Error: queryResult is not an array:', queryResult);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error executing MySQL query:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});



router.post('/api/addHT', async (req, res) => {
    //console.log('Add treatment_group request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Insert the new treatment_group data into the database
        const insertResult = await pool.query('INSERT INTO treatment_group SET ?', req.body);

        if (insertResult.affectedRows > 0) {
            // Generate CODE based on insert ID
            const insertId = insertResult.insertId;
            const type = req.body.TYPE;
            const code = generateCode(insertId, type);

            // Update the CODE column with the generated code
            await pool.query('UPDATE treatment_group SET CODE = ? WHERE HT_ID = ?', [code, insertId]);

            return res.status(200).json({ success: true, message: 'Heat treatment added successfully' });
        } else {
            console.error('Error: Failed to add treatment_group:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding treatment_group:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


router.post('/api/addHeatT', async (req, res) => {
    //console.log('Add heat_treatment request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        mainData ={
            // NAME: req.body.mainData.NAME,
            HT_ID: req.body.mainData.HT_ID,
            HEAT_BY: req.body.mainData.HT_BY,
            IS_APPROVED: 0,
            DATE: req.body.mainData.DATE,
            REMARK: req.body.mainData.REMARK,
            CREATED_BY: req.body.mainData.CREATED_BY,
        }

        // Insert the new heat_treatment data into the database
        const insertResult = await pool.query('INSERT INTO heat_treatment SET ?', mainData);

        if (insertResult.affectedRows > 0) {
            // Generate CODE based on insert ID
            const insertId = insertResult.insertId;
            const code = generateCodeHT(insertId);

            // Update the CODE column with the generated code
            await pool.query('UPDATE heat_treatment SET CODE = ? WHERE HEAT_ID = ?', [code, insertId]);

            //update item table

            for(const item of req.body.subDataArray){
                const updateResult = await pool.query('UPDATE items SET IS_HEAT_TREATED = 1, WEIGHT_AFTER_HT = ?,HT_ID = ?, HT_BY = ?, PHOTOS_AFTER_HT_LINK = ? , STATUS = ? WHERE ITEM_ID_AI = ?', [
                    item.WEIGHT_AFTER_HT,
                    req.body.mainData.HT_ID,
                    item.HT_BY,
                    item.PHOTOS_AFTER_HT_LINK,
                    item.AFTER_STATUS,
                    item.REFERENCE
                ]);
            }

            return res.status(200).json({ success: true, message: 'Heat treatment added successfully' });
        } else {
            console.error('Error: Failed to add heat_treatment:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding heat_treatment:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/addElecT', async (req, res) => {
    //console.log('Add heat_treatment request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
        mainData ={
            // NAME: req.body.mainData.NAME,
            HT_ID: req.body.mainData.ET_ID,
            ELEC_BY: req.body.mainData.ET_BY,
            IS_APPROVED: 0,
            DATE: req.body.mainData.DATE,
            REMARK: req.body.mainData.REMARK,
            CREATED_BY: req.body.mainData.CREATED_BY,
        }

        // Insert the new heat_treatment data into the database
        const insertResult = await pool.query('INSERT INTO elec_treatment SET ?', mainData);

        if (insertResult.affectedRows > 0) {
            // Generate CODE based on insert ID
            const insertId = insertResult.insertId;
            const code = generateCodeET(insertId);

            // Update the CODE column with the generated code
            await pool.query('UPDATE elec_treatment SET CODE = ? WHERE ELEC_ID = ?', [code, insertId]);

            //update item table

            for(const item of req.body.subDataArray){
                const updateResult = await pool.query('UPDATE items SET IS_ELEC_TREATED = 1, WEIGHT_AFTER_ET = ?,ET_ID = ?, ET_BY = ?, PHOTOS_AFTER_ET_LINK = ? , STATUS = ? WHERE ITEM_ID_AI = ?', [
                    item.WEIGHT_AFTER_ET,
                    req.body.mainData.ET_ID,
                    item.ET_BY,
                    item.PHOTOS_AFTER_ET_LINK,
                    item.AFTER_STATUS,
                    item.REFERENCE
                ]);
            }

            return res.status(200).json({ success: true, message: 'Elec treatment added successfully' });
        } else {
            console.error('Error: Failed to add elec_treatment:', insertResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error adding elec_treatment:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Function to generate CODE based on insert ID
function generateCode(insertId , type) {
    const paddedId = String(insertId).padStart(3, '0');
    if(type === 'Heat Treatment'){
        return `GHT${paddedId}`;
    }
    else if(type === 'Electric Treatment'){
        return `GET${paddedId}`;
    }
    else{
        return `GCP${paddedId}`;
    }
}

function generateCodeHT(insertId) {
    const paddedId = String(insertId).padStart(3, '0');
    return `HT${paddedId}`;
}

function generateCodeET(insertId) {
    const paddedId = String(insertId).padStart(3, '0');
    return `ET${paddedId}`;
}


router.post('/api/updateHT', async (req, res) => {
    //console.log('Update treatment_group request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the treatment_group ID from the request body
        const { HT_ID, ...updatedCustomerData } = req.body;

        const updatedCode = generateCode(HT_ID, updatedCustomerData.TYPE);

        updatedCustomerData.CODE = updatedCode;

        // Update the treatment_group data in the database
        const updateResult = await pool.query('UPDATE treatment_group SET ? WHERE HT_ID = ?', [
            updatedCustomerData,
            HT_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Customer updated successfully' });
        } else {
            console.error('Error: Failed to update treatment_group:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error updating treatment_group:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/updateHeatT', async (req, res) => {
    //console.log('Update treatment_group request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        mainData ={
            // NAME: req.body.mainData.NAME,
            HT_ID: req.body.mainData.HT_ID,
            HEAT_BY: req.body.mainData.HT_BY,
            DATE: req.body.mainData.DATE,
            REMARK: req.body.mainData.REMARK,
        }

        // Update the treatment_group data in the database
        const updateResult = await pool.query('UPDATE heat_treatment SET ? WHERE HEAT_ID = ?', [
            mainData,
            req.body.mainData.HEAT_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            for(const item of req.body.subDataArray){
                const updateResult = await pool.query('UPDATE items SET IS_HEAT_TREATED = 1, WEIGHT_AFTER_HT = ?, HT_BY = ?, PHOTOS_AFTER_HT_LINK = ? , STATUS = ? WHERE ITEM_ID_AI = ?', [
                    item.WEIGHT_AFTER_HT,
                    item.HT_BY,
                    item.PHOTOS_AFTER_HT_LINK,
                    item.AFTER_STATUS,
                    item.REFERENCE
                ]);
            }
            return res.status(200).json({ success: true, message: 'Customer updated successfully' });
        } else {
            console.error('Error: Failed to update treatment_group:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error updating treatment_group:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/updateElecT', async (req, res) => {
    //console.log('Update treatment_group request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        mainData ={
            // NAME: req.body.mainData.NAME,
            HT_ID: req.body.mainData.ET_ID,
            ELEC_BY: req.body.mainData.ET_BY,
            DATE: req.body.mainData.DATE,
            REMARK: req.body.mainData.REMARK,
        }

        // Update the treatment_group data in the database
        const updateResult = await pool.query('UPDATE elec_treatment SET ? WHERE ELEC_ID = ?', [
            mainData,
            req.body.mainData.ELEC_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            for(const item of req.body.subDataArray){
                const updateResult = await pool.query('UPDATE items SET IS_ELEC_TREATED = 1, WEIGHT_AFTER_ET = ?, ET_BY = ?, PHOTOS_AFTER_ET_LINK = ? , STATUS = ? WHERE ITEM_ID_AI = ?', [
                    item.WEIGHT_AFTER_ET,
                    item.ET_BY,
                    item.PHOTOS_AFTER_ET_LINK,
                    item.AFTER_STATUS,
                    item.REFERENCE
                ]);
            }
            return res.status(200).json({ success: true, message: 'Customer updated successfully' });
        } else {
            console.error('Error: Failed to update treatment_group:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error updating treatment_group:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/deactivateHT', async (req, res) => {
    //console.log('Deactivate treatment_group request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the treatment_group ID from the request body
        const { HT_ID } = req.body;

        // Update the IS_ACTIVE column to 0 to deactivate the treatment_group
        const updateResult = await pool.query('UPDATE treatment_group SET IS_ACTIVE = 0 WHERE HT_ID = ?', [
            HT_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Customer deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate treatment_group:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating treatment_group:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/deactivateHeatT', async (req, res) => {
    //console.log('Deactivate treatment_group request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the treatment_group ID from the request body
        const { HEAT_ID } = req.body;

        // Update the IS_ACTIVE column to 0 to deactivate the treatment_group
        const updateResult = await pool.query('UPDATE heat_treatment SET IS_ACTIVE = 0 WHERE HEAT_ID = ?', [
            HEAT_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Customer deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate treatment_group:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating treatment_group:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.post('/api/deactivateElecT', async (req, res) => {
    //console.log('Deactivate treatment_group request received:', req.body);

    try {
        // Ensure the MySQL connection pool is defined
        if (!pool) {
            console.error('Error: MySQL connection pool is not defined');
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }

        // Extract the treatment_group ID from the request body
        const { ELEC_ID } = req.body;

        // Update the IS_ACTIVE column to 0 to deactivate the treatment_group
        const updateResult = await pool.query('UPDATE elec_treatment SET IS_ACTIVE = 0 WHERE ELEC_ID = ?', [
            ELEC_ID,
        ]);

        if (updateResult.affectedRows > 0) {
            return res.status(200).json({ success: true, message: 'Customer deactivated successfully' });
        } else {
            console.error('Error: Failed to deactivate treatment_group:', updateResult.message);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    } catch (error) {
        console.error('Error deactivating treatment_group:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
});



module.exports = router;
