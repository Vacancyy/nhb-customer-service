// 知识库 CRUD 服务（跨期版）

import { query, queryOne, getClient } from '../postgres';
import { generateEmbedding } from '../embedding';
import { DEFAULT_TOPK, MIN_SIMILARITY, getValidTopK } from './config';
import {
  KnowledgeEntry,
  KnowledgeAnswer,
  CreateKnowledgeInput,
  CreateKnowledgeAnswerInput,
  UpdateKnowledgeInput,
  KnowledgeQueryParams,
} from './types';
import { logInfo } from '../logger';

const TABLE_ENTRIES = 'knowledge_entries';
const TABLE_ANSWERS = 'knowledge_answers';

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

// PostgreSQL 数组类型转换
function parseArray(arr: any): string[] | null {
  if (!arr) return null;
  if (Array.isArray(arr)) return arr;
  return null;
}

// 创建知识条目（含跨期答案）
export async function createKnowledge(
  input: CreateKnowledgeInput
): Promise<KnowledgeEntry> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 插入主表
    const entrySql = `
      INSERT INTO ${TABLE_ENTRIES} (
        source_id, std_question, retrieval_text, category, intent, scene,
        answer_mode, requires_verification, requires_business_confirm,
        similar_questions, keywords, channels
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;
    const entryResult = await client.query(entrySql, [
      input.source_id || null,
      input.std_question,
      input.retrieval_text || null,
      input.category || null,
      input.intent || null,
      input.scene || null,
      input.answer_mode || null,
      input.requires_verification || null,
      input.requires_business_confirm || false,
      input.similar_questions || [],
      input.keywords || [],
      input.channels || [],
    ]);
    const entry = entryResult.rows[0];
    const knowledgeId = entry.id;

    // 插入跨期答案
    if (input.answers && input.answers.length > 0) {
      for (const ans of input.answers) {
        const answerSql = `
          INSERT INTO ${TABLE_ANSWERS} (
            knowledge_id, period, answer, source, std_question_period, valid_from, valid_to
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        await client.query(answerSql, [
          knowledgeId,
          ans.period,
          ans.answer,
          ans.source || null,
          ans.std_question_period || null,
          ans.valid_from || null,
          ans.valid_to || null,
        ]);
      }
    }

    await client.query('COMMIT');

    return {
      ...entry,
      similar_questions: parseArray(entry.similar_questions),
      keywords: parseArray(entry.keywords),
      channels: parseArray(entry.channels),
      embedding: parseVector(entry.embedding),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// 根据 ID 获取知识条目（含跨期答案）
export async function getKnowledgeById(
  id: string,
  period?: number
): Promise<KnowledgeEntry | null> {
  // 查询主表
  const entrySql = `SELECT * FROM ${TABLE_ENTRIES} WHERE id = $1`;
  const entryRow = await queryOne<KnowledgeEntry>(entrySql, [id]);

  if (!entryRow) return null;

  // 查询答案表
  let answersSql = `SELECT * FROM ${TABLE_ANSWERS} WHERE knowledge_id = $1`;
  const params: any[] = [id];
  if (period) {
    answersSql += ` AND period = $2`;
    params.push(period);
  }
  answersSql += ` ORDER BY period DESC`;

  const answersRows = await query<KnowledgeAnswer>(answersSql, params);

  return {
    ...entryRow,
    similar_questions: parseArray(entryRow.similar_questions),
    keywords: parseArray(entryRow.keywords),
    channels: parseArray(entryRow.channels),
    embedding: parseVector(entryRow.embedding as unknown as string),
    answers: answersRows,
  };
}

// 分页查询知识条目
export async function listKnowledge(
  params: KnowledgeQueryParams
): Promise<{ data: KnowledgeEntry[]; total: number }> {
  const { page = 1, pageSize = 10, category, intent, keyword, period } = params;
  const offset = (page - 1) * pageSize;

  // 构建 WHERE 条件
  const conditions: string[] = [];
  const queryParams: any[] = [];
  let paramIndex = 1;

  if (category) {
    conditions.push(`category = $${paramIndex++}`);
    queryParams.push(category);
  }
  if (intent) {
    conditions.push(`intent = $${paramIndex++}`);
    queryParams.push(intent);
  }
  if (keyword) {
    conditions.push(`(std_question LIKE $${paramIndex} OR retrieval_text LIKE $${paramIndex})`);
    queryParams.push(`%${keyword}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // 查询总数
  const countSql = `SELECT COUNT(*) as total FROM ${TABLE_ENTRIES} ${whereClause}`;
  const countRow = await queryOne<{ total: number }>(countSql, queryParams);
  const total = countRow?.total || 0;

  // 查询数据
  const dataSql = `
    SELECT e.*, COALESCE(a.answers, '[]') as answers
    FROM ${TABLE_ENTRIES} e
    LEFT JOIN (
      SELECT knowledge_id, json_agg(json_build_object(
        'id', id,
        'knowledge_id', knowledge_id,
        'period', period,
        'answer', answer,
        'source', source,
        'std_question_period', std_question_period,
        'valid_from', valid_from,
        'valid_to', valid_to
      )) as answers
      FROM ${TABLE_ANSWERS}
      ${period ? `WHERE period = $${paramIndex}` : ''}
      GROUP BY knowledge_id
    ) a ON e.id = a.knowledge_id
    ${whereClause}
    ORDER BY e.updated_at DESC
    LIMIT $${paramIndex + (period ? 1 : 0)} OFFSET $${paramIndex + (period ? 1 : 0) + 1}
  `;

  const limitParams = [...queryParams];
  if (period) limitParams.push(period);
  limitParams.push(pageSize, offset);

  const rows = await query<any>(dataSql, limitParams);

  // 转换数据
  const data = rows.map((row) => ({
    ...row,
    similar_questions: parseArray(row.similar_questions),
    keywords: parseArray(row.keywords),
    channels: parseArray(row.channels),
    embedding: parseVector(row.embedding),
    answers: (row.answers || []).sort((a: KnowledgeAnswer, b: KnowledgeAnswer) => b.period - a.period),
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

  if (input.source_id !== undefined) {
    updateFields.push(`source_id = $${paramIndex++}`);
    params.push(input.source_id);
  }
  if (input.std_question !== undefined) {
    updateFields.push(`std_question = $${paramIndex++}`);
    params.push(input.std_question);
  }
  if (input.retrieval_text !== undefined) {
    updateFields.push(`retrieval_text = $${paramIndex++}`);
    params.push(input.retrieval_text);
  }
  if (input.category !== undefined) {
    updateFields.push(`category = $${paramIndex++}`);
    params.push(input.category);
  }
  if (input.intent !== undefined) {
    updateFields.push(`intent = $${paramIndex++}`);
    params.push(input.intent);
  }
  if (input.scene !== undefined) {
    updateFields.push(`scene = $${paramIndex++}`);
    params.push(input.scene);
  }
  if (input.answer_mode !== undefined) {
    updateFields.push(`answer_mode = $${paramIndex++}`);
    params.push(input.answer_mode);
  }
  if (input.requires_verification !== undefined) {
    updateFields.push(`requires_verification = $${paramIndex++}`);
    params.push(input.requires_verification);
  }
  if (input.requires_business_confirm !== undefined) {
    updateFields.push(`requires_business_confirm = $${paramIndex++}`);
    params.push(input.requires_business_confirm);
  }
  if (input.similar_questions !== undefined) {
    updateFields.push(`similar_questions = $${paramIndex++}`);
    params.push(input.similar_questions);
  }
  if (input.keywords !== undefined) {
    updateFields.push(`keywords = $${paramIndex++}`);
    params.push(input.keywords);
  }
  if (input.channels !== undefined) {
    updateFields.push(`channels = $${paramIndex++}`);
    params.push(input.channels);
  }
  if (input.embedding !== undefined) {
    updateFields.push(`embedding = $${paramIndex++}`);
    params.push(formatVector(input.embedding));
  }

  if (updateFields.length === 0) {
    return getKnowledgeById(id);
  }

  updateFields.push(`updated_at = NOW()`);
  params.push(id);

  const sql = `
    UPDATE ${TABLE_ENTRIES}
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  const row = await queryOne<KnowledgeEntry>(sql, params);
  if (!row) return null;

  return {
    ...row,
    similar_questions: parseArray(row.similar_questions),
    keywords: parseArray(row.keywords),
    channels: parseArray(row.channels),
    embedding: parseVector(row.embedding as unknown as string),
  };
}

// 删除知识条目（级联删除答案）
export async function deleteKnowledge(id: string): Promise<boolean> {
  const sql = `DELETE FROM ${TABLE_ENTRIES} WHERE id = $1 RETURNING id`;
  const row = await queryOne<{ id: string }>(sql, [id]);
  return row !== null;
}

// 批量删除知识条目
export async function deleteKnowledgeBatch(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = `DELETE FROM ${TABLE_ENTRIES} WHERE id = ANY($1) RETURNING id`;
  const rows = await query<{ id: string }>(sql, [ids]);
  return rows.length;
}

// 按分类统计数量
export async function countByCategory(): Promise<Record<string, number>> {
  const sql = `
    SELECT category, COUNT(*) as count
    FROM ${TABLE_ENTRIES}
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

// 按意图统计数量
export async function countByIntent(): Promise<Record<string, number>> {
  const sql = `
    SELECT intent, COUNT(*) as count
    FROM ${TABLE_ENTRIES}
    WHERE intent IS NOT NULL
    GROUP BY intent
    ORDER BY count DESC
  `;
  const rows = await query<{ intent: string; count: number }>(sql);
  return rows.reduce((acc, row) => {
    acc[row.intent] = row.count;
    return acc;
  }, {} as Record<string, number>);
}

// 根据 ID 查询数据并对 retrieval_text 进行向量化
export async function embedKnowledgeById(id: string): Promise<KnowledgeEntry | null> {
  const entry = await getKnowledgeById(id);
  if (!entry) {
    throw new Error('知识条目不存在');
  }

  const textToEmbed = entry.retrieval_text || entry.std_question;
  logInfo('向量化处理', { text: textToEmbed });
  const embedding = await generateEmbedding(textToEmbed);
  logInfo('向量化完成', { dimension: embedding.length });

  return updateKnowledge(id, { embedding });
}

// 批量向量化
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
  const sql = `SELECT id FROM ${TABLE_ENTRIES} WHERE embedding IS NULL`;
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

// 向量相似度搜索：根据问题文本查找最相似的知识条目（含跨期答案）
export async function searchKnowledgeByQuestion(
  question: string,
  topK?: number,
  period?: number
): Promise<(KnowledgeEntry & { similarity: number })[]> {
  // 1. 对问题进行向量化
  const embedding = await generateEmbedding(question);
  const embeddingStr = formatVector(embedding);

  // 2. 获取有效的 topK 值
  const validTopK = getValidTopK(topK);

  // 3. 使用 pgvector 的余弦相似度查询，JOIN 答案表
  const sql = `
    SELECT e.*,
      COALESCE(a.answers, '[]') as answers,
      1 - (e.embedding <=> $1) as similarity
    FROM ${TABLE_ENTRIES} e
    LEFT JOIN (
      SELECT knowledge_id, json_agg(json_build_object(
        'id', id,
        'knowledge_id', knowledge_id,
        'period', period,
        'answer', answer,
        'source', source,
        'std_question_period', std_question_period,
        'valid_from', valid_from,
        'valid_to', valid_to
      )) as answers
      FROM ${TABLE_ANSWERS}
      ${period ? `WHERE period = $4` : ''}
      GROUP BY knowledge_id
    ) a ON e.id = a.knowledge_id
    WHERE e.embedding IS NOT NULL
      AND 1 - (e.embedding <=> $1) >= $3
    ORDER BY e.embedding <=> $1
    LIMIT $2
  `;

  const params: any[] = [embeddingStr, validTopK, MIN_SIMILARITY];
  if (period) params.push(period);

  const rows = await query<any>(sql, params);

  // 4. 转换数据格式
  return rows.map((row) => ({
    ...row,
    similar_questions: parseArray(row.similar_questions),
    keywords: parseArray(row.keywords),
    channels: parseArray(row.channels),
    embedding: parseVector(row.embedding),
    answers: (row.answers || []).sort((a: KnowledgeAnswer, b: KnowledgeAnswer) => b.period - a.period),
    similarity: row.similarity,
  }));
}

// 根据期数获取答案
export async function getAnswerByPeriod(
  knowledgeId: string,
  period: number
): Promise<KnowledgeAnswer | null> {
  const sql = `
    SELECT * FROM ${TABLE_ANSWERS}
    WHERE knowledge_id = $1 AND period = $2
  `;
  return queryOne<KnowledgeAnswer>(sql, [knowledgeId, period]);
}

// 获取所有期数答案
export async function getAllAnswers(knowledgeId: string): Promise<KnowledgeAnswer[]> {
  const sql = `
    SELECT * FROM ${TABLE_ANSWERS}
    WHERE knowledge_id = $1
    ORDER BY period DESC
  `;
  return query<KnowledgeAnswer>(sql, [knowledgeId]);
}

// 创建或更新答案（同一条目同期只能有一个答案，使用 UPSERT）
export async function upsertAnswer(
  knowledgeId: string,
  input: CreateKnowledgeAnswerInput
): Promise<KnowledgeAnswer> {
  const sql = `
    INSERT INTO ${TABLE_ANSWERS} (
      knowledge_id, period, answer, source, std_question_period, valid_from, valid_to
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (knowledge_id, period) DO UPDATE SET
      answer = EXCLUDED.answer,
      source = EXCLUDED.source,
      std_question_period = EXCLUDED.std_question_period,
      valid_from = EXCLUDED.valid_from,
      valid_to = EXCLUDED.valid_to
    RETURNING *
  `;
  const row = await queryOne<KnowledgeAnswer>(sql, [
    knowledgeId,
    input.period,
    input.answer,
    input.source || null,
    input.std_question_period || null,
    input.valid_from || null,
    input.valid_to || null,
  ]);
  return row!;
}

// 删除答案
export async function deleteAnswer(answerId: number): Promise<boolean> {
  const sql = `DELETE FROM ${TABLE_ANSWERS} WHERE id = $1 RETURNING id`;
  const row = await queryOne<{ id: number }>(sql, [answerId]);
  return row !== null;
}

// 批量更新答案（先删除旧答案，再插入新答案）
export async function updateAnswersBatch(
  knowledgeId: string,
  answers: CreateKnowledgeAnswerInput[]
): Promise<KnowledgeAnswer[]> {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 删除旧答案
    await client.query(`DELETE FROM ${TABLE_ANSWERS} WHERE knowledge_id = $1`, [knowledgeId]);

    // 插入新答案
    const newAnswers: KnowledgeAnswer[] = [];
    for (const ans of answers) {
      const answerSql = `
        INSERT INTO ${TABLE_ANSWERS} (
          knowledge_id, period, answer, source, std_question_period, valid_from, valid_to
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      const result = await client.query(answerSql, [
        knowledgeId,
        ans.period,
        ans.answer,
        ans.source || null,
        ans.std_question_period || null,
        ans.valid_from || null,
        ans.valid_to || null,
      ]);
      newAnswers.push(result.rows[0]);
    }

    await client.query('COMMIT');
    return newAnswers;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// 检查数据库是否有向量能力
export async function checkVectorCapability(): Promise<boolean> {
  try {
    const sql = `SELECT 1 FROM pg_extension WHERE extname = 'vector'`;
    const result = await queryOne(sql);
    return result !== null;
  } catch {
    return false;
  }
}