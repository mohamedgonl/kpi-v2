import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, Validators, FormBuilder } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    FormsModule,
    DialogModule
  ],
  templateUrl: './tasks.component.html'
})
export class TasksComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  periods: any[] = [];
  workGroups: any[] = [];
  workTypes: any[] = [];
  tasks: any[] = [];
  selectedPeriodId = '';
  showForm = false;
  editingTask: any = null;
  loading = false;
  Math = Math;

  // Pagination & Filtering
  filters = { task_name: '', work_group_name: '', work_type_name: '' };
  currentPage = 1;
  pageSize = 10;

  get filteredTasks() {
    // Để cổng chờ cho tính năng tìm kiếm toàn cục sau này nếu cần
    return this.tasks;
  }

  get pagedTasks() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredTasks.slice(start, start + this.pageSize);
  }

  get pageNumbers() {
    const total = Math.ceil(this.filteredTasks.length / this.pageSize);
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  onFilterChange() {
    this.currentPage = 1;
  }

  form = this.fb.group({
    work_type_id: ['', Validators.required],
    task_name: ['', Validators.required],
    assigned_qty: [1, [Validators.required, Validators.min(0)]],
    actual_qty: [0, [Validators.required, Validators.min(0)]],
    deadline: [''],
    completion_date: [''],
    rework_count: [0],
    status: ['pending'],
    reference_code: [''],
    note: [''],
  });

  ngOnInit() {
    this.api.get<any>('kpi-periods').subscribe(res => {
      this.periods = res.data || [];
      const active = this.periods.find(p => p.is_active);
      if (active) this.selectedPeriodId = active.id;
      else if (this.periods.length) this.selectedPeriodId = this.periods[0].id;
      this.loadTasks();
    });
    this.api.get<any>('work-groups').subscribe(res => { this.workGroups = res.data || []; });
    this.api.get<any>('work-types').subscribe(res => { this.workTypes = res.data || []; });
  }

  onPeriodChange(event: Event) {
    this.selectedPeriodId = (event.target as HTMLSelectElement).value;
    this.loadTasks();
  }

  loadTasks() {
    this.loading = true;
    const params: any = {};
    if (this.selectedPeriodId) params['period_id'] = this.selectedPeriodId;
    this.api.get<any>('tasks', params).subscribe(res => { 
      this.tasks = res.data || []; 
      this.loading = false;
    });
  }

  getTypesForGroup(groupId: string) {
    return this.workTypes.filter(t => t.group_id === groupId);
  }

  addNew() {
    this.editingTask = null;
    this.form.reset({ assigned_qty: 1, actual_qty: 0, rework_count: 0, status: 'pending' });
    this.showForm = true;
  }

  editTask(task: any) {
    this.editingTask = task;
    this.form.patchValue({
      work_type_id: task.work_type_id,
      task_name: task.task_name,
      assigned_qty: task.assigned_qty,
      actual_qty: task.actual_qty,
      deadline: task.deadline?.substring(0, 10),
      completion_date: task.completion_date?.substring(0, 10),
      rework_count: task.rework_count,
      status: task.status,
      reference_code: task.reference_code,
      note: task.note,
    });
    this.showForm = true;
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    const body = { ...this.form.value, period_id: this.selectedPeriodId };

    const req = this.editingTask
      ? this.api.patch<any>(`tasks/${this.editingTask.id}`, body)
      : this.api.post<any>('tasks', body);

    req.subscribe({
      next: () => {
        this.showForm = false;
        this.loadTasks();
        this.loading = false;
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã lưu công việc' });
      },
      error: (err) => {
        this.loading = false;
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: err.error?.error?.message || 'Lỗi thao tác' });
      }
    });
  }

  deleteTask(id: string) {
    if (!confirm('Xác nhận xóa công việc này?')) return;
    this.api.delete<any>(`tasks/${id}`).subscribe(() => {
      this.loadTasks();
      this.messageService.add({ severity: 'info', summary: 'Đã xóa', detail: 'Công việc đã bị loại bỏ' });
    });
  }

  statusLabel(status: string): string {
    const map: any = { pending: 'Đang thực hiện', completed: 'Hoàn thành', cancelled: 'Hủy bỏ' };
    return map[status] || status;
  }
  
  statusClass(status: string): string {
    if (status === 'completed') return 'chip-success';
    if (status === 'pending') return 'chip-info';
    return 'chip-danger';
  }
}
