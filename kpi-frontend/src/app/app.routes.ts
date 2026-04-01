import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'tasks',
        loadComponent: () => import('./features/tasks/tasks.component').then(m => m.TasksComponent)
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent),
        canActivate: [roleGuard('admin', 'vu_truong', 'vu_pho')]
      },
      {
        path: 'admin/users',
        loadComponent: () => import('./features/admin/users/users.component').then(m => m.UsersComponent),
        canActivate: [roleGuard('admin')]
      },
      {
        path: 'admin/work-groups',
        loadComponent: () => import('./features/admin/work-groups/work-groups.component').then(m => m.WorkGroupsComponent),
        canActivate: [roleGuard('admin')]
      },
      {
        path: 'admin/work-types',
        loadComponent: () => import('./features/admin/work-types/work-types.component').then(m => m.WorkTypesComponent),
        canActivate: [roleGuard('admin')]
      },
      {
        path: 'admin/kpi-periods',
        loadComponent: () => import('./features/admin/kpi-periods/kpi-periods.component').then(m => m.KpiPeriodsComponent),
        canActivate: [roleGuard('admin')]
      },
    ]
  },
  { path: '**', redirectTo: '/dashboard' }
];
