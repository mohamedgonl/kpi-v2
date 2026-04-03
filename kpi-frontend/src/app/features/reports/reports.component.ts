import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ChartModule } from 'primeng/chart';
import { CalendarModule } from 'primeng/calendar';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, ChartModule, FormsModule, CalendarModule],
  templateUrl: './reports.component.html'
})
export class ReportsComponent implements OnInit {
  private api = inject(ApiService);

  periods: any[] = [];
  reportData: any[] = [];
  allReportData: any[] = [];
  startDate: string = '';
  endDate: string = '';
  
  timeMode: 'date' | 'month' | 'quarter' | 'year' | 'range' = 'month';
  selectedMonth: number = new Date().getMonth() + 1;
  selectedQuarter: number = Math.ceil((new Date().getMonth() + 1) / 3);
  selectedYear: number = new Date().getFullYear();
  
  years: number[] = [];
  months = Array.from({ length: 12 }, (_, i) => i + 1);
  quarters = [1, 2, 3, 4];

  loadingTable = false;
  loadingChart = false;
  Math = Math;
  now = new Date();
  // Pagination
  currentPage = 1;
  pageSize = 10;

  // Chart data
  chartData: any;
  chartOptions: any;

  searchText = '';
  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;

  ngOnInit() {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 20; y <= currentYear + 20; y++) this.years.push(y);
    
