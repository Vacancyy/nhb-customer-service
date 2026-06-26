// 跨期版知识库批量导入脚本
// 用法: npx tsx scripts/import-knowledge.ts
//
// 功能:
//   1. 删除旧表（如果存在），按新结构重建
//   2. 读取 docs/知识库_跨期版.json
//   3. 逐条插入 knowledge_entries 主表（拆分为独立字段）
//   4. 逐条插入 knowledge_answers 跨期答案表
//   5. 批量调用 DashScope text-embedding-v3 生成向量（如果 pgvector 可用）

import { config } from 'dotenv';
import { resolve } from 'path';

// 加载 .env.local
config({ path: resolve(process.cwd(), '.env.local') });

import { Pool } from 'pg';
import { readFileSync } from 'fs';

// ============ 配置 ============

const PG_HOST = process.env.PG_HOST || 'localhost';
const PG_PORT = parseInt(process.env.PG_PORT || '5432');
const PG_DATABASE = process.env.PG_DATABASE || 'nhb_customer_service';
const PG_USER = process.env.PG_USER || 'postgres';
const PG_PASSWORD = process.env.PG_PASSWORD || '';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const DASHSCOPE_EMBEDDING_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-v3';
const EMBEDDING_DIMENSION = 1024;

// 每批 embed 的条目数（阿里云百炼限制最多 10 条）
const EMBED_BATCH_SIZE = 10;

// 是否有向量能力（由 ensureTableExists 检测后设置）
let hasVectorCapability = false;

// ============ 类型定义 ============

interface AnswerByPeriod {
  answer: string;
  source: string;
  std_question_period: string;
  valid_from?: string;
  valid_to?: string;
}

interface KnowledgeItem {
  std_question: string;
  similar_questions: string[];
  keywords: string[];
  answers_by_period: Record<string, AnswerByPeriod>;
  requires_verification: string;
  primary_category: string;
  id: string;
  retrieval_text: string;
  channel: string[];
  intent: string;
  scene: string;
  requires_business_confirm: boolean;
  answer_mode: string;
}

// ============ 数据库 ============

const pool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  database: PG_DATABASE,
  user: PG_USER,
  password: PG_PASSWORD,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function ensureTableExists(): Promise<void> {
  const client = await pool.connect();
  try {
    // 尝试创建 pgvector 扩展
    let hasVector = false;
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      hasVector = true;
      console.log('pgvector 扩展已就绪');
    } catch {
      console.log('pgvector 扩展未安装，将跳过向量列');
    }

    // 删除旧的 knowledge_entries 表（如果存在旧结构）
    await client.query('DROP TABLE IF EXISTS knowledge_answers CASCADE');
    await client.query('DROP TABLE IF EXISTS knowledge_entries CASCADE');
    console.log('已删除旧表');

    // 创建 knowledge_entries 主表
    if (hasVector) {
      await client.query(`
        CREATE TABLE knowledge_entries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source_id VARCHAR(20),
          std_question TEXT NOT NULL,
          retrieval_text TEXT,
          category VARCHAR(50),
          intent VARCHAR(50),
          scene VARCHAR(100),
          answer_mode VARCHAR(30),
          requires_verification VARCHAR(10),
          requires_business_confirm BOOLEAN DEFAULT FALSE,
          similar_questions TEXT[],
          keywords TEXT[],
          channels TEXT[],
          embedding VECTOR(1024),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
    } else {
      await client.query(`
        CREATE TABLE knowledge_entries (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          source_id VARCHAR(20),
          std_question TEXT NOT NULL,
          retrieval_text TEXT,
          category VARCHAR(50),
          intent VARCHAR(50),
          scene VARCHAR(100),
          answer_mode VARCHAR(30),
          requires_verification VARCHAR(10),
          requires_business_confirm BOOLEAN DEFAULT FALSE,
          similar_questions TEXT[],
          keywords TEXT[],
          channels TEXT[],
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
    }
    console.log('knowledge_entries 主表已创建');

    // 创建索引
    if (hasVector) {
      try {
        await client.query(`
          CREATE INDEX idx_knowledge_embedding ON knowledge_entries
            USING hnsw (embedding vector_cosine_ops)
        `);
      } catch {
        console.log('向量索引创建被跳过');
      }
    }
    await client.query('CREATE INDEX idx_knowledge_category ON knowledge_entries (category)');
    await client.query('CREATE INDEX idx_knowledge_intent ON knowledge_entries (intent)');
    await client.query('CREATE INDEX idx_knowledge_channels ON knowledge_entries USING GIN (channels)');

    // 创建 knowledge_answers 跨期答案表
    await client.query(`
      CREATE TABLE knowledge_answers (
        id SERIAL PRIMARY KEY,
        knowledge_id UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        period INT NOT NULL,
        answer TEXT NOT NULL,
        source VARCHAR(50),
        std_question_period TEXT,
        valid_from DATE,
        valid_to DATE,
        UNIQUE(knowledge_id, period)
      )
    `);
    console.log('knowledge_answers 跨期答案表已创建');

    await client.query('CREATE INDEX idx_knowledge_answers_period ON knowledge_answers (period)');
    await client.query('CREATE INDEX idx_knowledge_answers_knowledge_id ON knowledge_answers (knowledge_id)');
    await client.query('CREATE INDEX idx_knowledge_answers_period_knowledge ON knowledge_answers (period, knowledge_id)');
    console.log('索引已就绪');

    hasVectorCapability = hasVector;
  } finally {
    client.release();
  }
}

async function insertEntry(item: KnowledgeItem): Promise<string> {
  const sql = `
    INSERT INTO knowledge_entries (
      source_id, std_question, retrieval_text, category, intent, scene,
      answer_mode, requires_verification, requires_business_confirm,
      similar_questions, keywords, channels
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING id
  `;
  const result = await pool.query(sql, [
    item.id,
    item.std_question,
    item.retrieval_text || null,
    item.primary_category || null,
    item.intent || null,
    item.scene || null,
    item.answer_mode || null,
    item.requires_verification || null,
    item.requires_business_confirm || false,
    item.similar_questions || [],
    item.keywords || [],
    item.channel || [],
  ]);
  return result.rows[0].id;
}

async function insertAnswers(knowledgeId: string, answersByPeriod: Record<string, AnswerByPeriod>): Promise<number> {
  const periods = Object.keys(answersByPeriod);
  if (periods.length === 0) return 0;

  let inserted = 0;
  for (const [period, data] of Object.entries(answersByPeriod)) {
    const sql = `
      INSERT INTO knowledge_answers (knowledge_id, period, answer, source, std_question_period, valid_from, valid_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    await pool.query(sql, [
      knowledgeId,
      parseInt(period),
      data.answer,
      data.source || null,
      data.std_question_period || null,
      data.valid_from || null,
      data.valid_to || null,
    ]);
    inserted++;
  }
  return inserted;
}

async function updateEmbedding(id: string, embedding: number[]): Promise<void> {
  const vectorStr = `[${embedding.join(',')}]`;
  await pool.query('UPDATE knowledge_entries SET embedding = $1 WHERE id = $2', [vectorStr, id]);
}

// ============ 向量生成 ============

async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  const response = await fetch(DASHSCOPE_EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API 调用失败: ${errorText}`);
  }

  const data = await response.json();
  if (!data.data || data.data.length === 0) {
    throw new Error('Embedding 返回结果为空');
  }

  return data.data.sort((a: any, b: any) => a.index - b.index).map((d: any) => d.embedding);
}

