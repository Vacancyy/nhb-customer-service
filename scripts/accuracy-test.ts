/**
 * 知识库准确率测试脚本 - 精简版
 *
 * 只测试有效数据，生成清晰的报告
 */

import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';

// 配置
const API_BASE = 'http://localhost:3001/nhb-customer-service-api';
const CHANNEL_ID = 'accuracy-test';

// 数据库连接
const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: (process.env.PG_PASSWORD || 'nhb@2026dev').trim()
});

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
    LIMIT 20
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

// 调用智能客服
async function callChat(question: string) {
  const start = Date.now();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: CHANNEL_ID,
        visitorId: `test_${Date.now()}`,
        message: question
      })
    });

    const data = await res.json();
    return {
      answer: data.data?.message || '',
      responseTime: Date.now() - start
    };
  } catch (e) {
    return { answer: 'API失败', responseTime: Date.now() - start };
  }
}

// 检查关键词命中
function checkKeywords(answer: string, keywords: string[]) {
  const hit = keywords.filter(k => answer.includes(k));
  const rate = keywords.length > 0 ? Math.round(hit.length / keywords.length * 100) : 0;
  return { hit, rate };
}

// 判断是否匹配成功
function isMatched(answer: string, hitRate: number): boolean {
  if (answer.includes('功能暂不可用') && answer.length < 100) return false;
  if (answer.includes('请联系人工') && answer.length < 80) return false;
  if (hitRate >= 30) return true;
  if (answer.length > 100 && !answer.includes('暂不可用')) return true;
  return false;
}

// 生成CSV报告
function generateCSV(results: any[]): string {
  const headers = [
    '序号', '分类', '难度', '测试问题', '关键词',
    '智能客服答案摘要', '命中关键词', '命中率%', '匹配成功', '响应时间ms'
  ];

  const rows = results.map((r, i) => [
    i + 1,
    r.category,
    r.difficulty,
    r.question,
    r.keywords.join(','),
    r.answer.substring(0, 100).replace(/\n/g, ' | '),
    r.hitKeywords.join(',') || '无',
    r.hitRate,
    r.matched ? '✓' : '✗',
    r.responseTime
  ]);

  const escape = (v: any) => {
    const s = String(v || '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
}

// 主函数
async function main() {
  console.log('========== 知识库准确率测试 ==========\n');

  // 1. 获取数据
  console.log('步骤1: 从数据库获取知识库数据...');
  const knowledge = await getKnowledgeData();
  console.log(`获取 ${knowledge.length} 条有效数据\n`);

  // 2. 构建测试问题
  console.log('步骤2: 构建测试问题...');
  const tests: any[] = [];

  for (const item of knowledge) {
    // 简单：标准问题
    tests.push({
      category: item.category,
      difficulty: '简单',
      question: item.stdQuestion,
      keywords: item.keywords,
      stdAnswer: item.stdAnswer
    });

    // 中等：相似问题（只取1个）
    if (item.similarQuestions.length > 0) {
      tests.push({
        category: item.category,
        difficulty: '中等',
        question: item.similarQuestions[0],
        keywords: item.keywords,
        stdAnswer: item.stdAnswer
      });
    }
  }

  console.log(`测试问题: ${tests.length} 个 (简单${tests.filter(t=>t.difficulty==='简单').length}, 中等${tests.filter(t=>t.difficulty==='中等').length})\n`);

  // 3. 执行测试
  console.log('步骤3: 执行测试...');
  const results: any[] = [];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`[${i+1}/${tests.length}] ${test.question.substring(0,25)}...`);

    const { answer, responseTime } = await callChat(test.question);
    const { hit, rate } = checkKeywords(answer, test.keywords);
    const matched = isMatched(answer, rate);

    results.push({
      category: test.category,
      difficulty: test.difficulty,
      question: test.question,
      keywords: test.keywords,
      answer,
      hitKeywords: hit,
      hitRate: rate,
      matched,
      responseTime
    });

    console.log(`  命中: ${hit.join(',') || '无'} (${rate}%) ${matched?'✓':'✗'}\n`);

    await new Promise(r => setTimeout(r, 200));
  }

  // 4. 生成报告
  const csv = generateCSV(results);
  const filename = `docs/test-result-${new Date().toISOString().slice(0,10)}.csv`;
  fs.writeFileSync(filename, '\ufeff' + csv, 'utf-8');
  console.log(`报告: ${filename}\n`);

  // 5. 汇总
  console.log('========== 测试汇总 ==========');

  const simple = results.filter(r => r.difficulty === '简单');
  const medium = results.filter(r => r.difficulty === '中等');

  const simpleMatched = simple.filter(r => r.matched).length;
  const mediumMatched = medium.filter(r => r.matched).length;

  console.log(`\n【简单级别】标准问题`);
  console.log(`  测试: ${simple.length} | 成功: ${simpleMatched} (${Math.round(simpleMatched/simple.length*100)}%)`);
  console.log(`  平均命中率: ${Math.round(simple.reduce((s,r)=>s+r.hitRate,0)/simple.length)}%`);

  console.log(`\n【中等级别】相似问题`);
  console.log(`  测试: ${medium.length} | 成功: ${mediumMatched} (${Math.round(mediumMatched/medium.length*100)}%)`);
  console.log(`  平均命中率: ${Math.round(medium.reduce((s,r)=>s+r.hitRate,0)/medium.length)}%`);

  console.log(`\n【总体】`);
  const totalMatched = results.filter(r => r.matched).length;
  console.log(`  测试: ${results.length} | 成功: ${totalMatched} (${Math.round(totalMatched/results.length*100)}%)`);
  console.log(`  平均响应时间: ${Math.round(results.reduce((s,r)=>s+r.responseTime,0)/results.length)}ms`);

  // 失败问题
  const failed = results.filter(r => !r.matched);
  if (failed.length > 0 && failed.length <= 10) {
    console.log(`\n失败问题:`);
    failed.forEach(r => console.log(`  - ${r.question.substring(0,40)}`));
  }

  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });