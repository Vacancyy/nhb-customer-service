import crypto from 'crypto';
import NodeRSA from 'node-rsa';

/**
 * RSA 加解密工具
 * 使用 Node.js 内置 crypto 模块
 *
 * 注意：Node.js v22+ 不支持 PKCS#1 v1.5 解密，需使用 node-rsa 库兼容 Java/Hutool
 */

// 默认密钥长度（位）
const DEFAULT_KEY_SIZE = 2048;

// 默认公钥格式
const DEFAULT_PUBLIC_KEY_FORMAT = 'pkcs8';

// 默认私钥格式
const DEFAULT_PRIVATE_KEY_FORMAT = 'pkcs8';

/**
 * 格式化密钥（添加 PEM 头部）
 * @param key 密钥内容（可能缺少 PEM 头部）
 * @param type 密钥类型：public 或 private
 * @param format 密钥格式：pkcs1 或 pkcs8
 * @returns PEM 格式的密钥
 */
function formatKey(key: string, type: 'public' | 'private', format: 'pkcs1' | 'pkcs8' = 'pkcs8'): string {
  // 如果已经有 PEM 头部，直接返回
  if (key.includes('-----BEGIN')) {
    return key;
  }

  // 清理 Base64 内容（移除空白）
  const cleanKey = key.replace(/\s+/g, '');

  // 添加 PEM 头部
  if (type === 'public') {
    const header = format === 'pkcs1' ? '-----BEGIN RSA PUBLIC KEY-----' : '-----BEGIN PUBLIC KEY-----';
    const footer = format === 'pkcs1' ? '-----END RSA PUBLIC KEY-----' : '-----END PUBLIC KEY-----';
    return `${header}\n${cleanKey}\n${footer}`;
  } else {
    const header = format === 'pkcs1' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PRIVATE KEY-----';
    const footer = format === 'pkcs1' ? '-----END RSA PRIVATE KEY-----' : '-----END PRIVATE KEY-----';
    return `${header}\n${cleanKey}\n${footer}`;
  }
}

/**
 * 检测密钥格式
 * @param key 密钥内容
 * @returns pkcs1 或 pkcs8
 */
function detectKeyFormat(key: string): 'pkcs1' | 'pkcs8' {
  // 如果有 PEM 头部，根据头部判断
  if (key.includes('BEGIN RSA PRIVATE KEY') || key.includes('BEGIN RSA PUBLIC KEY')) {
    return 'pkcs1';
  }
  if (key.includes('BEGIN PRIVATE KEY') || key.includes('BEGIN PUBLIC KEY')) {
    return 'pkcs8';
  }

  // 裸 Base64：解码第一个字节判断
  const cleanKey = key.replace(/\s+/g, '').replace(/-----.*-----/g, '');
  try {
    const buffer = Buffer.from(cleanKey.slice(0, 4), 'base64');
    // DER 编码：0x30 表示 SEQUENCE (PKCS#8)，0x02 表示 INTEGER (PKCS#1)
    // 实际上 PKCS#1 私钥也以 SEQUENCE 开头，需要更精确判断
    // PKCS#8: SEQUENCE { version INTEGER(0), privateKeyAlgorithm SEQUENCE, privateKey OCTET STRING }
    // PKCS#1: SEQUENCE { version INTEGER(0), modulus INTEGER, ... }

    // 更可靠的方法：检查特定偏移
    // PKCS#1 1024位私钥特征：MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJdAgEAAoGBAKKx
    // 这实际上是 PKCS#8 格式的特征（包含 OID）
    if (cleanKey.includes('MIICdwIBADANBgkqhkiG9w0BAQEFAASCAmEwggJd')) {
      return 'pkcs8'; // 这是 PKCS#8，包含 RSA OID
    }

    // 检查是否包含标准 RSA OID 标识
    if (cleanKey.includes('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A')) {
      return 'pkcs8'; // 公钥 OID
    }

    // 默认返回 pkcs8（更常见的格式）
    return 'pkcs8';
  } catch {
    return 'pkcs8';
  }
}

