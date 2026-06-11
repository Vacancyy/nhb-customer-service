/**
 * 知识库向量搜索准确率测试 - 直接测试搜索API
 */

import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';

// 配置
const API_BASE = 'http://localhost:3001/nhb-customer-service-api';
const DASHSCOPE_API_KEY = 'sk-57fbd990f89045ddb5795aa9e405d420';
const DASHSCOPE_EMBEDDING_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

// 数据库连接
const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: (process.env.PG_PASSWORD || 'nhb@2026dev').trim()
});

// 生成向量（与项目一致）
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

  if (!res.ok) {
    throw new Error(`Embedding API failed: ${res.status}`);
  }

  const data = await res.json();
  return data.data[0].embedding;
}

// 从数据库获取知识库数据
async function getKnowledgeData() {
  const sql = `
    SELECT
      ke.id,
      ke.std_question,
      ke.similar_questions,
      ke.keywords,
      ke.category,
      ka.answer as std_answer
    FROM knowledge_entries ke
    JOIN knowledge_answers ka ON ke.id = ka.knowledge_id
    WHERE ka.period = 6
      AND ke.keywords IS NOT NULL
      AND array_length(ke.keywords, 1) > 0
    ORDER BY ke.category
    LIMIT 30
  `;

  const result = await pool.query(sql);
  return result.rows.map(row => ({
    id: row.id,
    stdQuestion: row.std_question,
    similarQuestions: row.similar_questions || [],
    keywords: row.keywords || [],
    category: row.category || '未分类',
    stdAnswer: row.std_answer || ''
  }));
}

// 直接数据库向量搜索
async function searchVector(question: string, threshold: number = 0.5) {
  const embedding = await generateEmbedding(question);
  const embeddingStr = `[${embedding.join(',')}]`;

  const sql = `
    SELECT
      e.id,
      e.std_question,
      e.keywords,
      e.category,
      ka.answer,
      1 - (e.embedding <=> $1) as similarity
    FROM knowledge_entries e
    JOIN knowledge_answers ka ON e.id = ka.knowledge_id AND ka.period = 6
    WHERE e.embedding IS NOT NULL
      AND 1 - (e.embedding <=> $1) >= $2
    ORDER BY e.embedding <=> $1
    LIMIT 3
  `;

  const result = await pool.query(sql, [embeddingStr, threshold]);
  return result.rows;
}

