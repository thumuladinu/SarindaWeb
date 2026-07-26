const express = require('express');
const router = express.Router();
const pool = require('./index'); // Assuming pool is exported from index or db

// GET /api/mill/yield-configs
router.get('/api/mill/yield-configs', async (req, res) => {
    try {
        const [rows] = await pool.promise().query('SELECT * FROM mill_yield_configs LIMIT 1');
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Yield configurations not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching yield configs:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/mill/yield-configs
router.put('/api/mill/yield-configs', async (req, res) => {
    const { hal_yield, kudu_yield, hunsal_yield, waste_yield } = req.body;
    
    // Basic validation
    if (hal_yield === undefined || kudu_yield === undefined || hunsal_yield === undefined || waste_yield === undefined) {
        return res.status(400).json({ error: 'Missing yield configuration parameters' });
    }

    const total = parseFloat(hal_yield) + parseFloat(kudu_yield) + parseFloat(hunsal_yield) + parseFloat(waste_yield);
    // Allowing slight floating point variance
    if (Math.abs(total - 100) > 0.01) {
        return res.status(400).json({ error: 'Yield percentages must sum to exactly 100%' });
    }

    try {
        const query = `
            UPDATE mill_yield_configs 
            SET HAL_YIELD = ?, KUDU_YIELD = ?, HUNSAL_YIELD = ?, WASTE_YIELD = ?
            -- Updating all rows (there should only be one)
        `;
        await pool.promise().query(query, [hal_yield, kudu_yield, hunsal_yield, waste_yield]);
        
        res.json({ success: true, message: 'Yield configurations updated successfully' });
    } catch (error) {
        console.error('Error updating yield configs:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
