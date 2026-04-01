import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-admin-work-groups',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule],
  templateUrl: './work-groups.component.html'
})
export class WorkGroupsComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  workGroups: any[] = [];
  showForm = false;
  editingItem: any = null;
  loading = false;

  form = this.fb.group({
    name: ['', Validators.required],
    code: ['', Validators.required],
    description: [''],
    color_hex: ['#3b82f6'],
    sort_order: [0],
  });

  ngOnInit() { this.load(); }
  
  load() { 
    this.api.get<any>('work-groups').subscribe(res => { 
      this.workGroups = (res.data || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)); 
    }); 
  }

  addNew() {
    this.editingItem = null;
    this.form.reset({ color_hex: '#3b82f6', sort_order: 0 });
    this.showForm = true;
  }

  editItem(g: any) {
    this.editingItem = g;
    this.form.patchValue({ 
      code: g.code, 
      name: g.name, 
      description: g.description, 
      color_hex: g.color_hex, 
      sort_order: g.sort_order 
    });
    this.showForm = true;
  }

  onSubmit() {
    if (this.form.invalid) { 
      this.form.markAllAsTouched(); 
      return; 
    }
    this.loading = true;
    const req = this.editingItem
      ? this.api.patch<any>(`work-groups/${this.editingItem.id}`, this.form.value)
      : this.api.post<any>('work-groups', this.form.value);
    
    req.subscribe({
      next: () => { 
        this.showForm = false; 
        this.load(); 
        this.loading = false;
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: this.editingItem ? 'Đã cập nhật nhóm công việc' : 'Đã thêm nhóm công việc mới' });
      },
      error: (err) => { 
        this.loading = false; 
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: err.error?.error?.message || 'Không thể lưu dữ liệu' });
      }
    });
  }

  deleteItem(id: string) {
    if (!confirm('Xóa nhóm công việc này?')) return;
    this.api.delete<any>(`work-groups/${id}`).subscribe({
      next: () => {
        this.load();
        this.messageService.add({ severity: 'info', summary: 'Thông báo', detail: 'Đã xóa nhóm công việc' });
      },
      error: (err) => {
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Không thể xóa dữ liệu' });
      }
    });
  }
}
