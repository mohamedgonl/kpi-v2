import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-admin-work-types',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule],
  templateUrl: './work-types.component.html'
})
export class WorkTypesComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  workGroups: any[] = [];
  workTypes: any[] = [];
  showForm = false;
  editingItem: any = null;
  loading = false;

  form = this.fb.group({
    group_id: ['', Validators.required],
    name: ['', Validators.required],
    product_type: [''],
    coefficient: [1.0, [Validators.required, Validators.min(0)]],
    sort_order: [0],
  });

  ngOnInit() {
    this.api.get<any>('work-groups').subscribe(res => { 
      this.workGroups = (res.data || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)); 
    });
    this.loadTypes();
  }

  loadTypes() {
    this.api.get<any>('work-types').subscribe(res => { 
      this.workTypes = (res.data || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)); 
    });
  }

  getTypesForGroup(gId: string) {
    return this.workTypes.filter(t => t.group_id === gId);
  }

  addNew() {
    this.editingItem = null;
    this.form.reset({ coefficient: 1.0, sort_order: 0 });
    this.showForm = true;
  }

  editItem(item: any) {
    this.editingItem = item;
    this.form.patchValue({ 
      group_id: item.group_id, 
      name: item.name, 
      product_type: item.product_type, 
      coefficient: item.coefficient, 
      sort_order: item.sort_order 
    });
    this.showForm = true;
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    const req = this.editingItem
      ? this.api.patch<any>(`work-types/${this.editingItem.id}`, this.form.value)
      : this.api.post<any>('work-types', this.form.value);
    
    req.subscribe({
      next: () => {
        this.showForm = false;
        this.loadTypes();
        this.loading = false;
        this.messageService.add({ severity: 'success', summary: 'Thành công', detail: 'Đã lưu loại công việc' });
      },
      error: (err) => {
        this.loading = false;
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: err.error?.error?.message || 'Lỗi thao tác' });
      }
    });
  }

  deleteItem(id: string) {
    if (!confirm('Xóa loại công việc này?')) return;
    this.api.delete<any>(`work-types/${id}`).subscribe(() => {
      this.loadTypes();
      this.messageService.add({ severity: 'info', summary: 'Đã xóa', detail: 'Loại công việc đã bị loại bỏ' });
    });
  }
}
