import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class WorkTypesService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(queryObj: any) {
    const { group_id, search, page = 1, limit = 100, sortBy = 'sort_order', sortDesc = 'false' } = queryObj || {};

    let query = `
      SELECT t.id, t.group_id, t.name, t.coefficient, t.excel_group, t.sort_order, g.name as group_name
      FROM work_types t
      LEFT JOIN work_groups g ON t.group_id = g.id
      WHERE t.is_active = TRUE
    `;
    const params: any[] = [];
    
    if (group_id) {
      params.push(group_id);
      query += ` AND t.group_id = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (t.name ILIKE $${params.length} OR g.name ILIKE $${params.length})`;
    }

    if (queryObj['filters[name]']) { params.push(`%${queryObj['filters[name]']}%`); query += ` AND t.name ILIKE $${params.length}`; }
    if (queryObj['filters[coefficient]']) { params.push(queryObj['filters[coefficient]']); query += ` AND t.coefficient = $${params.length}`; }
    if (queryObj['filters[group_id]']) { params.push(queryObj['filters[group_id]']); query += ` AND t.group_id = $${params.length}`; }

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS sub`;
    const countRes = await this.db.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    const validSortFields = ['sort_order', 'name', 'coefficient', 'group_name'];
    const orderField = validSortFields.includes(sortBy) ? (sortBy === 'group_name' ? 'g.name' : `t.${sortBy}`) : 't.sort_order';
    const orderDir = sortDesc === 'true' ? 'DESC' : 'ASC';

    query += ` ORDER BY ${orderField} ${orderDir}`;

    const offset = (page - 1) * limit;
    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
    
    const res = await this.db.query(query, params);
    return { items: res.rows, total };
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
