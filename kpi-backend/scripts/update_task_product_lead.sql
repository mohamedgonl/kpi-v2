-- 1. Add product and lead_by to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS product TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS lead_by UUID REFERENCES users(id);

-- 2. Remove product_type from work_types
ALTER TABLE work_types DROP COLUMN IF EXISTS product_type;

-- 3. Recreate v_task_details with new columns and calculations
DROP VIEW IF EXISTS v_task_details;
CREATE VIEW v_task_details AS
SELECT 
    t.*,
    u.full_name as user_name,
    u.position as user_position,
    wg.id as work_group_id,
    wg.name as work_group_name,
    wt.name as work_type_name,
    wt.coefficient,
    wt.excel_group,
    (SELECT full_name FROM users WHERE id = t.lead_by) as lead_by_name,
    -- Col 7: assigned_qty_conv
    (t.assigned_qty * wt.coefficient) as assigned_qty_conv,
    -- Col 9: actual_qty_conv
    (t.actual_qty * wt.coefficient) as actual_qty_conv,
    -- Col 11: delay_days
    CASE 
        WHEN t.status = 'completed' AND t.completion_date > t.deadline 
        THEN (t.completion_date::date - t.deadline::date)
        ELSE 0 
    END as delay_days,
    -- Col 12: progress_conv (Penalty 25% if delayed)
    CASE 
        WHEN t.status = 'completed' AND t.completion_date > t.deadline 
        THEN GREATEST(0, (t.actual_qty * wt.coefficient) - (t.completion_date::date - t.deadline::date) * 0.25 * t.actual_qty * wt.coefficient)
        ELSE (t.actual_qty * wt.coefficient)
    END as progress_conv,
    -- Col 14: quality_conv (Penalty 25% * rework_count)
    GREATEST(0, (t.actual_qty * wt.coefficient) - (COALESCE(t.rework_count, 0) * 0.25 * t.actual_qty * wt.coefficient)) as quality_conv
FROM tasks t
JOIN users u ON t.user_id = u.id
JOIN work_types wt ON t.work_type_id = wt.id
JOIN work_groups wg ON wt.group_id = wg.id
WHERE t.is_deleted = FALSE;
