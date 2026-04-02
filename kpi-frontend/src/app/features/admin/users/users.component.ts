import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DialogModule],
  templateUrl: './users.component.html'
})
export class UsersComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  users: any[] = [];
  searchText = '';
  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;

  showForm = false;
  editingUser: any = null;
  loading = false;

  form = this.fb.group({
    full_name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    employee_code: [''],
    role: ['chuyen_vien', Validators.required],
    phone: [''],
    position: [''],
    password: ['']
  });

  roles = [
    { label: 'Admin', value: 'admin' },
    { label: 'Vụ trưởng', value: 'vu_truong' },
    { label: 'Vụ phó', value: 'vu_pho' },
    { label: 'Chuyên viên', value: 'chuyen_vien' }
  ];

  currentPage = 1;
  pageSize = 10;
  Math = Math;

  ngOnInit() {
    this.load();
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(val => {
      this.searchText = val;
      this.load();
    });
  }

  ngOnDestroy() {
    this.searchSubscription?.unsubscribe();
  }

  onSearchChange(val: string) {
    this.searchSubject.next(val);
  }

  sortBy = 'full_name';
  sortDesc = false;
  totalRecords = 0;
  filters: any = {};

  load() {
    const params: any = {
      page: this.currentPage,
      limit: this.pageSize,
      sortBy: this.sortBy,
      sortDesc: this.sortDesc
    };
    if (this.searchText) params['search'] = this.searchText;
    
    // Add individual column filters
    if (this.filters.full_name) params['filters[full_name]'] = this.filters.full_name;
    if (this.filters.email) params['filters[email]'] = this.filters.email;
    if (this.filters.employee_code) params['filters[employee_code]'] = this.filters.employee_code;
    if (this.filters.position) params['filters[position]'] = this.filters.position;
    if (this.filters.role) params['filters[role]'] = this.filters.role;

    this.api.get<any>('users', params).subscribe(res => { 
      // check if it's the new nested format or old fallback array
      if (res.data && res.data.items) {
        this.users = res.data.items || [];
        this.totalRecords = res.data.total || 0;
      } else {
        this.users = res.data || [];
        this.totalRecords = this.users.length;
      }
    });
  }

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

  onFilterChange(field: string, val: string) {
    this.filters[field] = val;
    this.currentPage = 1;
    this.load();
  }

  get pagedUsers() {
    // Already paged from server, but fallback to local if needed
    if (this.totalRecords > this.pageSize && this.users.length === this.pageSize) {
      return this.users;
    }
    // Fallback if pagination wasn't applied on server
    const start = (this.currentPage - 1) * this.pageSize;
    return this.users.slice(0, this.pageSize); 
  }

  get pageNumbers() {
    const total = Math.ceil(this.totalRecords / this.pageSize);
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  addNew() {
    this.editingUser = null;
    this.form.reset({ role: 'chuyen_vien' });
    this.form.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.showForm = true;
  }

  editUser(u: any) {
    this.editingUser = u;
    this.form.reset({ 
      full_name: u.full_name, 
      email: u.email, 
      employee_code: u.employee_code, 
      role: u.role, 
      phone: u.phone, 
      position: u.position 
    });
    this.form.get('password')?.clearValidators();
    this.form.get('password')?.updateValueAndValidity();
    this.showForm = true;
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    
    const val: any = { ...this.form.value };
    if (this.editingUser && !val.password) delete val.password;

    const req = this.editingUser
      ? this.api.patch<any>(`users/${this.editingUser.id}`, val)
      : this.api.post<any>('users', val);

    req.subscribe({
      next: () => {
        this.showForm = false;
        this.load();
        this.loading = false;
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: this.editingUser ? 'Đã cập nhật tài khoản' : 'Đã tạo tài khoản mới' });
      },
      error: (err) => {
        this.loading = false;
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: err.error?.error?.message || 'Lỗi thao tác' });
      }
    });
  }

  deleteUser(id: string) {
    if (!confirm('Xác nhận xóa tài khoản này?')) return;
    this.api.delete<any>(`users/${id}`).subscribe(() => {
      this.load();
      this.messageService.add({ severity: 'info', summary: 'Đã xóa', detail: 'Tài khoản đã bị loại bỏ' });
    });
  }

  resetPwd(id: string) {
    if (!confirm('Reset mật khẩu về 123456?')) return;
    this.api.patch<any>(`users/${id}/reset-password`, {}).subscribe(() => {
      this.messageService.add({ severity: 'success', summary: 'Mật khẩu', detail: 'Đã reset về 123456' });
    });
  }

  getRoleBadge(role: string): string {
    const map: any = { admin: 'chip-danger', vu_truong: 'chip-success', vu_pho: 'chip-info', chuyen_vien: 'chip-neutral' };
    return map[role] || 'chip-neutral';
  }

  roleLabel(role: string): string {
    const r = this.roles.find(r => r.value === role);
    return r ? r.label : role;
  }
}
