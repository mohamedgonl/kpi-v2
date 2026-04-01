/**
 * Seed script - Import users from Firebase data into Supabase
 * Usage: node scripts/seed-users.js
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const fs = require('fs');
const path = require('path');

// Try to load DATABASE_URL from .env if not provided
let DB_URL = process.argv[2];
if (!DB_URL) {
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
    const match = envFile.match(/DATABASE_URL=["']?([^"'\s]+)["']?/);
    if (match) {
      DB_URL = match[1];
    }
  } catch (err) {
    // Fall back to default if .env not found
  }
}

if (!DB_URL) {
  DB_URL = 'postgresql://postgres.eejofwsxxpkaylxymwwq:daicalongbn01@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres';
}

// Map Firebase users to system roles
// Firebase 'admin' (id 1-5): vụ trưởng / vụ phó lãnh đạo
// Firebase 'user' (id 6+): chuyên viên
const FIREBASE_USERS = [
  { id: 0,  name: 'Quản trị hệ thống',       email: 'the.shy.garena2@gmail.com', role: 'admin' },
  { id: 1,  name: 'Ngô Đức Minh',            role_firebase: 'admin' },
  { id: 2,  name: 'Bùi Thị Bình Giang',       role_firebase: 'admin' },
  { id: 3,  name: 'Phạm Thành Trung',          role_firebase: 'admin' },
  { id: 4,  name: 'Phạm Mai Hoa',              role_firebase: 'admin' },
  { id: 5,  name: 'Nguyễn Ngọc Lan',           role_firebase: 'admin' },
  { id: 6,  name: 'Nguyễn Tạ Minh Dương',      role_firebase: 'user' },
  { id: 7,  name: 'Nguyễn Thị Giang',          role_firebase: 'user' },
  { id: 8,  name: 'Hoàng Thùy Giang',          role_firebase: 'user' },
  { id: 9,  name: 'Vũ Hoàng Giang',            role_firebase: 'user' },
  { id: 10, name: 'Bùi Thị Bình Hiền',         role_firebase: 'user' },
  { id: 11, name: 'Nguyễn Ngân Hoài',           role_firebase: 'user' },
  { id: 12, name: 'Lại Thị Lan Hương',          role_firebase: 'user' },
  { id: 13, name: 'Hoàng Thị Hải Hà',           role_firebase: 'user' },
  { id: 14, name: 'Nguyễn Ngọc Anh - LPQT',    role_firebase: 'user' },
  { id: 15, name: 'Nguyễn Viết Khoảng',         role_firebase: 'user' },
  { id: 16, name: 'Nguyễn Ngọc Anh - TH',      role_firebase: 'user' },
  { id: 17, name: 'Biên Thị Mai',               role_firebase: 'user' },
  { id: 18, name: 'Lê Bá Ngọc',                 role_firebase: 'user' },
  { id: 19, name: 'Lê Thị Nhàn',                role_firebase: 'user' },
  { id: 20, name: 'Vũ Mai Nguyên Phương',        role_firebase: 'user' },
  { id: 21, name: 'Trương Minh Tú',              role_firebase: 'user' },
  { id: 22, name: 'Hoàng Văn Thưởng',           role_firebase: 'user' },
  { id: 23, name: 'Nguyễn Văn Thành',           role_firebase: 'user' },
  { id: 24, name: 'Lê Gia Thám Khiêm',          role_firebase: 'user' },
];

function mapRole(user) {
  if (user.role_firebase === 'user') return 'chuyen_vien';
  // Firebase admin #1 = Vụ trưởng, #2-5 = Vụ phó
  if (user.id === 1) return 'vu_truong';
  return 'vu_pho';
}

function makeEmail(id, name, customEmail) {
  if (customEmail) return customEmail;
  // Map ID 1 (Ngô Đức Minh - Vụ trưởng) to admin@moit.gov.vn
  if (id === 1) return 'admin@moit.gov.vn';
  // Generate unique email from id; user can update later
  return `user${String(id).padStart(2, '0')}@moit.gov.vn`;
}

function makeEmployeeCode(id) {
  return `MV${String(id).padStart(3, '0')}`;
}

async function seed() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('✅ Connected to database\n');

  const passwordHash = await bcrypt.hash('123456', 10);
  let inserted = 0;
  let skipped = 0;

  for (const u of FIREBASE_USERS) {
    const email = makeEmail(u.id, u.name, u.email);
    const role = u.role || mapRole(u);
    const code = u.id === 0 ? null : makeEmployeeCode(u.id);

    try {
      const res = await client.query(
        `INSERT INTO users (employee_code, full_name, email, role, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (email) 
         DO UPDATE SET 
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            is_active = true
         RETURNING id`,
        [code, u.name, email, role, passwordHash]
      );

      if (res.rowCount > 0) {
        console.log(`  ✅ [${code}] ${u.name.padEnd(30)} → ${role} (${email})`);
        inserted++;
      } else {
        console.log(`  ⏭️  [${code}] ${u.name.padEnd(30)} → không thay đổi, bỏ qua`);
        skipped++;
      }
    } catch (err) {
      console.error(`  ❌ ${u.name}: ${err.message}`);
    }
  }

  console.log(`\n📊 Kết quả: ${inserted} thêm mới, ${skipped} bỏ qua`);

  // Seed a test KPI period if not exists
  try {
    await client.query(`
      INSERT INTO kpi_periods (name, period_type, year, month, start_date, end_date, is_active)
      VALUES ('Tháng 4/2026', 'month', 2026, 4, '2026-04-01', '2026-04-30', true)
      ON CONFLICT DO NOTHING
    `);
    console.log('  ✅ Kỳ KPI "Tháng 4/2026" đã tạo');
  } catch (err) {
    console.log(`  ⏭️  Kỳ KPI: ${err.message}`);
  }

  await client.end();
  console.log('\n🎉 Seed hoàn tất!');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
