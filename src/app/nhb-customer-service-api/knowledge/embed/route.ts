// 知识库向量化 API

import { NextRequest, NextResponse } from 'next/server';
import { embedKnowledgeById, embedKnowledgeBatch, embedAllMissingVectors } from '@/lib/knowledge/service';

// POST: 对指定知识条目进行向量化
// 单个: { id: "xxx" }
// 批量: { ids: ["id1", "id2"] }
// 全量: { all: true }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 全量向量化（所有未向量化记录）
    if (body.all === true) {
      console.log('开始全量向量化...');
      const result = await embedAllMissingVectors();
      return NextResponse.json({
        code: 200,
        msg: `处理完成: 成功 ${result.processed} 条, 失败 ${result.failed} 条`,
        data: result,
      });
    }

    // 批量向量化
    if (body.ids && Array.isArray(body.ids)) {
      if (body.ids.length === 0) {
        return NextResponse.json(
          { code: 400, msg: 'ids 数组不能为空', data: null },
          { status: 400 }
        );
      }
      console.log(`开始批量向量化，共 ${body.ids.length} 条...`);
      const result = await embedKnowledgeBatch(body.ids);
      return NextResponse.json({
        code: 200,
        msg: `处理完成: 成功 ${result.success} 条, 失败 ${result.failed} 条`,
        data: result,
      });
    }

    // 单条向量化
    if (body.id) {
      console.log(`开始单条向量化: ${body.id}`);
      const entry = await embedKnowledgeById(body.id);
      if (!entry) {
        return NextResponse.json(
          { code: 404, msg: '知识条目不存在', data: null },
          { status: 404 }
        );
      }
      return NextResponse.json({
        code: 200,
        msg: '向量化完成',
        data: entry,
      });
    }

    return NextResponse.json(
      { code: 400, msg: '请提供 id、ids 或 all 参数', data: null },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error('向量化接口错误:', error);
    const errMsg = error instanceof Error ? error.message : '系统异常';
    return NextResponse.json(
      { code: 500, msg: errMsg, data: null },
      { status: 500 }
    );
  }
}