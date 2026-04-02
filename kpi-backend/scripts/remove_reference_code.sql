-- 1. Remove reference_code from tasks
ALTER TABLE tasks DROP COLUMN IF EXISTS reference_code;

-- 2. Update v_task_details view (must re-run because it selects t.*)
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
    (t.assigned_qty * wt.coefficient) as assigned_qty_conv,
    (t.actual_qty * wt.coefficient) as actual_qty_conv,
    CASE 
        WHEN t.status = 'completed' AND t.completion_date > t.deadline 
        THEN (t.completion_date::date - t.deadline::date)
        ELSE 0 
    END as delay_days,
    CASE 
        WHEN t.status = 'completed' AND t.completion_date > t.deadline 
        THEN GREATEST(0, (t.actual_qty * wt.coefficient) - (t.completion_date::date - t.deadline::date) * 0.25 * t.actual_qty * wt.coefficient)
        ELSE (t.actual_qty * wt.coefficient)
    END as progress_conv,
    GREATEST(0, (t.actual_qty * wt.coefficient) - (COALESCE(t.rework_count, 0) * 0.25 * t.actual_qty * wt.coefficient)) as quality_conv
FROM tasks t
JOIN users u ON t.user_id = u.id
JOIN work_types wt ON t.work_type_id = wt.id
JOIN work_groups wg ON wt.group_id = wg.id
WHERE t.is_deleted = FALSE;
