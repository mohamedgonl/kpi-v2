-- ============================================================
-- HỆ THỐNG TÍNH ĐIỂM KPI - BỘ CÔNG THƯƠNG (MoIT)
-- Database Schema: PostgreSQL (Supabase)
-- Version: 1.0.0
-- Author: Senior Fullstack Architect
-- Date: 2026-03-31
-- ============================================================
-- Ghi chú thiết kế:
-- 1. Cấu hình loại công việc hoàn toàn động (không fix cứng)
-- 2. Hỗ trợ RBAC: SuperAdmin > Admin > Manager > Staff
-- 3. Công thức tính điểm lưu dạng JSON để linh hoạt mở rộng
-- 4. Soft-delete trên tất cả bảng quan trọng
-- 5. Audit log đầy đủ (created_at, updated_at, created_by)
-- ============================================================

-- === EXTENSION ===
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- PHẦN 1: TỔ CHỨC (ORGANIZATIONS)
-- ============================================================

-- Bảng đơn vị / phòng ban (hỗ trợ cây phân cấp)
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(50) NOT NULL UNIQUE,       -- Mã đơn vị, ví dụ: "VU_CNTD"
    name            VARCHAR(255) NOT NULL,             -- Tên đầy đủ đơn vị
    short_name      VARCHAR(100),                      -- Tên viết tắt
    parent_id       UUID REFERENCES organizations(id), -- NULL = cấp Bộ/Vụ gốc
    level           SMALLINT NOT NULL DEFAULT 1,       -- 1=Bộ, 2=Vụ/Cục, 3=Phòng
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_parent_id ON organizations(parent_id);
CREATE INDEX idx_organizations_code ON organizations(code);

-- ============================================================
-- PHẦN 2: NGƯỜI DÙNG & PHÂN QUYỀN (AUTH & RBAC)
-- ============================================================

-- Enum role
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'manager', 'staff');

-- Bảng người dùng (kết nối với Supabase Auth qua id)
CREATE TABLE users (
    id              UUID PRIMARY KEY,                  -- Trùng với auth.users.id của Supabase
    employee_code   VARCHAR(50) UNIQUE,                -- Mã cán bộ
    full_name       VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    phone           VARCHAR(20),
    position        VARCHAR(255),                      -- Chức vụ (ví dụ: Chuyên viên, Phó trưởng phòng)
    organization_id UUID NOT NULL REFERENCES organizations(id),
    role            user_role NOT NULL DEFAULT 'staff',
    avatar_url      TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id)
);

CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================
-- PHẦN 3: CẤU HÌNH KPI ĐỘNG (DYNAMIC KPI CONFIGURATION)
-- ============================================================
-- Đây là phần cốt lõi - Admin tự định nghĩa hoàn toàn, không fix cứng code

-- Kỳ KPI (tháng, quý, năm)
CREATE TABLE kpi_periods (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL,             -- Ví dụ: "Tháng 4/2026", "Quý II/2026"
    period_type     VARCHAR(20) NOT NULL DEFAULT 'month', -- 'month' | 'quarter' | 'year'
    year            SMALLINT NOT NULL,
    month           SMALLINT,                          -- NULL nếu là quý/năm
    quarter         SMALLINT,                          -- NULL nếu là tháng/năm
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,    -- Chỉ 1 kỳ active tại một thời điểm
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE,    -- Khoá = không cho nhập liệu nữa
    total_kpi_score NUMERIC(5,2) NOT NULL DEFAULT 100, -- Tổng điểm tối đa của kỳ
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id),
    CONSTRAINT uq_period UNIQUE (period_type, year, month, quarter)
);

-- Nhóm loại công việc (phân nhóm lớn, ví dụ: Công việc thường xuyên, Đột xuất, v.v.)
CREATE TABLE work_category_groups (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,             -- Ví dụ: "Nhóm A - Công việc chuyên môn"
    description     TEXT,
    color_hex       VARCHAR(7) DEFAULT '#1e3a5f',      -- Màu hiển thị trên dashboard
    icon            VARCHAR(100),                      -- Tên icon (PrimeNG icon class)
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id)
);

