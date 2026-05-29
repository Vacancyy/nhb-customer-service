import { NextRequest, NextResponse } from 'next/server';
import { AjaxResult } from '@/lib/AjaxResult';
import { ERROR_MESSAGES } from '@/lib/prompts';
import { logInfo, logError } from '@/lib/logger';
import { verifyCodeA, verifyCodeB } from '@/lib/verification-code';
import { getUserAuthByElements, saveUserAuth } from '@/lib/user-auth';
import { setUserAuthCache } from '@/lib/redis';

// 身份证校验（简单校验）
function validateIdCard(idCard: string): boolean {
  if (idCard.length !== 18) return false;

  // 校验前17位是否为数字
  const first17 = idCard.slice(0, 17);
  if (!/^\d{17}$/.test(first17)) return false;

  // 校验最后一位
  const lastChar = idCard.slice(17);
  if (!/^[\dXx]$/.test(lastChar)) return false;

  // 校验码计算
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += parseInt(first17[i]) * weights[i];
  }

  const checkCode = checkCodes[sum % 11];
  return lastChar.toUpperCase() === checkCode;
}

// 实名认证提交接口
// 接收 userId + 三要素（姓名、证件号码、手机号） + 验证码
// 根据是否已实名选择方法A或方法B验证验证码
// 验证通过后：如果数据库没有数据就保存，并根据userId关联保存到Redis（24小时）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, name, idCard, phone, code } = body;

    // 参数校验
    if (!userId || !name || !idCard || !phone || !code) {
      return NextResponse.json(AjaxResult.error('请填写完整信息', 400));
    }

    // 身份证校验
    if (!validateIdCard(idCard)) {
      return NextResponse.json(AjaxResult.error('身份证号码格式不正确', 400));
    }

    // 手机号校验
    if (phone.length !== 11) {
      return NextResponse.json(AjaxResult.error('手机号码格式不正确', 400));
    }

    // 查询数据库判断是否已实名认证
    const existingAuth = await getUserAuthByElements(name, idCard, phone);

    let verified = false;

    if (existingAuth) {
      // 已实名认证 → 方法A验证验证码
      verified = await verifyCodeA(phone, code);
      if (!verified) {
        return NextResponse.json(AjaxResult.error('验证码不正确或已过期', 400));
      }
      logInfo('[verify-submit] 方法A验证成功', { userId, name, phone, alreadyVerified: true });
    } else {
      // 未实名认证 → 方法B验证验证码
      verified = await verifyCodeB(phone, code);
      if (!verified) {
        return NextResponse.json(AjaxResult.error('验证码不正确或已过期', 400));
      }

      // 验证通过，保存实名数据到数据库
      await saveUserAuth(name, idCard, phone);
      logInfo('[verify-submit] 方法B验证成功，保存实名数据', { userId, name, phone });
    }

    // 保存 userId 与用户信息关联到 Redis，24小时有效
    await setUserAuthCache(userId, { name, idCard, phone }, 24 * 60 * 60);

    logInfo('[verify-submit] 认证成功，Redis缓存已保存', { userId, name, phone });

    return NextResponse.json(
      AjaxResult.success({
        message: '实名认证成功',
        userId,
      })
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    const stack = error instanceof Error ? error.stack : '';
    logError(`[verify-submit] 认证失败: ${errMsg}\n${stack}`);
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}