import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { AjaxResult } from '@/lib/AjaxResult';
import { logError } from '@/lib/logger';

// 获取待审核对话列表（支持分页和筛选）
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const status = searchParams.get('status') || 'pending'; // 默认查询待审核
    const channel = searchParams.get('channel') || ''; // 可选：按渠道筛选
    const userId = searchParams.get('userId') || ''; // 可选：按用户ID筛选

    const offset = (page - 1) * pageSize;

    // 构建查询条件（默认排除已删除记录）
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (channel) {
      conditions.push(`channel = $${paramIndex++}`);
      params.push(channel);
    }

    if (userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(userId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : 'WHERE deleted_at IS NULL';

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM chat_history ${whereClause}`;
    const countResult = await query<{ total: string }>(countSql, params);
    const total = parseInt(countResult[0]?.total || '0');

    // 查询列表
    // 注意：created_at 存储的是本地时间（北京时间），需要先指定时区再提取 epoch
    // AT TIME ZONE 'Asia/Shanghai' 将无时区时间解释为北京时间
    // AT TIME ZONE 'UTC' 将北京时间转换为 UTC 时间戳
    const listSql = `
      SELECT
        id,
        user_id,
        channel,
        input,
        output,
        status,
        created_at,
        EXTRACT(EPOCH FROM (created_at AT TIME ZONE 'Asia/Shanghai' AT TIME ZONE 'UTC')) * 1000 as timestamp
      FROM chat_history
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(pageSize, offset);

    const rows = await query<{
      id: number;
      user_id: string;
      channel: string;
      input: string;
      output: string;
      status: string;
      created_at: string;
      timestamp: string;
    }>(listSql, params);

    return NextResponse.json(AjaxResult.success({
      list: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '获取待审核列表失败';
    logError('获取待审核列表错误', error);
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}