-- Loại công việc (Admin định nghĩa động - CORE của hệ thống)
CREATE TABLE work_types (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id            UUID REFERENCES work_category_groups(id),
    code                VARCHAR(50) NOT NULL UNIQUE,   -- Mã loại CV, ví dụ: "CV_THUONG_XUYEN"
    name                VARCHAR(255) NOT NULL,         -- Tên loại công việc
    description         TEXT,

    -- === CẤU HÌNH TÍNH ĐIỂM ĐỘNG ===
    unit                VARCHAR(50) DEFAULT 'task',    -- Đơn vị đo: 'task', 'document', 'hour', 'day'
    base_score          NUMERIC(8,4) NOT NULL DEFAULT 1.0, -- Điểm cơ bản/đơn vị
    weight_coefficient  NUMERIC(5,4) NOT NULL DEFAULT 1.0, -- Hệ số trọng số (nhân với base_score)
    max_score_per_task  NUMERIC(8,4),                  -- Giới hạn điểm tối đa/task (NULL = không giới hạn)
    max_score_per_period NUMERIC(8,4),                 -- Giới hạn điểm tối đa/kỳ (NULL = không giới hạn)

    -- === CÔNG THỨC TÍNH ĐIỂM (JSON linh hoạt) ===
    -- Ví dụ: {"type": "linear", "formula": "quantity * base_score * weight_coefficient"}
    -- Ví dụ: {"type": "tiered", "tiers": [{"min":1,"max":5,"score":1},{"min":6,"max":null,"score":0.8}]}
    scoring_formula     JSONB NOT NULL DEFAULT '{"type": "linear", "formula": "quantity * base_score * weight_coefficient"}'::jsonb,

    -- === QUY TẮC TRỪ ĐIỂM CHẬM TIẾN ĐỘ ===
    -- Ví dụ: {"enabled": true, "rate": 0.25, "unit": "per_day", "max_deduction_rate": 1.0}
    -- rate: 0.25 = trừ 25% điểm task cho mỗi ngày trễ
    deduction_rules     JSONB NOT NULL DEFAULT '{"enabled": false}'::jsonb,

    -- === QUY TẮC KIỂM DUYỆT ===
    requires_evidence   BOOLEAN NOT NULL DEFAULT FALSE, -- Bắt buộc đính kèm minh chứng
    requires_approval   BOOLEAN NOT NULL DEFAULT FALSE, -- Bắt buộc phê duyệt (dành cho tương lai)

    applies_to_roles    user_role[] DEFAULT '{staff,manager}'::user_role[], -- Vai trò nào được dùng
    sort_order          INT NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID REFERENCES users(id)
);

CREATE INDEX idx_work_types_group_id ON work_types(group_id);
CREATE INDEX idx_work_types_is_active ON work_types(is_active);

-- Phân bổ mục tiêu KPI theo đơn vị + kỳ (target allocation)
CREATE TABLE kpi_targets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id       UUID NOT NULL REFERENCES kpi_periods(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    work_type_id    UUID NOT NULL REFERENCES work_types(id),
    target_quantity NUMERIC(10,2),                     -- Số lượng công việc mục tiêu
    target_score    NUMERIC(8,2),                      -- Điểm mục tiêu (nếu phân bổ theo điểm)
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id),
    CONSTRAINT uq_kpi_target UNIQUE (period_id, organization_id, work_type_id)
);

-- ============================================================
-- PHẦN 4: NHẬP LIỆU CÔNG VIỆC (TASK ENTRY)
-- ============================================================