    this.updateDates();

    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(val => {
      this.searchText = val;
      this.currentPage = 1;
      this.loadTableData();
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

  onTimeModeChange() {
    this.updateDates();
  }

  ngOnDestroy() {
    this.searchSubscription?.unsubscribe();
  }

  onSearchChange(val: string) {
    this.searchSubject.next(val);
  }

  updateDates() {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (this.timeMode) {
      case 'date':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case 'month':
        start = new Date(this.selectedYear, this.selectedMonth - 1, 1);
        end = new Date(this.selectedYear, this.selectedMonth, 0, 23, 59, 59);
        break;
      case 'quarter':
        const startMonth = (this.selectedQuarter - 1) * 3;
        start = new Date(this.selectedYear, startMonth, 1);
        end = new Date(this.selectedYear, startMonth + 3, 0, 23, 59, 59);
        break;
      case 'year':
        start = new Date(this.selectedYear, 0, 1);
        end = new Date(this.selectedYear, 12, 0, 23, 59, 59);
        break;
      case 'range':
        this.loadTableData();
        this.loadChartData();
        return;
    }

    this.startDate = `${start.getFullYear()}-${(start.getMonth() + 1).toString().padStart(2, '0')}-${start.getDate().toString().padStart(2, '0')}`;
    this.endDate = `${end.getFullYear()}-${(end.getMonth() + 1).toString().padStart(2, '0')}-${end.getDate().toString().padStart(2, '0')}`;
    this.loadTableData();
    this.loadChartData();
  }

  loadTableData() {
    this.loadingTable = true;
    const params: any = {
      start_date: this.startDate,
      end_date: this.endDate,
      page: this.currentPage,
      limit: this.pageSize
    };
    if (this.searchText) params['search'] = this.searchText;
    if (this.sortBy) params['sortBy'] = this.sortBy;
    if (this.sortDesc) params['sortDesc'] = this.sortDesc;
    if (this.filters.full_name) params['filters[full_name]'] = this.filters.full_name;
    if (this.filters.position) params['filters[position]'] = this.filters.position;

    this.api.get<any>('dashboard/leaderboard', params).subscribe({
      next: (res) => {
        if (res.data && res.data.items) {
          this.reportData = res.data.items;
          this.totalRecords = res.data.total;
        } else {
          this.reportData = res.data || [];
          this.totalRecords = this.reportData.length;
        }
        this.loadingTable = false;
      },
      error: () => this.loadingTable = false
    });
  }

  loadChartData() {
    this.loadingChart = true;
    const allParams = { start_date: this.startDate, end_date: this.endDate, limit: '1000' };
    this.api.get<any>('dashboard/leaderboard', allParams).subscribe({
      next: (res) => {
        this.allReportData = (res.data && res.data.items) ? res.data.items : (res.data || []);
        this.updateChart();
        this.loadingChart = false;
      },
      error: () => this.loadingChart = false
    });
  }

  sortBy = '';
  sortDesc = false;
  filters: any = {};
  totalRecords = 0;

  onFilterChange(field: string, val: string) {
    this.filters[field] = val;
    this.currentPage = 1;
    this.loadTableData();
  }

  onSort(field: string) {
    if (this.sortBy === field) {
      this.sortDesc = !this.sortDesc;
    } else {
      this.sortBy = field;
      this.sortDesc = false;
    }
    this.currentPage = 1;
    this.loadTableData();
  }

  // Pagination Getters
  get pagedData() {
    return this.reportData;
  }

  get pageNumbers() {
    const total = Math.ceil(this.totalRecords / this.pageSize);
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  updateChart() {
    if (!this.allReportData || this.allReportData.length === 0) {
      this.chartData = null;
      return;
    }
    const labels = this.allReportData.map(d => d.user_name || d.full_name || 'NV');
    const values = this.allReportData.map(d => Number(d.kpi || 0));

    this.chartData = {
      labels: labels,
      datasets: [
        {
          label: 'Điểm KPI (%)',
          data: values,
          backgroundColor: this.allReportData.map(d => this.getBarColor(Number(d.kpi || 0))),
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
      'SL giao (quy đổi)': row.total_assigned_qty,
      'SL thực (quy đổi)': row.total_actual_qty,
      'Số lượng (%)': row.a + '%',
      'Chất lượng (%)': row.b + '%',
      'Tiến độ (%)': row.c + '%',
      'KPI': row.kpi + '%',
      'Xếp loại': this.grade(row.kpi)
    }));

    data.push({
      'STT': '',
      'Họ tên': 'TỔNG CỘNG ĐƠN VỊ',
      'Chức vụ': '',
      'SL giao (quy đổi)': this.totalUnitAssigned,
      'SL thực (quy đổi)': this.totalUnitActual,
      'Số lượng (%)': this.unitA.toFixed(1) + '%',
      'Chất lượng (%)': this.unitB.toFixed(1) + '%',
      'Tiến độ (%)': this.unitC.toFixed(1) + '%',
      'KPI': this.unitKPI.toFixed(1) + '%',
      'Xếp loại': this.grade(this.unitKPI)
    });

    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(data);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Báo cáo KPI');
    XLSX.writeFile(wb, `Bao_cao_KPI_${new Date().getTime()}.xlsx`);
  }

  getSelectedPeriodName() {
    const start = new Date(this.startDate).toLocaleDateString('vi-VN');
    const end = new Date(this.endDate).toLocaleDateString('vi-VN');
    return `Từ ${start} đến ${end}`;
  }

  async exportImage() {
    // Nhắm mục tiêu chính xác vào biểu đồ, lấy toàn bộ chiều rộng nội dung
    const element = document.getElementById('report-chart-inner');
    if (!element) return;

    try {
      this.loadingChart = true;
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
      this.loadingChart = false;
    } catch (err) {
      console.error('Lỗi khi xuất ảnh:', err);
      this.loadingChart = false;
    }
  }

  get totalUnitAssigned() { return this.allReportData.reduce((s, r) => s + Number(r.total_assigned_qty || 0), 0); }
  get totalUnitActual() { return this.allReportData.reduce((s, r) => s + Number(r.total_actual_qty || 0), 0); }
  get totalUnitOntime() { return this.allReportData.reduce((s, r) => s + Number(r.total_ontime_qty || 0), 0); }
  get totalUnitQuality() { return this.allReportData.reduce((s, r) => s + Number(r.total_quality_qty || 0), 0); }

  get unitA() { const c = this.totalUnitAssigned; return c > 0 ? (this.totalUnitActual / c) * 100 : 0; }
  get unitB() { const c = this.totalUnitAssigned; return c > 0 ? (this.totalUnitQuality / c) * 100 : 0; }
  get unitC() { const c = this.totalUnitAssigned; return c > 0 ? (this.totalUnitOntime / c) * 100 : 0; }
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
