// 秒信短信 SDK - Node.js 版本
// 基于 miaoxin-java-sdk-1.0.0.jar 反编译分析

import crypto from 'crypto';
import { logInfo, logError } from './logger';

// 秒信短信配置
const MIAOXIN_SERVER = process.env.MIAOXIN_SERVER || '';
const MIAOXIN_ACCOUNT = process.env.MIAOXIN_ACCOUNT || '';
const MIAOXIN_SECRET = process.env.MIAOXIN_SECRET || '';

// 判断是否为本地环境（本地环境不发送短信）
function isLocalEnvironment(): boolean {
  // 通过 APP_ENV 环境变量判断（更灵活）
  // local/development = 本地环境，不发送短信
  // stage/production = 测试/生产环境，发送短信
  const appEnv = process.env.APP_ENV || '';
  if (appEnv === 'local' || appEnv === 'development') {
    return true;
  }
  // 如果设置了 APP_ENV 为 stage 或 prod，则发送短信
  if (appEnv === 'stage' || appEnv === 'prod') {
    return false;
  }
  // 默认：未设置 APP_ENV 时，根据 NODE_ENV 判断
  // 但 TypeScript 限制了 NODE_ENV 类型，所以默认返回 true（本地环境）
  return true;
}

// 模拟发送短信结果
function mockSendResult(mobiles: string, content: string): SendResult {
  logInfo('[Miaoxin] 本地环境模拟发送短信', { mobiles, content });
  return { code: 0, msg: '本地环境模拟发送成功', orderId: 'mock-order-id' };
}

// 接口路径
const API_PATHS = {
  SEND: '/sms/send',
  SEND_FIXED_SIGNATURE: '/sms/sendFixedSignature',
  SEND_TEMPLATE: '/sms/sendTemplateParamd',
  CHECK: '/sms/check',
  BALANCE: '/account/getBalance',
};