-- Trạng thái công việc
CREATE TYPE task_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- Bảng công việc (task entry của cán bộ)
CREATE TABLE tasks (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id           UUID NOT NULL REFERENCES kpi_periods(id),
    user_id             UUID NOT NULL REFERENCES users(id),
    organization_id     UUID NOT NULL REFERENCES organizations(id), -- Đơn vị tại thời điểm nhập

    work_type_id        UUID NOT NULL REFERENCES work_types(id),

    -- === THÔNG TIN CÔNG VIỆC ===
    task_name           VARCHAR(500) NOT NULL,          -- Tên/mô tả công việc
    detail              TEXT,                           -- Chi tiết
    quantity            NUMERIC(10,2) NOT NULL DEFAULT 1, -- Số lượng
    unit_display        VARCHAR(50),                    -- Đơn vị hiển thị (tự nhập, ví dụ: "văn bản")

    -- === MỐC THỜI GIAN ===
    planned_date        DATE,                           -- Ngày dự kiến hoàn thành
    completed_date      DATE,                           -- Ngày hoàn thành thực tế
    days_late           INT GENERATED ALWAYS AS (
                            CASE
                                WHEN completed_date IS NOT NULL AND planned_date IS NOT NULL AND completed_date > planned_date
                                THEN (completed_date - planned_date)
                                ELSE 0
                            END
                        ) STORED,                       -- Số ngày trễ (computed column)

    -- === ĐIỂM SỐ (Tính và cache lại) ===
    raw_score           NUMERIC(10,4),                  -- Điểm trước khi trừ
    deduction_score     NUMERIC(10,4) DEFAULT 0,        -- Điểm bị trừ do trễ hạn
    final_score         NUMERIC(10,4),                  -- Điểm cuối = raw_score - deduction_score
    score_breakdown     JSONB,                          -- Chi tiết tính điểm: {formula, steps, deductions}

    -- === TRẠNG THÁI ===
    status              task_status NOT NULL DEFAULT 'submitted',
    rejection_reason    TEXT,
    reviewed_by         UUID REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,

    -- === MINH CHỨNG ===
    evidence_urls       TEXT[],                         -- Mảng URL đính kèm
    reference_code      VARCHAR(100),                   -- Số hiệu văn bản tham chiếu

    -- === SOFT DELETE ===
    is_deleted          BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at          TIMESTAMPTZ,
    deleted_by          UUID REFERENCES users(id),

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_period_id ON tasks(period_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_organization_id ON tasks(organization_id);
CREATE INDEX idx_tasks_work_type_id ON tasks(work_type_id);
CREATE INDEX idx_tasks_is_deleted ON tasks(is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_period_user ON tasks(period_id, user_id) WHERE is_deleted = FALSE;

-- ============================================================
-- PHẦN 5: KẾT QUẢ KPI TỔNG HỢP (AGGREGATED RESULTS)
-- ============================================================
-- Cache điểm tổng theo từng user/kỳ để dashboard nhanh

CREATE TABLE kpi_summaries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id           UUID NOT NULL REFERENCES kpi_periods(id),
    user_id             UUID NOT NULL REFERENCES users(id),
    organization_id     UUID NOT NULL REFERENCES organizations(id),

    -- Thống kê tổng hợp
    total_tasks         INT NOT NULL DEFAULT 0,
    total_raw_score     NUMERIC(10,4) NOT NULL DEFAULT 0,
    total_deduction     NUMERIC(10,4) NOT NULL DEFAULT 0,
    total_final_score   NUMERIC(10,4) NOT NULL DEFAULT 0,
    completion_rate     NUMERIC(5,2),                   -- % hoàn thành so với target

    -- Phân loại xếp hạng (Admin cấu hình ngưỡng)
    grade               VARCHAR(10),                    -- 'A', 'B', 'C', 'D' hoặc tùy chỉnh
    rank_in_org         INT,                            -- Thứ hạng trong đơn vị

    -- Score theo từng nhóm loại công việc (JSON)
    score_by_group      JSONB,                          -- {"group_id": {"score": x, "tasks": y}}
    score_by_work_type  JSONB,                          -- {"work_type_id": {"score": x, "tasks": y}}

    last_calculated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_kpi_summary UNIQUE (period_id, user_id)
);

CREATE INDEX idx_kpi_summaries_period_id ON kpi_summaries(period_id);
CREATE INDEX idx_kpi_summaries_user_id ON kpi_summaries(user_id);
CREATE INDEX idx_kpi_summaries_organization_id ON kpi_summaries(organization_id);

-- ============================================================
-- PHẦN 6: CẤU HÌNH XẾP LOẠI (GRADING CONFIG)
-- ============================================================
-- Admin cấu hình ngưỡng xếp loại theo từng kỳ

CREATE TABLE grading_configs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id       UUID REFERENCES kpi_periods(id),   -- NULL = áp dụng chung
    organization_id UUID REFERENCES organizations(id), -- NULL = áp dụng toàn Bộ
    grade_label     VARCHAR(10) NOT NULL,               -- 'A', 'B', 'C', 'D'
    grade_name      VARCHAR(100),                       -- 'Xuất sắc', 'Tốt', 'Đạt', 'Chưa đạt'
    min_score       NUMERIC(5,2) NOT NULL,              -- Ngưỡng điểm tối thiểu (%)
    max_score       NUMERIC(5,2),                       -- Ngưỡng điểm tối đa (NULL = không giới hạn)
    color_hex       VARCHAR(7),                         -- Màu badge
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id)
);

