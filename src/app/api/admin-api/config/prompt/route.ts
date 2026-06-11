import { NextRequest, NextResponse } from 'next/server';
import { AjaxResult } from '@/lib/AjaxResult';
import { getSystemPrompt, setSystemPrompt } from '@/lib/prompts';
import { logInfo, logError } from '@/lib/logger';

/**
 * 获取系统提示词
 * GET /api/admin-api/config/prompt
 */
export async function GET() {
  try {
    const prompt = await getSystemPrompt();
    return NextResponse.json(AjaxResult.success({
      prompt,
      source: 'redis_or_default',
    }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '获取失败';
    logError('获取系统提示词失败', { error: errMsg });
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}

/**
 * 设置系统提示词
 * POST /api/admin-api/config/prompt
 * Body: { prompt: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return NextResponse.json(AjaxResult.error('提示词内容不能为空'));
    }

    await setSystemPrompt(prompt.trim());
    logInfo('系统提示词已更新', { length: prompt.trim().length });

    return NextResponse.json(AjaxResult.success({
      message: '系统提示词已更新',
      length: prompt.trim().length,
    }));
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '设置失败';
    logError('设置系统提示词失败', { error: errMsg });
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}