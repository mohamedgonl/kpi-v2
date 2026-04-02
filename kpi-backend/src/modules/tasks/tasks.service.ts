import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class TasksService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(userId?: string, startDate?: string, endDate?: string, search?: string) {
    let query = `SELECT * FROM v_task_details WHERE 1=1`;
    const params: any[] = [];
    
    if (startDate) {
      params.push(startDate);
      query += ` AND deadline >= $${params.length}`;
    }
    
    if (endDate) {
      params.push(endDate);
      query += ` AND deadline <= $${params.length}`;
    }
    
    if (userId) {
      params.push(userId);
      query += ` AND user_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (task_name ILIKE $${params.length} 
                 OR product ILIKE $${params.length} 
                 OR note ILIKE $${params.length} 
                 OR lead_by_name ILIKE $${params.length})`;
    }
    
    query += ` ORDER BY created_at DESC`;
    const res = await this.db.query(query, params);
    return res.rows;
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
