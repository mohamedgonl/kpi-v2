/**
 * Seed script - Add test tasks to populate dashboards
 * Usage: node scripts/seed-tasks.js
 */
const { Client } = require('pg');

const fs = require('fs');
const path = require('path');

// Try to load DATABASE_URL from .env if not provided
let DB_URL = process.argv[2];
if (!DB_URL) {
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
    const match = envFile.match(/DATABASE_URL=["']?([^"'\s]+)["']?/);
    if (match) DB_URL = match[1];
  } catch (err) {}
}

if (!DB_URL) {
  DB_URL = 'postgresql://postgres.eejofwsxxpkaylxymwwq:daicalongbn01@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres';
}

async function seed() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('✅ Connected to database\n');

  // 1. Get users and work types
  const usersRes = await client.query('SELECT id, full_name FROM users');
  const typesRes = await client.query('SELECT id, name FROM work_types');
  const periodRes = await client.query("SELECT id FROM kpi_periods WHERE name = 'Tháng 4/2026' LIMIT 1");

  if (usersRes.rowCount === 0 || typesRes.rowCount === 0 || periodRes.rowCount === 0) {
    console.error('❌ Missing users, work_types, or kpi_period (Tháng 4/2026). Seed users first.');
    process.exit(1);
  }

  const users = usersRes.rows;
  const types = typesRes.rows;
  const periodId = periodRes.rows[0].id;

  console.log(`Found ${users.length} users, ${types.length} work types. Seeding tasks...`);

  let taskCount = 0;

  for (const user of users) {
    // Each user gets 3-7 random tasks
    const numTasks = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < numTasks; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        const assigned = Math.floor(Math.random() * 5) + 1;
        const actual = Math.random() > 0.1 ? assigned : assigned - 1; // 90% chance of completion
        const status = actual === assigned ? 'completed' : 'pending';
        
        // Random dates in April
        const day = Math.floor(Math.random() * 20) + 1;
        const deadline = `2026-04-${String(day + 5).padStart(2, '0')}`;
        const completionDate = status === 'completed' ? `2026-04-${String(day + Math.floor(Math.random()*4)).padStart(2, '0')}` : null;
        const rework = Math.random() > 0.8 ? 1 : 0;

        await client.query(
            `INSERT INTO tasks (user_id, period_id, work_type_id, task_name, assigned_qty, actual_qty, deadline, completion_date, rework_count, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [user.id, periodId, type.id, `Công việc mẫu ${i+1} của ${user.full_name}`, assigned, actual, deadline, completionDate, rework, status]
        );
        taskCount++;
    }
  }

  console.log(`\n🎉 Seeded ${taskCount} tasks successfully!`);
  await client.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