-- ============================================================
-- PHẦN 7: THÔNG BÁO HỆ THỐNG (NOTIFICATIONS)
-- ============================================================

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    title           VARCHAR(255) NOT NULL,
    body            TEXT,
    type            VARCHAR(50) DEFAULT 'info',         -- 'info', 'warning', 'success', 'error'
    related_entity  VARCHAR(50),                        -- 'task', 'period', 'kpi_summary'
    related_id      UUID,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id, is_read);

-- ============================================================
-- PHẦN 8: AUDIT LOG (LỊCH SỬ THAY ĐỔI)
-- ============================================================

CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(50) NOT NULL,               -- 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
    entity_type     VARCHAR(100) NOT NULL,              -- Tên bảng
    entity_id       UUID,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================
-- PHẦN 9: FUNCTIONS & TRIGGERS
-- ============================================================

-- Trigger tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Áp dụng trigger cho các bảng cần thiết
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_work_types_updated_at BEFORE UPDATE ON work_types
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_kpi_summaries_updated_at BEFORE UPDATE ON kpi_summaries
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- ============================================================
-- Function tính điểm task (core business logic tại DB layer)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_calculate_task_score(
    p_task_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_task          RECORD;
    v_work_type     RECORD;
    v_raw_score     NUMERIC;
    v_deduction     NUMERIC := 0;
    v_final_score   NUMERIC;
    v_breakdown     JSONB;
    v_formula_type  TEXT;
    v_deduction_cfg JSONB;
BEGIN
    -- Lấy thông tin task
    SELECT t.*, t.days_late INTO v_task FROM tasks t WHERE t.id = p_task_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task not found: %', p_task_id;
    END IF;

    -- Lấy cấu hình loại công việc
    SELECT * INTO v_work_type FROM work_types WHERE id = v_task.work_type_id;

    -- Lấy loại công thức
    v_formula_type := v_work_type.scoring_formula->>'type';

    -- === TÍNH ĐIỂM THÔ (RAW SCORE) ===
    IF v_formula_type = 'linear' THEN
        v_raw_score := v_task.quantity * v_work_type.base_score * v_work_type.weight_coefficient;
    ELSIF v_formula_type = 'fixed' THEN
        -- Mỗi task có điểm cố định, quantity không ảnh hưởng
        v_raw_score := v_work_type.base_score * v_work_type.weight_coefficient;
    ELSIF v_formula_type = 'tiered' THEN
        -- Điểm theo bậc thang (cần xử lý phức tạp hơn, tạm dùng linear)
        v_raw_score := v_task.quantity * v_work_type.base_score * v_work_type.weight_coefficient;
    ELSE
        v_raw_score := v_task.quantity * v_work_type.base_score * v_work_type.weight_coefficient;
    END IF;

    -- Giới hạn điểm tối đa/task
    IF v_work_type.max_score_per_task IS NOT NULL THEN
        v_raw_score := LEAST(v_raw_score, v_work_type.max_score_per_task);
    END IF;

    -- === TÍNH ĐIỂM KHẤU TRỪ (DEDUCTION) ===
    v_deduction_cfg := v_work_type.deduction_rules;

    IF (v_deduction_cfg->>'enabled')::BOOLEAN = TRUE AND v_task.days_late > 0 THEN
        DECLARE
            v_rate              NUMERIC;
            v_max_deduct_rate   NUMERIC;
        BEGIN
            v_rate := COALESCE((v_deduction_cfg->>'rate')::NUMERIC, 0.25);
            v_max_deduct_rate := COALESCE((v_deduction_cfg->>'max_deduction_rate')::NUMERIC, 1.0);
            -- Trừ: rate * days_late * raw_score, tối đa max_deduct_rate * raw_score
            v_deduction := LEAST(v_rate * v_task.days_late * v_raw_score, v_max_deduct_rate * v_raw_score);
        END;
    END IF;

    -- === ĐIỂM CUỐI ===
    v_final_score := v_raw_score - v_deduction;

    -- === CHI TIẾT TÍNH ĐIỂM (BREAKDOWN) ===
    v_breakdown := jsonb_build_object(
        'formula_type',         v_formula_type,
        'quantity',             v_task.quantity,
        'base_score',           v_work_type.base_score,
        'weight_coefficient',   v_work_type.weight_coefficient,
        'raw_score',            v_raw_score,
        'days_late',            v_task.days_late,
        'deduction_rate',       COALESCE((v_deduction_cfg->>'rate')::NUMERIC, 0),
        'deduction_amount',     v_deduction,
        'final_score',          v_final_score,
        'calculated_at',        NOW()
    );

    -- Cập nhật task
    UPDATE tasks SET
        raw_score       = v_raw_score,
        deduction_score = v_deduction,
        final_score     = v_final_score,
        score_breakdown = v_breakdown
    WHERE id = p_task_id;

    RETURN v_breakdown;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- Function tổng hợp KPI cho user theo kỳ
-- ============================================================
CREATE OR REPLACE FUNCTION fn_aggregate_kpi_summary(
    p_period_id UUID,
    p_user_id   UUID
)
RETURNS VOID AS $$
DECLARE
    v_summary RECORD;
BEGIN
    SELECT
        p_period_id                AS period_id,
        p_user_id                  AS user_id,
        u.organization_id,
        COUNT(t.id)                AS total_tasks,
        COALESCE(SUM(t.raw_score), 0)       AS total_raw_score,
        COALESCE(SUM(t.deduction_score), 0) AS total_deduction,
        COALESCE(SUM(t.final_score), 0)     AS total_final_score
    INTO v_summary
    FROM tasks t
    JOIN users u ON u.id = t.user_id
    WHERE t.period_id = p_period_id
      AND t.user_id   = p_user_id
      AND t.is_deleted = FALSE
      AND t.status NOT IN ('rejected')
    GROUP BY u.organization_id;

    INSERT INTO kpi_summaries (
        period_id, user_id, organization_id,
        total_tasks, total_raw_score, total_deduction, total_final_score,
        last_calculated_at
    )
    VALUES (
        v_summary.period_id, v_summary.user_id, v_summary.organization_id,
        v_summary.total_tasks, v_summary.total_raw_score,
        v_summary.total_deduction, v_summary.total_final_score,
        NOW()
    )
    ON CONFLICT (period_id, user_id) DO UPDATE SET
        organization_id     = EXCLUDED.organization_id,
        total_tasks         = EXCLUDED.total_tasks,
        total_raw_score     = EXCLUDED.total_raw_score,
        total_deduction     = EXCLUDED.total_deduction,
        total_final_score   = EXCLUDED.total_final_score,
        last_calculated_at  = NOW(),
        updated_at          = NOW();
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- PHẦN 10: ROW LEVEL SECURITY (RLS) - Supabase
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Staff chỉ thấy records của chính mình
CREATE POLICY "staff_own_tasks" ON tasks
    FOR ALL TO authenticated
    USING (
        user_id = auth.uid()
        OR
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
            AND role IN ('manager')
        )
        OR
        (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'super_admin')
    );

