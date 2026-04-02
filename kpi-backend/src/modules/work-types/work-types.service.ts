import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class WorkTypesService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(groupId?: string, search?: string) {
    let query = `
      SELECT id, group_id, name, coefficient, excel_group, sort_order 
      FROM work_types 
      WHERE is_active = TRUE
    `;
    const params: any[] = [];
    
    if (groupId) {
      params.push(groupId);
      query += ` AND group_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND name ILIKE $${params.length}`;
    }
    
    query += ` ORDER BY sort_order ASC`;
    
    const res = await this.db.query(query, params);
    return res.rows;
  }

  async create(createDto: any) {
    const { group_id, name, coefficient, excel_group, sort_order } = createDto;
    const res = await this.db.query(
      `INSERT INTO work_types (group_id, name, coefficient, excel_group, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [group_id, name, coefficient || 1.0, excel_group, sort_order || 0]
    );
    return { id: res.rows[0].id, name, message: 'Work type created' };
  }

  async update(id: string, updateDto: any) {
    const { group_id, name, coefficient, excel_group, sort_order } = updateDto;
    await this.db.query(
      `UPDATE work_types 
       SET group_id = COALESCE($1, group_id),
           name = COALESCE($2, name),
           coefficient = COALESCE($3, coefficient),
           excel_group = COALESCE($4, excel_group),
           sort_order = COALESCE($5, sort_order),
           updated_at = NOW()
       WHERE id = $6`,
      [group_id, name, coefficient, excel_group, sort_order, id]
    );
    return { id, message: 'Work type updated' };
  }

  async softDelete(id: string) {
    await this.db.query(`UPDATE work_types SET is_active = FALSE WHERE id = $1`, [id]);
    return { id, message: 'Work type deleted' };
  }
}
