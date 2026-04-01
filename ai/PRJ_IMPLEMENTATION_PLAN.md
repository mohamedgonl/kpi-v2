# KPI System — Implementation Plan (5 Bước)

> **Trạng thái:** Sẵn sàng bắt đầu
> **DB Schema:** ✅ Đã hoàn thiện (`PRJ_DATABASE_SCHEMA.sql`)
> **Tech Stack:** Angular 17 + NestJS 10 + PostgreSQL (Supabase) + Vercel

---

## Tổng quan kiến trúc monorepo

```
kpi-v2/
├── ai/                     ← Tài liệu thiết kế
├── kpi-backend/            ← NestJS REST API (Bước 2 & 3)
├── kpi-frontend/           ← Angular 17 SPA (Bước 4)
└── .github/workflows/      ← CI/CD (Bước 5)
```

## Những điểm đã thống nhất (khác với PRJ_TECH_STACK.md ban đầu)

| # | Quyết định thiết kế |
|---|---|
| 1 | **Không dùng Supabase Auth** — Tự quản lý bcrypt + JWT trong NestJS |
| 2 | **Không có bảng organizations** — 1 đơn vị cố định, trong suốt với người dùng |
| 3 | **4 roles:** `admin`, `vu_truong`, `vu_pho`, `chuyen_vien` |
| 4 | **KPI tính on-the-fly** — Không cache vào DB, tính khi gọi dashboard/báo cáo |
| 5 | **Không dùng stored procedures** — Logic tính KPI hoàn toàn ở Node.js |
| 6 | **Không có RLS** — Phân quyền xử lý ở NestJS Guards |
| 7 | **Quên mật khẩu qua email** — Bảng `password_reset_tokens` + SMTP |
| 8 | **`work_types.code` không lưu DB** — UI tự generate từ `sort_order` |

---

## BƯỚC 1: Khởi tạo Database Schema

**Mục tiêu:** Chạy SQL trên Supabase, có dữ liệu seed để phát triển.

### Chạy trên Supabase SQL Editor
File `ai/PRJ_DATABASE_SCHEMA.sql` — chạy toàn bộ 1 lần.

### Tạo Admin User đầu tiên
```bash
# Lấy bcrypt hash của '123456':
node -e "const b=require('bcrypt'); b.hash('123456',10).then(h=>console.log(h))"
```
```sql
INSERT INTO users (full_name, email, role, password_hash)
VALUES ('Administrator', 'admin@moit.gov.vn', 'admin', '$2b$10$...');
```

### Definition of Done ✅
- [ ] Tất cả 9 bảng + 2 views tạo thành công
- [ ] 6 work_groups + 21 work_types + 4 grading_configs có trong DB
- [ ] `SELECT * FROM v_kpi_raw_totals` chạy không lỗi

---

## BƯỚC 2: Backend — Auth & Module Quản trị

**Mục tiêu:** REST API nền móng (auth, users, cấu hình nhóm/loại công việc, kỳ KPI).

### Khởi tạo dự án
```bash
cd /home/gonl/workspaces/kpi-v2
npx @nestjs/cli new kpi-backend --package-manager npm --language TS
cd kpi-backend
npm install pg @nestjs/config @nestjs/jwt @nestjs/passport passport passport-jwt
npm install bcrypt nodemailer class-validator class-transformer
npm install -D @types/bcrypt @types/nodemailer @types/passport-jwt @types/pg
```

### Cấu trúc thư mục
```
kpi-backend/src/
├── config/
│   └── database.config.ts          ← pg Pool (DATABASE_URL)
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts   (@CurrentUser())
│   │   └── roles.decorator.ts          (@Roles('admin'))
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   └── interceptors/
│       └── response.interceptor.ts     ← { data, meta, error }
└── modules/
    ├── auth/                           ← login, forgot-password, reset-password
    ├── users/                          ← CRUD (Admin only)
    ├── work-groups/                    ← CRUD (Admin)
    ├── work-types/                     ← CRUD (Admin)
    └── kpi-periods/                    ← CRUD (Admin)
```

### API Endpoints
```
POST   /api/auth/login
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/me

GET    /api/users                       [Admin]
POST   /api/users                       [Admin]
PATCH  /api/users/:id                   [Admin]
PATCH  /api/users/:id/reset-password    [Admin] → reset về 123456
DELETE /api/users/:id                   [Admin] → is_active=false

GET    /api/work-groups
POST   /api/work-groups                 [Admin]
PATCH  /api/work-groups/:id             [Admin]
DELETE /api/work-groups/:id             [Admin]

GET    /api/work-types?group_id=
POST   /api/work-types                  [Admin]
PATCH  /api/work-types/:id              [Admin]
DELETE /api/work-types/:id              [Admin]

GET    /api/kpi-periods
POST   /api/kpi-periods                 [Admin]
PATCH  /api/kpi-periods/:id             [Admin] ← lock/unlock
```

