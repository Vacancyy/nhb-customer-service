import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { AjaxResult } from '@/lib/AjaxResult';
import { logError } from '@/lib/logger';

// 更新AI回答内容
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, output } = body;

    if (!id || !output) {
      return NextResponse.json(AjaxResult.error('参数错误：缺少id或output'));
    }

    // 更新回答内容
    const sql = `
      UPDATE chat_history
      SET output = $1
      WHERE id = $2
    `;

    await query(sql, [output, id]);

    return NextResponse.json(AjaxResult.success(null, '更新成功'));
  } catch (error) {
    logError('更新AI回答失败', error);
    return NextResponse.json(AjaxResult.error('更新失败'));
  }
}