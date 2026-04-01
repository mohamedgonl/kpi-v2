import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule],
  templateUrl: './users.component.html'
})
export class UsersComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  users: any[] = [];
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

  ngOnInit() { this.load(); }

  load() {
    this.api.get<any>('users').subscribe(res => { this.users = res.data || []; });
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
    
    // Remove empty password if editing
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
