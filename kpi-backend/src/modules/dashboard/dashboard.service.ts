import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

  async getPersonalDashboard(userId: string, startDate?: string, endDate?: string) {
    const params: any[] = [userId, startDate || null, endDate || null];
    const query = `
      SELECT 
        u.id as user_id,
        u.full_name,
        u.position,
        COALESCE(SUM(t.assigned_qty * wt.coefficient), 0) as total_col7,
        COALESCE(SUM(t.actual_qty * wt.coefficient), 0) as total_col9,
        COALESCE(SUM(GREATEST(0, (t.actual_qty * wt.coefficient) - 
          (CASE WHEN t.status = 'completed' AND t.completion_date > t.deadline 
                THEN (t.completion_date::date - t.deadline::date) * 0.25 * t.actual_qty * wt.coefficient 
                ELSE 0 END))), 0) as total_col12,
        COALESCE(SUM(GREATEST(0, (t.actual_qty * wt.coefficient) - 
          (COALESCE(t.rework_count, 0) * 0.25 * t.actual_qty * wt.coefficient))), 0) as total_col14
      FROM users u
      LEFT JOIN tasks t ON u.id = t.user_id AND t.is_deleted = FALSE
        AND ($2::date IS NULL OR t.deadline >= $2::date)
        AND ($3::date IS NULL OR t.deadline <= $3::date)
      LEFT JOIN work_types wt ON t.work_type_id = wt.id
      WHERE u.id = $1
      GROUP BY u.id, u.full_name, u.position
    `;
    
    const res = await this.db.query(query, params);
    return res.rows.map(row => this.calculateKPIFromRawData(row));
  }

  async getSummaryDashboard(queryObj: any) {
    const { start_date, end_date, search, page = 1, limit = 100, sortBy, sortDesc } = queryObj || {};
    const params: any[] = [start_date || null, end_date || null];
    let query = `
      SELECT 
        u.id as user_id,
        u.full_name,
        u.position,
        COALESCE(SUM(t.assigned_qty * wt.coefficient), 0) as total_col7,
        COALESCE(SUM(t.actual_qty * wt.coefficient), 0) as total_col9,
        COALESCE(SUM(GREATEST(0, (t.actual_qty * wt.coefficient) - 
          (CASE WHEN t.status = 'completed' AND t.completion_date > t.deadline 
                THEN (t.completion_date::date - t.deadline::date) * 0.25 * t.actual_qty * wt.coefficient 
                ELSE 0 END))), 0) as total_col12,
        COALESCE(SUM(GREATEST(0, (t.actual_qty * wt.coefficient) - 
          (COALESCE(t.rework_count, 0) * 0.25 * t.actual_qty * wt.coefficient))), 0) as total_col14
      FROM users u
      LEFT JOIN tasks t ON u.id = t.user_id AND t.is_deleted = FALSE
        AND ($1::date IS NULL OR t.deadline >= $1::date)
        AND ($2::date IS NULL OR t.deadline <= $2::date)
      LEFT JOIN work_types wt ON t.work_type_id = wt.id
      WHERE 1=1
    `;

    if (search) {
      params.push(`%${search}%`);
      query += ` AND u.full_name ILIKE $${params.length}`;
    }

    if (queryObj['filters[full_name]']) {
      params.push(`%${queryObj['filters[full_name]']}%`);
      query += ` AND u.full_name ILIKE $${params.length}`;
    }
    if (queryObj['filters[position]']) {
      params.push(`%${queryObj['filters[position]']}%`);
      query += ` AND u.position ILIKE $${params.length}`;
    }

    query += ` GROUP BY u.id, u.full_name, u.position`;
    
    const res = await this.db.query(query, params);
    let rows = res.rows.map((row: any) => this.calculateKPIFromRawData(row));

    // Sort in memory
    if (sortBy) {
      rows.sort((a,b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];
        if (sortBy === 'full_name') {
           valA = (a.user_name || a.full_name || '').toLowerCase();
           valB = (b.user_name || b.full_name || '').toLowerCase();
        }
        if (valA < valB) return sortDesc === 'true' || sortDesc === true ? 1 : -1;
        if (valA > valB) return sortDesc === 'true' || sortDesc === true ? -1 : 1;
        return 0;
      });
    }

    const total = rows.length;
    const startIndex = (Number(page) - 1) * Number(limit);
    let items = rows.slice(startIndex, startIndex + Number(limit));

    return { items, total };
  }

  async getLeaderboard(queryObj: any) {
    if (!queryObj.sortBy) {
       queryObj.sortBy = 'kpi';
       queryObj.sortDesc = true;
    }
    return this.getSummaryDashboard(queryObj);
  }

  private calculateKPIFromRawData(row: any) {
    const totalCol7 = Number(row.total_col7 || 0);
    const totalCol9 = Number(row.total_col9 || 0);
    const totalCol12 = Number(row.total_col12 || 0);
    const totalCol14 = Number(row.total_col14 || 0);

    const a = totalCol7 > 0 ? (totalCol9 / totalCol7) * 100 : 0;
    const b = totalCol7 > 0 ? (totalCol14 / totalCol7) * 100 : 0;
    const c = totalCol7 > 0 ? (totalCol12 / totalCol7) * 100 : 0;
    const kpi = (a + b + c) / 3;

    return {
      ...row,
      total_tasks: Number(totalCol7.toFixed(2)),
      completed_tasks: Number(totalCol9.toFixed(2)),
      a: Number(a.toFixed(2)),
      b: Number(b.toFixed(2)),
      c: Number(c.toFixed(2)),
      kpi: Number(kpi.toFixed(2))
    };
  }
}
