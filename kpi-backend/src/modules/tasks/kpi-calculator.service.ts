import { Injectable } from '@nestjs/common';

@Injectable()
export class KpiCalculatorService {
  /**
   * Tính toán các cột giá trị cho một task đơn lẻ
   * Dựa theo logic gốc: computeTaskColumns trong store.js
   */
  computeTaskColumns(task: any, coefficient: number) {
    const col7 = coefficient * Number(task.assigned_qty || 0); // Số lượng giao quy đổi
    const col9 = coefficient * Number(task.actual_qty || 0);   // Số lượng thực hiện quy đổi
    
    let delayDays = 0;
    if (task.completion_date && task.deadline) {
      const completionDate = new Date(task.completion_date).getTime();
      const deadline = new Date(task.deadline).getTime();
      if (completionDate > deadline) {
        delayDays = Math.max(0, Math.ceil((completionDate - deadline) / 86_400_000));
      }
    }
    
    // col12 = MAX(0, col9 - delayDays * 0.25 * col9)
    const col12 = Math.max(0, col9 - delayDays * 0.25 * col9);
    
    // col14 = MAX(0, col9 - rework_count * 0.25 * col9)
    const reworkCount = Number(task.rework_count || 0);
    const col14 = Math.max(0, col9 - reworkCount * 0.25 * col9);
    
    return {
      col7,
      col9,
      delayDays,
      col12,
      col14
    };
  }

  /**
   * Tính điểm số KPI tổng hợp cho một tập hợp task
   */
  computeKpiBreakdown(tasks: any[]) {
    let totalCol7 = 0;
    let totalCol9 = 0;
    let totalCol12 = 0;
    let totalCol14 = 0;
    let completedTasks = 0;
    let pendingTasks = 0;

    tasks.forEach(task => {
      const coeff = Number(task.coefficient || 1);
      const cols = this.computeTaskColumns(task, coeff);
      
      totalCol7 += cols.col7;
      totalCol9 += cols.col9;
      totalCol12 += cols.col12;
      totalCol14 += cols.col14;

      if (task.status === 'completed') {
        completedTasks++;
      } else if (task.status === 'pending') {
        pendingTasks++;
      }
    });

    const a = totalCol7 > 0 ? (totalCol9 / totalCol7) * 100 : 0;
    const b = totalCol7 > 0 ? (totalCol14 / totalCol7) * 100 : 0;
    const c = totalCol7 > 0 ? (totalCol12 / totalCol7) * 100 : 0;
    
    return {
      a: Number(a.toFixed(2)),
      b: Number(b.toFixed(2)),
      c: Number(c.toFixed(2)),
      kpi: Number(((a + b + c) / 3).toFixed(2)),
      totalTasks: tasks.length,
      completedTasks,
      pendingTasks,
      totalCol7: Number(totalCol7.toFixed(1)),
      totalCol9: Number(totalCol9.toFixed(1)),
      totalCol12: Number(totalCol12.toFixed(1)),
      totalCol14: Number(totalCol14.toFixed(1))
    };
  }
}
