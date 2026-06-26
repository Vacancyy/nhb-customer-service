import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { AjaxResult } from '@/lib/AjaxResult';
import { logError, logInfo } from '@/lib/logger';

// 元数据列是否存在的缓存标志（迁移后为 true，避免每次查询都检测）
let metadataColumnsExist: boolean | null = null;

async function checkMetadataColumns(): Promise<boolean> {
  if (metadataColumnsExist !== null) return metadataColumnsExist;
  try {
    const result = await query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'chat_history' AND column_name = 'first_token_time'`
    );
    metadataColumnsExist = result.length > 0;
    logInfo(`Metadata columns check: ${metadataColumnsExist ? 'exists' : 'missing'}`);
  } catch {
    metadataColumnsExist = false;
  }
  return metadataColumnsExist;
}

// 获取对话记录列表（支持分页和多维度筛选）
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    const status = searchParams.get('status') || '';
    const channel = searchParams.get('channel') || '';
    const userId = searchParams.get('userId') || '';
    const keyword = searchParams.get('keyword') || '';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const hasToolCalls = searchParams.get('hasToolCalls') || '';
    const modelUsed = searchParams.get('modelUsed') || '';

    const offset = (page - 1) * pageSize;
    const hasMetadata = await checkMetadataColumns();

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
    if (keyword) {
      conditions.push(`(input ILIKE $${paramIndex++} OR output ILIKE $${paramIndex++})`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(endDate);
    }
    // 元数据列筛选（仅迁移后生效）
    if (hasMetadata && hasToolCalls === 'true') {
      conditions.push(`has_tool_calls = TRUE`);
    } else if (hasMetadata && hasToolCalls === 'false') {
      conditions.push(`has_tool_calls = FALSE`);
    }
    if (hasMetadata && modelUsed) {
      conditions.push(`model_used = $${paramIndex++}`);
      params.push(modelUsed);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM chat_history ${whereClause}`;
    const countResult = await query<{ total: string }>(countSql, params);
    const total = parseInt(countResult[0]?.total || '0');

    // 查询列表 — 根据迁移状态选择包含或不包含元数据列
    const metadataSelect = hasMetadata
      ? `, first_token_time, generation_time, model_used, has_tool_calls, tool_calls_detail, prompt_tokens, completion_tokens, total_tokens, agent_iterations`
      : '';

    const listSql = `
      SELECT
        id, user_id, channel, input, output, status, created_at,
        EXTRACT(EPOCH FROM (created_at AT TIME ZONE 'Asia/Shanghai' AT TIME ZONE 'UTC')) * 1000 as timestamp
        ${metadataSelect}
      FROM chat_history
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(pageSize, offset);

    const rows = await query(listSql, params);

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
    const errMsg = error instanceof Error ? error.message : '获取对话记录失败';
    logError('获取对话记录错误', error);
    // 如果是列不存在的错误，重置缓存让下次请求重新检测
    if (errMsg.includes('does not exist')) {
      metadataColumnsExist = null;
    }
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}
