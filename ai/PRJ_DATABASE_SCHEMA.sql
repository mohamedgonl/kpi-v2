-- ============================================================
-- HỆ THỐNG TÍNH ĐIỂM KPI - CẤP VỤ
-- Database Schema: PostgreSQL (Supabase)
-- Version: 2.0.0
-- Date: 2026-04-01
-- ============================================================
-- Ghi chú thiết kế:
-- 1. Chỉ 1 đơn vị (cấp Vụ) - trong suốt với người dùng
-- 2. 4 role: admin (toàn quyền hệ thống), vu_truong (vụ trưởng), vu_pho (vụ phó), chuyen_vien
-- 3. KPI KHÔNG lưu vào DB - tính on-the-fly khi xem dashboard/báo cáo
-- 4. Cấu trúc công việc: Nhóm → Loại → Task (3 cấp, tham chiếu workGroups.js)
-- 5. Công thức KPI: KPI = (a + b + c) / 3
--    a = Σ(coeff × actualQty) / Σ(coeff × assignedQty) × 100  (số lượng)
--    b = Σ(coeff × actualQty - rework×0.25×coeff×actualQty) / Σ(coeff × assignedQty) × 100 (chất lượng)
--    c = Σ(coeff × actualQty - delay×0.25×coeff×actualQty) / Σ(coeff × assignedQty) × 100 (tiến độ)
-- 6. Không dùng stored procedure, hạn chế policy/constraint ở DB
-- 7. Password reset: quên mật khẩu gửi mail, admin reset về '123456'
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PHẦN 1: NGƯỜI DÙNG & PHÂN QUYỀN
-- ============================================================

-- 4 role cố định tương ứng với cơ cấu 1 đơn vị cấp Vụ + Admin hệ thống
CREATE TYPE user_role AS ENUM ('admin', 'vu_truong', 'vu_pho', 'chuyen_vien');

-- Bảng người dùng
-- Lưu ý: password_hash lưu mật khẩu đã hash (bcrypt), 
--        admin có thể reset về '123456' qua API
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_code       VARCHAR(50) UNIQUE,                -- Mã cán bộ (tùy chọn)
    full_name           VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL UNIQUE,
    phone               VARCHAR(20),
    position            VARCHAR(255),                      -- Chức danh (ví dụ: Chuyên viên chính)
    role                user_role NOT NULL DEFAULT 'chuyen_vien',
    password_hash       TEXT NOT NULL,                     -- bcrypt hash, mặc định hash('123456')
    avatar_url          TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID REFERENCES users(id)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active) WHERE is_active = TRUE;

-- Bảng token đặt lại mật khẩu (quên mật khẩu)
-- Token hết hạn sau 1 giờ, code xử lý validate
CREATE TABLE password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(128) NOT NULL UNIQUE,               -- Secure random token
    expires_at  TIMESTAMPTZ NOT NULL,                       -- Thường NOW() + 1 hour
    used_at     TIMESTAMPTZ,                                -- NULL = chưa dùng
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- ============================================================
-- PHẦN 2: CẤU HÌNH NHÓM & LOẠI CÔNG VIỆC (3 cấp phân cấp)
-- ============================================================
-- Cấu trúc tham chiếu từ workGroups.js:
--   work_groups (Nhóm I..VI) → work_types (loại công việc con, ví dụ 1.1.1, 1.1.2...)
-- Admin có thể chỉnh sửa qua UI, không fix cứng trong code backend

-- Nhóm công việc (Nhóm I → Nhóm VI trong workGroups.js)
CREATE TABLE work_groups (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(20) NOT NULL UNIQUE,               -- Ví dụ: 'I', 'II', 'III'
    name        VARCHAR(500) NOT NULL,                     -- Tên đầy đủ nhóm
    short_name  VARCHAR(100),                              -- Ví dụ: 'Nhóm I'
    color_hex   VARCHAR(7) DEFAULT '#6366f1',
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID REFERENCES users(id)
);

