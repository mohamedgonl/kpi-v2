import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../core/services/api.service';
import { ChartModule } from 'primeng/chart';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, ChartModule],
  templateUrl: './reports.component.html'
})
export class ReportsComponent implements OnInit {
  private api = inject(ApiService);

  periods: any[] = [];
  reportData: any[] = [];
  selectedPeriodId = '';
  loading = false;
  
  // Chart data
  chartData: any;
  chartOptions: any;

  ngOnInit() {
    this.api.get<any>('kpi-periods').subscribe(res => {
      this.periods = res.data || [];
      if (this.periods.length) {
        this.selectedPeriodId = this.periods[0].id;
        this.loadReport();
      }
    });

    this.chartOptions = {
      maintainAspectRatio: false,
      aspectRatio: 0.6,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { size: 11 } },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: { color: '#64748b' }
        }
      }
    };
  }

  onPeriodChange(event: Event) {
    this.selectedPeriodId = (event.target as HTMLSelectElement).value;
    this.loadReport();
  }

  loadReport() {
    this.loading = true;
    const params: any = {};
    if (this.selectedPeriodId) params['period_id'] = this.selectedPeriodId;
    this.api.get<any>('dashboard/leaderboard', params).subscribe(res => {
      this.reportData = res.data || [];
      this.updateChart();
      this.loading = false;
    });
  }

  updateChart() {
    const labels = this.reportData.map(d => d.user_name || d.full_name || 'NV');
    const values = this.reportData.map(d => d.kpi);

    this.chartData = {
      labels: labels,
      datasets: [
        {
          label: 'Điểm KPI (%)',
          data: values,
          backgroundColor: this.reportData.map(d => this.getBarColor(d.kpi)),
          borderRadius: 4
        }
      ]
    };
  }

  getBarColor(kpi: number) {
    if (kpi >= 90) return '#16a34a'; // Green
    if (kpi >= 70) return '#3b82f6'; // Blue
    if (kpi >= 50) return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  }

  exportExcel() {
    const data: any[] = this.reportData.map((row, index) => ({
      'STT': index + 1,
      'Họ tên': row.user_name || row.full_name,
      'Chức vụ': row.position,
      'SL giao (quy đổi)': row.total_col7,
      'SL thực (quy đổi)': row.total_col9,
      'a% (Số lượng)': row.a + '%',
      'b% (Chất lượng)': row.b + '%',
      'c% (Tiến độ)': row.c + '%',
      'KPI': row.kpi + '%',
      'Xếp loại': this.grade(row.kpi)
    }));

    // Add totals row
    data.push({
      'STT': '',
      'Họ tên': 'TỔNG CỘNG ĐƠN VỊ',
      'Chức vụ': '',
      'SL giao (quy đổi)': this.totalUnitCol7,
      'SL thực (quy đổi)': this.totalUnitCol9,
      'a% (Số lượng)': this.unitA.toFixed(1) + '%',
      'b% (Chất lượng)': this.unitB.toFixed(1) + '%',
      'c% (Tiến độ)': this.unitC.toFixed(1) + '%',
      'KPI': this.unitKPI.toFixed(1) + '%',
      'Xếp loại': this.grade(this.unitKPI)
    });

    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo KPI');
    XLSX.writeFile(wb, `Bao_cao_KPI_${new Date().getTime()}.xlsx`);
  }

  get totalUnitCol7() { return this.reportData.reduce((s, r) => s + Number(r.total_col7 || 0), 0); }
  get totalUnitCol9() { return this.reportData.reduce((s, r) => s + Number(r.total_col9 || 0), 0); }
  get totalUnitCol12() { return this.reportData.reduce((s, r) => s + Number(r.total_col12 || 0), 0); }
  get totalUnitCol14() { return this.reportData.reduce((s, r) => s + Number(r.total_col14 || 0), 0); }

  get unitA() { const c7 = this.totalUnitCol7; return c7 > 0 ? (this.totalUnitCol9 / c7) * 100 : 0; }
  get unitB() { const c7 = this.totalUnitCol7; return c7 > 0 ? (this.totalUnitCol14 / c7) * 100 : 0; }
  get unitC() { const c7 = this.totalUnitCol7; return c7 > 0 ? (this.totalUnitCol12 / c7) * 100 : 0; }
  get unitKPI() { return (this.unitA + this.unitB + this.unitC) / 3; }

  grade(kpi: number): string {
    if (kpi >= 90) return 'A';
    if (kpi >= 70) return 'B';
    if (kpi >= 50) return 'C';
    return 'D';
  }

  gradeClass(kpi: number): string {
    return `grade-${this.grade(kpi).toLowerCase()}`;
  }
}
