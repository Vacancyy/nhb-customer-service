import { NextRequest, NextResponse } from 'next/server';
import { getUserHistory, DEFAULT_CHANNEL, clearUserHistory } from '@/lib/session';
import { AjaxResult } from '@/lib/AjaxResult';
import { ERROR_MESSAGES } from '@/lib/prompts';

// GET: 获取用户历史会话
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userIdStr = searchParams.get('userId');
    const channel = searchParams.get('channel') || DEFAULT_CHANNEL;

    if (!userIdStr) {
      return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.USER_ID_REQUIRED, 400));
    }

    const userId = BigInt(userIdStr);
    const history = await getUserHistory(userId, channel);

    return NextResponse.json(
      AjaxResult.success({
        userId: userIdStr,
        channel,
        history,
        total: history.length,
      })
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}

// DELETE: 清空用户历史会话
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userIdStr = searchParams.get('userId');
    const channel = searchParams.get('channel') || DEFAULT_CHANNEL;

    if (!userIdStr) {
      return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.USER_ID_REQUIRED, 400));
    }

    const userId = BigInt(userIdStr);
    await clearUserHistory(userId, channel);

    return NextResponse.json(AjaxResult.success({ userId: userIdStr, channel }, '历史会话已清空'));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}