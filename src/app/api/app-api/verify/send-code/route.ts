import { NextRequest, NextResponse } from 'next/server';
import { AjaxResult } from '@/lib/AjaxResult';
import { ERROR_MESSAGES } from '@/lib/prompts';
import { logInfo, logError } from '@/lib/logger';
import {
  generateCode,
  storeCodeMiaoXin,
  sendSMSMiaoXin,
  verifyThreeElementsStart,
  storeThreeElementsData
} from '@/lib/verification-code';
import { getUserAuthByElements } from '@/lib/user-auth';

// 发送验证码接口
// 接收三要素（姓名、证件号码、手机号）
// 根据是否已实名选择方法A（普通短信）或方法B（实名短信）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, idCard, phone } = body;

    // 参数校验
    if (!name || !idCard || !phone) {
      return NextResponse.json(AjaxResult.error('请填写完整信息（姓名、证件号码、手机号）', 400));
    }

    // 手机号校验
    if (phone.length !== 11) {
      return NextResponse.json(AjaxResult.error('手机号码格式不正确', 400));
    }

    // 身份证校验（简单校验）
    if (idCard.length !== 18) {
      return NextResponse.json(AjaxResult.error('身份证号码格式不正确', 400));
    }

    // 查询数据库判断是否已实名认证
    const existingAuth = await getUserAuthByElements(name, idCard, phone);

    // 生成验证码
    const code = generateCode();

    if (existingAuth) {
      // 已实名认证 → 方法A（普通短信）
      await storeCodeMiaoXin(phone, code);
      await sendSMSMiaoXin(phone, code);

      logInfo('[send-code] 方法A发送验证码', { phone, name, alreadyVerified: true });

      return NextResponse.json(
        AjaxResult.success({
          message: '验证码已发送',
          method: 'A',
          code: process.env.NODE_ENV !== 'production' ? code : undefined, // 开发环境返回验证码
        })
      );
    } else {
      // 未实名认证 → 方法B（实名短信）
      // 先调用第三方三要素认证接口验证身份真实性
      const verifyResult = await verifyThreeElementsStart(name, idCard, phone);

      if (!verifyResult.success) {
        logError('[send-code] 三要素验证失败', { name, phone, message: verifyResult.message });
        return NextResponse.json(AjaxResult.error(verifyResult.message || '身份信息验证失败', 400));
      }

      // 存储 verifyResult.data 到 Redis，供后续验证使用
      if (verifyResult.data) {
        await storeThreeElementsData(phone, verifyResult.data);
      }

      logInfo('[send-code] 易签宝发送验证码', { phone, name, alreadyVerified: false });

      return NextResponse.json(
        AjaxResult.success({
          message: '验证码已发送',
          method: 'B',
          code: process.env.NODE_ENV !== 'production' ? code : undefined, // 开发环境返回验证码
        })
      );
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    const stack = error instanceof Error ? error.stack : '';
    logError(`[send-code] 发送验证码失败: ${errMsg}\n${stack}`);
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}