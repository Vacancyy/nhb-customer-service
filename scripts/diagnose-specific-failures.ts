/**
 * 针对两个失败问题的深入诊断
 */

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: (process.env.PG_PASSWORD || 'nhb@2026dev').trim()
});

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || 'sk-57fbd990f89045ddb5795aa9e405d420';
const DASHSCOPE_EMBEDDING_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(DASHSCOPE_EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-v3',
      input: text
    })
  });

  if (!res.ok) throw new Error(`Embedding API Failed: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

async function diagnose() {
  console.log('========== 针对失败问题的深入诊断 ==========\n');

  // 问题1: 健康告知/体检
  console.log('【问题1】投保这款产品是否需要健康告知/体检？\n');

  // 检查知识库是否有此问题
  const healthSql = `
    SELECT ke.id, ke.std_question, ke.keywords, ke.embedding IS NOT NULL as has_embedding
    FROM knowledge_entries ke
    WHERE ke.std_question ILIKE '%健康告知%' OR ke.std_question ILIKE '%体检%'
  `;
  const healthResult = await pool.query(healthSql);

  console.log('知识库匹配结果:');
  healthResult.rows.forEach(r => {
    console.log(`  ID: ${r.id}`);
    console.log(`  标准问题: ${r.std_question}`);
    console.log(`  关键词: ${r.keywords?.join(', ') || '无'}`);
    console.log(`  向量存在: ${r.has_embedding ? '✓' : '✗'}`);
  });

  // 检查答案
  const healthAnswerSql = `
    SELECT ke.std_question, ka.answer, ka.period
    FROM knowledge_entries ke
    JOIN knowledge_answers ka ON ke.id = ka.knowledge_id
    WHERE ke.std_question ILIKE '%健康告知%' OR ke.std_question ILIKE '%体检%'
    ORDER BY ka.period DESC
    LIMIT 5
  `;
  const healthAnswerResult = await pool.query(healthAnswerSql);

  console.log('\n知识库答案:');
  healthAnswerResult.rows.forEach(r => {
    console.log(`  【第${r.period}期】问题: ${r.std_question}`);
    console.log(`  答案: ${r.answer?.substring(0, 200)}...`);
  });

  // 尝试向量搜索
  if (healthResult.rows.length > 0 && healthResult.rows[0].has_embedding) {
    const question = '投保这款产品是否需要健康告知/体检？';
    const embedding = await generateEmbedding(question);
    const embeddingStr = `[${embedding.join(',')}]`;

    const searchSql = `
      SELECT ke.id, ke.std_question, 1 - (ke.embedding <=> $1::vector) as similarity
      FROM knowledge_entries ke
      WHERE ke.embedding IS NOT NULL
      ORDER BY ke.embedding <=> $1::vector
      LIMIT 3
    `;

    const searchResult = await pool.query(searchSql, [embeddingStr]);
    console.log('\n向量搜索结果:');
    searchResult.rows.forEach((r, i) => {
      console.log(`  第${i+1}名: 相似度=${r.similarity?.toFixed(4)}, "${r.std_question.substring(0, 50)}..."`);
    });
  }

  // 问题2: 犹豫期
  console.log('\n\n【问题2】这款产品的犹豫期有多久？\n');

  const hesitationSql = `
    SELECT ke.id, ke.std_question, ke.keywords, ke.embedding IS NOT NULL as has_embedding
    FROM knowledge_entries ke
    WHERE ke.std_question ILIKE '%犹豫期%' OR ke.keywords::text ILIKE '%犹豫期%'
  `;
  const hesitationResult = await pool.query(hesitationSql);

  console.log('知识库匹配结果:');
  hesitationResult.rows.forEach(r => {
    console.log(`  ID: ${r.id}`);
    console.log(`  标准问题: ${r.std_question}`);
    console.log(`  关键词: ${r.keywords?.join(', ') || '无'}`);
    console.log(`  向量存在: ${r.has_embedding ? '✓' : '✗'}`);
  });

  // 检查答案
  const hesitationAnswerSql = `
    SELECT ke.std_question, ka.answer, ka.period
    FROM knowledge_entries ke
    JOIN knowledge_answers ka ON ke.id = ka.knowledge_id
    WHERE ke.std_question ILIKE '%犹豫期%' OR ke.keywords::text ILIKE '%犹豫期%'
    ORDER BY ka.period DESC
    LIMIT 5
  `;
  const hesitationAnswerResult = await pool.query(hesitationAnswerSql);

  console.log('\n知识库答案:');
  hesitationAnswerResult.rows.forEach(r => {
    console.log(`  【第${r.period}期】问题: ${r.std_question}`);
    console.log(`  答案: ${r.answer}`);
  });

  // 尝试向量搜索
  if (hesitationResult.rows.length > 0 && hesitationResult.rows[0].has_embedding) {
    const question = '这款产品的犹豫期有多久？';
    const embedding = await generateEmbedding(question);
    const embeddingStr = `[${embedding.join(',')}]`;

    const searchSql = `
      SELECT ke.id, ke.std_question, 1 - (ke.embedding <=> $1::vector) as similarity
      FROM knowledge_entries ke
      WHERE ke.embedding IS NOT NULL
      ORDER BY ke.embedding <=> $1::vector
      LIMIT 3
    `;

    const searchResult = await pool.query(searchSql, [embeddingStr]);
    console.log('\n向量搜索结果:');
    searchResult.rows.forEach((r, i) => {
      console.log(`  第${i+1}名: 相似度=${r.similarity?.toFixed(4)}, "${r.std_question.substring(0, 50)}..."`);
    });
  }

  await pool.end();
}

diagnose();