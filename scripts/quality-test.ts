/**
 * 智能客服自动化质量测试脚本
 *
 * 功能：
 * 1. 通过API获取知识库数据
 * 2. 使用LLM生成50个测试问题（简单到复杂）
 * 3. 调用智能客服API获取答案
 * 4. 使用LLM评估答案准确率
 * 5. 生成Excel测试报告
 */

// 加载环境变量
import 'dotenv/config';

// 配置
const API_BASE = 'http://localhost:3008/nhb-customer-service-api';
const CHANNEL_ID = '89c06202-b87c-46fd-b391-b0c59f834ef1';
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || 'sk-57fbd990f89045ddb5795aa9e405d420';
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// 测试结果类型
interface TestResult {
  id: number;
  difficulty: '简单' | '中等' | '复杂';
  stdQuestion: string;
  stdAnswer: string;
  testQuestion: string;
  actualAnswer: string;
  accuracy: number;
  keyInfoCoverage: string;
  completeness: string;
  responseTime: number;
  triggeredSkill: string;
  evaluationReason: string;
}

// 通过API获取知识库数据
async function fetchKnowledgeData(): Promise<Array<{stdQuestion: string, answer: string, keywords: string[]}>> {
  try {
    const response = await fetch(`${API_BASE}/knowledge`);
    const data = await response.json();

    if (data.code === 200 && data.data) {
      return data.data.map((item: any) => ({
        stdQuestion: item.std_question || item.question || '',
        answer: item.answer || '',
        keywords: item.keywords || []
      }));
    }
  } catch (error) {
    console.error('获取知识库数据失败:', error);
  }

  // 返回预设数据作为备用
  return [
    { stdQuestion: '免赔额是多少', answer: '基础版99元：责任一免赔额1.5万至2万元...', keywords: ['免赔额', '1.5万', '99元'] },
    { stdQuestion: '家庭成员共享免赔额', answer: '家庭成员人数在3至7人之间可共享...', keywords: ['3人', '7人', '家庭'] },
    { stdQuestion: '参保时间', answer: '即日起至2025年12月31日...', keywords: ['参保时间', '2025', '12月31日'] },
    { stdQuestion: '门诊特殊病有哪些', answer: '恶性肿瘤、器官移植术后...', keywords: ['恶性肿瘤', '门诊特殊病'] },
    { stdQuestion: '直赔登记流程', answer: '通过我的南京APP或微信公众号...', keywords: ['我的南京', '微信', '直赔'] },
    { stdQuestion: '省外医保能参保吗', answer: '可以参保，需提供居住证明...', keywords: ['省外医保', '居住证明'] },
    { stdQuestion: '既往症赔付比例', answer: '既往症赔付60%或30%...', keywords: ['既往症', '60%', '30%'] },
    { stdQuestion: '门诊开药能理赔吗', answer: '普通门诊开药不在理赔范围内...', keywords: ['门诊', '理赔'] },
  ];
}

// 使用LLM生成测试问题
async function generateTestQuestions(knowledgeData: Array<{stdQuestion: string, answer: string, keywords: string[]}>) {
  const prompt = `你是一个保险知识测试专家。请根据以下知识库数据，生成50个测试问题。

要求：
1. 问题分为三个难度：简单（直接问）、中等（换个说法问）、复杂（场景化问题）
2. 每个问题都要有明确的预期答案关键词
3. 问题要覆盖不同主题：免赔额、参保条件、理赔流程、保障范围、直赔登记等

知识库数据：
${knowledgeData.map((k, i) => `${i+1}. 问题：${k.stdQuestion}\n答案：${k.answer.substring(0, 200)}...`).join('\n\n')}

请输出JSON格式：
{
  "questions": [
    {
      "id": 1,
      "difficulty": "简单",
      "stdQuestion": "标准问题",
      "stdAnswer": "标准答案摘要",
      "testQuestion": "生成的测试问题",
      "keyTerms": ["关键词1", "关键词2"]
    }
  ]
}

只输出JSON，不要其他内容。`;

  const response = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // 解析JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  throw new Error('无法解析LLM返回的JSON');
}

// 调用智能客服API
async function callChatAPI(question: string): Promise<{answer: string, responseTime: number, skill: string}> {
  const startTime = Date.now();

  try {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: CHANNEL_ID,
        visitorId: `test_${Date.now()}`,
        message: question
      })
    });

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    return {
      answer: data.data?.message || data.msg || '无回复',
      responseTime,
      skill: 'knowledge_query' // 从日志推断
    };
  } catch (error) {
    return {
      answer: 'API调用失败',
      responseTime: Date.now() - startTime,
      skill: 'error'
    };
  }
}

