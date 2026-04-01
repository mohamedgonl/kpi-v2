import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  roles?: string[];
}

import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ToastModule],
  templateUrl: './shell.component.html'
})
export class ShellComponent {
  auth = inject(AuthService);

  mainNav: NavItem[] = [
    { label: 'Dashboard', icon: 'pi-chart-bar', route: '/dashboard' },
    { label: 'Công việc của tôi', icon: 'pi-list-check', route: '/tasks' },
    { label: 'Báo cáo KPI', icon: 'pi-file-export', route: '/reports', roles: ['admin', 'vu_truong', 'vu_pho'] },
  ];

  adminNav: NavItem[] = [
    { label: 'Quản lý tài khoản', icon: 'pi-users', route: '/admin/users' },
    { label: 'Nhóm công việc', icon: 'pi-folder', route: '/admin/work-groups' },
    { label: 'Loại công việc', icon: 'pi-sitemap', route: '/admin/work-types' },
    { label: 'Kỳ KPI', icon: 'pi-calendar', route: '/admin/kpi-periods' },
  ];

  canSeeNav(item: NavItem): boolean {
    if (!item.roles) return true;
    return this.auth.hasRole(...item.roles);
  }

  get userInitials(): string {
    const name = this.auth.currentUser?.full_name || '';
    return name.split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();
  }

  get roleLabel(): string {
    const map: Record<string, string> = {
      admin: 'Quản trị viên',
      vu_truong: 'Vụ trưởng',
      vu_pho: 'Vụ phó',
      chuyen_vien: 'Chuyên viên',
    };
    return map[this.auth.currentUser?.role || ''] || '';
  }
}
