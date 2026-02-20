const axios = require('axios');
const dayjs = require('dayjs');

async function test() {
    try {
        const payload = {
            startDate: dayjs().subtract(14, 'day').format('YYYY-MM-DD'),
            endDate: dayjs().format('YYYY-MM-DD')
        };
        console.log("Sending payload:", payload);
        const res = await axios.post('http://localhost:3001/api/getInventoryHistory', payload);
        const data = res.data.result;
        console.log("Total records:", data.length);
        const stockOps = data.filter(h => h.SOURCE_TYPE === 'stock_operation');
        console.log("Stock Ops count:", stockOps.length);
        
        if (stockOps.length > 0) {
            console.log("First Op:", stockOps[0].OP_ID, stockOps[0].OP_TYPE_NAME, stockOps[0].CREATED_DATE);
        }
    } catch (e) {
        console.error("API error:", e.message);
    }
}
test();
