// 应用配置

// basePath（与 next.config.mjs 保持一致）
export const BASE_PATH = '/nhb-customer-service';

// API 基础路径
export const API_BASE_URL = `${BASE_PATH}/api/app-api`;
export const ADMIN_API_BASE_URL = `${BASE_PATH}/api/admin-api`;

// 页面路径
export const PAGE_PATHS = {
  chat: `${BASE_PATH}/web/app/chat`,
  verify: `${BASE_PATH}/web/app/verify`,
  root: `${BASE_PATH}/web/app`,
  admin: `${BASE_PATH}/web/admin`,
  adminReview: `${BASE_PATH}/web/admin/review`,
};