### Auth logic chi tiết
```
Login:
  email + password → bcrypt.compare → JWT{ sub, role, email }

Forgot password:
  email → crypto.randomBytes(48).toString('hex') → lưu password_reset_tokens
        → gửi email link: FRONTEND_URL/reset-password?token=xxx

Reset password:
  token → kiểm tra (expires_at > NOW() && used_at IS NULL)
        → bcrypt.hash(newPassword, 10) → UPDATE users
        → UPDATE password_reset_tokens SET used_at = NOW()

Admin reset password:
  PATCH /api/users/:id/reset-password → bcrypt.hash('123456', 10)
```

### Definition of Done ✅
- [ ] Login trả JWT hợp lệ
- [ ] JWT Guard bảo vệ route private
- [ ] Roles Guard phân biệt admin với role khác
- [ ] Admin reset password về 123456 hoạt động
- [ ] CRUD work-groups, work-types OK
- [ ] Forgot password gửi email đến inbox test (Mailtrap hoặc Gmail)

---

## BƯỚC 3: Backend — Task Entry & KPI On-the-fly

**Mục tiêu:** Nhập liệu công việc + engine tính KPI chuyển từ kpi.js gốc.

### Modules mới thêm
```
kpi-backend/src/modules/
├── tasks/
│   ├── tasks.controller.ts
│   ├── tasks.service.ts
│   └── kpi-calculator.service.ts   ← ⭐ Port từ kpi.js + store.js
├── dashboard/
│   ├── dashboard.controller.ts
│   └── dashboard.service.ts        ← Query v_kpi_raw_totals → tính KPI
└── reports/
    ├── reports.controller.ts
    └── reports.service.ts          ← ExcelJS export
```

### API Endpoints
```
GET    /api/tasks?period_id=&user_id=&status=
POST   /api/tasks
PATCH  /api/tasks/:id
DELETE /api/tasks/:id               ← is_deleted=true

GET    /api/dashboard/personal?period_id=
GET    /api/dashboard/summary?period_id=        [vu_truong, vu_pho, admin]
GET    /api/dashboard/leaderboard?period_id=    [vu_truong, vu_pho, admin]

GET    /api/reports/export?period_id=&user_id=  ← download Excel
```

### KPI Calculator — logic từ kpi.js gốc (TypeScript)
```typescript
// kpi-calculator.service.ts

function computeTaskColumns(task: Task, coefficient: number) {
  const col7 = coefficient * task.assigned_qty;           // assigned converted
  const col9 = coefficient * task.actual_qty;             // actual converted
  const delayDays = task.completion_date && task.deadline
    ? Math.max(0, Math.ceil(
        (new Date(task.completion_date).getTime() -
         new Date(task.deadline).getTime()) / 86_400_000
      ))
    : 0;
  const col12 = Math.max(0, col9 - delayDays * 0.25 * col9);    // tiến độ
  const col14 = Math.max(0, col9 - task.rework_count * 0.25 * col9); // chất lượng
  return { col7, col9, col12, col14, delayDays };
}

function computeKpiBreakdown(tasks) {
  // Σ các cột quy đổi
  let totalCol7 = 0, totalCol9 = 0, totalCol12 = 0, totalCol14 = 0;
  tasks.forEach(t => {
    const cols = computeTaskColumns(t, t.coefficient);
    totalCol7  += cols.col7;
    totalCol9  += cols.col9;
    totalCol12 += cols.col12;
    totalCol14 += cols.col14;
  });
  const a   = totalCol7 > 0 ? (totalCol9  / totalCol7) * 100 : 0;  // Số lượng %
  const b   = totalCol7 > 0 ? (totalCol14 / totalCol7) * 100 : 0;  // Chất lượng %
  const c   = totalCol7 > 0 ? (totalCol12 / totalCol7) * 100 : 0;  // Tiến độ %
  const kpi = (a + b + c) / 3;
  return { a, b, c, kpi, totalCol7, totalCol9, totalCol12, totalCol14 };
}
```

### Grading (xếp loại)
```typescript
// So sánh kpi% với grading_configs để gán A/B/C/D
// Query: SELECT * FROM grading_configs WHERE period_id IS NULL ORDER BY min_score DESC
// Tìm grade đầu tiên có min_score <= kpi
```

### Definition of Done ✅
- [ ] POST /api/tasks lưu thành công
- [ ] GET /api/dashboard/personal trả KPI đúng
- [ ] Test: `coefficient=95, assigned=1, actual=1, delay=0, rework=0` → KPI=100%
- [ ] Test: same nhưng `delay_days=2` → col12 = MAX(0, 95 - 2×0.25×95) = 47.5
- [ ] Excel có đủ cột + dòng tổng hợp + KPI = (a+b+c)/3

---

## BƯỚC 4: Frontend — Angular 17 + PrimeNG

**Mục tiêu:** 6 module giao diện, professional theo UI/UX spec.

