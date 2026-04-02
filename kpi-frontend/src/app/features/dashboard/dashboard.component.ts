import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  total_tasks: number; 
  completed_tasks: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  auth = inject(AuthService);

  periods: any[] = [];
  startDate: string = '';
  endDate: string = '';
  
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
  loading = false;
  Math = Math;

  // Pagination
  currentPage = 1;
  pageSize = 5;

  get showSummary() { 
    return this.auth.hasRole('admin', 'vu_truong', 'vu_pho'); 
  }

  get filteredSummary() {
    return this.summaryData;
  }

  get pagedSummary() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredSummary.slice(start, start + this.pageSize);
  }

  get pageNumbers() {
    // Note: Since search is server-side, filteredSummary is already the result of the search
    const total = Math.ceil(this.filteredSummary.length / this.pageSize);
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  ngOnInit() {
    const currentYear = new Date().getFullYear();
    for (let y = 2024; y <= currentYear + 1; y++) this.years.push(y);
    
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
      this.loadData();
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
        return this.loadData();
    }

    this.startDate = start.toISOString().substring(0, 10);
    this.endDate = end.toISOString().substring(0, 10);
    this.loadData();
  }

  loadData() {
    this.loading = true;
    const params: any = {};
    if (this.startDate) params['start_date'] = this.startDate;
    if (this.endDate) params['end_date'] = this.endDate;
    if (this.searchText) params['search'] = this.searchText;

    this.api.get<any>('dashboard/personal', { start_date: params.start_date, end_date: params.end_date }).subscribe({
      next: (res) => {
        const data = res.data || [];
        this.myKpi = data.length > 0 ? data[0] : null;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
      }
    });

    if (this.showSummary) {
      this.api.get<any>('dashboard/leaderboard', params).subscribe({
        next: (res) => {
          this.summaryData = res.data || [];
          this.currentPage = 1;
        },
        error: (err) => {
        }
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
