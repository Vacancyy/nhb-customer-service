// 知识库管理 API - CRUD 接口（跨期版）

import { NextRequest, NextResponse } from 'next/server';
import {
  createKnowledge,
  getKnowledgeById,
  listKnowledge,
  updateKnowledge,
  deleteKnowledge,
  deleteKnowledgeBatch,
  countByCategory,
  countByIntent,
  updateAnswersBatch,
} from '@/lib/knowledge/service';
import {
  CreateKnowledgeInput,
  UpdateKnowledgeInput,
  KnowledgeQueryParams,
  CreateKnowledgeAnswerInput,
} from '@/lib/knowledge/types';
import { AjaxResult } from '@/lib/AjaxResult';
import { ERROR_MESSAGES } from '@/lib/prompts';
import { logError } from '@/lib/logger';

// GET: 查询知识条目列表或单个条目
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const period = searchParams.get('period') ? parseInt(searchParams.get('period')!) : undefined;

    // 根据 ID 查询单个条目
    if (id) {
      const entry = await getKnowledgeById(id, period);
      if (!entry) {
        return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.KNOWLEDGE_ENTRY_NOT_FOUND, 404));
      }
      return NextResponse.json(AjaxResult.success(entry));
    }

    // 统计接口
    if (searchParams.get('stats') === 'category') {
      const stats = await countByCategory();
      return NextResponse.json(AjaxResult.success(stats));
    }
    if (searchParams.get('stats') === 'intent') {
      const stats = await countByIntent();
      return NextResponse.json(AjaxResult.success(stats));
    }

    // 分页查询列表
    const params: KnowledgeQueryParams = {
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '10'),
      category: searchParams.get('category') || undefined,
      intent: searchParams.get('intent') || undefined,
      keyword: searchParams.get('keyword') || undefined,
      period: period,
    };

    const result = await listKnowledge(params);
    return NextResponse.json({
      ...AjaxResult.success(result.data),
      total: result.total,
      page: params.page,
      pageSize: params.pageSize,
    });
  } catch (error: unknown) {
    logError('GET 接口错误', error);
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}

// POST: 创建知识条目
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input: CreateKnowledgeInput = {
      source_id: body.source_id,
      std_question: body.std_question,
      retrieval_text: body.retrieval_text,
      category: body.category,
      intent: body.intent,
      scene: body.scene,
      answer_mode: body.answer_mode,
      requires_verification: body.requires_verification,
      requires_business_confirm: body.requires_business_confirm,
      similar_questions: body.similar_questions,
      keywords: body.keywords,
      channels: body.channels,
      answers: body.answers,
    };

    // 参数校验
    if (!input.std_question) {
      return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.KNOWLEDGE_FIELDS_REQUIRED, 400));
    }

    const entry = await createKnowledge(input);
    return NextResponse.json(AjaxResult.success(entry, '创建成功'));
  } catch (error: unknown) {
    logError('POST 接口错误', error);
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}

// PUT: 更新知识条目（含答案表）
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, answers, ...updates } = body;

    if (!id) {
      return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.ID_REQUIRED, 400));
    }

    // 更新主表
    const input: UpdateKnowledgeInput = updates;
    const entry = await updateKnowledge(id, input);

    if (!entry) {
      return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.KNOWLEDGE_ENTRY_NOT_FOUND, 404));
    }

    // 更新答案表（如果提供了 answers）
    if (answers && Array.isArray(answers)) {
      const answerInputs: CreateKnowledgeAnswerInput[] = answers.map(a => ({
        period: a.period,
        answer: a.answer,
        source: a.source,
        std_question_period: a.std_question_period,
        valid_from: a.valid_from,
        valid_to: a.valid_to,
      }));
      await updateAnswersBatch(id, answerInputs);
    }

    // 返回更新后的完整数据（含答案）
    const fullEntry = await getKnowledgeById(id);
    return NextResponse.json(AjaxResult.success(fullEntry, '更新成功'));
  } catch (error: unknown) {
    logError('PUT 接口错误', error);
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}

// DELETE: 删除知识条目（支持单个和批量）
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids');

    if (ids) {
      // 批量删除
      const idList = ids.split(',').filter(Boolean);
      const count = await deleteKnowledgeBatch(idList);
      return NextResponse.json(
        AjaxResult.success({ deleted: count }, `成功删除 ${count} 条记录`)
      );
    }

    if (id) {
      // 单个删除
      const success = await deleteKnowledge(id);
      if (!success) {
        return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.KNOWLEDGE_ENTRY_NOT_FOUND, 404));
      }
      return NextResponse.json(AjaxResult.success(null, '删除成功'));
    }

    return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.IDS_OR_ID_REQUIRED, 400));
  } catch (error: unknown) {
    logError('DELETE 接口错误', error);
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}