// 生成时间戳（格式：yyyyMMddHHmmss）
function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hour}${minute}${second}`;
}

// SHA1 加密
function sha1(input: string): string {
  return crypto.createHash('sha1').update(input, 'utf8').digest('hex');
}

// 构建请求参数
function buildRequestParams(
  params: Record<string, string>,
  account: string,
  secret: string
): string {
  const ts = generateTimestamp();
  const secretContent = `account=${account}&ts=${ts}&secret=${secret}`;
  const token = sha1(secretContent);

  logInfo('[Miaoxin] 构建参数', { account, ts, secretContent, token });

  // 添加认证参数
  const allParams = {
    ...params,
    account,
    ts,
    token,
  };

  // 构建 URL 编码的请求体
  const encodedParams = Object.entries(allParams)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return encodedParams;
}

// POST 请求
async function post(url: string, body: string): Promise<string> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const responseText = await response.text();
  logInfo('[Miaoxin] 收到响应', { status: response.status, body: responseText });
  if (!response.ok) {
    throw new Error(`秒信 API 调用失败: ${response.status} ${response.statusText}`);
  }
  return responseText;
}

// ========== 短信发送接口 ==========

interface SendResult {
  code: number;
  msg: string;
  orderId?: string; // 短信发送成功后返回的订单ID
}

// 发送短信（普通短信）
export async function sendSMS(
  mobiles: string,
  content: string,
  ref?: string,
  ext?: string
): Promise<SendResult> {
  const server = MIAOXIN_SERVER;
  const account = MIAOXIN_ACCOUNT;
  const secret = MIAOXIN_SECRET;

  if (!server || !account || !secret) {
    throw new Error('秒信短信配置缺失，请检查环境变量 MIAOXIN_SERVER、MIAOXIN_ACCOUNT、MIAOXIN_SECRET');
  }

  // 本地环境不发送短信，返回模拟结果
  if (isLocalEnvironment()) {
    return mockSendResult(mobiles, content);
  }

  const params: Record<string, string> = {
    mobiles,
    content,
  };

  if (ref) params.ref = ref;
  if (ext) params.ext = ext;

  const url = `${server}${API_PATHS.SEND}`;
  const body = buildRequestParams(params, account, secret);

  try {
    const response = await post(url, body);
    // 解析响应（格式通常是 JSON 或特定格式）
    const result = JSON.parse(response);
    return {
      code: result.code || 0,
      msg: result.msg || response,
      orderId: result.orderId || result.orderIds,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '发送失败';
    const stack = error instanceof Error ? error.stack : '';
    logError(`[Miaoxin] sendSMS error: ${errMsg}\n${stack}`);
    return { code: -1, msg: errMsg };
  }
}

// 发送固定签名短信
export async function sendFixedSignatureSMS(
  mobiles: string,
  content: string,
  signatureId: string,
  ref?: string,
  ext?: string
): Promise<SendResult> {
  const server = MIAOXIN_SERVER;
  const account = MIAOXIN_ACCOUNT;
  const secret = MIAOXIN_SECRET;

  if (!server || !account || !secret) {
    throw new Error('秒信短信配置缺失');
  }

  // 本地环境不发送短信，返回模拟结果
  if (isLocalEnvironment()) {
    return mockSendResult(mobiles, content);
  }

  const params: Record<string, string> = {
    mobiles,
    content,
    signatureId,
  };

  if (ref) params.ref = ref;
  if (ext) params.ext = ext;

  const url = `${server}${API_PATHS.SEND_FIXED_SIGNATURE}`;
  const body = buildRequestParams(params, account, secret);

  try {
    const response = await post(url, body);
    const result = JSON.parse(response);
    return {
      code: result.code || 0,
      msg: result.msg || response,
      orderId: result.orderId || result.orderIds,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '发送失败';
    const stack = error instanceof Error ? error.stack : '';
    logError(`[Miaoxin] sendFixedSignatureSMS error: ${errMsg}\n${stack}`);
    return { code: -1, msg: errMsg };
  }
}

// 发送模板短信
export async function sendTemplateSMS(
  mobiles: string,
  templateId: string,
  params: string[],
  ref?: string,
  ext?: string
): Promise<SendResult> {
  const server = MIAOXIN_SERVER;
  const account = MIAOXIN_ACCOUNT;
  const secret = MIAOXIN_SECRET;

  if (!server || !account || !secret) {
    throw new Error('秒信短信配置缺失');
  }

  // 本地环境不发送短信，返回模拟结果
  if (isLocalEnvironment()) {
    return mockSendResult(mobiles, `模板:${templateId}, 参数:${params.join(',')}`);
  }

  const requestParams: Record<string, string> = {
    mobiles,
    templateId,
  };

  // 添加模板参数 param0, param1, ...
  params.forEach((value, index) => {
    requestParams[`param${index}`] = value;
  });

  if (ref) requestParams.ref = ref;
  if (ext) requestParams.ext = ext;

  const url = `${server}${API_PATHS.SEND_TEMPLATE}`;
  const body = buildRequestParams(requestParams, account, secret);

  try {
    const response = await post(url, body);
    const result = JSON.parse(response);
    return {
      code: result.code || 0,
      msg: result.msg || response,
      orderId: result.orderId || result.orderIds,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '发送失败';
    const stack = error instanceof Error ? error.stack : '';
    logError(`[Miaoxin] sendTemplateSMS error: ${errMsg}\n${stack}`);
    return { code: -1, msg: errMsg };
  }
}

// 查询短信状态
export async function checkSMS(orderIds: string): Promise<SendResult> {
  const server = MIAOXIN_SERVER;
  const account = MIAOXIN_ACCOUNT;
  const secret = MIAOXIN_SECRET;

  if (!server || !account || !secret) {
    throw new Error('秒信短信配置缺失');
  }

  const params: Record<string, string> = {
    orderIds,
  };

  const url = `${server}${API_PATHS.CHECK}`;
  const body = buildRequestParams(params, account, secret);

  try {
    const response = await post(url, body);
    const result = JSON.parse(response);
    return {
      code: result.code || 0,
      msg: result.msg || response,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '查询失败';
    const stack = error instanceof Error ? error.stack : '';
    logError(`[Miaoxin] checkSMS error: ${errMsg}\n${stack}`);
    return { code: -1, msg: errMsg };
  }
}

// 查询账户余额
export async function getBalance(): Promise<string> {
  const server = MIAOXIN_SERVER;
  const account = MIAOXIN_ACCOUNT;
  const secret = MIAOXIN_SECRET;

  if (!server || !account || !secret) {
    throw new Error('秒信短信配置缺失');
  }

  const url = `${server}${API_PATHS.BALANCE}`;
  const body = buildRequestParams({}, account, secret);

  try {
    return await post(url, body);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '查询失败';
    const stack = error instanceof Error ? error.stack : '';
    logError(`[Miaoxin] getBalance error: ${errMsg}\n${stack}`);
    throw error;
  }
}

// 导出配置常量（供测试或手动配置使用）
export const MiaoxinConfig = {
  server: MIAOXIN_SERVER,
  account: MIAOXIN_ACCOUNT,
  secret: MIAOXIN_SECRET,
};