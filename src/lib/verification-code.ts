// 验证码缓存服务 - 使用 Redis

import { getRedisClient, REDIS_KEY_PREFIX } from './redis';
import { sendSMS } from './miaoxin-sdk';
import { logInfo, logError } from './logger';

interface VerificationCode {
  code: string;
  type: 'A' | 'B';
}

// 生成 6 位随机验证码
export function generateCode(): string {
  // 测试环境默认验证码
  if (process.env.NODE_ENV !== 'production') {
    return '888888';
  }
  return Math.random().toString().slice(2, 8);
}

// ========== 方法A - 普通短信（已实名用户） ==========

// 存储验证码 - 秒信短信（Redis，5分钟过期）
export async function storeCodeMiaoXin(phone: string, code: string, ttlSeconds: number = 5 * 60): Promise<void> {
  const client = getRedisClient();
  const key = `${REDIS_KEY_PREFIX.VERIFY_CODE_A}${phone}`;
  const data = JSON.stringify({ code, type: 'A' });

  try {
    await client.setex(key, ttlSeconds, data);
  } catch (error) {
    logError('存储验证码A失败', error);
  }
}

// 验证码校验 - 秒信短信
export async function verifyCodeMiaoXin(phone: string, code: string): Promise<boolean> {
  const client = getRedisClient();
  const key = `${REDIS_KEY_PREFIX.VERIFY_CODE_A}${phone}`;

  try {
    const data = await client.get(key);
    if (!data) return false;

    const stored = JSON.parse(data) as VerificationCode;
    if (stored.code !== code) return false;

    // 验证成功后删除
    await client.del(key);
    return true;
  } catch (error) {
    logError('验证码A校验失败', error);
    return false;
  }
}
// ========== 短信发送接口 ==========

// 秒信短信 - 发送普通短信（调用秒信短信接口）
export async function sendSMSMiaoXin(phone: string, code: string): Promise<boolean> {
  try {
    const content = `【智慧医疗】您的验证码是${code}，5分钟内有效，请勿泄露给他人，拒收请回复R`;
    const result = await sendSMS(phone, content);

    if (result.code === 0) {
      logInfo('[SMS_A] 发送成功', { phone, orderId: result.orderId });
      return true;
    } else {
      logError('[SMS_A] 发送失败', { phone, code: result.code, msg: result.msg });
      return false;
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '发送失败';
    logError(`[SMS_A] 发送异常: ${errMsg}`);
    return false;
  }
}


// ========== 三要素认证数据存储 ==========

// 存储三要素认证返回的数据（Redis，5分钟过期）
export async function storeThreeElementsData(phone: string, data: unknown, ttlSeconds: number = 5 * 60): Promise<void> {
  const client = getRedisClient();
  const key = `${REDIS_KEY_PREFIX.THREE_ELEMENTS_DATA}${phone}`;

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(data));
  } catch (error) {
    logError('存储三要素认证数据失败', error);
  }
}

// 获取三要素认证数据
export async function getThreeElementsData(phone: string): Promise<unknown | null> {
  const client = getRedisClient();
  const key = `${REDIS_KEY_PREFIX.THREE_ELEMENTS_DATA}${phone}`;

  try {
    const data = await client.get(key);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    logError('获取三要素认证数据失败', error);
    return null;
  }
}

// ========== 三要素实名认证接口（TODO: 后续对接具体接口） ==========

interface ThreeElementsResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export async function verifyThreeElementsStart(
  name: string,
  idCard: string,
  phone: string
): Promise<ThreeElementsResult> {
  const verifyUrl = process.env.THREE_ELEMENTS_VERIFY_URL + '/authStart';
  if (!verifyUrl) {
    logError('[ThreeElements] 未配置三要素验证接口地址');
    return { success: false, message: '系统配置错误' };
  }

  try {
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, credentialType: 'IDENTITY_CARD', credentialNumber: idCard, mobile: phone, productSetCode: 'ninghuibaoV6' })
    });
    const result = await response.json();
    if (result.code === 0) {
      return { success: true, message: '验证通过', data: result.data };
    } else {
      return { success: false, message: result.msg || result.message || '验证失败' };
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '验证失败';
    logError(`[ThreeElements] 验证异常: ${errMsg}`);
    return { success: false, message: errMsg };
  }
}


// 验证码校验 - 方法B
export async function verifyThreeElementsResult(flowId: string, code: string): Promise<boolean> {
  const verifyUrl = process.env.THREE_ELEMENTS_VERIFY_URL + '/checkAuthStatus';
  if (!verifyUrl) {
    logError('[ThreeElements] 未配置三要素验证接口地址');
    return false;
  }
  logInfo("[ThreeElements] submit " , { flowId, code })
  try {
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flowId, authCode: code,  productSetCode: 'ninghuibaoV6' })
    });
    const result = await response.json();
    if (result.code === 0) {
      return true;
    }
    logError(`[ThreeElements] 验证异常: ` , result.message);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '验证失败';
    logError(`[ThreeElements] 验证异常: ${errMsg}`);
  }
  return false;
}