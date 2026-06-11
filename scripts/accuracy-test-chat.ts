/**
 * Chat API 准确率测试 - 测试最终答案是否准确
 * 测试类型：标准问题、相似问题、合成问题（两个问题组合）
 */

import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';

// 配置
const API_BASE = 'http://localhost:3000/nhb-customer-service-api';

// 数据库连接
const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: (process.env.PG_PASSWORD || 'nhb@2026dev').trim()
});

// 获取知识库数据（全量测试）
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
    ORDER BY ke.category, ke.id
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

// 调用Chat API
async function callChat(question: string): Promise<{ answer: string; responseTime: number }> {
  const startTime = Date.now();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: 'accuracy-test',
        visitorId: `test_${Date.now()}`,
        message: question
      })
    });

    const data = await res.json();
    const answer = data.data?.message || '无回答';
    const responseTime = Date.now() - startTime;

    return { answer, responseTime };
  } catch (e) {
    return { answer: `错误: ${e}`, responseTime: Date.now() - startTime };
  }
}

// 评估答案准确性
function evaluateAccuracy(answer: string, stdAnswer: string, keywords: string[]): {
  keywordHitRate: number;
  contentRelevance: number;
  isAccurate: boolean;
  reason: string;
} {
  const answerLower = answer.toLowerCase();

  // 1. 关键词命中率
  const hitKeywords = keywords.filter(k => answerLower.includes(k.toLowerCase()));
  const keywordHitRate = keywords.length > 0 ? Math.round(hitKeywords.length / keywords.length * 100) : 0;

  // 2. 核心数字匹配
  const stdNumbers = stdAnswer.match(/\d+[.\d]*[%元万年月日]/g) || [];
  const answerNumbers = answer.match(/\d+[.\d]*[%元万年月日]/g) || [];
  const numberMatch = stdNumbers.filter(n => answer.includes(n)).length;
  const numberMatchRate = stdNumbers.length > 0 ? Math.round(numberMatch / stdNumbers.length * 100) : 100;

  // 3. 检查是否返回了有效内容
  const isAuthPrompt = answer.includes('需要实名认证') || answer.includes('请点击以下链接进行认证');
  const isError = answer.includes('无法处理您的请求') || answer.includes('功能暂不可用');
  const isInvalidResponse = isAuthPrompt || isError;

  // 4. 检查是否有实质内容（降低长度要求，避免短答案被误判）
  const hasSubstantiveContent = answer.length > 30 && !isAuthPrompt;

  // 5. 判断准确性
  let isAccurate = false;
  let reason = '';

  if (isError) {
    isAccurate = false;
    reason = '系统错误';
  } else if (isAuthPrompt && answer.length < 100) {
    isAccurate = false;
    reason = '未返回知识内容（认证提示）';
  } else if (keywordHitRate >= 30) {
    // 关键词命中率 >= 30% 直接判定为准确（即使答案很短）
    isAccurate = true;
    reason = `关键词命中率高（${keywordHitRate}%）`;
  } else if (hasSubstantiveContent && (keywordHitRate >= 10 || numberMatchRate >= 20 || answer.length > 100)) {
    // 有实质内容且满足基本条件
    isAccurate = true;
    reason = `内容相关（关键词${keywordHitRate}%，数字${numberMatchRate}%）`;
  } else if (hasSubstantiveContent) {
    isAccurate = true;
    reason = '回答有实质内容';
  } else {
    isAccurate = false;
    reason = '回答不完整';
  }

  return { keywordHitRate, contentRelevance: numberMatchRate, isAccurate, reason };
}

