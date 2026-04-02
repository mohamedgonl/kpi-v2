import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
  selector: 'app-admin-work-groups',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DialogModule],
  templateUrl: './work-groups.component.html'
})
export class WorkGroupsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  workGroups: any[] = [];
  searchText = '';
  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;

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

  get filteredWorkGroups() {
    return this.workGroups;
  }

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

  load() {
    const params: any = {};
    if (this.searchText) params['search'] = this.searchText;
    this.api.get<any>('work-groups', params).subscribe(res => { 
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