-- Loại công việc (các item cụ thể trong từng nhóm, ví dụ 1.1.1, 2.1.1...)
-- coefficient (hệ số quy đổi) là trường then chốt cho công thức KPI
CREATE TABLE work_types (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id        UUID NOT NULL REFERENCES work_groups(id) ON DELETE RESTRICT,
    name            VARCHAR(1000) NOT NULL,                -- Tên công việc
    product_type    VARCHAR(500),                          -- Loại sản phẩm/đầu ra
    coefficient     NUMERIC(8,4) NOT NULL DEFAULT 1.0,     -- Hệ số quy đổi (col7 = coeff × assignedQty)
    excel_group     SMALLINT,                              -- Nhóm excel (1-5) để phân loại
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id)
);

CREATE INDEX idx_work_types_group_id ON work_types(group_id);
CREATE INDEX idx_work_types_is_active ON work_types(is_active) WHERE is_active = TRUE;

-- ============================================================
-- PHẦN 3: KỲ KPI
-- ============================================================

CREATE TABLE kpi_periods (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL,                 -- Ví dụ: 'Tháng 4/2026', 'Quý II/2026'
    period_type     VARCHAR(10) NOT NULL DEFAULT 'month',  -- 'month' | 'quarter' | 'year'
    year            SMALLINT NOT NULL,
    month           SMALLINT,                              -- NULL nếu quý/năm (1-12)
    quarter         SMALLINT,                              -- NULL nếu tháng/năm (1-4)
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,        -- Kỳ hiện tại đang nhập liệu
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE,        -- Khoá = không cho chỉnh sửa nữa
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID REFERENCES users(id),
    CONSTRAINT uq_kpi_period UNIQUE (period_type, year, month, quarter)
);

-- ============================================================
-- PHẦN 4: CÔNG VIỆC (TASKS) - DỮ LIỆU GỐC ĐỂ TÍNH KPI
-- ============================================================
-- Đây là bảng chứa tất cả dữ liệu thô.
-- KPI được tính trực tiếp từ bảng này khi cần (không cache).
--
-- Công thức tính cột (tham chiếu computeTaskColumns trong store.js):
--   col7 (assignedQtyConverted) = coefficient × assigned_qty
--   col9 (actualQtyConverted)   = coefficient × actual_qty
--   col11 (delayDays)           = MAX(0, CEIL((completion_date - deadline) in days))
--   col12 (progressQtyConverted)= MAX(0, col9 - delay_days × 0.25 × col9)
--   col14 (qualityQtyConverted) = MAX(0, col9 - rework_count × 0.25 × col9)
--
-- KPI cuối:
--   a (số lượng%) = Σcol9 / Σcol7 × 100
--   b (chất lượng%) = Σcol14 / Σcol7 × 100
--   c (tiến độ%) = Σcol12 / Σcol7 × 100
--   KPI = (a + b + c) / 3

CREATE TYPE task_status AS ENUM ('pending', 'completed', 'rejected');

CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id       UUID NOT NULL REFERENCES kpi_periods(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    work_type_id    UUID NOT NULL REFERENCES work_types(id),

    -- === THÔNG TIN CÔNG VIỆC ===
    task_name       VARCHAR(500) NOT NULL,                 -- Tên/mô tả công việc
    note            TEXT,                                  -- Ghi chú thêm

    -- === SỐ LƯỢNG ===
    assigned_qty    NUMERIC(10,2) NOT NULL DEFAULT 1,      -- Số lượng được giao (cột 6)
    actual_qty      NUMERIC(10,2) NOT NULL DEFAULT 0,      -- Số lượng thực hiện (cột 8)

    -- === MỐC THỜI GIAN ===
    deadline        DATE,                                  -- Hạn hoàn thành (cột 10)
    completion_date DATE,                                  -- Ngày hoàn thành thực tế (cột 11)

    -- === CHẤT LƯỢNG & TIẾN ĐỘ ===
    -- rework_count: số lần làm lại → ảnh hưởng col14 (quality)
    -- delay_days: số ngày trễ → ảnh hưởng col12 (progress), tự tính từ completion_date vs deadline ở code
    rework_count    SMALLINT NOT NULL DEFAULT 0,           -- Số lần làm lại (cột 13)

    -- === TRẠNG THÁI & LUỒNG DUYỆT ===
    status          task_status NOT NULL DEFAULT 'pending',
    rejected_reason TEXT,
    reviewed_by     UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,

    -- === PHÂN CÔNG (nếu vu_truong/vu_pho giao việc) ===
    assigned_by     UUID REFERENCES users(id),             -- NULL = tự nhập

    -- === MINH CHỨNG ===
    evidence_urls   TEXT[],                                -- Mảng URL file đính kèm
    reference_code  VARCHAR(100),                          -- Số văn bản tham chiếu

    -- === SOFT DELETE ===
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES users(id),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_period_id ON tasks(period_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_work_type_id ON tasks(work_type_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_period_user ON tasks(period_id, user_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_tasks_is_deleted ON tasks(is_deleted) WHERE is_deleted = FALSE;

-- ============================================================
-- PHẦN 5: CẤU HÌNH XẾP LOẠI (GRADING CONFIG)
-- ============================================================
-- Admin cấu hình ngưỡng xếp loại, áp dụng khi xuất báo cáo

CREATE TABLE grading_configs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    period_id   UUID REFERENCES kpi_periods(id),           -- NULL = áp dụng chung cho tất cả kỳ
    grade_label VARCHAR(10) NOT NULL,                      -- 'A', 'B', 'C', 'D'
    grade_name  VARCHAR(100),                              -- 'Xuất sắc', 'Tốt', 'Đạt', 'Chưa đạt'
    min_score   NUMERIC(5,2) NOT NULL,                     -- % tối thiểu
    max_score   NUMERIC(5,2),                              -- % tối đa (NULL = không giới hạn trên)
    color_hex   VARCHAR(7),
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by  UUID REFERENCES users(id)
);

-- ============================================================
-- PHẦN 6: THÔNG BÁO HỆ THỐNG
-- ============================================================

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    body            TEXT,
    type            VARCHAR(20) NOT NULL DEFAULT 'info',   -- 'info' | 'warning' | 'success' | 'error'
    related_entity  VARCHAR(50),                           -- 'task' | 'period' | ...
    related_id      UUID,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- ============================================================
-- PHẦN 7: AUDIT LOG
-- ============================================================

CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID REFERENCES users(id),
    action      VARCHAR(50) NOT NULL,                      -- 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'RESET_PASSWORD'
    entity_type VARCHAR(100) NOT NULL,                     -- Tên bảng: 'tasks', 'users', ...
    entity_id   UUID,
    old_values  JSONB,
    new_values  JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================
-- PHẦN 8: TRIGGER CẬP NHẬT updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_work_groups_updated_at
    BEFORE UPDATE ON work_groups
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_work_types_updated_at
    BEFORE UPDATE ON work_types
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- PHẦN 9: VIEWS HỮU ÍCH (không lưu KPI - chỉ join dữ liệu gốc)
-- ============================================================

-- View danh sách task đầy đủ thông tin để tính KPI ở application layer
-- Application dùng view này để lấy data, sau đó tự tính KPI theo công thức
CREATE OR REPLACE VIEW v_task_details AS
SELECT
    t.id,
    t.period_id,
    kp.name                         AS period_name,
    kp.period_type,
    kp.year,
    kp.month,
    kp.quarter,
    t.user_id,
    u.full_name                     AS user_name,
    u.employee_code,
    u.role                          AS user_role,
    u.position,
    wg.id                           AS work_group_id,
    wg.code                         AS work_group_code,
    wg.name                         AS work_group_name,
    wg.short_name                   AS work_group_short_name,
    wg.color_hex                    AS work_group_color,
    wt.id                           AS work_type_id,
    wt.name                         AS work_type_name,
    wt.product_type,
    wt.coefficient,
    wt.excel_group,
    t.task_name,
    t.note,
    -- Số lượng gốc
    t.assigned_qty,
    t.actual_qty,
    -- Số lượng quy đổi (col7, col9) - tính sẵn để tiện query
    ROUND((wt.coefficient * t.assigned_qty)::NUMERIC, 1) AS assigned_qty_converted,  -- col7
    ROUND((wt.coefficient * t.actual_qty)::NUMERIC, 1)   AS actual_qty_converted,    -- col9
    -- Ngày
    t.deadline,
    t.completion_date,
    -- delay_days (col11): tính từ completion_date và deadline
    CASE
        WHEN t.completion_date IS NOT NULL AND t.deadline IS NOT NULL
             AND t.completion_date > t.deadline
        THEN EXTRACT(DAY FROM (t.completion_date::TIMESTAMP - t.deadline::TIMESTAMP))::INT
        ELSE 0
    END                             AS delay_days,
    t.rework_count,
    -- Chất lượng & tiến độ (col12, col14)
    -- col12 (progress_qty_converted) = MAX(0, col9 - delay_days * 0.25 * col9)
    -- col14 (quality_qty_converted)  = MAX(0, col9 - rework_count * 0.25 * col9)
    GREATEST(0,
        ROUND((wt.coefficient * t.actual_qty)::NUMERIC, 1)
        - CASE
            WHEN t.completion_date IS NOT NULL AND t.deadline IS NOT NULL
                 AND t.completion_date > t.deadline
            THEN EXTRACT(DAY FROM (t.completion_date::TIMESTAMP - t.deadline::TIMESTAMP)) * 0.25
                 * ROUND((wt.coefficient * t.actual_qty)::NUMERIC, 1)
            ELSE 0
          END
    )                               AS progress_qty_converted,                         -- col12
    GREATEST(0,
        ROUND((wt.coefficient * t.actual_qty)::NUMERIC, 1)
        - t.rework_count * 0.25 * ROUND((wt.coefficient * t.actual_qty)::NUMERIC, 1)
    )                               AS quality_qty_converted,                          -- col14
    t.status,
    t.rejected_reason,
    t.reviewed_by,
    t.reviewed_at,
    t.assigned_by,
    t.evidence_urls,
    t.reference_code,
    t.is_deleted,
    t.created_at,
    t.updated_at
FROM tasks t
JOIN kpi_periods kp ON kp.id = t.period_id
JOIN users u        ON u.id = t.user_id
JOIN work_types wt  ON wt.id = t.work_type_id
JOIN work_groups wg ON wg.id = wt.group_id
WHERE t.is_deleted = FALSE;

COMMENT ON VIEW v_task_details IS
'View đầy đủ thông tin task gồm các cột quy đổi (col7, col9, col12, col14).
Application tự tính KPI = (a+b+c)/3 theo công thức:
  a = Σcol9 / Σcol7 * 100
  b = Σcol14 / Σcol7 * 100
  c = Σcol12 / Σcol7 * 100';


-- View tổng hợp nhanh theo user/kỳ (cột tổng để tính KPI)
-- Dùng cho dashboard và báo cáo - application nhận data này rồi tính KPI
CREATE OR REPLACE VIEW v_kpi_raw_totals AS
SELECT
    t.period_id,
    kp.name                         AS period_name,
    kp.year,
    kp.month,
    kp.quarter,
    kp.period_type,
    t.user_id,
    u.full_name                     AS user_name,
    u.role                          AS user_role,
    u.position,
    COUNT(t.id)                     AS total_tasks,
    COUNT(t.id) FILTER (WHERE t.status = 'completed')   AS completed_tasks,
    COUNT(t.id) FILTER (WHERE t.status = 'pending')     AS pending_tasks,
    -- Tổng các cột quy đổi (Σcol7, Σcol9, Σcol12, Σcol14)
    ROUND(SUM(wt.coefficient * t.assigned_qty)::NUMERIC, 1)   AS total_col7,
    ROUND(SUM(wt.coefficient * t.actual_qty)::NUMERIC, 1)     AS total_col9,
    -- Σcol12: Σ MAX(0, col9 - delay*0.25*col9)
    ROUND(SUM(
        GREATEST(0,
            wt.coefficient * t.actual_qty
            - CASE
                WHEN t.completion_date IS NOT NULL AND t.deadline IS NOT NULL
                     AND t.completion_date > t.deadline
                THEN EXTRACT(DAY FROM (t.completion_date::TIMESTAMP - t.deadline::TIMESTAMP))
                     * 0.25 * wt.coefficient * t.actual_qty
                ELSE 0
              END
        )
    )::NUMERIC, 1)                  AS total_col12,
    -- Σcol14: Σ MAX(0, col9 - rework*0.25*col9)
    ROUND(SUM(
        GREATEST(0,
            wt.coefficient * t.actual_qty
            - t.rework_count * 0.25 * wt.coefficient * t.actual_qty
        )
    )::NUMERIC, 1)                  AS total_col14
FROM tasks t
JOIN kpi_periods kp ON kp.id = t.period_id
JOIN users u        ON u.id = t.user_id
JOIN work_types wt  ON wt.id = t.work_type_id
WHERE t.is_deleted = FALSE
  AND t.status != 'rejected'
GROUP BY t.period_id, kp.name, kp.year, kp.month, kp.quarter, kp.period_type,
         t.user_id, u.full_name, u.role, u.position;

COMMENT ON VIEW v_kpi_raw_totals IS
'Tổng hợp các cột quy đổi (col7, col9, col12, col14) theo user/kỳ.
Application tính KPI:
  a% = total_col9 / total_col7 * 100
  b% = total_col14 / total_col7 * 100
  c% = total_col12 / total_col7 * 100
  KPI = (a + b + c) / 3';


-- ============================================================
-- PHẦN 10: DỮ LIỆU MẪU (SEED DATA)
-- ============================================================

-- Kỳ KPI mẫu
INSERT INTO kpi_periods (id, name, period_type, year, month, start_date, end_date, is_active) VALUES
    ('00000000-0000-0000-0000-000000000010', 'Tháng 4/2026', 'month', 2026, 4, '2026-04-01', '2026-04-30', TRUE)
ON CONFLICT DO NOTHING;

-- Nhóm công việc (6 nhóm theo workGroups.js)
INSERT INTO work_groups (id, code, name, short_name, color_hex, sort_order) VALUES
    ('00000000-0000-0000-0000-000000000001', 'I',   'Xây dựng thể chế, chính sách, pháp luật, điều ước quốc tế', 'Nhóm I',   '#6366f1', 1),
    ('00000000-0000-0000-0000-000000000002', 'II',  'Hướng dẫn và triển khai thực hiện các văn bản (trừ VBQPPL, ĐUQT, TTQT)', 'Nhóm II',  '#8b5cf6', 2),
    ('00000000-0000-0000-0000-000000000003', 'III', 'Kiểm tra, sơ kết, tổng kết việc thực hiện các văn bản', 'Nhóm III', '#ec4899', 3),
    ('00000000-0000-0000-0000-000000000004', 'IV',  'Thẩm định văn bản', 'Nhóm IV',  '#f59e0b', 4),
    ('00000000-0000-0000-0000-000000000005', 'V',   'Thực hiện các nhiệm vụ chuyên môn, nghiệp vụ', 'Nhóm V',   '#10b981', 5),
    ('00000000-0000-0000-0000-000000000006', 'VI',  'Nhóm hỗ trợ, phục vụ, khác', 'Nhóm VI',  '#06b6d4', 6)
ON CONFLICT DO NOTHING;

-- Loại công việc (các item theo workGroups.js, coefficient = hệ số quy đổi)
INSERT INTO work_types (name, product_type, group_id, coefficient, excel_group, sort_order) VALUES
    -- Nhóm I
    ('Xây dựng chính sách, chiến lược, Đề án, quan điểm, định hướng, Luật, Điều ước quốc tế (cấp QH, Nhà nước)',
     'Quyết định, Luật, Điều ước quốc tế, Định hướng, Chiến lược, Đề án',
     '00000000-0000-0000-0000-000000000001', 95, 5, 1),
    ('Xây dựng Nghị định, QĐ của TTg, Thông tư, Điều ước quốc tế (cấp Chính phủ)',
     'Nghị định, QĐ của TTg, Thông tư, Điều ước quốc tế',
     '00000000-0000-0000-0000-000000000001', 76, 4, 2),
    ('Xây dựng các Chương trình, Kế hoạch của Bộ/trình cấp có thẩm quyền',
     'Quyết định, Tờ trình cấp có thẩm quyền, Văn bản gửi Bộ Tư pháp',
     '00000000-0000-0000-0000-000000000001', 76, 4, 3),
    ('Tham gia ý kiến đối với các chiến lược, Đề án, định hướng, kế hoạch, chương trình, VBQPPL, ĐUQT, thỏa thuận quốc tế',
     'Văn bản tham gia ý kiến',
     '00000000-0000-0000-0000-000000000001', 57, 3, 4),
    -- Nhóm II
    ('Triển khai thực hiện các văn bản',
     'Quyết định, Văn bản tham gia ý kiến, Ý kiến tại cuộc họp, Dữ liệu điện tử',
     '00000000-0000-0000-0000-000000000002', 38, 2, 5),
    ('Theo dõi, đôn đốc tiến độ các chương trình, kế hoạch (đối với người đầu mối chủ trì)',
     'Báo cáo tiến độ/ Công văn đôn đốc',
     '00000000-0000-0000-0000-000000000002', 38, 2, 6),
    -- Nhóm III
    ('Kiểm tra, sơ kết, tổng kết',
     'Kết luận kiểm tra, Báo cáo sơ kết, Báo cáo tổng kết, báo cáo khác',
     '00000000-0000-0000-0000-000000000003', 38, 2, 7),
    ('Điều tra, khảo sát, tổ chức Hội nghị, hội thảo',
     'Phiếu điều tra, khảo sát, Hội nghị, Hội thảo',
     '00000000-0000-0000-0000-000000000003', 38, 2, 8),
    -- Nhóm IV
    ('Thẩm định văn bản QPPL do BCT ban hành',
     'Báo cáo thẩm định',
     '00000000-0000-0000-0000-000000000004', 76, 4, 9),
    ('Tham gia thẩm định',
     'Văn bản có ý kiến thẩm định, Ý kiến tại cuộc họp',
     '00000000-0000-0000-0000-000000000004', 57, 3, 10),
    -- Nhóm V
    ('Kiểm tra, rà soát, hệ thống hóa, theo dõi thi hành pháp luật...',
     'Kết quả kiểm tra, rà soát, Kết luận TĐTHPL, Hội nghị Phổ biến...',
     '00000000-0000-0000-0000-000000000005', 38, 2, 11),
    ('Trường hợp phát sinh tình huống phức tạp trong quá trình thực hiện các nhiệm vụ chuyên môn, nghiệp vụ',
     'Văn bản',
     '00000000-0000-0000-0000-000000000005', 57, 3, 12),
    ('Giải quyết tranh chấp thương mại, đầu tư quốc tế',
     'Văn bản ý kiến, Tờ trình',
     '00000000-0000-0000-0000-000000000005', 57, 3, 13),
    -- Nhóm VI
    ('Công tác văn thư',                'Lần',                         '00000000-0000-0000-0000-000000000006', 1, 1, 14),
    ('Công tác quản trị (thiết bị,...)', 'Lần, Văn bản đề nghị',        '00000000-0000-0000-0000-000000000006', 1, 1, 15),
    ('Phát hành văn bản',                'Lần',                         '00000000-0000-0000-0000-000000000006', 1, 1, 16),
    ('Lưu trữ hồ sơ, tài liệu',          'Lần',                         '00000000-0000-0000-0000-000000000006', 1, 1, 17),
    ('Công tác hậu cần',                  'Cuộc họp',                    '00000000-0000-0000-0000-000000000006', 1, 1, 18),
    ('Đăng hồ sơ dự án Luật trên Cổng pháp luật Quốc gia/CSDL quốc gia', 'Hồ sơ trên website', '00000000-0000-0000-0000-000000000006', 1, 1, 19),
    ('Cập nhật tiến độ/hồ sơ chính sách/dự thảo VBQPPL trên Hệ thống thông tin quản lý Chương trình xây dựng VBQPPL',
     'Email, Tin nhắn',
     '00000000-0000-0000-0000-000000000006', 1, 1, 20),
    ('Soạn thảo văn bản hành chính thông thường', 'Văn bản',            '00000000-0000-0000-0000-000000000006', 1, 1, 21);

-- Cấu hình xếp loại mặc định (áp dụng chung - period_id = NULL)
INSERT INTO grading_configs (grade_label, grade_name, min_score, max_score, color_hex, sort_order) VALUES
    ('A', 'Xuất sắc',  90,   NULL, '#16a34a', 1),
    ('B', 'Tốt',       70,     90, '#3b82f6', 2),
    ('C', 'Đạt',       50,     70, '#f59e0b', 3),
    ('D', 'Chưa đạt',   0,     50, '#ef4444', 4)
ON CONFLICT DO NOTHING;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE users                  IS 'Người dùng trong hệ thống. 4 role: admin (toàn quyền), vu_truong, vu_pho, chuyen_vien.';
COMMENT ON TABLE password_reset_tokens  IS 'Token đặt lại mật khẩu qua email. Hết hạn sau 1 giờ, validate ở application layer.';
COMMENT ON TABLE work_groups            IS 'Nhóm công việc cấp 1 (Nhóm I-VI). Admin quản lý qua UI.';
COMMENT ON TABLE work_types             IS 'Loại công việc cụ thể. Có hệ số quy đổi (coefficient) để tính KPI.';
COMMENT ON TABLE kpi_periods            IS 'Kỳ KPI: tháng/quý/năm. is_locked = không cho nhập liệu.';
COMMENT ON TABLE tasks                  IS 'Công việc do cán bộ nhập. KPI KHÔNG lưu ở đây - tính on-the-fly từ assigned_qty, actual_qty, rework_count, deadline, completion_date và coefficient của work_type.';
COMMENT ON TABLE grading_configs        IS 'Ngưỡng xếp loại A/B/C/D. Áp dụng khi xuất báo cáo.';
COMMENT ON TABLE notifications          IS 'Thông báo trong hệ thống.';
COMMENT ON TABLE audit_logs             IS 'Lịch sử thao tác. Ghi từ application layer.';

COMMENT ON COLUMN users.password_hash   IS 'bcrypt hash của mật khẩu. Mật khẩu mặc định: 123456. Admin có thể reset về 123456 qua tính năng quản lý user.';
COMMENT ON COLUMN work_types.coefficient IS 'Hệ số quy đổi. col7 = coefficient × assigned_qty, col9 = coefficient × actual_qty.';
COMMENT ON COLUMN tasks.rework_count    IS 'Số lần làm lại. Ảnh hưởng chất lượng: col14 = MAX(0, col9 - rework_count × 0.25 × col9).';
COMMENT ON COLUMN tasks.deadline        IS 'Hạn hoàn thành. delay_days = MAX(0, completion_date - deadline). Ảnh hưởng tiến độ: col12 = MAX(0, col9 - delay_days × 0.25 × col9).';