/**
 * 生成 RSA 密钥对
 * @param options 配置选项
 * @returns { publicKey, privateKey }
 */
export function generateKeyPair(options?: {
  keySize?: number;
  publicKeyFormat?: 'pkcs1' | 'pkcs8' | 'der';
  privateKeyFormat?: 'pkcs1' | 'pkcs8' | 'der';
}): { publicKey: string; privateKey: string } {
  const keySize = options?.keySize || DEFAULT_KEY_SIZE;
  const publicKeyFormat = options?.publicKeyFormat || DEFAULT_PUBLIC_KEY_FORMAT;
  const privateKeyFormat = options?.privateKeyFormat || DEFAULT_PRIVATE_KEY_FORMAT;

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: keySize,
    publicKeyEncoding: {
      type: publicKeyFormat === 'pkcs1' ? 'pkcs1' : 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: privateKeyFormat === 'pkcs1' ? 'pkcs1' : 'pkcs8',
      format: 'pem',
    },
  });

  return { publicKey, privateKey };
}

/**
 * 公钥加密
 * @param data 待加密数据（字符串或 Buffer）
 * @param publicKey 公钥（PEM 格式或裸 Base64）
 * @param options 加密选项
 * @returns 加密后的数据
 */
export function encrypt(
  data: string | Buffer,
  publicKey: string,
  options?: {
    padding?: 'pkcs1' | 'oaep';
    outputEncoding?: crypto.Encoding;
  }
): string {
  const padding = options?.padding || 'oaep';
  const outputEncoding = options?.outputEncoding || 'base64';
  const bufferData = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

  // 格式化公钥
  const keyFormat = detectKeyFormat(publicKey);
  const formattedKey = formatKey(publicKey, 'public', keyFormat);

  const encrypted = crypto.publicEncrypt(
    {
      key: formattedKey,
      padding: padding === 'pkcs1' ? crypto.constants.RSA_PKCS1_PADDING : crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    bufferData
  );

  return encrypted.toString(outputEncoding);
}

/**
 * 私钥解密
 * @param encryptedData 加密数据（base64 或其他编码）
 * @param privateKey 私钥（PEM 格式或裸 Base64）
 * @param options 解密选项
 * @returns 解密后的原始数据
 */
export function decrypt(
  encryptedData: string,
  privateKey: string,
  options?: {
    padding?: 'pkcs1' | 'oaep';
    inputEncoding?: crypto.Encoding;
  }
): string {
  const padding = options?.padding || 'oaep'; // 默认 OAEP，兼容 Node.js 22+
  const inputEncoding = options?.inputEncoding || 'base64';
  const bufferData = Buffer.from(encryptedData, inputEncoding);

  // 检测并格式化私钥
  const keyFormat = detectKeyFormat(privateKey);
  const formattedKey = formatKey(privateKey, 'private', keyFormat);

  const decrypted = crypto.privateDecrypt(
    {
      key: formattedKey,
      padding: padding === 'pkcs1' ? crypto.constants.RSA_PKCS1_PADDING : crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    bufferData
  );

  return decrypted.toString('utf8');
}

/**
 * 私钥签名
 * @param data 待签名数据
 * @param privateKey 私钥（PEM 格式）
 * @param algorithm 签名算法，默认 SHA256
 * @param outputEncoding 输出编码，默认 base64
 * @returns 签名值
 */
export function sign(
  data: string | Buffer,
  privateKey: string,
  algorithm: string = 'SHA256',
  outputEncoding: crypto.Encoding = 'base64'
): string {
  const bufferData = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

  const signer = crypto.createSign(algorithm);
  signer.update(bufferData);
  signer.end();

  const signature = signer.sign(privateKey);
  return signature.toString(outputEncoding);
}

/**
 * 公钥验签
 * @param data 原始数据
 * @param signature 签名值
 * @param publicKey 公钥（PEM 格式）
 * @param algorithm 签名算法，默认 SHA256
 * @param inputEncoding 签名输入编码，默认 base64
 * @returns 验签是否成功
 */
export function verify(
  data: string | Buffer,
  signature: string,
  publicKey: string,
  algorithm: string = 'SHA256',
  inputEncoding: crypto.Encoding = 'base64'
): boolean {
  const bufferData = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const bufferSignature = Buffer.from(signature, inputEncoding);

  const verifier = crypto.createVerify(algorithm);
  verifier.update(bufferData);
  verifier.end();

  return verifier.verify(publicKey, bufferSignature);
}

/**
 * 加密长数据（分段加密）
 * RSA 2048 位密钥最大加密数据长度为 245 字节（OAEP + SHA256）
 * @param data 待加密数据
 * @param publicKey 公钥
 * @returns 加密后的数据（各段用 | 分隔）
 */
export function encryptLong(data: string, publicKey: string): string {
  // RSA 2048 OAEP + SHA256 最大加密长度
  const maxChunkSize = 190;
  const bufferData = Buffer.from(data, 'utf8');
  const chunks: string[] = [];

  for (let i = 0; i < bufferData.length; i += maxChunkSize) {
    const chunk = bufferData.slice(i, i + maxChunkSize);
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      chunk
    );
    chunks.push(encrypted.toString('base64'));
  }

  return chunks.join('|');
}

/**
 * 解密长数据（分段解密）
 * @param encryptedData 加密数据（各段用 | 分隔）
 * @param privateKey 私钥
 * @returns 解密后的原始数据
 */
export function decryptLong(encryptedData: string, privateKey: string): string {
  const chunks = encryptedData.split('|');
  const decryptedBuffers: Buffer[] = [];

  for (const chunk of chunks) {
    const bufferChunk = Buffer.from(chunk, 'base64');
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      bufferChunk
    );
    decryptedBuffers.push(decrypted);
  }

  return Buffer.concat(decryptedBuffers).toString('utf8');
}

