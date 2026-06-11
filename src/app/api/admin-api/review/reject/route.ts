import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { AjaxResult } from '@/lib/AjaxResult';
import { logError } from '@/lib/logger';

// 审核拒绝（批量或单个）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids } = body; // 支持数组，批量审核

    if (!ids || (Array.isArray(ids) && ids.length === 0)) {
      return NextResponse.json(AjaxResult.error('请提供要审核的记录ID'));
    }

    const idList = Array.isArray(ids) ? ids : [ids];
    const placeholders = idList.map((_, index) => `$${index + 1}`).join(',');

    const sql = `
      UPDATE chat_history
      SET status = 'rejected'
      WHERE id IN (${placeholders}) AND status = 'pending'
      RETURNING id
    `;

    const result = await query<{ id: number }>(sql, idList);

    if (result.length === 0) {
      return NextResponse.json(AjaxResult.error('没有找到待审核的记录'));
    }

    return NextResponse.json(AjaxResult.success({
      rejectedCount: result.length,
      message: `已拒绝 ${result.length} 条记录`,
    }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '审核拒绝失败';
    logError('审核拒绝错误', error);
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}