import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient, REDIS_KEY_PREFIX } from '@/lib/redis';
import { AjaxResult } from '@/lib/AjaxResult';
import { logError } from '@/lib/logger';

// 强制动态路由，避免构建时静态生成
export const dynamic = 'force-dynamic';

/**
 * 获取人工客服链接
 * GET /api/app-api/config/human-service
 */
export async function GET() {
  try {
    const redisClient = getRedisClient();
    const redisKey = `${REDIS_KEY_PREFIX.SYSTEM_CONFIG}human_service_url`;
    const url = await redisClient.get(redisKey);

    if (!url) {
      return NextResponse.json(AjaxResult.error('人工客服链接未配置'));
    }

    return NextResponse.json(AjaxResult.success({ url }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '获取失败';
    logError('获取人工客服链接失败', error);
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}