// 导出所有方法
export default {
  generateKeyPair,
  encrypt,
  decrypt,
  decryptJava, // 兼容 Java/Hutool PKCS#1 解密
  sign,
  verify,
  encryptLong,
  decryptLong,
};

/**
 * 使用 node-rsa 解密 Java/Hutool 加密的数据
 * 支持 PKCS#1 v1.5 填充（Hutool 默认）
 *
 * @param encryptedData 加密数据（base64）
 * @param privateKey 私钥（PEM 格式或裸 Base64，支持 PKCS#1 和 PKCS#8）
 * @returns 解密后的原始数据
 */
export function decryptJava(encryptedData: string, privateKey: string): string {
  // 格式化私钥
  const keyFormat = detectKeyFormat(privateKey);
  const formattedKey = formatKey(privateKey, 'private', keyFormat);

  // 创建 node-rsa 实例
  const key = new NodeRSA(formattedKey);

  // 设置解密填充为 PKCS#1 v1.5（Hutool 默认）
  key.setOptions({
    encryptionScheme: 'pkcs1',
    signingScheme: 'pkcs1-sha256',
  });

  // 解密
  const decrypted = key.decrypt(encryptedData, 'utf8');
  return decrypted;
}

/**
 * 使用 node-rsa 加密数据（兼容 Java/Hutool）
 *
 * @param data 待加密数据
 * @param publicKey 公钥（PEM 格式或裸 Base64）
 * @returns 加密后的数据（base64）
 */
export function encryptForJava(data: string, publicKey: string): string {
  // 格式化公钥
  const keyFormat = detectKeyFormat(publicKey);
  const formattedKey = formatKey(publicKey, 'public', keyFormat);

  // 创建 node-rsa 实例
  const key = new NodeRSA(formattedKey);

  // 设置加密填充为 PKCS#1 v1.5
  key.setOptions({
    encryptionScheme: 'pkcs1',
    signingScheme: 'pkcs1-sha256',
  });

  // 加密
  return key.encrypt(data, 'base64');
}