import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class KpiPeriodsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const res = await this.db.query(
      `SELECT id, name, period_type, year, month, quarter, start_date, end_date, is_active, is_locked 
       FROM kpi_periods ORDER BY start_date DESC`
    );
    return res.rows;
  }

  async create(createDto: any) {
    const { name, period_type, year, month, quarter, start_date, end_date } = createDto;
    const res = await this.db.query(
      `INSERT INTO kpi_periods (name, period_type, year, month, quarter, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, period_type || 'month', year, month, quarter, start_date, end_date]
    );
    return { id: res.rows[0].id, name, message: 'KPI period created' };
  }

  async update(id: string, updateDto: any) {
    const { name, start_date, end_date, is_active, is_locked } = updateDto;
    await this.db.query(
      `UPDATE kpi_periods 
       SET name = COALESCE($1, name),
           start_date = COALESCE($2, start_date),
           end_date = COALESCE($3, end_date),
           is_active = COALESCE($4, is_active),
           is_locked = COALESCE($5, is_locked)
       WHERE id = $6`,
      [name, start_date, end_date, is_active, is_locked, id]
    );

    // If making active, ensure only one active period
    if (is_active) {
      await this.db.query(`UPDATE kpi_periods SET is_active = FALSE WHERE id != $1`, [id]);
    }

    return { id, message: 'KPI period updated' };
  }
}
