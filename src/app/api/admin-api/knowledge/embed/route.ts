// 知识库向量化 API

import { NextRequest, NextResponse } from 'next/server';
import { embedKnowledgeById, embedKnowledgeBatch, embedAllMissingVectors } from '@/lib/knowledge/service';
import { AjaxResult } from '@/lib/AjaxResult';
import { ERROR_MESSAGES } from '@/lib/prompts';
import { logInfo, logError } from '@/lib/logger';

// POST: 对指定知识条目进行向量化
// 单个: { id: "xxx" }
// 批量: { ids: ["id1", "id2"] }
// 全量: { all: true }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 全量向量化（所有未向量化记录）
    if (body.all === true) {
      logInfo('开始全量向量化');
      const result = await embedAllMissingVectors();
      return NextResponse.json(
        AjaxResult.success(result, `处理完成: 成功 ${result.processed} 条, 失败 ${result.failed} 条`)
      );
    }

    // 批量向量化
    if (body.ids && Array.isArray(body.ids)) {
      if (body.ids.length === 0) {
        return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.IDS_EMPTY, 400));
      }
      logInfo('开始批量向量化', { count: body.ids.length });
      const result = await embedKnowledgeBatch(body.ids);
      return NextResponse.json(
        AjaxResult.success(result, `处理完成: 成功 ${result.success} 条, 失败 ${result.failed} 条`)
      );
    }

    // 单条向量化
    if (body.id) {
      logInfo('开始单条向量化', { id: body.id });
      const entry = await embedKnowledgeById(body.id);
      if (!entry) {
        return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.KNOWLEDGE_ENTRY_NOT_FOUND, 404));
      }
      return NextResponse.json(AjaxResult.success(entry, '向量化完成'));
    }

    return NextResponse.json(AjaxResult.error('请提供 id、ids 或 all 参数', 400));
  } catch (error: unknown) {
    logError('向量化接口错误', error);
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}