// 知识库向量搜索 API（跨期版）

import { NextRequest, NextResponse } from 'next/server';
import { searchKnowledgeByQuestion } from '@/lib/knowledge/service';
import { DEFAULT_TOPK, MIN_SIMILARITY, getValidTopK } from '@/lib/knowledge/config';
import { AjaxResult } from '@/lib/AjaxResult';
import { ERROR_MESSAGES } from '@/lib/prompts';
import { KnowledgeAnswer } from '@/lib/knowledge/types';

export interface SearchResult {
  id: string;
  std_question: string;
  retrieval_text: string | null;
  category: string | null;
  intent: string | null;
  scene: string | null;
  answer_mode: string | null;
  requires_verification: string | null;
  requires_business_confirm: boolean;
  similar_questions: string[] | null;
  keywords: string[] | null;
  channels: string[] | null;
  answers: KnowledgeAnswer[];
  similarity: number;
}

// POST: 根据问题进行向量相似度搜索
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, topK, period } = body;

    console.log('向量搜索请求:', { question, topK, period });
    console.log('配置:', { DEFAULT_TOPK, MIN_SIMILARITY });

    if (!question || typeof question !== 'string') {
      return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.QUESTION_REQUIRED, 400));
    }

    // 使用配置获取有效的 topK 值
    const validTopK = getValidTopK(topK);

    // 执行向量搜索
    const results = await searchKnowledgeByQuestion(question, validTopK, period);

    // 格式化返回结果，包含相似度分数
    const data: SearchResult[] = results.map((r) => ({
      id: r.id,
      std_question: r.std_question,
      retrieval_text: r.retrieval_text,
      category: r.category,
      intent: r.intent,
      scene: r.scene,
      answer_mode: r.answer_mode,
      requires_verification: r.requires_verification,
      requires_business_confirm: r.requires_business_confirm,
      similar_questions: r.similar_questions,
      keywords: r.keywords,
      channels: r.channels,
      answers: r.answers || [],
      similarity: r.similarity,
    }));

    return NextResponse.json({
      ...AjaxResult.success(data),
      total: data.length,
      config: {
        topK: validTopK,
        minSimilarity: MIN_SIMILARITY,
        period: period || null,
      },
    });
  } catch (error: unknown) {
    console.error('向量搜索接口错误:', error);
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}