// 使用LLM评估答案准确率
async function evaluateAnswer(
  stdQuestion: string,
  stdAnswer: string,
  testQuestion: string,
  actualAnswer: string,
  keyTerms: string[]
): Promise<{accuracy: number, keyInfoCoverage: string, completeness: string, reason: string}> {
  const prompt = `你是一个保险客服质量评估专家。请评估以下智能客服回答的质量。

标准问题：${stdQuestion}
标准答案：${stdAnswer}

测试问题：${testQuestion}
智能客服回答：${actualAnswer}

预期关键词：${keyTerms.join(', ')}

请从以下维度评估（满分100分）：
1. 关键信息覆盖率：答案是否包含预期关键词（0-40分）
2. 答案准确性：信息是否正确无误（0-30分）
3. 答案完整性：是否完整回答了问题（0-20分）
4. 答案相关性：是否与问题相关（0-10分）

请输出JSON格式：
{
  "accuracy": 85,
  "keyInfoCoverage": "覆盖了免赔额、赔付比例",
  "completeness": "完整回答",
  "reason": "答案包含了关键信息，但缺少部分细节"
}

只输出JSON，不要其他内容。`;

  try {
    const response = await fetch(DASHSCOPE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'qwen-plus',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // 解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('评估失败:', error);
  }

  return {
    accuracy: 0,
    keyInfoCoverage: '评估失败',
    completeness: '评估失败',
    reason: 'LLM评估失败'
  };
}

// 生成CSV报告
function generateCSVReport(results: TestResult[]): string {
  const headers = [
    '序号', '问题难度', '标准问题', '标准答案', '测试问题',
    '智能客服答案', '准确率(%)', '关键信息覆盖', '答案完整性',
    '响应时间(ms)', '触发技能', '评估说明'
  ];

  const rows = results.map(r => [
    r.id,
    r.difficulty,
    r.stdQuestion,
    r.stdAnswer.substring(0, 100).replace(/[\n\r]/g, ' '),
    r.testQuestion,
    r.actualAnswer.substring(0, 200).replace(/[\n\r]/g, ' '),
    r.accuracy,
    r.keyInfoCoverage,
    r.completeness,
    r.responseTime,
    r.triggeredSkill,
    r.evaluationReason.replace(/[\n\r]/g, ' ')
  ]);

  // CSV转义
  const escapeCSV = (val: any) => {
    const str = String(val || '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  return [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ].join('\n');
}

// 主函数
async function main() {
  console.log('========== 智能客服自动化质量测试 ==========\n');

  // 1. 获取知识库数据
  console.log('步骤1: 读取知识库数据...');
  const knowledgeData = await fetchKnowledgeData();
  console.log(`获取到 ${knowledgeData.length} 条知识库数据\n`);

  // 2. 生成测试问题
  console.log('步骤2: 使用LLM生成测试问题...');
  let testQuestions;
  try {
    testQuestions = await generateTestQuestions(knowledgeData);
    console.log(`生成了 ${testQuestions.questions?.length || 0} 个测试问题\n`);
  } catch (error) {
    console.error('生成测试问题失败，使用预设问题');
    // 使用预设问题
    testQuestions = {
      questions: knowledgeData.slice(0, 20).map((k, i) => ({
        id: i + 1,
        difficulty: i < 7 ? '简单' : i < 14 ? '中等' : '复杂',
        stdQuestion: k.stdQuestion,
        stdAnswer: k.answer.substring(0, 200),
        testQuestion: k.stdQuestion,
        keyTerms: k.keywords
      }))
    };
  }

  // 3. 执行测试
  console.log('步骤3: 调用智能客服API...');
  const results: TestResult[] = [];

  for (const q of testQuestions.questions || []) {
    console.log(`测试 ${q.id}: ${q.testQuestion.substring(0, 30)}...`);

    // 调用API
    const apiResult = await callChatAPI(q.testQuestion);

    // 评估答案
    const evaluation = await evaluateAnswer(
      q.stdQuestion,
      q.stdAnswer,
      q.testQuestion,
      apiResult.answer,
      q.keyTerms || []
    );

    results.push({
      id: q.id,
      difficulty: q.difficulty,
      stdQuestion: q.stdQuestion,
      stdAnswer: q.stdAnswer,
      testQuestion: q.testQuestion,
      actualAnswer: apiResult.answer,
      accuracy: evaluation.accuracy,
      keyInfoCoverage: evaluation.keyInfoCoverage,
      completeness: evaluation.completeness,
      responseTime: apiResult.responseTime,
      triggeredSkill: apiResult.skill,
      evaluationReason: evaluation.reason
    });

    // 短暂延迟避免API限流
    await new Promise(r => setTimeout(r, 500));
  }

  // 4. 生成报告
  console.log('\n步骤4: 生成测试报告...');
  const csv = generateCSVReport(results);
  const filename = `docs/quality-test-report-${new Date().toISOString().slice(0,10)}.csv`;

  // 写入文件
  const fs = await import('fs');
  fs.writeFileSync(filename, '\ufeff' + csv, 'utf-8'); // 添加BOM确保Excel正确显示中文

  console.log(`报告已生成: ${filename}`);

  // 5. 统计汇总
  console.log('\n========== 测试汇总 ==========');
  const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
  const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;

  const byDifficulty = {
    '简单': results.filter(r => r.difficulty === '简单'),
    '中等': results.filter(r => r.difficulty === '中等'),
    '复杂': results.filter(r => r.difficulty === '复杂')
  };

  console.log(`总测试数: ${results.length}`);
  console.log(`平均准确率: ${avgAccuracy.toFixed(1)}%`);
  console.log(`平均响应时间: ${avgResponseTime.toFixed(0)}ms`);
  console.log('\n按难度统计:');
  for (const [diff, items] of Object.entries(byDifficulty)) {
    if (items.length > 0) {
      const avg = items.reduce((s, r) => s + r.accuracy, 0) / items.length;
      console.log(`  ${diff}: ${items.length}题, 平均准确率 ${avg.toFixed(1)}%`);
    }
  }

  // 关闭进程
console.log('\n测试完成！');
}

main().catch(console.error);