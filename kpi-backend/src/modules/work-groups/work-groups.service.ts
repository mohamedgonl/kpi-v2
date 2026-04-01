import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class WorkGroupsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const res = await this.db.query(
      `SELECT id, code, name, short_name, color_hex, sort_order 
       FROM work_groups WHERE is_active = TRUE ORDER BY sort_order ASC`
    );
    return res.rows;
  }

  async create(createDto: any) {
    const { code, name, short_name, color_hex, sort_order } = createDto;
    const res = await this.db.query(
      `INSERT INTO work_groups (code, name, short_name, color_hex, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [code, name, short_name, color_hex, sort_order || 0]
    );
    return { id: res.rows[0].id, name, message: 'Work group created' };
  }

  async update(id: string, updateDto: any) {
    const { code, name, short_name, color_hex, sort_order } = updateDto;
    await this.db.query(
      `UPDATE work_groups 
       SET code = COALESCE($1, code),
           name = COALESCE($2, name),
           short_name = COALESCE($3, short_name),
           color_hex = COALESCE($4, color_hex),
           sort_order = COALESCE($5, sort_order),
           updated_at = NOW()
       WHERE id = $6`,
      [code, name, short_name, color_hex, sort_order, id]
    );
    return { id, message: 'Work group updated' };
  }

  async softDelete(id: string) {
    await this.db.query(`UPDATE work_groups SET is_active = FALSE WHERE id = $1`, [id]);
    return { id, message: 'Work group deleted' };
  }
}
