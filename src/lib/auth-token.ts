import crypto from 'crypto';
import { logError } from './logger';

/**
 * AES Token 加解密模块
 * 用于加密 userId 生成 token，前端在请求头携带
 */

// 密钥：32字节（256位），从环境变量获取或使用默认密钥
const DEFAULT_KEY = 'nhb_customer_service_default_key_32b!'; // 32字节
const AUTH_TOKEN_KEY = process.env.AUTH_TOKEN_KEY || DEFAULT_KEY;

// 确保密钥长度为32字节
function getKey(): Buffer {
  const key = AUTH_TOKEN_KEY;
  if (key.length < 32) {
    // 补齐到32字节
    return Buffer.from(key.padEnd(32, '0'));
  }
  if (key.length > 32) {
    // 截取前32字节
    return Buffer.from(key.slice(0, 32));
  }
  return Buffer.from(key);
}

/**
 * 加密 userId 生成 token
 * AES-256-CBC 模式，IV 随机生成，与密文一起存储
 * 格式：Base64(iv + ciphertext)，使用 URL-safe 编码
 *
 * @param userId 用户ID
 * @returns 加密后的 token（URL-safe Base64）
 */
export function generateToken(userId: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(16); // 16字节 IV

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

  // 加密 userId
  let encrypted = cipher.update(userId, 'utf8', 'binary');
  encrypted += cipher.final('binary');

  // 组合 iv + ciphertext
  const combined = Buffer.concat([iv, Buffer.from(encrypted, 'binary')]);

  // 返回 URL-safe Base64 编码（替换 + 为 -，/ 为 _，移除 =）
  return combined.toString('base64url');
}

/**
 * 解析 token 返回 userId
 * 支持标准 Base64 和 URL-safe Base64 格式
 *
 * @param token 加密后的 token
 * @returns userId 或 null（解析失败）
 */
export function parseToken(token: string): string | null {
  try {
    const key = getKey();

    // 处理 URL 中可能出现的空格（+ 号被解码为空格）
    // 同时兼容 URL-safe Base64（- 替换为 +，_ 替换为 /）
    const normalizedToken = token
      .replace(/\s/g, '+')  // URL 中 + 会变成空格，还原
      .replace(/-/g, '+')   // URL-safe Base64 的 - 还原为 +
      .replace(/_/g, '/');  // URL-safe Base64 的 _ 还原为 /

    // 补齐可能缺失的 = 填充
    const paddedToken = normalizedToken + '='.repeat((4 - normalizedToken.length % 4) % 4);

    // Base64 解码
    const combined = Buffer.from(paddedToken, 'base64');

    // 分离 iv 和 ciphertext
    const iv = combined.slice(0, 16);
    const ciphertext = combined.slice(16);

    // 解密
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logError('[auth-token] Token 解析失败', error);
    return null;
  }
}

/**
 * 从 Authorization header 解析 userId
 *
 * @param authHeader Authorization header 值（如 "Bearer xxx"）
 * @returns userId 或 null
 */
export function extractUserIdFromHeader(authHeader: string | null | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // 支持 "Bearer xxx" 格式
  const parts = authHeader.split(' ');
  const token = parts.length === 2 ? parts[1] : authHeader;

  return parseToken(token);
}