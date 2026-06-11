import { NextRequest, NextResponse } from 'next/server';
import { AjaxResult } from '@/lib/AjaxResult';
import { decryptJava } from '@/lib/rsa';
import { generateId } from '@/lib/snowflake';
import { setUserAuthCache } from '@/lib/redis';
import { generateToken } from '@/lib/auth-token';
import { getUserAuthByElements, saveUserAuth } from '@/lib/user-auth';
import { logInfo, logError } from '@/lib/logger';

/**
 * 用户初始化接口
 * POST /api/app-api/user
 *
 * 请求体：{ wdnjUser?: string, channel?: string }
 * 返回：{ token: string, name?: string, mobile?: string, idCard?: string }
 *
 * 逻辑：
 * - 如果传了 wdnjUser（我的南京加密数据）：解密 → 存储 userInfo → 返回 token
 * - 如果没传 wdnjUser：生成新 userId，返回 token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wdnjUser, channel } = body;

    logInfo('[用户初始化]', { channel: channel || 'default', wdnjUser: wdnjUser ? '有' : '无' });

    // 如果传了加密数据（我的南京渠道）
    if (wdnjUser) {
      return handleMyNanjingDecrypt(wdnjUser);
    }

    // 非我的南京渠道：生成新 userId
    const userId = generateId().toString();
    logInfo('[用户初始化] 生成新 userId', { userId });

    // 生成 token
    const token = generateToken(userId);

    return NextResponse.json(AjaxResult.success({ token }, '初始化成功'));
  } catch (error) {
    logError('[用户初始化] 接口错误', error);
    return NextResponse.json(AjaxResult.error('初始化接口异常'));
  }
}

/**
 * 处理我的南京解密逻辑
 */
async function handleMyNanjingDecrypt(wdnjUser: string,): Promise<NextResponse> {
  // RSA 解密
  const privateKey = process.env.WDN_PRIVATE_KEY;
  if (!privateKey) {
    logError('[我的南京解密] 缺少 WDN_PRIVATE_KEY 环境变量');
    return NextResponse.json(AjaxResult.error('服务端缺少私钥配置'));
  }

  let userInfo: { userName?: string; idNumber?: string; phone?: string };
  try {
    const decryptedStr = decryptJava(wdnjUser, privateKey);
    userInfo = JSON.parse(decryptedStr);
  } catch (decryptError) {
    logError('[我的南京解密] 解密失败', decryptError);
    return NextResponse.json(AjaxResult.error('解密失败'));
  }

  // 生成新 userId
  const userId = generateId().toString();
  logInfo('[我的南京解密] 解密成功，生成 userId', { userId, userName: userInfo.userName });

  // 存储用户认证信息到 Redis（24小时有效）
  setUserAuthCache(userId, {
    name: userInfo.userName || '',
    idCard: userInfo.idNumber || '',
    phone: userInfo.phone || '',
  });

  // 保存到 user_auth 表（如果不存在）
  if (userInfo.userName && userInfo.idNumber && userInfo.phone) {
    const existingAuth = await getUserAuthByElements(
      userInfo.userName,
      userInfo.idNumber,
      userInfo.phone
    );
    if (!existingAuth) {
      await saveUserAuth(userInfo.userName, userInfo.idNumber, userInfo.phone);
      logInfo('[我的南京解密] 用户信息已保存到 user_auth 表', { userName: userInfo.userName });
    }
  }

  // 生成 token
  const token = generateToken(userId);

  return NextResponse.json(AjaxResult.success({
    token,
    name: userInfo.userName,
    idCard: userInfo.idNumber,
    mobile: userInfo.phone,
  }, '解密成功'));
}