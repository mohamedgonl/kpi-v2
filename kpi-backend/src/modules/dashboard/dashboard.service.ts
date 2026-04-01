import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

  async getPersonalDashboard(userId: string, periodId?: string) {
    let query = `SELECT * FROM v_kpi_raw_totals WHERE user_id = $1`;
    const params: any[] = [userId];

    if (periodId) {
      params.push(periodId);
      query += ` AND period_id = $2`;
    }
    
    query += ` ORDER BY period_id DESC`;
    
    const res = await this.db.query(query, params);
    
    return res.rows.map(row => this.calculateKPIFromRawData(row));
  }

  async getSummaryDashboard(periodId?: string) {
    let query = `SELECT * FROM v_kpi_raw_totals WHERE 1=1`;
    const params: any[] = [];

    if (periodId) {
      params.push(periodId);
      query += ` AND period_id = $1`;
    }
    
    const res = await this.db.query(query, params);
    
    return res.rows.map(row => this.calculateKPIFromRawData(row));
  }

  async getLeaderboard(periodId?: string) {
    const summary = await this.getSummaryDashboard(periodId);
    
    // Sort by KPI descending
    return summary.sort((s1, s2) => s2.kpi - s1.kpi);
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
      a: Number(a.toFixed(2)),
      b: Number(b.toFixed(2)),
      c: Number(c.toFixed(2)),
      kpi: Number(kpi.toFixed(2))
    };
  }
}