// 主函数
async function main() {
  console.log('========== 知识库向量搜索准确率测试 ==========\n');

  // 1. 获取知识库数据
  console.log('步骤1: 获取知识库数据...');
  const knowledge = await getKnowledgeData();
  console.log(`获取 ${knowledge.length} 条数据\n`);

  // 2. 构建测试问题
  console.log('步骤2: 构建测试问题...');
  const tests: any[] = [];

  for (const item of knowledge) {
    // 标准问题
    tests.push({
      knowledgeId: item.id,
      category: item.category,
      stdQuestion: item.stdQuestion,
      testQuestion: item.stdQuestion,
      keywords: item.keywords,
      stdAnswer: item.stdAnswer,
      difficulty: '标准'
    });

    // 相似问题（取1个）
    if (item.similarQuestions.length > 0) {
      tests.push({
        knowledgeId: item.id,
        category: item.category,
        stdQuestion: item.stdQuestion,
        testQuestion: item.similarQuestions[0],
        keywords: item.keywords,
        stdAnswer: item.stdAnswer,
        difficulty: '相似'
      });
    }
  }

  console.log(`测试问题: ${tests.length} 个\n`);

  // 3. 执行向量搜索测试
  console.log('步骤3: 执行向量搜索...');
  const results: any[] = [];
  let matchCount = 0;

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    process.stdout.write(`[${i+1}/${tests.length}] ${test.testQuestion.substring(0,30)}... `);

    try {
      const searchResults = await searchVector(test.testQuestion);

      // 检查是否匹配到正确的知识条目
      const topResult = searchResults[0];
      const matched = topResult && topResult.id === test.knowledgeId;
      const matchedText = matched ? '✓ 匹配' : (topResult ? '✗ 错配' : '✗ 无结果');

      if (matched) matchCount++;

      console.log(`${matchedText} (相似度=${topResult?.similarity?.toFixed(3) || 'N/A'})`);

      results.push({
        category: test.category,
        difficulty: test.difficulty,
        stdQuestion: test.stdQuestion.substring(0, 50),
        testQuestion: test.testQuestion.substring(0, 50),
        keywords: test.keywords.slice(0, 3).join(','),
        matched,
        topSimilarity: topResult?.similarity?.toFixed(3) || 'N/A',
        topStdQuestion: topResult?.std_question?.substring(0, 40) || 'N/A',
        topAnswer: topResult?.answer?.substring(0, 80) || 'N/A'
      });

      await new Promise(r => setTimeout(r, 100));

    } catch (e) {
      console.log(`❌ 错误: ${e}`);
      results.push({
        category: test.category,
        difficulty: test.difficulty,
        stdQuestion: test.stdQuestion.substring(0, 50),
        testQuestion: test.testQuestion.substring(0, 50),
        keywords: test.keywords.slice(0, 3).join(','),
        matched: false,
        topSimilarity: 'ERROR',
        topStdQuestion: 'ERROR',
        topAnswer: 'ERROR'
      });
    }
  }

  // 4. 生成报告
  console.log('\n步骤4: 生成报告...');
  const csv = generateCSV(results);
  const filename = `docs/vector-search-result-${new Date().toISOString().slice(0,10)}.csv`;
  fs.writeFileSync(filename, '\ufeff' + csv, 'utf-8');
  console.log(`CSV报告: ${filename}\n`);

  // 5. 汇总统计
  console.log('========== 测试汇总 ==========');

  const standard = results.filter(r => r.difficulty === '标准');
  const similar = results.filter(r => r.difficulty === '相似');

  const standardMatched = standard.filter(r => r.matched).length;
  const similarMatched = similar.filter(r => r.matched).length;

  console.log(`\n【标准问题测试】`);
  console.log(`  测试数: ${standard.length}`);
  console.log(`  匹配成功: ${standardMatched} (${Math.round(standardMatched/standard.length*100)}%)`);
  const avgStandardSim = standard.filter(r => r.topSimilarity !== 'N/A' && r.topSimilarity !== 'ERROR')
    .reduce((s, r) => s + parseFloat(r.topSimilarity), 0) / standard.length;
  console.log(`  平均相似度: ${avgStandardSim.toFixed(3)}`);

  console.log(`\n【相似问题测试】`);
  console.log(`  测试数: ${similar.length}`);
  console.log(`  匹配成功: ${similarMatched} (${Math.round(similarMatched/similar.length*100)}%)`);
  const avgSimilarSim = similar.filter(r => r.topSimilarity !== 'N/A' && r.topSimilarity !== 'ERROR')
    .reduce((s, r) => s + parseFloat(r.topSimilarity), 0) / similar.length;
  console.log(`  平均相似度: ${avgSimilarSim.toFixed(3)}`);

  console.log(`\n【总体】`);
  console.log(`  总测试: ${results.length}`);
  console.log(`  总匹配成功: ${matchCount} (${Math.round(matchCount/results.length*100)}%)`);

  // 错配分析
  const wrongMatches = results.filter(r => !r.matched && r.topStdQuestion !== 'N/A' && r.topStdQuestion !== 'ERROR');
  if (wrongMatches.length > 0 && wrongMatches.length <= 10) {
    console.log(`\n【错配问题分析】(前10个)`);
    wrongMatches.slice(0, 10).forEach(r => {
      console.log(`  测试: "${r.testQuestion}"`);
      console.log(`    应匹配: "${r.stdQuestion}"`);
      console.log(`    实际匹配: "${r.topStdQuestion}" (相似度=${r.topSimilarity})`);
    });
  }

  await pool.end();
}

// 生成CSV
function generateCSV(results: any[]): string {
  const headers = ['分类', '难度', '标准问题', '测试问题', '关键词', '是否匹配', '最高相似度', '匹配到的标准问题', '匹配到的答案摘要'];

  const rows = results.map(r => [
    r.category,
    r.difficulty,
    r.stdQuestion,
    r.testQuestion,
    r.keywords,
    r.matched ? '是' : '否',
    r.topSimilarity,
    r.topStdQuestion,
    r.topAnswer
  ]);

  const escape = (v: any) => {
    const s = String(v || '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '"""')}"` : s;
  };

  return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
}

main().catch(e => { console.error(e); pool.end(); });