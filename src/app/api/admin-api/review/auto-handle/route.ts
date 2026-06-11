import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { AjaxResult } from '@/lib/AjaxResult';
import { logError } from '@/lib/logger';

const AUTO_REPLY_MESSAGE = '抱歉，AI回答生成失败，请点击"转人工"接入人工客服，或稍后重试。';

// 自动处理超时消息（发送默认回答）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(AjaxResult.error('参数错误：缺少id'));
    }

    // 检查当前状态是否为pending
    const checkSql = `SELECT status, input FROM chat_history WHERE id = $1`;
    const checkResult = await query<{ status: string; input: string }>(checkSql, [id]);

    if (checkResult.length === 0) {
      return NextResponse.json(AjaxResult.error('记录不存在'));
    }

    if (checkResult[0].status !== 'pending') {
      // 已经被处理过了，不需要再处理
      return NextResponse.json(AjaxResult.success(null, '该消息已被处理'));
    }

    // 更新状态为success，并替换output为默认回答
    const updateSql = `
      UPDATE chat_history
      SET output = $1, status = 'success'
      WHERE id = $2
    `;
    await query(updateSql, [AUTO_REPLY_MESSAGE, id]);

    return NextResponse.json(AjaxResult.success({
      id,
      output: AUTO_REPLY_MESSAGE,
      status: 'success'
    }, '自动处理成功'));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '自动处理失败';
    logError('自动处理超时消息失败', error);
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}