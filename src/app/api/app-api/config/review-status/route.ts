// 公开审核状态接口 — 前端判断是否走 WS 路径

import { NextResponse } from 'next/server';
import { getRedisClient, REDIS_KEY_PREFIX } from '@/lib/redis';
import { AjaxResult } from '@/lib/AjaxResult';

// 强制动态渲染 — 此路由读取 Redis，不能静态预渲染
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const redisClient = getRedisClient();
    const key = `${REDIS_KEY_PREFIX.SYSTEM_CONFIG}review_enabled`;
    const value = await redisClient.get(key);

    // 与 chat/route.ts、config/switch/route.ts 保持一致的判断逻辑
    const enabled = value === 'true' || value === '1';

    return NextResponse.json(AjaxResult.success({ enabled }));
  } catch (error) {
    // Redis 不可用时默认审核开启（安全策略）
    return NextResponse.json(AjaxResult.success({ enabled: true }));
  }
}
