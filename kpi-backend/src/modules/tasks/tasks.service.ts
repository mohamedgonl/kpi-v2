import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class TasksService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(userId?: string, queryObj: any = {}) {
    const { start_date, end_date, search, page = 1, limit = 20, sortBy = 'deadline', sortDesc = 'false' } = queryObj;

    let query = `SELECT * FROM v_task_details WHERE 1=1`;
    const params: any[] = [];
    
    if (start_date) {
      params.push(start_date);
      query += ` AND deadline >= $${params.length}`;
    }
    
    if (end_date) {
      params.push(end_date);
      query += ` AND deadline <= $${params.length}`;
    }
    
    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (task_name ILIKE $${params.length} 
                 OR product ILIKE $${params.length})`;
    }

    if (queryObj['filters[task_name]']) {
      params.push(`%${queryObj['filters[task_name]']}%`);
      query += ` AND task_name ILIKE $${params.length}`;
    }

    if (queryObj['filters[product]']) {
      params.push(`%${queryObj['filters[product]']}%`);
      query += ` AND product ILIKE $${params.length}`;
    }

    // Count before pagination
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS sub`;
    const countRes = await this.db.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    const validSortFields = ['deadline', 'task_name', 'status', 'assigned_qty', 'actual_qty', 'created_at'];
    const orderField = validSortFields.includes(sortBy) ? sortBy : 'deadline';
    const orderDir = sortDesc === 'true' ? 'DESC' : 'ASC';
    query += ` ORDER BY ${orderField} ${orderDir}`;

    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const res = await this.db.query(query, params);
    return { items: res.rows, total };
  }

  async create(userId: string, createDto: any) {
    const { 
      work_type_id, task_name, note,
      assigned_qty, actual_qty, deadline, completion_date,
      rework_count, status,
      product, lead_by
    } = createDto;

    const res = await this.db.query(
      `INSERT INTO tasks (
        user_id, work_type_id, task_name, note,
        assigned_qty, actual_qty, deadline, completion_date,
        rework_count, status,
        product, lead_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [
        userId, work_type_id, task_name, note,
        assigned_qty || 1, actual_qty || 0, deadline, completion_date,
        rework_count || 0, status || 'pending',
        product, lead_by
      ]
    );
    return { id: res.rows[0].id, message: 'Task created' };
  }

  async update(userId: string, id: string, updateDto: any) {
    const {
      task_name, note, assigned_qty, actual_qty, deadline, completion_date,
      rework_count, status,
      product, lead_by
    } = updateDto;

    await this.db.query(
      `UPDATE tasks 
       SET task_name = COALESCE($1, task_name),
           note = COALESCE($2, note),
           assigned_qty = COALESCE($3, assigned_qty),
           actual_qty = COALESCE($4, actual_qty),
           deadline = COALESCE($5, deadline),
           completion_date = COALESCE($6, completion_date),
           rework_count = COALESCE($7, rework_count),
           status = COALESCE($8, status),
           product = COALESCE($9, product),
           lead_by = COALESCE($10, lead_by),
           updated_at = NOW()
       WHERE id = $11 AND (user_id = $12 OR (SELECT role FROM users WHERE id = $12) IN ('admin', 'vu_truong', 'vu_pho'))`,
      [
        task_name, note, assigned_qty, actual_qty, deadline, completion_date,
        rework_count, status, product, lead_by, id, userId
      ]
    );
    return { id, message: 'Task updated' };
  }

  async delete(userId: string, id: string) {
    await this.db.query(
      `UPDATE tasks SET is_deleted = TRUE 
       WHERE id = $1 AND (user_id = $2 OR (SELECT role FROM users WHERE id = $2) IN ('admin', 'vu_truong', 'vu_pho'))`, 
      [id, userId]
    );
    return { id, message: 'Task deleted' };
  }
}
