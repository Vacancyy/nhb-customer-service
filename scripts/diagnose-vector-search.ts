/**
 * 诊断：为什么知识库标准问题无法匹配到答案
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

// 失败的标准问题（关键词命中率0%）
const failedStdQuestions = [
  '投保这款产品是否需要健康告知/体检？',
  '其他城市什么时候上线？',
  '有理赔次数限制吗？',
  '医院等级在哪里查看？',
  '在哪里查询投保须知？',
  '快赔系统没带出来这一段时间的就诊记录，走的传统通道',
  '钱已经被扣了，怎么退回来？',
  '为什么显示还在出单？',
  '住院花了很多钱，怎么才赔这么点？',
  '怎么查宁惠保的电子保单？',
  '打哪个电话找客服？',
  '投保人的手机号码是哪个？',
  '怎么查这家医院是什么级别的？',
  '为什么直付没看到赔款？'
];

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const DASHSCOPE_EMBEDDING_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

// 生成向量
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
  console.log('========== 诊断：为什么标准问题无法匹配 ==========\n');

  // 1. 检查知识库向量是否存在
  console.log('步骤1: 检查知识库向量是否已生成...\n');

  const vectorCheckSql = `
    SELECT ke.id, ke.std_question, ke.embedding IS NOT NULL as has_embedding,
           pg_column_size(ke.embedding) as embedding_size
    FROM knowledge_entries ke
    WHERE ke.std_question = $1 OR ke.std_question = $2 OR ke.std_question = $3
    LIMIT 3
  `;

  const vectorCheck = await pool.query(vectorCheckSql, failedStdQuestions.slice(0, 3));
  console.log(`检查前5个失败问题的向量状态:`);
  vectorCheck.rows.forEach(r => {
    console.log(`  "${r.std_question.substring(0, 30)}..."`);
    console.log(`    向量是否存在: ${r.has_embedding ? '✓ 存在' : '✗ 不存在'}`);
    console.log(`    向量大小: ${r.embedding_size || 0} bytes`);
  });

  // 2. 实际向量搜索测试
  console.log('\n步骤2: 实际向量搜索测试（用标准问题搜索自己）...\n');

  for (let i = 0; i < 3; i++) {
    const question = failedStdQuestions[i];

    // 获取该问题在知识库中的ID
    const idResult = await pool.query(`
      SELECT ke.id, ke.std_question, ke.embedding
      FROM knowledge_entries ke
      WHERE ke.std_question = $1
    `, [question]);

    if (idResult.rows.length === 0) {
      console.log(`✗ 知识库未找到: "${question}"`);
      continue;
    }

    const knowledgeId = idResult.rows[0].id;
    const storedEmbedding = idResult.rows[0].embedding;

    if (!storedEmbedding) {
      console.log(`✗ 向量未生成: "${question.substring(0, 30)}..."`);
      continue;
    }

    // 生成新的向量进行搜索
    const newEmbedding = await generateEmbedding(question);
    const embeddingStr = `[${newEmbedding.join(',')}]`;

    // 执行向量搜索
    const searchSql = `
      SELECT ke.id, ke.std_question,
             1 - (ke.embedding <=> $1::vector) as similarity
      FROM knowledge_entries ke
      WHERE ke.embedding IS NOT NULL
      ORDER BY ke.embedding <=> $1::vector
      LIMIT 3
    `;

    const searchResult = await pool.query(searchSql, [embeddingStr]);

    console.log(`测试问题: "${question.substring(0, 40)}..."`);
    console.log(`期望匹配ID: ${knowledgeId}`);
    console.log(`搜索结果:`);

    searchResult.rows.forEach((r, idx) => {
      const match = r.id === knowledgeId ? '✓ 正确匹配' : (idx === 0 ? '✗ 未匹配到正确答案' : '');
      console.log(`  第${idx+1}名: 相似度=${r.similarity?.toFixed(4)}, ID=${r.id} ${match}`);
      console.log(`    问题: "${r.std_question.substring(0, 30)}..."`);
    });

    // 检查正确答案的排名
    const correctRank = searchResult.rows.findIndex(r => r.id === knowledgeId) + 1;
    console.log(`正确答案排名: ${correctRank > 0 ? `第${correctRank}名` : '未在前3名中'}`);
    console.log('');

    await new Promise(r => setTimeout(r, 200));
  }

  // 3. 检查搜索阈值设置
  console.log('\n步骤3: 检查向量搜索阈值设置...\n');

  // 从配置表或代码中获取阈值
  console.log(`当前系统阈值配置:`);
  console.log(`  - MIN_SIMILARITY: 需检查 config.ts 配置`);
  console.log(`  - 建议: 降低阈值至 0.35 或取消阈值限制`);

  // 4. 问题总结
  console.log('\n========== 诊断结论 ==========\n');

  console.log(`问题类型分析:`);
  console.log(`  1. 向量是否生成 → 如果未生成，需要重新生成向量`);
  console.log(`  2. 向量搜索排名 → 如果正确答案排名靠后，向量质量有问题`);
  console.log(`  3. 搜索阈值设置 → 如果阈值过高，正确答案被过滤掉`);

  console.log(`\n根本原因可能:`);
  console.log(`  - 向量搜索时，标准问题未能排在第一位（向量质量问题）`);
  console.log(`  - 搜索阈值设置过高，过滤掉了正确答案`);
  console.log(`  - LLM回答生成时，未正确使用知识库返回的内容`);

  await pool.end();
}

diagnose();