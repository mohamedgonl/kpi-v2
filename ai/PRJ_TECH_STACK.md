# PRJ_TECH_STACK — Kiến Trúc Kỹ Thuật & Cấu Trúc Thư Mục
## Hệ Thống KPI — Bộ Công Thương (MoIT)

---

## 1. TECHNOLOGY STACK (100% Free Tier)

| Layer | Technology | Version | Mục đích |
|---|---|---|---|
| **Frontend** | Angular | 17+ (Standalone) | SPA chính |
| **UI Library** | PrimeNG | 17+ | Component library chuyên nghiệp |
| **CSS Framework** | TailwindCSS | 3.x | Utility-first styling |
| **State Mgmt** | NgRx Signals Store | 17+ | Lightweight, Signal-based |
| **Backend** | NestJS | 10+ | REST API + Serverless |
| **Runtime** | Node.js | 20 LTS | - |
| **Database** | PostgreSQL | 15 | Supabase Free Tier |
| **Auth** | Supabase Auth | - | JWT + RLS |
| **Realtime** | Supabase Realtime | - | Live score updates |
| **Storage** | Supabase Storage | - | Minh chứng đính kèm |
| **Hosting FE** | Vercel / Netlify | - | CDN tự động |
| **Hosting BE** | Vercel Serverless | - | /api/* routes |
| **CI/CD** | GitHub Actions | - | Auto deploy |
| **Excel Export** | ExcelJS | 4.x | Xuất báo cáo |

---

## 2. KIẾN TRÚC TỔNG QUAN

```
┌─────────────────────────────────────────────────────┐
│                   INTERNET                           │
└────────────────┬────────────────────────────────────┘
                 │
    ┌────────────▼────────────┐
    │   Vercel / Netlify CDN  │
    │   Angular 17 SPA        │
    │   (Static Files)        │
    └────────────┬────────────┘
                 │ HTTP REST / Supabase Realtime
    ┌────────────▼────────────┐     ┌──────────────────┐
    │   Vercel Serverless     │     │   Supabase        │
    │   NestJS API            │────▶│   PostgreSQL 15   │
    │   /api/*                │     │   Auth / RLS      │
    └─────────────────────────┘     │   Realtime        │
                                    │   Storage         │
                                    └──────────────────┘
```

### Luồng Authentication
```
User → Angular Login → Supabase Auth → JWT Token
Token → NestJS API (Authorization header)
NestJS → Verify JWT với Supabase → Truy vấn DB
DB → RLS filter data theo role
```

---

## 3. CẤU TRÚC THƯ MỤC — FRONTEND (Angular 17)

```
kpi-frontend/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD GitHub Actions
│
├── src/
│   ├── app/
│   │   │
│   │   ├── core/                   # Singleton services, guards, interceptors
│   │   │   ├── auth/
│   │   │   │   ├── auth.service.ts         # Supabase Auth wrapper
│   │   │   │   ├── auth.guard.ts           # Route protection
│   │   │   │   └── role.guard.ts           # RBAC guard
│   │   │   ├── interceptors/
│   │   │   │   ├── auth.interceptor.ts     # JWT header injection
│   │   │   │   └── error.interceptor.ts    # Global error handling
│   │   │   ├── services/
│   │   │   │   ├── supabase.service.ts     # Supabase client singleton
│   │   │   │   ├── notification.service.ts # Toast + Push notifications
│   │   │   │   └── excel-export.service.ts # ExcelJS export logic
│   │   │   └── models/                     # TypeScript interfaces (domain models)
│   │   │       ├── user.model.ts
│   │   │       ├── task.model.ts
│   │   │       ├── work-type.model.ts
│   │   │       ├── kpi-period.model.ts
│   │   │       └── kpi-summary.model.ts
│   │   │
│   │   ├── features/               # Feature modules (lazy-loaded)
│   │   │   │
│   │   │   ├── auth/               # Module đăng nhập
│   │   │   │   ├── login/
│   │   │   │   │   ├── login.component.ts
│   │   │   │   │   └── login.component.html
│   │   │   │   └── auth.routes.ts
│   │   │   │
│   │   │   ├── dashboard/          # Dashboard cá nhân + lãnh đạo
│   │   │   │   ├── personal/       # Cán bộ xem KPI cá nhân
│   │   │   │   │   ├── personal-dashboard.component.ts
│   │   │   │   │   └── personal-dashboard.component.html
│   │   │   │   ├── manager/        # Lãnh đạo xem tổng hợp đơn vị
│   │   │   │   │   ├── manager-dashboard.component.ts
│   │   │   │   │   └── manager-dashboard.component.html
│   │   │   │   ├── widgets/        # Chart widgets dùng chung
│   │   │   │   │   ├── kpi-gauge/
│   │   │   │   │   ├── score-trend-chart/
│   │   │   │   │   └── org-ranking-table/
│   │   │   │   └── dashboard.routes.ts
│   │   │   │
│   │   │   ├── task-entry/         # Module nhập liệu công việc
│   │   │   │   ├── task-list/
│   │   │   │   │   ├── task-list.component.ts
│   │   │   │   │   └── task-list.component.html
│   │   │   │   ├── task-form/      # Form nhập + real-time score preview
│   │   │   │   │   ├── task-form.component.ts
│   │   │   │   │   └── task-form.component.html
│   │   │   │   ├── score-preview/  # Component hiển thị điểm tạm tính
│   │   │   │   │   └── score-preview.component.ts
│   │   │   │   ├── stores/         # NgRx Signal Store
│   │   │   │   │   └── task.store.ts
│   │   │   │   └── task-entry.routes.ts
│   │   │   │
│   │   │   ├── admin/              # Module quản trị (SuperAdmin/Admin)
│   │   │   │   ├── user-management/
│   │   │   │   │   ├── user-list.component.ts
│   │   │   │   │   └── user-form.component.ts
│   │   │   │   ├── work-type-config/   # ⭐ CẤU HÌNH ĐỘNG - quan trọng nhất
│   │   │   │   │   ├── work-type-list.component.ts
│   │   │   │   │   ├── work-type-form.component.ts  # Form cấu hình công thức
│   │   │   │   │   └── formula-builder/             # Visual formula builder
│   │   │   │   │       └── formula-builder.component.ts
│   │   │   │   ├── period-management/
│   │   │   │   │   ├── period-list.component.ts
│   │   │   │   │   └── period-form.component.ts
│   │   │   │   ├── organization-management/
│   │   │   │   │   └── org-tree.component.ts        # PrimeNG Tree component
│   │   │   │   ├── grading-config/
│   │   │   │   │   └── grading-config.component.ts
│   │   │   │   └── admin.routes.ts
│   │   │   │
│   │   │   └── reports/            # Module xuất báo cáo
│   │   │       ├── report-builder/
│   │   │       │   └── report-builder.component.ts
│   │   │       ├── export-excel/
│   │   │       │   └── export-excel.component.ts
│   │   │       └── reports.routes.ts
│   │   │
│   │   ├── shared/                 # Components dùng lại toàn app
│   │   │   ├── components/
│   │   │   │   ├── page-header/    # Header mỗi trang
│   │   │   │   ├── data-table/     # Wrapper PrimeNG Table
│   │   │   │   ├── confirm-dialog/ # Confirm xoá/submit
│   │   │   │   ├── grade-badge/    # Badge xếp loại A/B/C/D
│   │   │   │   └── score-display/  # Hiển thị điểm có breakdown
│   │   │   ├── pipes/
│   │   │   │   ├── vnd-score.pipe.ts     # Format điểm số
│   │   │   │   └── date-vn.pipe.ts       # Format ngày tiếng Việt
│   │   │   └── directives/
│   │   │       └── role-visibility.directive.ts  # *appHasRole
│   │   │
│   │   ├── layout/                 # Shell layout
│   │   │   ├── main-layout/
│   │   │   │   ├── main-layout.component.ts
│   │   │   │   └── main-layout.component.html
│   │   │   ├── sidebar/
│   │   │   │   └── sidebar.component.ts
│   │   │   └── topbar/
│   │   │       └── topbar.component.ts
│   │   │
│   │   ├── app.component.ts        # Root component
│   │   ├── app.config.ts           # provideRouter, provideHttpClient...
│   │   └── app.routes.ts           # Root routes
│   │
│   ├── environments/
│   │   ├── environment.ts          # Dev
│   │   └── environment.prod.ts     # Production
│   │
│   ├── assets/
│   │   ├── images/
│   │   │   └── logo-moit.png       # Logo Bộ Công Thương
│   │   └── i18n/
│   │       └── vi.json             # Tiếng Việt
│   │
│   ├── styles/
│   │   ├── _variables.scss         # Design tokens (màu, font, spacing)
│   │   ├── _primeng-override.scss  # Custom PrimeNG theme
│   │   └── styles.scss             # Global styles
│   │
│   └── index.html
│
├── tailwind.config.js
├── angular.json
├── package.json
└── tsconfig.json
```

---

## 4. CẤU TRÚC THƯ MỤC — BACKEND (NestJS Serverless)

```
kpi-backend/
├── .github/
│   └── workflows/
│       └── deploy-api.yml
│
├── api/                            # ⭐ Vercel Serverless entry point
│   └── index.ts                   # Express adapter cho NestJS
│
├── src/
│   ├── main.ts                     # Bootstrap (local dev)
│   ├── app.module.ts
│   │
│   ├── config/                     # Configuration
│   │   ├── app.config.ts           # ConfigModule setup
│   │   └── supabase.config.ts      # Supabase client config
│   │
│   ├── common/                     # Cross-cutting concerns
│   │   ├── decorators/
│   │   │   ├── current-user.decorator.ts   # @CurrentUser()
│   │   │   └── roles.decorator.ts          # @Roles('admin', 'manager')
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts           # Verify Supabase JWT
│   │   │   └── roles.guard.ts              # RBAC check
│   │   ├── interceptors/
│   │   │   ├── response.interceptor.ts     # Chuẩn hoá response {data, meta, error}
│   │   │   └── logging.interceptor.ts      # Request logging
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts    # Global error handler
│   │   ├── pipes/
│   │   │   └── parse-uuid.pipe.ts
│   │   └── dto/
│   │       ├── pagination.dto.ts           # { page, limit, sort }
│   │       └── response.dto.ts             # { data, meta, error }
│   │
│   ├── modules/                    # Feature modules
│   │   │
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts          # POST /auth/profile
│   │   │   ├── auth.service.ts             # Verify JWT, get user profile
│   │   │   └── strategies/
│   │   │       └── supabase.strategy.ts
│   │   │
│   │   ├── users/
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts         # CRUD users
│   │   │   ├── users.service.ts
│   │   │   ├── users.repository.ts         # DB queries
│   │   │   └── dto/
│   │   │       ├── create-user.dto.ts
│   │   │       └── update-user.dto.ts
│   │   │
│   │   ├── organizations/
│   │   │   ├── organizations.module.ts
│   │   │   ├── organizations.controller.ts
│   │   │   ├── organizations.service.ts
│   │   │   └── organizations.repository.ts
│   │   │
│   │   ├── work-types/             # ⭐ Cấu hình động - core module
│   │   │   ├── work-types.module.ts
│   │   │   ├── work-types.controller.ts
│   │   │   ├── work-types.service.ts
│   │   │   ├── work-types.repository.ts
│   │   │   ├── dto/
│   │   │   │   ├── create-work-type.dto.ts
│   │   │   │   └── update-work-type.dto.ts
│   │   │   └── validators/
│   │   │       └── formula-validator.ts    # Validate JSON formula syntax
│   │   │
│   │   ├── kpi-periods/
│   │   │   ├── kpi-periods.module.ts
│   │   │   ├── kpi-periods.controller.ts
│   │   │   ├── kpi-periods.service.ts
│   │   │   └── kpi-periods.repository.ts
│   │   │
│   │   ├── tasks/                  # Nhập liệu + tính điểm
│   │   │   ├── tasks.module.ts
│   │   │   ├── tasks.controller.ts
│   │   │   ├── tasks.service.ts
│   │   │   ├── tasks.repository.ts
│   │   │   ├── scoring/            # ⭐ Engine tính điểm
│   │   │   │   ├── scoring.service.ts          # Orchestrate scoring
│   │   │   │   ├── formula-engine.ts           # Xử lý JSON formula
│   │   │   │   └── deduction-calculator.ts     # Tính khấu trừ chậm trễ
│   │   │   └── dto/
│   │   │       ├── create-task.dto.ts
│   │   │       ├── update-task.dto.ts
│   │   │       └── score-preview.dto.ts        # Xem điểm trước khi lưu
│   │   │
│   │   ├── kpi-summaries/
│   │   │   ├── kpi-summaries.module.ts
│   │   │   ├── kpi-summaries.controller.ts     # GET /kpi-summaries/dashboard
│   │   │   └── kpi-summaries.service.ts        # Gọi fn_aggregate_kpi_summary
│   │   │
│   │   └── reports/
│   │       ├── reports.module.ts
│   │       ├── reports.controller.ts           # GET /reports/export-excel
│   │       └── reports.service.ts              # ExcelJS generation
│   │
│   └── database/
│       ├── database.module.ts      # Supabase connection pool
│       ├── database.service.ts     # Query executor
│       └── migrations/             # SQL migration files
│           ├── 001_initial_schema.sql
│           ├── 002_seed_data.sql
│           └── 003_rls_policies.sql
│
├── vercel.json                     # Vercel routing config
├── package.json
├── nest-cli.json
└── tsconfig.json
```

---

## 5. API ENDPOINTS (REST)

### Auth
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/auth/profile` | Lấy profile người dùng hiện tại |
| PUT | `/api/auth/profile` | Cập nhật profile |

### Users (Admin only)
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/users` | Danh sách users (filter by org, role) |
| POST | `/api/users` | Tạo user mới |
| PUT | `/api/users/:id` | Cập nhật user |
| DELETE | `/api/users/:id` | Soft-delete user |

### Work Types (Admin)
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/work-types` | Danh sách loại công việc |
| POST | `/api/work-types` | Tạo loại công việc mới |
| PUT | `/api/work-types/:id` | Cập nhật cấu hình + công thức |
| DELETE | `/api/work-types/:id` | Xoá mềm |
| GET | `/api/work-types/:id/preview-score` | Xem thử điểm với params cho trước |

### Tasks (Staff/Manager)
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/tasks` | Danh sách task (filter by period, user, org) |
| POST | `/api/tasks` | Nhập task mới → tự động tính điểm |
| PUT | `/api/tasks/:id` | Sửa task → tự động tính lại điểm |
| DELETE | `/api/tasks/:id` | Soft-delete task |
| POST | `/api/tasks/preview-score` | **Preview điểm real-time** (không lưu DB) |

### KPI Dashboard
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/kpi-summaries/personal` | KPI cá nhân theo kỳ |
| GET | `/api/kpi-summaries/organization` | KPI tổng hợp đơn vị (Manager) |
| GET | `/api/kpi-summaries/leaderboard` | Bảng xếp hạng |
| POST | `/api/kpi-summaries/recalculate` | Tính lại toàn bộ KPI |

### Reports
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/reports/export-excel?period_id=&org_id=` | Export Excel |
| GET | `/api/reports/export-excel-personal?period_id=` | Export Excel cá nhân |

---

## 6. ENVIRONMENT VARIABLES

```env
# === SUPABASE ===
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Only backend, NEVER expose to FE

# === APP ===
NODE_ENV=production
APP_PORT=3000
JWT_SECRET=your-jwt-secret

# === FRONTEND (Angular environment.prod.ts) ===
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
API_BASE_URL=https://kpi-api.vercel.app/api
```

---

## 7. CI/CD PIPELINE (GitHub Actions)

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  deploy-frontend:
    # Build Angular → Deploy to Vercel/Netlify
    
  deploy-backend:
    # Build NestJS → Deploy to Vercel Serverless
    
  run-migrations:
    # Apply SQL migrations to Supabase
```

---

## 8. QUYẾT ĐỊNH KỸ THUẬT QUAN TRỌNG

### Tại sao NestJS thay vì Express thuần?
- Dependency Injection → dễ test, dễ mở rộng
- Decorator-based RBAC guard gọn hơn
- Tích hợp class-validator/transformer sẵn
- Cùng TypeScript strict với Angular

### Tại sao NgRx Signals Store thay vì Redux?
- Angular 17 native (Signals API)
- Boilerplate ít hơn 70% so với NgRx classic
- Reactive tốt hơn cho real-time score update

### Tại sao lưu công thức tính điểm dạng JSON?
- Admin thay đổi không cần deploy code
- Dễ migrate, dễ audit
- Hỗ trợ nhiều kiểu công thức: linear, fixed, tiered
- Có thể mở rộng thành visual formula builder

### Realtime Score Update
```
Staff nhập task → POST /api/tasks →
NestJS tính điểm → Lưu DB →
Supabase Realtime broadcast → Angular subscribe →
Dashboard cập nhật tức thì (không cần refresh)
```