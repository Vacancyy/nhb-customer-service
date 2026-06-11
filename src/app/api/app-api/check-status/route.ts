import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/postgres';
import { AjaxResult } from '@/lib/AjaxResult';
import { getRedisClient, REDIS_KEY_PREFIX } from '@/lib/redis';
import { logInfo, logError } from '@/lib/logger';
import { extractUserIdFromHeader } from '@/lib/auth-token';

// 检查对话审核状态
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const recordId = searchParams.get('recordId');
    const channel = searchParams.get('channel');

    // 从 Header 获取 userId
    const authHeader = req.headers.get('Authorization');
    const userId = extractUserIdFromHeader(authHeader);

    if (!recordId) {
      return NextResponse.json(AjaxResult.error('缺少记录ID'));
    }

    // 查询记录状态
    // 注意：created_at 存储的是本地时间（北京时间），需要先指定时区再提取 epoch
    const sql = `
      SELECT id, user_id, channel, input, output, status, created_at,
             EXTRACT(EPOCH FROM (created_at AT TIME ZONE 'Asia/Shanghai' AT TIME ZONE 'UTC')) * 1000 as timestamp
      FROM chat_history
      WHERE id = $1 AND deleted_at IS NULL
    `;
    const result = await query<{
      id: number;
      user_id: string;
      channel: string;
      input: string;
      output: string;
      status: string;
      created_at: string;
      timestamp: string;
    }>(sql, [parseInt(recordId)]);

    if (result.length === 0) {
      return NextResponse.json(AjaxResult.error('记录不存在'));
    }

    const record = result[0];

    // 验证用户权限（可选）
    if (userId && channel && (record.user_id !== userId || record.channel !== channel)) {
      return NextResponse.json(AjaxResult.error('无权限查看此记录'));
    }

    // 检查审核开关（Redis）
    const redisClient = getRedisClient();
    const reviewEnabledKey = `${REDIS_KEY_PREFIX.SYSTEM_CONFIG}review_enabled`;
    const reviewEnabledValue = await redisClient.get(reviewEnabledKey);

    // 审核开关逻辑：'true' 或 '1' 表示启用审核，其他值（包括不存在）表示禁用审核
    const reviewEnabled = reviewEnabledValue === 'true' || reviewEnabledValue === '1';

    // 如果审核功能关闭，直接返回数据（不判断状态）
    if (!reviewEnabled) {
      logInfo('审核功能已关闭，直接返回数据', { recordId: record.id });

      // 如果状态非审核通过，更新为审核通过状态
      if (record.status !== 'success') {
        const updateSql = `UPDATE chat_history SET status = 'success' WHERE id = $1`;
        await query(updateSql, [record.id]);
        logInfo('已自动将记录状态更新为审核通过', { recordId: record.id, oldStatus: record.status });
      }

      return NextResponse.json(AjaxResult.success({
        status: 'success', // 绕过审核，直接返回
        input: record.input,
        output: record.output,
        recordId: record.id,
        timestamp: parseFloat(record.timestamp),
        reviewBypassed: true, // 标记已绕过审核
      }));
    }

    // 审核功能开启时，根据状态返回不同内容
    if (record.status === 'pending') {
      return NextResponse.json(AjaxResult.success({
        status: 'pending',
        message: '正在审核中，请稍后',
        recordId: record.id,
      }));
    } else if (record.status === 'success') {
      return NextResponse.json(AjaxResult.success({
        status: 'success',
        input: record.input,
        output: record.output,
        recordId: record.id,
        timestamp: parseFloat(record.timestamp),
      }));
    } else if (record.status === 'rejected') {
      return NextResponse.json(AjaxResult.success({
        status: 'rejected',
        message: '审核未通过，请重新提问',
        recordId: record.id,
      }));
    }

    return NextResponse.json(AjaxResult.error('未知状态'));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '查询失败';
    logError('查询审核状态失败', error);
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}