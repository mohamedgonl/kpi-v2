const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function checkCols() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    console.log('--- Columns in v_kpi_raw_totals ---');
    const res = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'v_kpi_raw_totals'
    `);
    console.table(res.rows);
    
    console.log('--- Sample data (first 5 rows) ---');
    const sample = await client.query('SELECT user_id, full_name, position, period_id FROM v_kpi_raw_totals LIMIT 5');
    console.table(sample.rows);
    await client.end();
}
checkCols();
