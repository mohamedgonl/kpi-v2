import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
  selector: 'app-admin-work-types',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, DialogModule],
  templateUrl: './work-types.component.html'
})
export class WorkTypesComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  workGroups: any[] = [];
  workTypes: any[] = [];
  searchText = '';
  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;

  showForm = false;
  editingItem: any = null;
  loading = false;

  form = this.fb.group({
    group_id: ['', Validators.required],
    name: ['', Validators.required],
    coefficient: [1.0, [Validators.required, Validators.min(0)]],
    sort_order: [0],
  });

  ngOnInit() {
    this.api.get<any>('work-groups').subscribe(res => { 
      const items = res.data?.items ? res.data.items : (res.data || []);
      this.workGroups = items.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)); 
    });
    this.loadTypes();

    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged()
    ).subscribe(val => {
      this.searchText = val;
      this.loadTypes();
    });
  }

  ngOnDestroy() {
    this.searchSubscription?.unsubscribe();
  }

  onSearchChange(val: string) {
    this.searchSubject.next(val);
  }

  loadTypes() {
    const params: any = {
      page: this.currentPage,
      limit: this.pageSize,
      sortBy: this.sortBy,
      sortDesc: this.sortDesc
    };
    if (this.searchText) params['search'] = this.searchText;
    
    if (this.filters.name) params['filters[name]'] = this.filters.name;
    if (this.filters.group_id) params['filters[group_id]'] = this.filters.group_id;
    if (this.filters.coefficient) params['filters[coefficient]'] = this.filters.coefficient;

    this.api.get<any>('work-types', params).subscribe(res => { 
      if (res.data && res.data.items) {
        this.workTypes = res.data.items || [];
        this.totalRecords = res.data.total || 0;
      } else {
        this.workTypes = res.data || []; 
        this.totalRecords = this.workTypes.length;
      }
    });
  }

  currentPage = 1;
  pageSize = 10;
  Math = Math;
  
  sortBy = 'sort_order';
  sortDesc = false;
  totalRecords = 0;
  filters: any = {};

  onSort(field: string) {
    if (this.sortBy === field) {
      this.sortDesc = !this.sortDesc;
    } else {
      this.sortBy = field;
      this.sortDesc = false;
    }
    this.currentPage = 1;
    this.loadTypes();
  }

  onFilterChange(field: string, val: string) {
    this.filters[field] = val;
    this.currentPage = 1;
    this.loadTypes();
  }

  get pagedWorkTypes() {
    if (this.workTypes.length <= this.pageSize && this.totalRecords >= this.workTypes.length) return this.workTypes;
    const start = (this.currentPage - 1) * this.pageSize;
    return this.workTypes.slice(start, start + this.pageSize);
  }

  get pageNumbers() {
    const total = Math.ceil(this.totalRecords / this.pageSize);
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  getGroupInfo(gId: string) {
    return this.workGroups.find(g => g.id === gId);
  }

  getGroupName(gId: string) {
    const g = this.getGroupInfo(gId);
    return g ? `${g.code} - ${g.name}` : 'Không rõ';
  }

  addNew(groupId: string = '') {
    this.editingItem = null;
    this.form.reset({ group_id: groupId, coefficient: 1, sort_order: 0 });
    this.showForm = true;
  }

  editItem(item: any) {
    this.editingItem = item;
    this.form.patchValue({
      group_id: item.group_id,
      name: item.name,
      coefficient: item.coefficient,
      sort_order: item.sort_order
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
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: 'Không thể lưu dữ liệu' });
      }
    });
  }

  deleteItem(id: string) {
    if (!confirm('Xóa loại công việc này?')) return;
    this.api.delete<any>(`work-types/${id}`).subscribe({
      next: () => {
        this.loadTypes();
        this.messageService.add({ severity: 'info', summary: 'Thông báo', detail: 'Đã xóa loại công việc' });
      }
    });
  }
}