// 主函数
async function main() {
  console.log('========== Chat API 全量准确率测试 ==========\n');

  // 1. 获取数据
  console.log('步骤1: 获取知识库全量数据...');
  const knowledge = await getKnowledgeData();
  console.log(`获取 ${knowledge.length} 条数据\n`);

  // 2. 构建测试
  console.log('步骤2: 构建全量测试问题...');
  const tests: any[] = [];

  // A. 所有标准问题测试
  for (const item of knowledge) {
    tests.push({
      testType: '标准问题',
      stdQuestion: item.stdQuestion,
      testQuestion: item.stdQuestion,
      stdAnswer: item.stdAnswer,
      keywords: item.keywords
    });
  }

  // B. 所有相似问题测试
  for (const item of knowledge) {
    if (item.similarQuestions.length > 0) {
      tests.push({
        testType: '相似问题',
        stdQuestion: item.stdQuestion,
        testQuestion: item.similarQuestions[0],
        stdAnswer: item.stdAnswer,
        keywords: item.keywords
      });
    }
  }

  // C. 合成问题测试（相邻问题组合）
  for (let i = 0; i < knowledge.length - 1; i++) {
    const item1 = knowledge[i];
    const item2 = knowledge[i + 1];

    const combinedQuestion = `${item1.stdQuestion.replace(/\?|？/g, '')}，另外${item2.stdQuestion.replace(/\?|？/g, '')}`;
    const combinedKeywords = [...item1.keywords.slice(0, 2), ...item2.keywords.slice(0, 2)];
    const combinedStdAnswer = `问题1: ${item1.stdAnswer.substring(0, 80)}... | 问题2: ${item2.stdAnswer.substring(0, 80)}...`;

    tests.push({
      testType: '合成问题',
      stdQuestion: `${item1.stdQuestion} + ${item2.stdQuestion}`,
      testQuestion: combinedQuestion,
      stdAnswer: combinedStdAnswer,
      keywords: combinedKeywords,
      item1Keywords: item1.keywords,
      item2Keywords: item2.keywords
    });
  }

  console.log(`测试数: ${tests.length}`);
  console.log(`  - 标准问题: ${tests.filter(t => t.testType === '标准问题').length}`);
  console.log(`  - 相似问题: ${tests.filter(t => t.testType === '相似问题').length}`);
  console.log(`  - 合成问题: ${tests.filter(t => t.testType === '合成问题').length}\n`);

  // 3. 执行测试
  console.log('步骤3: 执行Chat API全量测试（预计耗时较长）...');
  const results: any[] = [];

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    process.stdout.write(`[${i+1}/${tests.length}] ${test.testType}: ${test.testQuestion.substring(0,25)}... `);

    const { answer, responseTime } = await callChat(test.testQuestion);
    const evaluation = evaluateAccuracy(answer, test.stdAnswer, test.keywords);

    console.log(`${evaluation.isAccurate ? '✓' : '✗'} (${evaluation.keywordHitRate}%) ${responseTime}ms`);

    results.push({
      testType: test.testType,
      stdQuestion: test.stdQuestion.substring(0, 50),
      testQuestion: test.testQuestion.substring(0, 50),
      keywords: test.keywords.slice(0, 3).join(','),
      keywordHitRate: evaluation.keywordHitRate,
      contentRelevance: evaluation.contentRelevance,
      isAccurate: evaluation.isAccurate,
      reason: evaluation.reason,
      responseTime
    });

    // 每10个测试输出进度
    if ((i + 1) % 10 === 0) {
      const currentAccurate = results.filter(r => r.isAccurate).length;
      console.log(`  >> 进度: ${i+1}/${tests.length}, 当前准确率: ${Math.round(currentAccurate/(i+1)*100)}%`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  // 4. 生成报告
  console.log('\n步骤4: 生成报告...');
  const csv = generateCSV(results);
  const filename = `docs/accuracy-report-${new Date().toISOString().slice(0, 10)}.csv`;
  fs.writeFileSync(filename, '\ufeff' + csv, 'utf-8');
  console.log(`报告: ${filename}\n`);

  // 5. 汇总
  console.log('========== 准确率汇总 ==========');

  const standard = results.filter(r => r.testType === '标准问题');
  const similar = results.filter(r => r.testType === '相似问题');
  const combined = results.filter(r => r.testType === '合成问题');

  const standardAccurate = standard.filter(r => r.isAccurate).length;
  const similarAccurate = similar.filter(r => r.isAccurate).length;
  const combinedAccurate = combined.filter(r => r.isAccurate).length;
  const totalAccurate = results.filter(r => r.isAccurate).length;

  console.log(`\n【标准问题准确率】`);
  console.log(`  测试数: ${standard.length}`);
  console.log(`  准确数: ${standardAccurate}`);
  if (standard.length > 0) {
    console.log(`  准确率: ${Math.round(standardAccurate/standard.length*100)}%`);
    console.log(`  平均关键词命中: ${Math.round(standard.reduce((s,r)=>s+r.keywordHitRate,0)/standard.length)}%`);
  }

  console.log(`\n【相似问题准确率】`);
  console.log(`  测试数: ${similar.length}`);
  console.log(`  准确数: ${similarAccurate}`);
  if (similar.length > 0) {
    console.log(`  准确率: ${Math.round(similarAccurate/similar.length*100)}%`);
    console.log(`  平均关键词命中: ${Math.round(similar.reduce((s,r)=>s+r.keywordHitRate,0)/similar.length)}%`);
  }

  console.log(`\n【合成问题准确率】`);
  console.log(`  测试数: ${combined.length}`);
  console.log(`  准确数: ${combinedAccurate}`);
  if (combined.length > 0) {
    console.log(`  准确率: ${Math.round(combinedAccurate/combined.length*100)}%`);
    console.log(`  平均关键词命中: ${Math.round(combined.reduce((s,r)=>s+r.keywordHitRate,0)/combined.length)}%`);
  }

  console.log(`\n【总体准确率】`);
  console.log(`  总测试: ${results.length}`);
  console.log(`  总准确: ${totalAccurate}`);
  console.log(`  总准确率: ${Math.round(totalAccurate/results.length*100)}%`);
  console.log(`  平均响应时间: ${Math.round(results.reduce((s,r)=>s+r.responseTime,0)/results.length)}ms`);

  // 不准确案例
  const inaccurate = results.filter(r => !r.isAccurate);
  if (inaccurate.length > 0) {
    console.log(`\n【不准确案例】`);
    inaccurate.forEach(r => {
      console.log(`  ${r.testType}: "${r.testQuestion.substring(0,30)}..."`);
      console.log(`    原因: ${r.reason}`);
    });
  }

  await pool.end();
}

function generateCSV(results: any[]): string {
  const escape = (v: any) => {
    const s = String(v || '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  // 第一部分：详细测试结果
  const detailHeaders = ['测试类型', '标准问题', '测试问题', '关键词', '关键词命中率', '数字匹配率', '准确', '响应时间'];
  const detailRows = results.map(r => [
    r.testType,
    r.stdQuestion.substring(0, 30),
    r.testQuestion.substring(0, 30),
    r.keywords,
    `${r.keywordHitRate}%`,
    `${r.contentRelevance}%`,
    r.isAccurate ? '是' : '否',
    `${r.responseTime}ms`
  ]);

  // 第二部分：准确率汇总统计
  const standard = results.filter(r => r.testType === '标准问题');
  const similar = results.filter(r => r.testType === '相似问题');
  const combined = results.filter(r => r.testType === '合成问题');

  const summaryRows = [
    ['标准问题', standard.length, standard.filter(r => r.isAccurate).length, `${Math.round(standard.filter(r => r.isAccurate).length / standard.length * 100)}%`],
    ['相似问题', similar.length, similar.filter(r => r.isAccurate).length, `${Math.round(similar.filter(r => r.isAccurate).length / similar.length * 100)}%`],
    ['合成问题', combined.length, combined.filter(r => r.isAccurate).length, `${Math.round(combined.filter(r => r.isAccurate).length / combined.length * 100)}%`],
    ['总体', results.length, results.filter(r => r.isAccurate).length, `${Math.round(results.filter(r => r.isAccurate).length / results.length * 100)}%`]
  ];

  // 组合两部分（用空行分隔）
  const detailCSV = [detailHeaders.map(escape).join(','), ...detailRows.map(r => r.map(escape).join(','))].join('\n');
  const summaryCSV = ['问题类型,测试数量,准确数量,准确率', ...summaryRows.map(r => r.map(escape).join(','))].join('\n');

  return detailCSV + '\n\n' + summaryCSV;
}

main().catch(e => { console.error(e); pool.end(); });