-- Policy: Users chỉ thấy thông tin của chính mình + cùng đơn vị (manager)
CREATE POLICY "users_visibility" ON users
    FOR SELECT TO authenticated
    USING (
        id = auth.uid()
        OR organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
            AND role IN ('manager', 'admin', 'super_admin')
        )
        OR (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'super_admin')
    );

-- Policy: Notification chỉ thấy của mình
CREATE POLICY "own_notifications" ON notifications
    FOR ALL TO authenticated
    USING (user_id = auth.uid());


-- ============================================================
-- PHẦN 11: DỮ LIỆU SEED MẪU (SEED DATA)
-- ============================================================

-- Đơn vị mẫu
INSERT INTO organizations (id, code, name, short_name, level, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000001', 'MOI_T', 'Bộ Công Thương', 'MoIT', 1, 0),
    ('00000000-0000-0000-0000-000000000002', 'VU_CNTD', 'Vụ Công nghiệp tiêu dùng', 'CNTD', 2, 1),
    ('00000000-0000-0000-0000-000000000003', 'PHONG_TH', 'Phòng Tổng hợp', 'TH', 3, 1)
ON CONFLICT DO NOTHING;

-- Kỳ KPI mẫu (Tháng 4/2026)
INSERT INTO kpi_periods (id, name, period_type, year, month, start_date, end_date, is_active) VALUES
    ('00000000-0000-0000-0000-000000000010', 'Tháng 4/2026', 'month', 2026, 4, '2026-04-01', '2026-04-30', TRUE)
ON CONFLICT DO NOTHING;

-- Nhóm loại công việc mẫu
INSERT INTO work_category_groups (id, name, color_hex, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000020', 'Nhóm A - Công tác chuyên môn', '#1e3a5f', 1),
    ('00000000-0000-0000-0000-000000000021', 'Nhóm B - Công tác hành chính', '#3b82f6', 2),
    ('00000000-0000-0000-0000-000000000022', 'Nhóm C - Công tác đột xuất', '#f59e0b', 3)
ON CONFLICT DO NOTHING;

-- Loại công việc mẫu (Admin có thể sửa/thêm qua UI)
INSERT INTO work_types (code, name, group_id, unit, base_score, weight_coefficient, scoring_formula, deduction_rules, sort_order) VALUES
    (
        'SOAN_THAO_VB',
        'Soạn thảo văn bản, tờ trình, báo cáo',
        '00000000-0000-0000-0000-000000000020',
        'document',
        2.0,
        1.0,
        '{"type": "linear", "formula": "quantity * base_score * weight_coefficient"}'::jsonb,
        '{"enabled": true, "rate": 0.25, "unit": "per_day", "max_deduction_rate": 1.0}'::jsonb,
        1
    ),
    (
        'THAM_GIA_HOP',
        'Tham gia hội họp, hội nghị',
        '00000000-0000-0000-0000-000000000020',
        'session',
        1.0,
        1.0,
        '{"type": "linear", "formula": "quantity * base_score * weight_coefficient"}'::jsonb,
        '{"enabled": false}'::jsonb,
        2
    ),
    (
        'XU_LY_DON_THU',
        'Xử lý đơn thư, phản ánh kiến nghị',
        '00000000-0000-0000-0000-000000000020',
        'case',
        3.0,
        1.2,
        '{"type": "linear", "formula": "quantity * base_score * weight_coefficient"}'::jsonb,
        '{"enabled": true, "rate": 0.25, "unit": "per_day", "max_deduction_rate": 0.75}'::jsonb,
        3
    ),
    (
        'CV_HANH_CHINH',
        'Công việc hành chính, văn thư',
        '00000000-0000-0000-0000-000000000021',
        'task',
        0.5,
        1.0,
        '{"type": "linear", "formula": "quantity * base_score * weight_coefficient"}'::jsonb,
        '{"enabled": false}'::jsonb,
        4
    ),
    (
        'CONG_TAC_DOT_XUAT',
        'Công tác đột xuất theo yêu cầu lãnh đạo',
        '00000000-0000-0000-0000-000000000022',
        'task',
        5.0,
        1.5,
        '{"type": "fixed", "formula": "base_score * weight_coefficient"}'::jsonb,
        '{"enabled": false}'::jsonb,
        5
    )
ON CONFLICT DO NOTHING;

-- Cấu hình xếp loại mặc định
INSERT INTO grading_configs (grade_label, grade_name, min_score, max_score, color_hex, sort_order) VALUES
    ('A', 'Xuất sắc',  90, NULL, '#16a34a', 1),
    ('B', 'Tốt',       70,   90, '#3b82f6', 2),
    ('C', 'Đạt',       50,   70, '#f59e0b', 3),
    ('D', 'Chưa đạt',   0,   50, '#ef4444', 4)
ON CONFLICT DO NOTHING;

-- ============================================================
-- PHẦN 12: VIEWS HỮU ÍCH (USEFUL VIEWS)
-- ============================================================

-- View tổng hợp danh sách task với thông tin đầy đủ
CREATE OR REPLACE VIEW v_task_details AS
SELECT
    t.id,
    t.period_id,
    kp.name                     AS period_name,
    t.user_id,
    u.full_name                 AS user_name,
    u.employee_code,
    org.name                    AS organization_name,
    org.short_name              AS organization_short_name,
    wt.name                     AS work_type_name,
    wcg.name                    AS work_group_name,
    t.task_name,
    t.quantity,
    t.unit_display,
    t.planned_date,
    t.completed_date,
    t.days_late,
    t.raw_score,
    t.deduction_score,
    t.final_score,
    t.status,
    t.is_deleted,
    t.created_at
FROM tasks t
JOIN kpi_periods kp      ON kp.id = t.period_id
JOIN users u             ON u.id = t.user_id
JOIN organizations org   ON org.id = t.organization_id
JOIN work_types wt       ON wt.id = t.work_type_id
LEFT JOIN work_category_groups wcg ON wcg.id = wt.group_id
WHERE t.is_deleted = FALSE;


-- View leaderboard theo đơn vị
CREATE OR REPLACE VIEW v_org_leaderboard AS
SELECT
    ks.period_id,
    kp.name                     AS period_name,
    ks.organization_id,
    org.name                    AS organization_name,
    ks.user_id,
    u.full_name                 AS user_name,
    u.position,
    ks.total_tasks,
    ks.total_final_score,
    ks.grade,
    RANK() OVER (
        PARTITION BY ks.period_id, ks.organization_id
        ORDER BY ks.total_final_score DESC
    )                           AS rank_in_org
FROM kpi_summaries ks
JOIN kpi_periods kp      ON kp.id = ks.period_id
JOIN users u             ON u.id = ks.user_id
JOIN organizations org   ON org.id = ks.organization_id;


-- ============================================================
-- COMMENTS (Tài liệu hóa trực tiếp trong DB)
-- ============================================================
COMMENT ON TABLE organizations    IS 'Cây đơn vị tổ chức: Bộ → Vụ/Cục → Phòng';
COMMENT ON TABLE users            IS 'Người dùng, liên kết với Supabase Auth';
COMMENT ON TABLE kpi_periods      IS 'Kỳ KPI: tháng/quý/năm';
COMMENT ON TABLE work_category_groups IS 'Nhóm loại công việc (Admin cấu hình)';
COMMENT ON TABLE work_types       IS 'Loại công việc động - Admin định nghĩa công thức tính điểm';
COMMENT ON TABLE tasks            IS 'Công việc do cán bộ nhập, có tính điểm tự động';
COMMENT ON TABLE kpi_summaries    IS 'Cache điểm KPI tổng hợp theo user/kỳ cho dashboard';
COMMENT ON TABLE grading_configs  IS 'Ngưỡng xếp loại A/B/C/D theo kỳ/đơn vị';
COMMENT ON TABLE audit_logs       IS 'Lịch sử mọi thao tác trong hệ thống';

COMMENT ON COLUMN work_types.scoring_formula IS 
    'JSON công thức tính điểm. type: linear|fixed|tiered. Ví dụ: {"type":"linear","formula":"quantity*base_score*weight_coefficient"}';
COMMENT ON COLUMN work_types.deduction_rules IS 
    'JSON quy tắc trừ điểm chậm. Ví dụ: {"enabled":true,"rate":0.25,"unit":"per_day","max_deduction_rate":1.0}';
COMMENT ON COLUMN tasks.days_late IS 
    'Số ngày trễ hạn (computed, tự động = completed_date - planned_date nếu > 0)';
COMMENT ON COLUMN tasks.score_breakdown IS 
    'Chi tiết từng bước tính điểm, lưu để audit và hiển thị cho người dùng';
