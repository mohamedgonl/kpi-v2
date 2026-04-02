-- Remove KPI Periods and update related tables
-- CAUTION: Run this script to permanently delete KPI periods data

-- 1. Drop views that depend on period_id
DROP VIEW IF EXISTS v_kpi_raw_totals CASCADE;
DROP VIEW IF EXISTS v_task_details CASCADE;

-- 2. Drop the kpi_periods table
DROP TABLE IF EXISTS kpi_periods CASCADE;

-- 3. Remove period_id column from tasks table
ALTER TABLE tasks DROP COLUMN IF EXISTS period_id;

-- 4. Re-create v_task_details view without period_id
CREATE VIEW v_task_details AS
SELECT 
    t.*,
    u.full_name as user_name,
    wg.name as work_group_name,
    wt.name as work_type_name,
    wt.coefficient,
    wt.group_id as work_group_id
FROM tasks t
JOIN users u ON t.user_id = u.id
JOIN work_types wt ON t.work_type_id = wt.id
JOIN work_groups wg ON wt.group_id = wg.id
WHERE t.is_deleted = FALSE;

-- 5. Re-create v_kpi_raw_totals view grouped by user (and maybe month/year)
-- This view should be adjusted based on how you want to aggregate scores now.
-- For now, let's just group by user_id to get global totals.
CREATE VIEW v_kpi_raw_totals AS
SELECT 
    t.user_id,
    u.full_name,
    u.position,
    SUM(t.assigned_qty * wt.coefficient) as total_col7,
    SUM(t.actual_qty * wt.coefficient) as total_col9,
    SUM(CASE WHEN t.status = 'completed' AND t.completion_date <= t.deadline THEN t.assigned_qty * wt.coefficient ELSE 0 END) as total_col12,
    SUM(CASE WHEN t.status = 'completed' THEN t.actual_qty * wt.coefficient ELSE 0 END) as total_col14
FROM tasks t
JOIN users u ON t.user_id = u.id
JOIN work_types wt ON t.work_type_id = wt.id
WHERE t.is_deleted = FALSE
GROUP BY t.user_id, u.full_name, u.position;
