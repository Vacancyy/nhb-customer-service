// 知识库 CRUD 服务

import { query, queryOne } from '../postgres';
import { generateEmbedding } from '../embedding';
import { DEFAULT_TOPK, MIN_SIMILARITY, getValidTopK } from './config';
import {
  KnowledgeEntry,
  CreateKnowledgeInput,
  UpdateKnowledgeInput,
  KnowledgeQueryParams,
} from './types';

const TABLE_NAME = 'knowledge_entries';

// VECTOR 类型转换辅助函数
function formatVector(embedding: number[] | null): string | null {
  if (!embedding) return null;
  return `[${embedding.join(',')}]`;  // pgvector 格式: [0.1,0.2,0.3]
}

function parseVector(embeddingStr: string | null): number[] | null {
  if (!embeddingStr) return null;
  // pgvector 返回格式可能是 "[0.1,0.2,0.3]" 或 "0.1,0.2,0.3"
  const cleaned = embeddingStr.replace(/^\[|\]$/g, '');
  if (!cleaned) return null;
  return cleaned.split(',').map(Number);
}

function parseJsonData(data: any): Record<string, any> {
  // pg 库对 JSONB 类型已自动解析为对象
  if (!data) return {};
  if (typeof data === 'object') return data;
  if (typeof data === 'string') return JSON.parse(data);
  return {};
}

// 创建知识条目
export async function createKnowledge(
  input: CreateKnowledgeInput
): Promise<KnowledgeEntry> {
  const sql = `
    INSERT INTO ${TABLE_NAME} (topic, question, embedding, structured_data, category)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const params = [
    input.topic,
    input.question,
    formatVector(input.embedding ?? null),
    JSON.stringify(input.structured_data),
    input.category || null,
  ];

  const row = await queryOne<KnowledgeEntry>(sql, params);
  if (!row) {
    throw new Error('创建知识条目失败');
  }

  return {
    ...row,
    embedding: parseVector(row.embedding as unknown as string),
    structured_data: parseJsonData(row.structured_data as unknown as string),
  };
}

// 根据 ID 获取知识条目
export async function getKnowledgeById(id: string): Promise<KnowledgeEntry | null> {
  const sql = `SELECT * FROM ${TABLE_NAME} WHERE id = $1`;
  const row = await queryOne<KnowledgeEntry>(sql, [id]);

  if (!row) return null;

  return {
    ...row,
    embedding: parseVector(row.embedding as unknown as string),
    structured_data: parseJsonData(row.structured_data as unknown as string),
  };
}

// 分页查询知识条目
export async function listKnowledge(
  params: KnowledgeQueryParams
): Promise<{ data: KnowledgeEntry[]; total: number }> {
  const { page = 1, pageSize = 10, category, topic, keyword } = params;
  const offset = (page - 1) * pageSize;

  // 构建 WHERE 条件
  const conditions: string[] = [];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (category) {
    conditions.push(`category = $${paramIndex++}`);
    queryParams.push(category);
  }
  if (topic) {
    conditions.push(`topic LIKE $${paramIndex++}`);
    queryParams.push(`%${topic}%`);
  }
  if (keyword) {
    conditions.push(`question LIKE $${paramIndex++}`);
    queryParams.push(`%${keyword}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 查询总数
  const countSql = `SELECT COUNT(*) as total FROM ${TABLE_NAME} ${whereClause}`;
  const countRow = await queryOne<{ total: number }>(countSql, queryParams);
  const total = countRow?.total || 0;

  // 查询数据
  const dataSql = `
    SELECT * FROM ${TABLE_NAME}
    ${whereClause}
    ORDER BY updated_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  const rows = await query<KnowledgeEntry>(dataSql, [...queryParams, pageSize, offset]);

  // 转换数据
  const data = rows.map((row) => ({
    ...row,
    embedding: parseVector(row.embedding as unknown as string),
    structured_data: parseJsonData(row.structured_data as unknown as string),
  }));

  return { data, total };
}

// 更新知识条目
export async function updateKnowledge(
  id: string,
  input: UpdateKnowledgeInput
): Promise<KnowledgeEntry | null> {
  const updateFields: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (input.topic !== undefined) {
    updateFields.push(`topic = $${paramIndex++}`);
    params.push(input.topic);
  }
  if (input.question !== undefined) {
    updateFields.push(`question = $${paramIndex++}`);
    params.push(input.question);
  }
  if (input.embedding !== undefined) {
    updateFields.push(`embedding = $${paramIndex++}`);
    params.push(formatVector(input.embedding));
  }
  if (input.structured_data !== undefined) {
    updateFields.push(`structured_data = $${paramIndex++}`);
    params.push(JSON.stringify(input.structured_data));
  }
  if (input.category !== undefined) {
    updateFields.push(`category = $${paramIndex++}`);
    params.push(input.category);
  }

  if (updateFields.length === 0) {
    return getKnowledgeById(id);
  }

  updateFields.push(`updated_at = NOW()`);
  params.push(id);

  const sql = `
    UPDATE ${TABLE_NAME}
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const row = await queryOne<KnowledgeEntry>(sql, params);
  if (!row) return null;

  return {
    ...row,
    embedding: parseVector(row.embedding as unknown as string),
    structured_data: parseJsonData(row.structured_data as unknown as string),
  };
}

