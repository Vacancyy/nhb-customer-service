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

// 存储验证码 - 方法A（Redis，5分钟过期）
export async function storeCodeA(phone: string, code: string, ttlSeconds: number = 5 * 60): Promise<void> {
  const client = getRedisClient();
  const key = `${REDIS_KEY_PREFIX.VERIFY_CODE_A}${phone}`;
  const data = JSON.stringify({ code, type: 'A' });

  try {
    await client.setex(key, ttlSeconds, data);
  } catch (error) {
    console.error('Failed to store code A:', error);
  }
}

// 验证码校验 - 方法A
export async function verifyCodeA(phone: string, code: string): Promise<boolean> {
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
    console.error('Failed to verify code A:', error);
    return false;
  }
}

// ========== 方法B - 实名短信（未实名用户） ==========

// 存储验证码 - 方法B（Redis，5分钟过期）
export async function storeCodeB(phone: string, code: string, ttlSeconds: number = 5 * 60): Promise<void> {
  const client = getRedisClient();
  const key = `${REDIS_KEY_PREFIX.VERIFY_CODE_B}${phone}`;
  const data = JSON.stringify({ code, type: 'B' });

  try {
    await client.setex(key, ttlSeconds, data);
  } catch (error) {
    console.error('Failed to store code B:', error);
  }
}

// 验证码校验 - 方法B
export async function verifyCodeB(phone: string, code: string): Promise<boolean> {
  const client = getRedisClient();
  const key = `${REDIS_KEY_PREFIX.VERIFY_CODE_B}${phone}`;

  try {
    const data = await client.get(key);
    if (!data) return false;

    const stored = JSON.parse(data) as VerificationCode;
    if (stored.code !== code) return false;

    // 验证成功后删除
    await client.del(key);
    return true;
  } catch (error) {
    console.error('Failed to verify code B:', error);
    return false;
  }
}

// ========== 短信发送接口 ==========

// 方法A - 发送普通短信（调用秒信短信接口）
export async function sendSMS_A(phone: string, code: string): Promise<boolean> {
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

// 方法B - 发送实名短信（TODO: 后续对接实名短信接口）
export async function sendSMS_B(phone: string, code: string): Promise<boolean> {
  // TODO: 调用实名短信接口（需要三要素验证的短信）
  // 示例: await smsService.sendWithAuth(phone, `您的验证码是${code}，5分钟内有效`);
  console.log(`[SMS_B] 发送实名短信到 ${phone}, 验证码: ${code}`);
  return true;
}

// ========== 三要素实名认证接口（TODO: 后续对接具体接口） ==========

interface ThreeElementsResult {
  success: boolean;
  message: string;
}

export async function verifyThreeElements(
  name: string,
  idCard: string,
  phone: string
): Promise<ThreeElementsResult> {
  // TODO: 调用第三方三要素实名认证接口
  // 示例:
  // const response = await fetch('https://api.example.com/verify', {
  //   method: 'POST',
  //   body: JSON.stringify({ name, idCard, phone })
  // });
  // return response.json();

  // 开发环境默认返回成功
  console.log(`[ThreeElements] 验证三要素: ${name}, ${idCard}, ${phone}`);
  return { success: true, message: '验证通过' };
}