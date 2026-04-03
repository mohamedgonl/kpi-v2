import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { DialogModule } from 'primeng/dialog';
import { CalendarModule } from 'primeng/calendar';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-admin-kpi-periods',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DialogModule, CalendarModule],
  templateUrl: './kpi-periods.component.html'
})
export class KpiPeriodsComponent implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);

  periods: any[] = [];
  showForm = false;
  loading = false;

  form = this.fb.group({
    name: ['', Validators.required],
    period_type: ['month', Validators.required],
    year: [new Date().getFullYear(), Validators.required],
    month: [new Date().getMonth() + 1],
    quarter: [null],
    start_date: ['', Validators.required],
    end_date: ['', Validators.required],
  });

  ngOnInit() { this.load(); }
  
  load() { 
    this.api.get<any>('kpi-periods').subscribe(res => { 
      this.periods = (res.data || []).sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()); 
    }); 
  }

  addNew() {
    this.form.reset({ 
      period_type: 'month', 
      year: new Date().getFullYear(), 
      month: new Date().getMonth() + 1 
    });
    this.showForm = true;
  }

  onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    this.api.post<any>('kpi-periods', this.form.value).subscribe({
      next: () => { 
        this.showForm = false; 
        this.load(); 
        this.loading = false;
        this.messageService.add({ severity: 'success', summary: 'Kỳ KPI', detail: 'Đã thiết lập kỳ đánh giá mới' });
      },
      error: (err) => { 
        this.loading = false; 
        this.messageService.add({ severity: 'error', summary: 'Lỗi', detail: err.error?.error?.message || 'Lỗi thao tác' });
      }
    });
  }

  setActive(id: string) {
    this.api.patch<any>(`kpi-periods/${id}`, { is_active: true }).subscribe(() => {
      this.load();
      this.messageService.add({ severity: 'success', summary: 'Kích hoạt', detail: 'Đã chuyển trạng thái kỳ hiện tại' });
    });
  }

  toggleLock(p: any) {
    this.api.patch<any>(`kpi-periods/${p.id}`, { is_locked: !p.is_locked }).subscribe(() => {
      this.load();
      this.messageService.add({ severity: 'info', summary: 'Khóa/Mở', detail: p.is_locked ? 'Đã mở khóa kỳ' : 'Đã khóa kỳ' });
    });
  }
}
