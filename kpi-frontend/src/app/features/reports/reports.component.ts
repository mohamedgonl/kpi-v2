import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ChartModule } from 'primeng/chart';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, ChartModule, FormsModule],
  templateUrl: './reports.component.html'
})
export class ReportsComponent implements OnInit {
  private api = inject(ApiService);

  periods: any[] = [];
  reportData: any[] = [];
  selectedPeriodId = '';
  loading = false;
  Math = Math;
  now = new Date();
  // Pagination
  currentPage = 1;
  pageSize = 10;

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
      layout: {
        padding: {
          bottom: 30 // Khoảng trống cho nhãn xoay nghiêng
        }
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
      this.currentPage = 1;
      this.loading = false;
    });
  }

  // Pagination Getters
  get pagedData() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.reportData.slice(start, start + this.pageSize);
  }

  get pageNumbers() {
    const total = Math.ceil(this.reportData.length / this.pageSize);
    return Array.from({ length: total }, (_, i) => i + 1);
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

  getSelectedPeriodName() {
    const p = this.periods.find(p => p.id === this.selectedPeriodId);
    return p ? p.name : '—';
  }

  async exportImage() {
    // Nhắm mục tiêu chính xác vào biểu đồ, lấy toàn bộ chiều rộng nội dung
    const element = document.getElementById('report-chart-inner');
    if (!element) return;

    try {
      this.loading = true;
      this.now = new Date(); // Làm mới thời gian chụp ảnh v29.3
      const canvas = await html2canvas(element, {
        scale: 3, // Siêu sắc nét (High Quality)
        logging: false,
        useCORS: true,
        backgroundColor: '#ffffff', // Nền trắng sạch đẹp
        width: element.scrollWidth, // Lấy toàn bộ chiều rộng dù có bị cuộn
        height: element.scrollHeight,
        windowWidth: element.scrollWidth,
        onclone: (clonedDoc) => {
          // Bật hiển thị Header chỉ khi xuất ảnh
          const header = clonedDoc.getElementById('chart-header-stamp');
          if (header) {
            header.style.display = 'block';
          }
        }
      });
      
      const link = document.createElement('a');
      const time = new Date().getTime();
      link.download = `Bieu_do_KPI_${time}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
      this.loading = false;
    } catch (err) {
      console.error('Lỗi khi xuất ảnh:', err);
      this.loading = false;
    }
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