// 删除知识条目
export async function deleteKnowledge(id: string): Promise<boolean> {
  const sql = `DELETE FROM ${TABLE_NAME} WHERE id = $1 RETURNING id`;
  const row = await queryOne<{ id: string }>(sql, [id]);
  return row !== null;
}

// 批量删除知识条目
export async function deleteKnowledgeBatch(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = `DELETE FROM ${TABLE_NAME} WHERE id = ANY($1) RETURNING id`;
  const rows = await query<{ id: string }>(sql, [ids]);
  return rows.length;
}

// 按分类统计数量
export async function countByCategory(): Promise<Record<string, number>> {
  const sql = `
    SELECT category, COUNT(*) as count
    FROM ${TABLE_NAME}
    WHERE category IS NOT NULL
    GROUP BY category
    ORDER BY count DESC
  `;
  const rows = await query<{ category: string; count: number }>(sql);
  return rows.reduce((acc, row) => {
    acc[row.category] = row.count;
    return acc;
  }, {} as Record<string, number>);
}

// 根据 ID 查询数据并对 topic 进行向量化，保存到数据库
export async function embedKnowledgeById(id: string): Promise<KnowledgeEntry | null> {
  // 1. 查询知识条目
  const entry = await getKnowledgeById(id);
  if (!entry) {
    throw new Error('知识条目不存在');
  }

  // 2. 对 topic 进行向量化
  console.log(`正在对 topic "${entry.topic}" 进行向量化...`);
  const embedding = await generateEmbedding(entry.topic);
  console.log(`向量化完成，维度: ${embedding.length}`);

  // 3. 更新数据库保存向量
  const updatedEntry = await updateKnowledge(id, { embedding });
  return updatedEntry;
}

// 批量向量化：对指定 IDs 的知识条目进行向量化
export async function embedKnowledgeBatch(ids: string[]): Promise<{ success: number; failed: number; errors: string[] }> {
  const result = { success: 0, failed: 0, errors: [] as string[] };

  for (const id of ids) {
    try {
      await embedKnowledgeById(id);
      result.success++;
    } catch (error: unknown) {
      result.failed++;
      const errMsg = error instanceof Error ? error.message : '未知错误';
      result.errors.push(`ID ${id}: ${errMsg}`);
    }
  }

  return result;
}

// 对所有没有向量的知识条目进行批量向量化
export async function embedAllMissingVectors(): Promise<{ processed: number; failed: number; errors: string[] }> {
  // 查询 embedding 为空的记录
  const sql = `SELECT id FROM ${TABLE_NAME} WHERE embedding IS NULL`;
  const rows = await query<{ id: string }>(sql);

  if (rows.length === 0) {
    return { processed: 0, failed: 0, errors: [] };
  }

  const ids = rows.map(r => r.id);
  const result = await embedKnowledgeBatch(ids);

  return {
    processed: result.success,
    failed: result.failed,
    errors: result.errors,
  };
}

// 向量相似度搜索：根据问题文本查找最相似的知识条目
export async function searchKnowledgeByQuestion(
  question: string,
  topK?: number
): Promise<(KnowledgeEntry & { similarity: number })[]> {
  // 1. 对问题进行向量化
  const embedding = await generateEmbedding(question);
  const embeddingStr = formatVector(embedding);

  // 2. 获取有效的 topK 值（从配置）
  const validTopK = getValidTopK(topK);

  // 3. 使用 pgvector 的余弦相似度查询
  // 过滤相似度低于阈值的结果
  const sql = `
    SELECT *,
      1 - (embedding <=> $1) as similarity
    FROM ${TABLE_NAME}
    WHERE embedding IS NOT NULL
      AND 1 - (embedding <=> $1) >= $3
    ORDER BY embedding <=> $1
    LIMIT $2
  `;

  // <=> 是余弦距离运算符，值越小越相似
  // 1 - <=> 得到相似度分数（范围 0-1）
  // 参数：$1=向量, $2=topK, $3=最小相似度阈值
  const rows = await query<KnowledgeEntry & { similarity: number }>(sql, [
    embeddingStr,
    validTopK,
    MIN_SIMILARITY,
  ]);

  // 4. 转换数据格式
  return rows.map((row) => ({
    ...row,
    embedding: parseVector(row.embedding as unknown as string),
    structured_data: parseJsonData(row.structured_data as unknown as string),
    similarity: row.similarity,
  }));
}