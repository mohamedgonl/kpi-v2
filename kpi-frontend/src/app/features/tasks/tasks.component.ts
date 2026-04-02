import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { CalendarModule } from 'primeng/calendar';
import { DropdownModule } from 'primeng/dropdown';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { MessageService } from 'primeng/api';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DialogModule, CalendarModule, DropdownModule],
  templateUrl: './tasks.component.html'
})
export class TasksComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  leaders: any[] = [];
  workGroups: any[] = [];
  workTypes: any[] = [];
  
  years: number[] = [];
  months = Array.from({ length: 12 }, (_, i) => i + 1);
  quarters = [1, 2, 3, 4];

  showForm = false;
  editingTask: any = null;
  loading = false;
  Math = Math;

  // Search & Filtering
  searchText = '';
  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;
  
  timeMode: 'date' | 'month' | 'quarter' | 'year' | 'range' | 'custom' = 'month';
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;
  selectedQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  startDate = '';
  endDate = '';

  tasks: any[] = [];
  currentPage = 1;
  pageSize = 10;
  totalRecords = 0;
  sortBy = 'deadline';
  sortDesc = false;

  onSort(field: string) {
    if (this.sortBy === field) {
      this.sortDesc = !this.sortDesc;
    } else {
      this.sortBy = field;
      this.sortDesc = false;
    }
    this.currentPage = 1;
    this.load();
  }

  onSearchChange(val: string) {
    this.searchSubject.next(val);
  }

  form = this.fb.group({
    work_type_id: ['', Validators.required],
    task_name: ['', Validators.required],
    note: [''],
    assigned_qty: [1.0, [Validators.required, Validators.min(0)]],
    actual_qty: [0, [Validators.required, Validators.min(0)]],
    deadline: [null as Date | null, Validators.required],
    completion_date: [null as Date | null],
    rework_count: [0, [Validators.required, Validators.min(0)]],
    status: ['pending', Validators.required],
    product: [''],
    lead_by: ['']
  });

  statusList = [
    { label: 'Chờ thực hiện', value: 'pending' },
    { label: 'Đang thực hiện', value: 'in_progress' },
    { label: 'Hoàn thành', value: 'completed' },
    { label: 'Hủy bỏ', value: 'cancelled' }
  ];

  ngOnInit() {
    this.api.get<any>('users/leaders').subscribe(res => { 
      this.leaders = res?.data?.items || (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])); 
    });
    this.api.get<any>('work-groups', { limit: '1000' }).subscribe(res => { 
      this.workGroups = res?.data?.items || (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])); 
    });
    this.api.get<any>('work-types', { limit: '1000' }).subscribe(res => { 
      this.workTypes = res?.data?.items || (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])); 
    });
    
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 20; y <= currentYear + 20; y++) this.years.push(y);
    
    this.updateDates();

    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(val => {
      this.searchText = val;
      this.currentPage = 1;
      this.load();
    });

    this.auth.currentUser$.subscribe(user => {
      if (user) {
        this.load();
      }
    });
  }

  ngOnDestroy() {
    this.searchSubscription?.unsubscribe();
  }

  get groupedWorkTypes() {
    if (!Array.isArray(this.workGroups)) return [];
    const wt = Array.isArray(this.workTypes) ? this.workTypes : [];
    // PrimeNG expects: { label: 'Group', items: [ {label: 'Item', value: 1} ] }
    return this.workGroups.map(g => ({
      label: g.name,
      items: wt
        .filter(t => t.group_id == g.id)
        .map(t => ({ label: t.name, value: t.id }))
    })).filter(g => g.items.length > 0);
  }

  get pagedTasks() { return this.tasks; }

  get pageNumbers() {
    const total = Math.ceil(this.totalRecords / this.pageSize);
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  onTimeModeChange() {
    this.updateDates();
  }

  updateDates() {
    const now = new Date();
    if (this.timeMode === 'date') {
      this.startDate = now.toISOString().split('T')[0];
      this.endDate = now.toISOString().split('T')[0];
    } else if (this.timeMode === 'month') {
      this.startDate = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}-01`;
      this.endDate = new Date(this.selectedYear, this.selectedMonth, 0).toISOString().split('T')[0];
    } else if (this.timeMode === 'quarter') {
      this.startDate = `${this.selectedYear}-${String((this.selectedQuarter - 1) * 3 + 1).padStart(2, '0')}-01`;
      this.endDate = new Date(this.selectedYear, this.selectedQuarter * 3, 0).toISOString().split('T')[0];
    } else if (this.timeMode === 'year') {
      this.startDate = `${this.selectedYear}-01-01`;
      this.endDate = `${this.selectedYear}-12-31`;
    } else if (this.timeMode === 'range') {
      // Inputs binded to startDate/endDate manually
    }
    this.load();
  }

  load() {
    this.loading = true;
    const params: any = {
      start_date: this.startDate,
      end_date: this.endDate,
      page: this.currentPage,
      limit: this.pageSize,
      sortBy: this.sortBy,
      sortDesc: this.sortDesc
    };
    if (this.searchText) params.search = this.searchText;

    this.api.get<any>('tasks', params).subscribe({
      next: (res) => {
        if (res.data && res.data.items) {
          this.tasks = res.data.items;
          this.totalRecords = res.data.total;
        } else {
          this.tasks = res.data || [];
          this.totalRecords = this.tasks.length;
        }
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Không thể tải danh sách công việc' });
      }
    });
  }

  addNew() {
    this.editingTask = null;
    this.form.reset({
      assigned_qty: 1,
      actual_qty: 0,
      rework_count: 0,
      status: 'pending'
    });
    this.showForm = true;
  }

  editTask(task: any) {
    this.editingTask = task;
    this.form.patchValue({
      work_type_id: task.work_type_id,
      task_name: task.task_name,
      note: task.note,
      assigned_qty: task.assigned_qty,
      actual_qty: task.actual_qty,
      deadline: task.deadline ? new Date(task.deadline) : null,
      completion_date: task.completion_date ? new Date(task.completion_date) : null,
      rework_count: task.rework_count,
      status: task.status,
      product: task.product,
      lead_by: task.lead_by
    });
    this.showForm = true;
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading = true;
    const val = { ...this.form.value };
    if (val.deadline) val.deadline = (val.deadline as any).toISOString().split('T')[0];
    if (val.completion_date) val.completion_date = (val.completion_date as any).toISOString().split('T')[0];

    const req = this.editingTask 
      ? this.api.patch<any>(`tasks/${this.editingTask.id}`, val)
      : this.api.post<any>('tasks', val);

    req.subscribe({
      next: () => {
        this.showForm = false;
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã lưu công việc' });
        this.load();
      },
      error: (err) => {
        this.loading = false;
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: err.error?.error?.message || 'Có lỗi xảy ra' });
      }
    });
  }

  deleteTask(id: string) {
    if (!confirm('Xác nhận xóa công việc này?')) return;
    this.api.delete<any>(`tasks/${id}`).subscribe({
      next: () => {
        this.messageService.add({ severity: 'info', summary: 'Đã xóa', detail: 'Công việc đã được loại bỏ' });
        this.load();
      }
    });
  }

  getStatusLabel(status: string) {
    return this.statusList.find(s => s.value === status)?.label || status;
  }
}
