import { NextRequest, NextResponse } from 'next/server';
import { getUserHistory, DEFAULT_CHANNEL } from '@/lib/session';

// GET: 获取用户历史会话
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const channel = searchParams.get('channel') || DEFAULT_CHANNEL;

    if (!userId) {
      return NextResponse.json(
        { code: 400, msg: 'userId 参数必填', data: null },
        { status: 400 }
      );
    }

    const history = await getUserHistory(userId, channel);

    return NextResponse.json({
      code: 200,
      msg: '',
      data: {
        userId,
        channel,
        history,
        total: history.length,
      },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '系统异常';
    return NextResponse.json(
      { code: 500, msg: errMsg, data: null },
      { status: 500 }
    );
  }
}

// DELETE: 清空用户历史会话
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const channel = searchParams.get('channel') || DEFAULT_CHANNEL;

    if (!userId) {
      return NextResponse.json(
        { code: 400, msg: 'userId 参数必填', data: null },
        { status: 400 }
      );
    }

    // 导入 clearHistory 函数
    const { clearHistory } = await import('@/lib/redis');
    await clearHistory(userId, channel);

    return NextResponse.json({
      code: 200,
      msg: '历史会话已清空',
      data: { userId, channel },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '系统异常';
    return NextResponse.json(
      { code: 500, msg: errMsg, data: null },
      { status: 500 }
    );
  }
}