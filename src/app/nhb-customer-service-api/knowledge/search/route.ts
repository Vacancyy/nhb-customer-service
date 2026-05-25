// 知识库向量搜索 API

import { NextRequest, NextResponse } from 'next/server';
import { searchKnowledgeByQuestion } from '@/lib/knowledge/service';
import { DEFAULT_TOPK, MIN_SIMILARITY, getValidTopK } from '@/lib/knowledge/config';

export interface SearchResult {
  id: string;
  topic: string;
  question: string;
  structured_data: Record<string, any>;
  category: string | null;
  similarity: number;
}

// POST: 根据问题进行向量相似度搜索
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { question, topK } = body;

    console.log('向量搜索请求:', { question, topK });
    console.log('配置:', { DEFAULT_TOPK, MIN_SIMILARITY });

    if (!question || typeof question !== 'string') {
      return NextResponse.json(
        { code: 400, msg: 'question 参数必填且为字符串', data: null },
        { status: 400 }
      );
    }

    // 使用配置获取有效的 topK 值
    const validTopK = getValidTopK(topK);

    // 执行向量搜索
    const results = await searchKnowledgeByQuestion(question, validTopK);

    // 格式化返回结果，包含相似度分数
    const data: SearchResult[] = results.map((r) => ({
      id: r.id,
      topic: r.topic,
      question: r.question,
      structured_data: r.structured_data,
      category: r.category,
      similarity: r.similarity,
    }));

    return NextResponse.json({
      code: 200,
      msg: '',
      data,
      total: data.length,
      config: {
        topK: validTopK,
        minSimilarity: MIN_SIMILARITY,
      },
    });
  } catch (error: unknown) {
    console.error('向量搜索接口错误:', error);
    const errMsg = error instanceof Error ? error.message : '系统异常';
    return NextResponse.json(
      { code: 500, msg: errMsg, data: null },
      { status: 500 }
    );
  }
}