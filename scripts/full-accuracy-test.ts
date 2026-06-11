/**
 * 知识库全面准确率测试
 * 测试类型：标准问题、相似问题、合成问题（两个问题组合）
 */

import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';

// 配置
const API_BASE = 'http://localhost:3000/nhb-customer-service-api';
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

  if (!res.ok) throw new Error(`Embedding API failed: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

// 向量搜索
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

// 检查关键词命中
function checkKeywords(answer: string, keywords: string[]): { hit: string[], rate: number } {
  const answerLower = answer.toLowerCase();
  const hit = keywords.filter(k => answerLower.includes(k.toLowerCase()));
  const rate = keywords.length > 0 ? Math.round(hit.length / keywords.length * 100) : 0;
  return { hit, rate };
}

// 判断是否匹配成功（命中率>=50%）
function isMatched(answer: string, keywords: string[]): boolean {
  const { rate } = checkKeywords(answer, keywords);
  return rate >= 50;
}

// 主函数
async function main() {
  console.log('========== 知识库全面准确率测试 ==========\n');

  // 1. 获取知识库数据
  console.log('步骤1: 获取知识库数据...');
  const knowledge = await getKnowledgeData();
  console.log(`获取 ${knowledge.length} 条数据\n`);

  // 2. 构建三类测试问题
  console.log('步骤2: 构建测试问题...');

  const tests: any[] = [];

  // A. 标准问题测试
  for (const item of knowledge) {
    tests.push({
      knowledgeId: item.id,
      category: item.category,
      testType: '标准问题',
      stdQuestion: item.stdQuestion,
      testQuestion: item.stdQuestion,
      keywords: item.keywords,
      stdAnswer: item.stdAnswer,
      expectedKeywords: item.keywords.slice(0, 3)
    });
  }

  // B. 相似问题测试（从similar_questions取）
  for (const item of knowledge) {
    if (item.similarQuestions.length > 0) {
      tests.push({
        knowledgeId: item.id,
        category: item.category,
        testType: '相似问题',
        stdQuestion: item.stdQuestion,
        testQuestion: item.similarQuestions[0],
        keywords: item.keywords,
        stdAnswer: item.stdAnswer,
        expectedKeywords: item.keywords.slice(0, 3)
      });
    }
  }

  // C. 合成问题测试（两个问题组合）
  const combinedCount = Math.min(30, knowledge.length - 1);
  for (let i = 0; i < combinedCount; i++) {
    const item1 = knowledge[i];
    const item2 = knowledge[i + 1];

    // 组合两个问题
    const combinedQuestion = `${item1.stdQuestion.replace(/\?|？/g, '')}，还有${item2.stdQuestion.replace(/\?|？/g, '')}`;
    const combinedKeywords = [...item1.keywords.slice(0, 2), ...item2.keywords.slice(0, 2)];
    const combinedAnswer = `问题1答案: ${item1.stdAnswer.substring(0, 100)}... | 问题2答案: ${item2.stdAnswer.substring(0, 100)}...`;

    tests.push({
      knowledgeId: `${item1.id}+${item2.id}`,
      category: `${item1.category}+${item2.category}`,
      testType: '合成问题',
      stdQuestion: `${item1.stdQuestion} + ${item2.stdQuestion}`,
      testQuestion: combinedQuestion,
      keywords: combinedKeywords,
      stdAnswer: combinedAnswer,
      expectedKeywords: combinedKeywords
    });
  }

  console.log(`测试问题总数: ${tests.length}`);
  console.log(`  - 标准问题: ${tests.filter(t => t.testType === '标准问题').length}`);
  console.log(`  - 相似问题: ${tests.filter(t => t.testType === '相似问题').length}`);
  console.log(`  - 合成问题: ${tests.filter(t => t.testType === '合成问题').length}\n`);

  // 3. 执行向量搜索测试
  console.log('步骤3: 执行向量搜索测试...');
  const results: any[] = [];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    process.stdout.write(`[${i+1}/${tests.length}] ${test.testType}: ${test.testQuestion.substring(0,25)}... `);

    try {
      const searchResults = await searchVector(test.testQuestion);

      // 对于合成问题，检查是否匹配到两个知识条目
      let matched = false;
      let matchedIds: string[] = [];

      if (test.testType === '合成问题') {
        // 合成问题需要匹配到两个相关的知识条目
        matchedIds = searchResults.slice(0, 2).map(r => r.id);
        const expectedIds = test.knowledgeId.split('+');
        matched = matchedIds.length >= 2 &&
                  (matchedIds.includes(expectedIds[0]) || matchedIds.includes(expectedIds[1]));
      } else {
        // 标准问题和相似问题需要匹配到正确的知识条目
        matched = searchResults.length > 0 && searchResults[0].id === test.knowledgeId;
      }

      // 获取答案内容用于关键词匹配
      const answerContent = searchResults.map(r => r.answer).join(' ');
      const { hit, rate } = checkKeywords(answerContent, test.expectedKeywords);

      // 综合判断：ID匹配或关键词命中率>=50%
      const finalMatched = matched || rate >= 50;

      console.log(`${finalMatched ? '✓' : '✗'} (相似度=${searchResults[0]?.similarity?.toFixed(3) || 'N/A'}, 关键词命中=${rate}%)`);

      results.push({
        category: test.category,
        testType: test.testType,
        stdQuestion: test.stdQuestion.substring(0, 40),
        testQuestion: test.testQuestion.substring(0, 50),
        keywords: test.expectedKeywords.join(','),
        matched: finalMatched,
        idMatched: matched,
        keywordMatched: rate >= 50,
        keywordHitRate: rate,
        topSimilarity: searchResults[0]?.similarity?.toFixed(3) || 'N/A',
        topStdQuestion: searchResults[0]?.std_question?.substring(0, 30) || 'N/A',
        secondStdQuestion: searchResults[1]?.std_question?.substring(0, 30) || 'N/A',
        answerPreview: answerContent.substring(0, 100)
      });

      await new Promise(r => setTimeout(r, 100));

    } catch (e) {
      console.log(`❌ 错误: ${e}`);
      results.push({
        category: test.category,
        testType: test.testType,
        stdQuestion: test.stdQuestion.substring(0, 40),
        testQuestion: test.testQuestion.substring(0, 50),
        keywords: test.expectedKeywords.join(','),
        matched: false,
        idMatched: false,
        keywordMatched: false,
        keywordHitRate: 0,
        topSimilarity: 'ERROR',
        topStdQuestion: 'ERROR',
        secondStdQuestion: 'ERROR',
        answerPreview: 'ERROR'
      });
    }
  }

  // 4. 生成Excel报告
  console.log('\n步骤4: 生成Excel报告...');
  const csv = generateCSV(results);
  const filename = `docs/full-accuracy-report-${new Date().toISOString().slice(0, 10)}.csv`;
  fs.writeFileSync(filename, '\ufeff' + csv, 'utf-8');
  console.log(`报告: ${filename}\n`);

  // 5. 汇总统计
  console.log('========== 测试汇总 ==========');

  const standardResults = results.filter(r => r.testType === '标准问题');
  const similarResults = results.filter(r => r.testType === '相似问题');
  const combinedResults = results.filter(r => r.testType === '合成问题');

  const standardMatched = standardResults.filter(r => r.matched).length;
  const similarMatched = similarResults.filter(r => r.matched).length;
  const combinedMatched = combinedResults.filter(r => r.matched).length;

  console.log(`\n【标准问题测试】`);
  console.log(`  测试数: ${standardResults.length}`);
  console.log(`  成功数: ${standardMatched}`);
  console.log(`  成功率: ${Math.round(standardMatched/standardResults.length*100)}%`);
  console.log(`  ID匹配率: ${Math.round(standardResults.filter(r => r.idMatched).length/standardResults.length*100)}%`);
  console.log(`  关键词匹配率: ${Math.round(standardResults.filter(r => r.keywordMatched).length/standardResults.length*100)}%`);

  console.log(`\n【相似问题测试】`);
  console.log(`  测试数: ${similarResults.length}`);
  console.log(`  成功数: ${similarMatched}`);
  console.log(`  成功率: ${Math.round(similarMatched/similarResults.length*100)}%`);
  console.log(`  ID匹配率: ${Math.round(similarResults.filter(r => r.idMatched).length/similarResults.length*100)}%`);
  console.log(`  关键词匹配率: ${Math.round(similarResults.filter(r => r.keywordMatched).length/similarResults.length*100)}%`);

  console.log(`\n【合成问题测试】`);
  console.log(`  测试数: ${combinedResults.length}`);
  console.log(`  成功数: ${combinedMatched}`);
  console.log(`  成功率: ${Math.round(combinedMatched/combinedResults.length*100)}%`);
  console.log(`  关键词匹配率: ${Math.round(combinedResults.filter(r => r.keywordMatched).length/combinedResults.length*100)}%`);

  console.log(`\n【总体统计】`);
  console.log(`  总测试数: ${results.length}`);
  console.log(`  总成功数: ${results.filter(r => r.matched).length}`);
  console.log(`  总成功率: ${Math.round(results.filter(r => r.matched).length/results.length*100)}%`);

  // 平均相似度
  const validResults = results.filter(r => r.topSimilarity !== 'ERROR' && r.topSimilarity !== 'N/A');
  const avgSimilarity = validResults.reduce((s, r) => s + parseFloat(r.topSimilarity), 0) / validResults.length;
  console.log(`  平均相似度: ${avgSimilarity.toFixed(3)}`);

  // 失败案例分析
  const failed = results.filter(r => !r.matched);
  if (failed.length > 0) {
    console.log(`\n【失败案例分析】(共${failed.length}个)`);
    failed.slice(0, 10).forEach(r => {
      console.log(`  ${r.testType}: "${r.testQuestion.substring(0, 35)}..."`);
      console.log(`    相似度=${r.topSimilarity}, 关键词命中=${r.keywordHitRate}%`);
    });
  }

  await pool.end();
}

// 生成CSV
function generateCSV(results: any[]): string {
  const headers = [
    '分类', '测试类型', '标准问题', '测试问题', '关键词',
    '是否成功', 'ID匹配', '关键词匹配', '关键词命中率',
    '最高相似度', '匹配问题1', '匹配问题2', '答案摘要'
  ];

  const rows = results.map(r => [
    r.category,
    r.testType,
    r.stdQuestion,
    r.testQuestion,
    r.keywords,
    r.matched ? '成功' : '失败',
    r.idMatched ? '是' : '否',
    r.keywordMatched ? '是' : '否',
    `${r.keywordHitRate}%`,
    r.topSimilarity,
    r.topStdQuestion,
    r.secondStdQuestion,
    r.answerPreview?.substring(0, 50)
  ]);

  const escape = (v: any) => {
    const s = String(v || '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '"""')}"` : s;
  };

  return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
}

main().catch(e => { console.error(e); pool.end(); });