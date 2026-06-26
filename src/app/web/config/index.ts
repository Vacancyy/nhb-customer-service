// 应用配置

// basePath（与 next.config.mjs 保持一致）
export const BASE_PATH = '/nhb-customer-service';

// API 基础路径
export const API_BASE_URL = `${BASE_PATH}/api/app-api`;
export const ADMIN_API_BASE_URL = `${BASE_PATH}/api/admin-api`;

// WebSocket 基础路径（HTTPS 页面必须用 wss://，否则浏览器会阻止混合内容）
export const WS_BASE_URL = `${typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'}://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}${BASE_PATH}/ws`;

// 页面路径
export const PAGE_PATHS = {
  chat: `${BASE_PATH}/web/app/chat`,
  verify: `${BASE_PATH}/web/app/verify`,
  root: `${BASE_PATH}/web/app`,
  admin: `${BASE_PATH}/web/admin`,
  adminReview: `${BASE_PATH}/web/admin/review`,
  adminRecords: `${BASE_PATH}/web/admin/records`,
};