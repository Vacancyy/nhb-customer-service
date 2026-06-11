import { NextRequest, NextResponse } from 'next/server';
import { getUserHistory, DEFAULT_CHANNEL } from '@/lib/session';
import { AjaxResult } from '@/lib/AjaxResult';
import { ERROR_MESSAGES } from '@/lib/prompts';
import { extractUserIdFromHeader } from '@/lib/auth-token';

// GET: 获取用户历史会话
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const channel = searchParams.get('channel') || DEFAULT_CHANNEL;

    // 从 Header 获取 userId
    const authHeader = req.headers.get('Authorization');
    const userId = extractUserIdFromHeader(authHeader);

    if (!userId) {
      return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.USER_ID_REQUIRED, 400));
    }

    const history = await getUserHistory(BigInt(userId), channel);

    return NextResponse.json(
      AjaxResult.success({
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