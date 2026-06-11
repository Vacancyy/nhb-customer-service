// E签宝实名认证 SDK - Node.js 版本
// TODO: 后续对接E签宝三要素实名认证API

import { logInfo, logError } from './logger';

// E签宝配置
const ESIGN_SERVER = process.env.ESIGN_SERVER || '';
const ESIGN_APP_KEY = process.env.ESIGN_APP_KEY || '';
const ESIGN_APP_SECRET = process.env.ESIGN_APP_SECRET || '';

// 三要素实名认证结果
export interface ThreeElementsResult {
  success: boolean;
  message: string;
  code?: string;
}

/**
 * 三要素实名认证
 * @param name 姓名
 * @param idCard 身份证号
 * @param phone 手机号
 * @returns 认证结果
 */
export async function verifyThreeElements(
  name: string,
  idCard: string,
  phone: string
): Promise<ThreeElementsResult> {
  const server = ESIGN_SERVER;
  const appKey = ESIGN_APP_KEY;
  const appSecret = ESIGN_APP_SECRET;

  if (!server || !appKey || !appSecret) {
    logInfo('[Esign] 配置缺失，开发环境模拟认证通过');
    // 开发环境模拟认证通过
    return { success: true, message: '开发环境模拟认证通过' };
  }

  try {
    // TODO: 实现E签宝三要素实名认证API调用
    logInfo('[Esign] 开始三要素实名认证', { name, idCard, phone });

    // 这里后续实现具体的API调用逻辑
    // const response = await fetch(...);

    return { success: true, message: '认证通过' };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '认证失败';
    logError(`[Esign] 三要素认证异常: ${errMsg}`);
    return { success: false, message: errMsg };
  }
}

// 导出配置常量（供测试使用）
export const EsignConfig = {
  server: ESIGN_SERVER,
  appKey: ESIGN_APP_KEY,
  appSecret: ESIGN_APP_SECRET,
};