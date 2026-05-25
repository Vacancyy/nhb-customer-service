// 知识库管理 API - CRUD 接口

import { NextRequest, NextResponse } from 'next/server';
import {
  createKnowledge,
  getKnowledgeById,
  listKnowledge,
  updateKnowledge,
  deleteKnowledge,
  deleteKnowledgeBatch,
  countByCategory,
} from '@/lib/knowledge/service';
import {
  CreateKnowledgeInput,
  UpdateKnowledgeInput,
  KnowledgeQueryParams,
} from '@/lib/knowledge/types';

// GET: 查询知识条目列表或单个条目
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    // 根据 ID 查询单个条目
    if (id) {
      const entry = await getKnowledgeById(id);
      if (!entry) {
        return NextResponse.json(
          { code: 404, msg: '知识条目不存在', data: null },
          { status: 404 }
        );
      }
      return NextResponse.json({ code: 200, msg: '', data: entry });
    }

    // 统计接口
    if (searchParams.get('stats') === 'category') {
      const stats = await countByCategory();
      return NextResponse.json({ code: 200, msg: '', data: stats });
    }

    // 分页查询列表
    const params: KnowledgeQueryParams = {
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '10'),
      category: searchParams.get('category') || undefined,
      topic: searchParams.get('topic') || undefined,
      keyword: searchParams.get('keyword') || undefined,
    };

    const result = await listKnowledge(params);
    return NextResponse.json({
      code: 200,
      msg: '',
      data: result.data,
      total: result.total,
      page: params.page,
      pageSize: params.pageSize,
    });
  } catch (error: unknown) {
    console.error('GET 接口错误:', error);
    const errMsg = error instanceof Error ? error.message : '系统异常';
    console.error('错误详情:', errMsg);
    return NextResponse.json(
      { code: 500, msg: errMsg, data: null },
      { status: 500 }
    );
  }
}

// POST: 创建知识条目
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input: CreateKnowledgeInput = {
      topic: body.topic,
      question: body.question,
      embedding: body.embedding,
      structured_data: body.structured_data,
      category: body.category,
    };

    // 参数校验
    if (!input.topic || !input.question || !input.structured_data) {
      return NextResponse.json(
        { code: 400, msg: 'topic、question、structured_data 为必填字段', data: null },
        { status: 400 }
      );
    }

    const entry = await createKnowledge(input);
    return NextResponse.json({ code: 200, msg: '创建成功', data: entry });
  } catch (error: unknown) {
    console.error('GET 接口错误:', error);
    const errMsg = error instanceof Error ? error.message : '系统异常';
    console.error('错误详情:', errMsg);
    return NextResponse.json(
      { code: 500, msg: errMsg, data: null },
      { status: 500 }
    );
  }
}

// PUT: 更新知识条目
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { code: 400, msg: 'id 为必填字段', data: null },
        { status: 400 }
      );
    }

    const input: UpdateKnowledgeInput = updates;
    const entry = await updateKnowledge(id, input);

    if (!entry) {
      return NextResponse.json(
        { code: 404, msg: '知识条目不存在', data: null },
        { status: 404 }
      );
    }

    return NextResponse.json({ code: 200, msg: '更新成功', data: entry });
  } catch (error: unknown) {
    console.error('GET 接口错误:', error);
    const errMsg = error instanceof Error ? error.message : '系统异常';
    console.error('错误详情:', errMsg);
    return NextResponse.json(
      { code: 500, msg: errMsg, data: null },
      { status: 500 }
    );
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
      return NextResponse.json({
        code: 200,
        msg: `成功删除 ${count} 条记录`,
        data: { deleted: count },
      });
    }

    if (id) {
      // 单个删除
      const success = await deleteKnowledge(id);
      if (!success) {
        return NextResponse.json(
          { code: 404, msg: '知识条目不存在', data: null },
          { status: 404 }
        );
      }
      return NextResponse.json({ code: 200, msg: '删除成功', data: null });
    }

    return NextResponse.json(
      { code: 400, msg: 'id 或 ids 参数必填', data: null },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error('GET 接口错误:', error);
    const errMsg = error instanceof Error ? error.message : '系统异常';
    console.error('错误详情:', errMsg);
    return NextResponse.json(
      { code: 500, msg: errMsg, data: null },
      { status: 500 }
    );
  }
}