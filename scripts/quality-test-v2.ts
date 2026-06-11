/**
 * 智能客服质量测试脚本 v2
 *
 * 直接从数据库获取知识库数据，测试真实问题
 */

import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';

// 配置
const API_BASE = 'http://localhost:3000/nhb-customer-service-api';
const CHANNEL_ID = 'quality-test';

// 数据库连接
const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: (process.env.PG_PASSWORD || 'nhb@2026dev').trim()
});

// 测试结果
interface TestResult {
  id: number;
  category: string;
  stdQuestion: string;
  stdAnswer: string;
  keywords: string[];
  actualAnswer: string;
  hitKeywords: string[];
  missKeywords: string[];
  hitRate: number;
  hasContent: boolean;
  responseTime: number;
  status: string;
}

// 从数据库获取知识库数据
async function getKnowledgeData() {
  const sql = `
    SELECT
      ke.std_question,
      ke.category,
      ke.keywords,
      ka.answer
    FROM knowledge_entries ke
    JOIN knowledge_answers ka ON ke.id = ka.knowledge_id
    WHERE ka.period = 6
    ORDER BY ke.category
    LIMIT 30
  `;

  const result = await pool.query(sql);
  return result.rows.map(row => ({
    stdQuestion: row.std_question,
    category: row.category || '未分类',
    keywords: row.keywords || [],
    answer: row.answer || ''
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

// 检查关键词
function checkKeywords(answer: string, keywords: string[]) {
  const hit = keywords.filter(k => answer.includes(k));
  const miss = keywords.filter(k => !answer.includes(k));
  const rate = keywords.length > 0 ? Math.round(hit.length / keywords.length * 100) : 0;
  return { hit, miss, rate };
}

// 判断是否有实质内容
function hasRealContent(answer: string) {
  const emptyPhrases = ['功能暂不可用', '请联系人工', '实名认证'];
  if (answer.length < 50) return false;
  if (emptyPhrases.some(p => answer.includes(p) && answer.length < 100)) return false;
  return true;
}

// 生成CSV
function generateCSV(results: TestResult[]) {
  const headers = ['序号', '分类', '标准问题', '标准答案摘要', '关键词',
    '智能客服答案', '命中关键词', '缺失关键词', '命中率%',
    '有实质内容', '响应时间ms', '状态'];

  const rows = results.map(r => [
    r.id, r.category, r.stdQuestion,
    r.stdAnswer.substring(0, 80).replace(/\n/g, ' | '),
    r.keywords.join(','),
    r.actualAnswer.substring(0, 150).replace(/\n/g, ' | '),
    r.hitKeywords.join(',') || '无',
    r.missKeywords.join(',') || '无',
    r.hitRate,
    r.hasContent ? '是' : '否',
    r.responseTime,
    r.status
  ]);

  const escape = (v: any) => {
    const s = String(v || '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
}

// 主函数
async function main() {
  console.log('========== 智能客服质量测试 ==========\n');

  // 1. 获取知识库数据
  console.log('步骤1: 从数据库获取知识库数据...');
  const knowledge = await getKnowledgeData();
  console.log(`获取 ${knowledge.length} 条数据\n`);

  // 2. 测试
  console.log('步骤2: 调用智能客服API...');
  const results: TestResult[] = [];

  for (let i = 0; i < knowledge.length; i++) {
    const item = knowledge[i];
    console.log(`测试 ${i + 1}: ${item.stdQuestion.substring(0, 20)}...`);

    const { answer, responseTime } = await callChat(item.stdQuestion);
    const { hit, miss, rate } = checkKeywords(answer, item.keywords);
    const hasContent = hasRealContent(answer);

    const status = rate >= 60 && hasContent ? '通过'
      : rate >= 30 || hasContent ? '部分通过'
      : '失败';

    results.push({
      id: i + 1,
      category: item.category,
      stdQuestion: item.stdQuestion,
      stdAnswer: item.answer,
      keywords: item.keywords,
      actualAnswer: answer,
      hitKeywords: hit,
      missKeywords: miss,
      hitRate: rate,
      hasContent,
      responseTime,
      status
    });

    console.log(`  命中: ${hit.join(',') || '无'} | 状态: ${status}`);

    await new Promise(r => setTimeout(r, 200));
  }

  // 3. 生成报告
  console.log('\n步骤3: 生成报告...');
  const csv = generateCSV(results);
  const filename = `docs/quality-report-${new Date().toISOString().slice(0, 10)}.csv`;
  fs.writeFileSync(filename, '\ufeff' + csv, 'utf-8');
  console.log(`保存: ${filename}\n`);

  // 4. 汇总
  console.log('========== 测试汇总 ==========');
  const passed = results.filter(r => r.status === '通过').length;
  const partial = results.filter(r => r.status === '部分通过').length;
  const failed = results.filter(r => r.status === '失败').length;
  const avgRate = Math.round(results.reduce((s, r) => s + r.hitRate, 0) / results.length);
  const avgTime = Math.round(results.reduce((s, r) => s + r.responseTime, 0) / results.length);

  console.log(`总数: ${results.length}`);
  console.log(`通过: ${passed} (${Math.round(passed/results.length*100)}%)`);
  console.log(`部分通过: ${partial}`);
  console.log(`失败: ${failed}`);
  console.log(`平均命中率: ${avgRate}%`);
  console.log(`平均响应时间: ${avgTime}ms`);

  if (failed > 0) {
    console.log('\n失败问题:');
    results.filter(r => r.status === '失败').forEach(r => {
      console.log(`  - ${r.stdQuestion.substring(0, 30)}`);
    });
  }

  await pool.end();
}

main().catch(e => { console.error(e); pool.end(); });