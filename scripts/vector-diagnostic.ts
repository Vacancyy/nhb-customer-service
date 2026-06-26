/**
 * 向量搜索诊断脚本 - 检查向量数据质量和搜索效果
 */

import 'dotenv/config';
import { Pool } from 'pg';

// 数据库连接
const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: (process.env.PG_PASSWORD || 'nhb@2026dev').trim()
});

// DashScope Embedding API (OpenAI 兼容模式 - 与项目一致)
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const DASHSCOPE_EMBEDDING_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await fetch(DASHSCOPE_EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'text-embedding-v3',  // 使用与项目一致的模型
      input: text
    })
  });

  if (!res.ok) {
    throw new Error(`Embedding API failed: ${res.status}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

async function main() {
  console.log('========== 向量搜索诊断 ==========\n');

  // 1. 检查数据库向量扩展
  console.log('【1】检查 pgvector 扩展...');
  const extResult = await pool.query(`SELECT * FROM pg_extension WHERE extname = 'vector'`);
  console.log(`  pgvector 扩展: ${extResult.rows.length > 0 ? '已安装 ✓' : '未安装 ✗'}\n`);

  // 2. 检查知识库向量数据
  console.log('【2】检查知识库向量数据...');
  const countResult = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(embedding) as with_vector,
      COUNT(*) - COUNT(embedding) as no_vector
    FROM knowledge_entries
  `);
  const stats = countResult.rows[0];
  console.log(`  总条目: ${stats.total}`);
  console.log(`  有向量: ${stats.with_vector}`);
  console.log(`  无向量: ${stats.no_vector}\n`);

  if (parseInt(stats.with_vector) === 0) {
    console.log('⚠️ 没有任何向量数据！需要先进行向量化。');
    await pool.end();
    return;
  }

  // 3. 抽样检查向量维度
  console.log('【3】抽样检查向量维度...');
  const sampleResult = await pool.query(`
    SELECT id, std_question, embedding
    FROM knowledge_entries
    WHERE embedding IS NOT NULL
    LIMIT 5
  `);

  for (const row of sampleResult.rows) {
    let dim = 0;
    if (row.embedding) {
      const str = row.embedding.toString();
      const nums = str.replace(/^\[|\]$/g, '').split(',');
      dim = nums.filter(n => n.trim() && !isNaN(parseFloat(n))).length;
    }
    console.log(`  ${row.id}: "${row.std_question?.substring(0,30)}..." - 维度=${dim}`);
  }
  console.log();

  // 4. 测试向量搜索
  console.log('【4】测试向量搜索效果...');

  const testQuestions = [
    '什么是南京宁惠保？',
    '南京宁惠保多少钱？',
    '免赔额是多少？',
    '如何理赔？',
    '可以给家人买吗？'
  ];

  const MIN_SIMILARITY = 0.5;

  for (const question of testQuestions) {
    console.log(`\n  问题: "${question}"`);

    try {
      // 生成问题向量
      const embedding = await generateEmbedding(question);
      console.log(`    问题向量维度: ${embedding.length}`);

      // 格式化为 pgvector 格式
      const embeddingStr = `[${embedding.join(',')}]`;

      // 执行向量搜索 - 返回前5个结果，不过滤阈值
      const searchSql = `
        SELECT
          id,
          std_question,
          retrieval_text,
          1 - (embedding <=> $1) as similarity
        FROM knowledge_entries
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1
        LIMIT 5
      `;

      const searchResult = await pool.query(searchSql, [embeddingStr]);
      console.log(`    搜索结果: ${searchResult.rows.length} 条`);

      for (const r of searchResult.rows) {
        const sim = parseFloat(r.similarity);
        const pass = sim >= MIN_SIMILARITY ? '✓' : '✗';
        console.log(`      ${pass} 相似度=${sim.toFixed(3)} | "${r.std_question?.substring(0,40)}..."`);
      }

      // 统计超过阈值的数量
      const passedCount = searchResult.rows.filter(r => parseFloat(r.similarity) >= MIN_SIMILARITY).length;
      console.log(`    超过阈值(>=${MIN_SIMILARITY}): ${passedCount} 条`);

    } catch (e) {
      console.log(`    ❌ 错误: ${e}`);
    }
  }

  // 5. 检查向量索引
  console.log('\n【5】检查向量索引...');
  const indexResult = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'knowledge_entries'
      AND indexdef LIKE '%embedding%'
  `);
  if (indexResult.rows.length > 0) {
    console.log(`  向量索引: ${indexResult.rows[0].indexname}`);
  } else {
    console.log('  向量索引: 未创建');
  }

  console.log('\n========== 诊断完成 ==========');
  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });