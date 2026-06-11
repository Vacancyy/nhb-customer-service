import { NextRequest, NextResponse } from 'next/server';
import { getRedisClient, REDIS_KEY_PREFIX } from '@/lib/redis';
import { AjaxResult } from '@/lib/AjaxResult';
import { logError } from '@/lib/logger';

/**
 * 设置系统配置开关
 * POST /api/admin-api/config/switch
 * Body: { key: string, value: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key) {
      return NextResponse.json(AjaxResult.error('缺少参数：key'));
    }

    // 只允许设置特定的配置项
    const allowedKeys = ['review_enabled', 'auth_required', 'human_service_url'];
    if (!allowedKeys.includes(key)) {
      return NextResponse.json(AjaxResult.error(`不允许设置的配置项：${key}`));
    }

    const redisClient = getRedisClient();
    const redisKey = `${REDIS_KEY_PREFIX.SYSTEM_CONFIG}${key}`;

    if (value === undefined || value === null || value === '') {
      // 删除配置（禁用）
      await redisClient.del(redisKey);
      return NextResponse.json(AjaxResult.success({
        key,
        action: 'deleted',
        message: `已删除配置 ${key}，功能已禁用`
      }));
    } else {
      // 设置配置
      await redisClient.set(redisKey, String(value));
      return NextResponse.json(AjaxResult.success({
        key,
        value: String(value),
        message: `已设置 ${key} = ${value}`
      }));
    }
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '设置失败';
    logError('设置系统配置失败', error);
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}

/**
 * 获取系统配置开关状态
 * GET /api/admin-api/config/switch?key=review_enabled
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get('key') || 'review_enabled';

    const redisClient = getRedisClient();
    const redisKey = `${REDIS_KEY_PREFIX.SYSTEM_CONFIG}${key}`;
    const value = await redisClient.get(redisKey);

    return NextResponse.json(AjaxResult.success({
      key,
      value: value || null,
      enabled: value === 'true' || value === '1'
    }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '查询失败';
    logError('查询系统配置失败', error);
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}