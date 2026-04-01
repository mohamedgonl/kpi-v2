import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class WorkTypesService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(groupId?: string) {
    let query = `
      SELECT id, group_id, name, product_type, coefficient, excel_group, sort_order 
      FROM work_types 
      WHERE is_active = TRUE
    `;
    const params: any[] = [];
    
    if (groupId) {
      query += ` AND group_id = $1`;
      params.push(groupId);
    }
    
    query += ` ORDER BY sort_order ASC`;
    
    const res = await this.db.query(query, params);
    return res.rows;
  }

  async create(createDto: any) {
    const { group_id, name, product_type, coefficient, excel_group, sort_order } = createDto;
    const res = await this.db.query(
      `INSERT INTO work_types (group_id, name, product_type, coefficient, excel_group, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [group_id, name, product_type, coefficient || 1.0, excel_group, sort_order || 0]
    );
    return { id: res.rows[0].id, name, message: 'Work type created' };
  }

  async update(id: string, updateDto: any) {
    const { group_id, name, product_type, coefficient, excel_group, sort_order } = updateDto;
    await this.db.query(
      `UPDATE work_types 
       SET group_id = COALESCE($1, group_id),
           name = COALESCE($2, name),
           product_type = COALESCE($3, product_type),
           coefficient = COALESCE($4, coefficient),
           excel_group = COALESCE($5, excel_group),
           sort_order = COALESCE($6, sort_order),
           updated_at = NOW()
       WHERE id = $7`,
      [group_id, name, product_type, coefficient, excel_group, sort_order, id]
    );
    return { id, message: 'Work type updated' };
  }

  async softDelete(id: string) {
    await this.db.query(`UPDATE work_types SET is_active = FALSE WHERE id = $1`, [id]);
    return { id, message: 'Work type deleted' };
  }
}
