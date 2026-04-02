import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class WorkGroupsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(queryObj: any) {
    const { search, page = 1, limit = 100, sortBy = 'sort_order', sortDesc = 'false' } = queryObj || {};
    
    let query = `SELECT id, code, name, short_name as description, color_hex, sort_order 
                 FROM work_groups WHERE is_active = TRUE`;
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR code ILIKE $${params.length} OR short_name ILIKE $${params.length})`;
    }

    if (queryObj['filters[name]']) { params.push(`%${queryObj['filters[name]']}%`); query += ` AND name ILIKE $${params.length}`; }
    if (queryObj['filters[code]']) { params.push(`%${queryObj['filters[code]']}%`); query += ` AND code ILIKE $${params.length}`; }
    if (queryObj['filters[description]']) { params.push(`%${queryObj['filters[description]']}%`); query += ` AND short_name ILIKE $${params.length}`; }

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) AS sub`;
    const countRes = await this.db.query(countQuery, params);
    const total = parseInt(countRes.rows[0].total, 10);

    const validSortFields = ['sort_order', 'name', 'code', 'description'];
    const orderField = validSortFields.includes(sortBy) ? (sortBy === 'description' ? 'short_name' : sortBy) : 'sort_order';
    const orderDir = sortDesc === 'true' ? 'DESC' : 'ASC';

    query += ` ORDER BY ${orderField} ${orderDir}`;
    
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const res = await this.db.query(query, params);
    return { items: res.rows, total };
  }

  async create(createDto: any) {
    const { code, name, description, color_hex, sort_order } = createDto;
    const res = await this.db.query(
      `INSERT INTO work_groups (code, name, short_name, color_hex, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [code, name, description, color_hex, sort_order || 0]
    );
    return { id: res.rows[0].id, name, message: 'Work group created' };
  }

  async update(id: string, updateDto: any) {
    const { code, name, description, color_hex, sort_order } = updateDto;
    await this.db.query(
      `UPDATE work_groups 
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           short_name = COALESCE($3, short_name),
           color_hex = COALESCE($4, color_hex),
           sort_order = COALESCE($5, sort_order),
           updated_at = NOW()
       WHERE id = $6`,
      [code, name, description, color_hex, sort_order, id]
    );
    return { id, message: 'Work group updated' };
  }

  async softDelete(id: string) {
    await this.db.query(`UPDATE work_groups SET is_active = FALSE WHERE id = $1`, [id]);
    return { id, message: 'Work group deleted' };
  }
}