// ============ 主流程 ============

async function main(): Promise<void> {
  if (!DASHSCOPE_API_KEY) {
    console.error('错误: DASHSCOPE_API_KEY 未配置，请在 .env.local 中设置');
    process.exit(1);
  }
  console.log(`DASHSCOPE_API_KEY: ${DASHSCOPE_API_KEY.substring(0, 15)}...`);

  // 0. 建表
  await ensureTableExists();

  // 1. 读取 JSON
  const jsonPath = resolve(process.cwd(), 'docs/知识库_跨期版.json');
  console.log(`读取知识库文件: ${jsonPath}`);
  const rawData = readFileSync(jsonPath, 'utf-8');
  const items: KnowledgeItem[] = JSON.parse(rawData);
  console.log(`共读取 ${items.length} 条知识条目`);

  // 2. 插入主表和答案表
  console.log('开始插入数据...');
  const inserted: Array<{ id: string; retrievalText: string }> = [];
  let totalAnswers = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const id = await insertEntry(item);
      const answerCount = await insertAnswers(id, item.answers_by_period);
      totalAnswers += answerCount;
      inserted.push({ id, retrievalText: item.retrieval_text || item.std_question });
      if ((i + 1) % 50 === 0 || i === items.length - 1) {
        console.log(`  已插入 ${i + 1}/${items.length} 条（含 ${totalAnswers} 条答案）`);
      }
    } catch (err) {
      console.error(`  插入失败 [${item.id}]: ${item.std_question}`, err);
    }
  }
  console.log(`成功插入 ${inserted.length} 条知识，${totalAnswers} 条答案`);

  // 3. 批量生成向量并更新（如果 pgvector 可用）
  let embedFailed = 0;
  if (!hasVectorCapability) {
    console.log('pgvector 不可用，跳过向量化步骤。后续安装 pgvector 后可重新运行: npx tsx scripts/import-knowledge.ts --skip-rebuild');
  } else {
    console.log('开始批量向量化...');
    let embedded = 0;

    for (let i = 0; i < inserted.length; i += EMBED_BATCH_SIZE) {
      const batch = inserted.slice(i, i + EMBED_BATCH_SIZE);
      const texts = batch.map((b) => b.retrievalText);

      try {
        const embeddings = await generateEmbeddingBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          try {
            await updateEmbedding(batch[j].id, embeddings[j]);
          } catch (err) {
            console.error(`  更新向量失败 [${batch[j].id}]:`, err);
            embedFailed++;
          }
        }

        embedded += batch.length;
        console.log(`  向量化进度: ${Math.min(embedded, inserted.length)}/${inserted.length}`);

        // 避免触发 API 限流
        await sleep(200);
      } catch (err) {
        console.error(`  批次向量化失败 (offset ${i}):`, err);
        embedFailed += batch.length;
      }
    }
  }

  console.log(`\n导入完成!`);
  console.log(`  知识条目: ${inserted.length} 条`);
  console.log(`  跨期答案: ${totalAnswers} 条`);
  if (hasVectorCapability) {
    console.log(`  向量化成功: ${inserted.length - embedFailed} 条`);
    console.log(`  向量化失败: ${embedFailed} 条`);
  } else {
    console.log('  向量化: 已跳过（pgvector 未安装）');
  }

  await pool.end();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('导入脚本异常:', err);
  pool.end().finally(() => process.exit(1));
});
