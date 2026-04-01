import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface KpiData {
  user_id: string;
  user_name: string;
  full_name: string;
  period_id: string;
  a: number; 
  b: number; 
  c: number; 
  kpi: number;
  total_tasks: number; 
  completed_tasks: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);

  periods: any[] = [];
  selectedPeriodId = '';
  myKpi: KpiData | null = null;
  summaryData: any[] = [];
  loading = false;

  get showSummary() { 
    return this.auth.hasRole('admin', 'vu_truong', 'vu_pho'); 
  }

  ngOnInit() {
    this.api.get<any>('kpi-periods').subscribe(res => {
      this.periods = res.data || [];
      const active = this.periods.find(p => p.is_active);
      if (active) {
        this.selectedPeriodId = active.id;
      } else if (this.periods.length > 0) {
        this.selectedPeriodId = this.periods[0].id;
      }
      this.loadData();
    });
  }

  onPeriodChange(event: Event) {
    this.selectedPeriodId = (event.target as HTMLSelectElement).value;
    this.loadData();
  }

  loadData() {
    this.loading = true;
    const params: any = {};
    if (this.selectedPeriodId) params['period_id'] = this.selectedPeriodId;

    this.api.get<any>('dashboard/personal', params).subscribe(res => {
      const data = res.data || [];
      this.myKpi = data.length > 0 ? data[0] : null;
      this.loading = false;
    });

    if (this.showSummary) {
      this.api.get<any>('dashboard/leaderboard', params).subscribe(res => {
        this.summaryData = res.data || [];
      });
    }
  }

  grade(kpi: number): string {
    if (kpi >= 90) return 'A';
    if (kpi >= 70) return 'B';
    if (kpi >= 50) return 'C';
    return 'D';
  }

  gradeClass(kpi: number): string {
    return `grade-${this.grade(kpi).toLowerCase()}`;
  }

  getKpiColor(kpi: number): string {
    if (kpi >= 90) return 'var(--grade-a)';
    if (kpi >= 70) return 'var(--grade-b)';
    if (kpi >= 50) return 'var(--grade-c)';
    return 'var(--grade-d)';
  }
}
