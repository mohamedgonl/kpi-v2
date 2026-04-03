import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CalendarModule } from 'primeng/calendar';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

interface KpiData {
  user_id: string;
  user_name: string;
  full_name: string;
  period_id: string;
  a: number; 
  b: number; 
  c: number; 
  kpi: number;
  total_tasks: number | string; 
  completed_tasks: number | string;
  total_assigned_qty?: number; 
  total_actual_qty?: number; 
  total_rework?: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, CalendarModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  auth = inject(AuthService);

  periods: any[] = [];
  startDate: any = '';
  endDate: any = '';
  
  timeMode: 'date' | 'month' | 'quarter' | 'year' | 'range' = 'month';
  selectedMonth: number = new Date().getMonth() + 1;
  selectedQuarter: number = Math.ceil((new Date().getMonth() + 1) / 3);
  selectedYear: number = new Date().getFullYear();
  
  years: number[] = [];
  months = Array.from({ length: 12 }, (_, i) => i + 1);
  quarters = [1, 2, 3, 4];

  myKpi: KpiData | null = null;
  searchText = '';
  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;
  
  summaryData: any[] = [];
  loadingPersonal = false;
  loadingLeaderboard = false;
  Math = Math;

  // Pagination
  currentPage = 1;
  pageSize = 5;

  get showSummary() { 
    return this.auth.hasRole('admin', 'vu_truong', 'vu_pho'); 
  }

  sortBy = 'kpi';
  sortDesc = true;
  totalRecords = 0;
  filters: any = {};

  get pagedSummary() {
    return this.summaryData;
  }

  get pageNumbers() {
    const total = Math.ceil(this.totalRecords / this.pageSize);
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  onSort(field: string) {
    if (this.sortBy === field) {
      this.sortDesc = !this.sortDesc;
    } else {
      this.sortBy = field;
      this.sortDesc = false;
    }
    this.currentPage = 1;
    this.loadData();
  }

  onFilterChange(field: string, val: string) {
    this.filters[field] = val;
    this.currentPage = 1;
    this.loadData();
  }

  ngOnInit() {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 20; y <= currentYear + 20; y++) this.years.push(y);
    
    this.updateDates();
    
    this.auth.currentUser$.subscribe(user => {
      if (user && this.summaryData.length === 0) {
        this.loadData();
      }
    });

    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(val => {
      this.searchText = val;
      this.currentPage = 1;
      this.loadLeaderboard();
    });
  }

  ngOnDestroy() {
    this.searchSubscription?.unsubscribe();
  }

  onSearchChange(val: string) {
    this.searchSubject.next(val);
  }

  onTimeModeChange() {
    this.updateDates();
  }

  updateDates() {
    const now = new Date();
    let start: any = new Date();
    let end: any = new Date();

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
        if (this.startDate && this.endDate) {
          start = new Date(this.startDate);
          end = new Date(this.endDate);
          this.startDate = start.toISOString().substring(0, 10);
          this.endDate = end.toISOString().substring(0, 10);
        }
        return this.loadData();
    }

    this.startDate = `${start.getFullYear()}-${(start.getMonth() + 1).toString().padStart(2, '0')}-${start.getDate().toString().padStart(2, '0')}`;
    this.endDate = `${end.getFullYear()}-${(end.getMonth() + 1).toString().padStart(2, '0')}-${end.getDate().toString().padStart(2, '0')}`;
    this.loadData();
  }

  loadData() {
    this.loadPersonal();
    if (this.showSummary) {
      this.loadLeaderboard();
    }
  }

  loadPersonal() {
    this.loadingPersonal = true;
    this.api.get<any>('dashboard/personal', { start_date: this.startDate, end_date: this.endDate }).subscribe({
      next: (res) => {
        const data = res.data || [];
        this.myKpi = data.length > 0 ? data[0] : null;
        this.loadingPersonal = false;
      },
      error: (err) => {
        this.loadingPersonal = false;
      }
    });
  }

  loadLeaderboard() {
    this.loadingLeaderboard = true;
    const params: any = {
      start_date: this.startDate,
      end_date: this.endDate,
      page: this.currentPage,
      limit: this.pageSize
    };
    if (this.searchText) params.search = this.searchText;
    if (this.sortBy) params.sortBy = this.sortBy;
    if (this.sortDesc) params.sortDesc = this.sortDesc;

    this.api.get<any>('dashboard/leaderboard', params).subscribe({
      next: (res) => {
        if (res.data && res.data.items) {
           this.summaryData = res.data.items || [];
           this.totalRecords = res.data.total || 0;
        } else {
           this.summaryData = res.data || [];
           this.totalRecords = this.summaryData.length;
        }
        this.loadingLeaderboard = false;
      },
      error: (err) => {
        this.loadingLeaderboard = false;
      }
    });
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
