import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { AjaxResult } from '@/lib/AjaxResult';
import { logError } from '@/lib/logger';
import { extractUserIdFromHeader } from '@/lib/auth-token';

// 提交用户反馈
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { recordId, feedback } = body;

    if (!recordId || !feedback) {
      return NextResponse.json(AjaxResult.error('参数错误：缺少 recordId 或 feedback'));
    }

    // 从 Header 获取 userId
    const authHeader = request.headers.get('Authorization');
    const userId = extractUserIdFromHeader(authHeader);

    if (!userId) {
      return NextResponse.json(AjaxResult.error('用户未登录', 401));
    }

    // 验证记录归属
    const checkSql = `SELECT user_id FROM chat_history WHERE id = $1 AND deleted_at IS NULL`;
    const checkResult = await query<{ user_id: string }>(checkSql, [recordId]);

    if (checkResult.length === 0) {
      return NextResponse.json(AjaxResult.error('记录不存在'));
    }

    if (checkResult[0].user_id !== userId) {
      return NextResponse.json(AjaxResult.error('无权限提交反馈', 403));
    }

    // 更新反馈内容
    const updateSql = `
      UPDATE chat_history
      SET feedback = $1, feedback_at = NOW()
      WHERE id = $2
    `;
    await query(updateSql, [feedback, recordId]);

    return NextResponse.json(AjaxResult.success(null, '反馈提交成功'));
  } catch (error) {
    logError('提交反馈失败', error);
    return NextResponse.json(AjaxResult.error('反馈提交失败'));
  }
}