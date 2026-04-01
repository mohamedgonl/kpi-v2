/**
 * FRONTEND CONSTANTS
 * Dùng cho các tính toán hiển thị và logic đồng bộ với Backend
 */

export const UI_CONSTANTS = {
  KPI: {
    REWORK_PENALTY: 0.25,
    DELAY_PENALTY: 0.25,
  },
  AUTH: {
    TOKEN_KEY: 'kpi_auth_token',
    USER_KEY: 'kpi_user_data'
  },
  ROLES: [
    { label: 'Quản trị hệ thống', value: 'admin' },
    { label: 'Vụ trưởng', value: 'vu_truong' },
    { label: 'Vụ phó', value: 'vu_pho' },
    { label: 'Chuyên viên', value: 'chuyen_vien' }
  ]
};