### Khởi tạo
```bash
cd /home/gonl/workspaces/kpi-v2
npx -y @angular/cli@17 new kpi-frontend --routing --style=scss --standalone
cd kpi-frontend
npm install primeng@17 primeicons primeflex chart.js
```

### Modules theo thứ tự ưu tiên

| # | Module | Người dùng | Màn hình chính |
|---|---|---|---|
| 1 | **Auth** | Tất cả | Login, Quên MK, Reset MK |
| 2 | **Task Entry** | Chuyên viên | List + Form nhập (preview điểm RT) |
| 3 | **Dashboard Personal** | Tất cả | KPI %, gauge, biểu đồ theo nhóm |
| 4 | **Dashboard Manager** | Vụ trưởng/Phó | Bảng xếp hạng, so sánh cá nhân |
| 5 | **Reports** | Vụ trưởng/Phó/Admin | Chọn kỳ → Xuất Excel |
| 6 | **Admin** | Admin | Quản lý users, work types, kỳ KPI |

### Design Tokens
```scss
// Theo PRJ_UI_UX_DESIGN.md
$primary:  #1d4ed8;   // Navy blue — màu chủ đạo
$danger:   #ef4444;
$success:  #16a34a;
$warning:  #f59e0b;
$font:     'Roboto', 'Inter', sans-serif;
```

### Task Form — điểm quan trọng nhất
```
Giao diện nhập task:
1. Chọn Nhóm công việc (dropdown từ /api/work-groups)
2. Chọn Loại công việc (cascade dropdown từ /api/work-types?group_id=)
3. Nhập tên mô tả công việc
4. Nhập Số lượng giao / Số lượng thực hiện
5. Chọn Hạn hoàn thành / Ngày hoàn thành thực tế
6. Nhập Số lần làm lại
7. [Preview] Hiển thị tạm tính:
   col7 | col9 | Ngày trễ | col12 | col14 | a% | b% | c% | KPI%
```

### Route Guard theo role
```typescript
// Login → redirect theo role:
admin      → /admin
vu_truong  → /dashboard/summary
vu_pho     → /dashboard/summary
chuyen_vien → /dashboard/personal
```

### Definition of Done ✅
- [ ] Login redirect đúng theo role
- [ ] Nhập task, xem list, xoá được
- [ ] Preview điểm cập nhật khi đổi số lượng/ngày/làm lại
- [ ] Dashboard cá nhân: KPI % + xếp loại A/B/C/D
- [ ] Dashboard manager: bảng xếp hạng toàn đơn vị
- [ ] Admin: CRUD users, reset password 1 click
- [ ] Export Excel download được file đúng format

---

## BƯỚC 5: CI/CD — GitHub Actions + Vercel

### Cấu trúc repo (monorepo)
```
kpi-v2/
├── kpi-frontend/
│   └── vercel.json
├── kpi-backend/
│   └── vercel.json
└── .github/workflows/
    └── deploy.yml
```

### kpi-backend/vercel.json
```json
{
  "version": 2,
  "builds": [{ "src": "dist/main.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/api/(.*)", "dest": "dist/main.js" }]
}
```

### .github/workflows/deploy.yml
```yaml
name: Deploy KPI System
on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd kpi-backend && npm ci && npm run build
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_API }}
          working-directory: kpi-backend
          vercel-args: '--prod'

  deploy-frontend:
    runs-on: ubuntu-latest
    needs: deploy-backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd kpi-frontend && npm ci && npm run build
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID_FE }}
          working-directory: kpi-frontend
          vercel-args: '--prod'
```

### Environment Variables — Vercel Backend
```
DATABASE_URL=postgresql://postgres:[pass]@[host]:5432/postgres
JWT_SECRET=<32-char random string>
JWT_EXPIRES_IN=7d
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=<gmail app password>
SMTP_FROM=KPI System <noreply@moit.gov.vn>
FRONTEND_URL=https://kpi-moit.vercel.app
```

### Environment Variables — Vercel Frontend
```
NG_APP_API_URL=https://kpi-api.vercel.app/api
```

### Definition of Done ✅
- [ ] Push main → GitHub Actions xanh
- [ ] Backend live: `https://kpi-api.vercel.app/api/auth/login`
- [ ] Frontend live: `https://kpi-moit.vercel.app`

---

## Câu hỏi cần xác nhận để bắt đầu

> Trả lời 4 câu này để bắt đầu code ngay:

1. **SMTP**: Dùng Gmail (App Password) hay dịch vụ khác (Resend, SendGrid)?
2. **Supabase**: Đã tạo project chưa? Có `DATABASE_URL` chưa?
3. **Vercel**: Đã có tài khoản, đã connect GitHub chưa?
4. **Bắt đầu từ Bước mấy?**
   - Bước 1 → Chạy SQL schema trên Supabase (chỉ cần copy-paste)
   - Bước 2 → Bắt đầu code NestJS backend
