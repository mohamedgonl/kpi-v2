/**
 * HỆ THỐNG KPI - PROJECT CONSTANTS
 * Chứa các hằng số phi bảo mật, dễ dàng thay đổi mà không cần can thiệp logic sâu
 */

export const APP_CONSTANTS = {
  VERSION: '2.0.0',
  AUTH: {
    JWT_EXPIRES_IN_DEFAULT: '7d',
    PASSWORD_DEFAULT: '123456',
  },
  KPI: {
    REWORK_PENALTY: 0.25,
    DELAY_PENALTY: 0.25,
  },
  ROLES: {
    ADMIN: 'admin',
    VU_TRUONG: 'vu_truong',
    VU_PHO: 'vu_pho',
    CHUYEN_VIEN: 'chuyen_vien',
  },
  UI: {
    COLORS: {
      PRIMARY: '#6366f1',
      SUCCESS: '#10b981',
      WARNING: '#f59e0b',
      DANGER: '#ef4444',
    }
  }
};
