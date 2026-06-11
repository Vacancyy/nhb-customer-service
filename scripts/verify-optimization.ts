/**
 * 验证优化效果 - 重新测试之前失败的问题
 */

const API_BASE = 'http://localhost:3000/nhb-customer-service-api';

// 之前失败的问题及其期望答案中的关键词
const testCases = [
  {
    question: '投保这款产品是否需要健康告知/体检？',
    expectedKeywords: ['不需要', '健康告知', '体检'],
    expectedAnswerContains: '不需要健康告知'
  },
  {
    question: '其他城市什么时候上线？',
    expectedKeywords: ['正在', '积极', '沟通'],
    expectedAnswerContains: '正在积极'
  },
  {
    question: '有理赔次数限制吗？',
    expectedKeywords: ['没有限制', '理赔次数'],
    expectedAnswerContains: '理赔次数没有限制'
  },
  {
    question: '人工客服电话是多少？',
    expectedKeywords: ['4000040181', '电话'],
    expectedAnswerContains: '4000040181'
  },
  {
    question: '外籍人士可以投保这款产品吗？',
    expectedKeywords: ['外籍', '无法', '投保'],
    expectedAnswerContains: '无法'
  },
  {
    question: '这款产品的犹豫期有多久？',
    expectedKeywords: ['犹豫期', '无'],
    expectedAnswerContains: '犹豫期'
  },
  {
    question: '什么是商业保险？',
    expectedKeywords: ['商业保险', '保险合同', '营利'],
    expectedAnswerContains: '商业保险'
  },
  {
    question: '保险人是指什么？',
    expectedKeywords: ['保险人', '承保人', '保险公司'],
    expectedAnswerContains: '承保人'
  },
  {
    question: '种植牙是否可以报销',
    expectedKeywords: ['种植牙', '报销', '赔付'],
    expectedAnswerContains: '报销'
  },
  {
    question: '医院等级在哪里查看？',
    expectedKeywords: ['医疗机构查询系统', 'http'],
    expectedAnswerContains: '医疗机构查询系统'
  },
  {
    question: '在哪里查询投保须知？',
    expectedKeywords: ['投保须知', '参保入口', '公众号'],
    expectedAnswerContains: '投保须知'
  },
  {
    question: '怎么查宁惠保的电子保单？',
    expectedKeywords: ['电子保单', '下载', '保单'],
    expectedAnswerContains: '电子保单'
  },
  {
    question: '打哪个电话找客服？',
    expectedKeywords: ['400', '电话'],
    expectedAnswerContains: '400'
  }
];

async function callChat(question: string) {
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: 'optimization-test',
        visitorId: `opt_${Date.now()}`,
        message: question
      })
    });

    const data = await res.json();
    return {
      success: res.ok,
      answer: data.data?.message || '无回答',
      type: data.data?.type || '未知'
    };
  } catch (e) {
    return {
      success: false,
      answer: `请求失败: ${e}`,
      type: 'error'
    };
  }
}

async function main() {
  console.log('========== 优化效果验证测试 ==========\\n');

  let passedCount = 0;
  let failedCount = 0;
  const results: any[] = [];

  for (const tc of testCases) {
    const result = await callChat(tc.question);
    const answerLower = result.answer.toLowerCase();

    // 检查期望内容是否存在
    const hasExpectedContent = answerLower.includes(tc.expectedAnswerContains.toLowerCase());

    // 检查关键词命中
    const keywordHits = tc.expectedKeywords.filter(k => answerLower.includes(k.toLowerCase())).length;
    const keywordRate = Math.round(keywordHits / tc.expectedKeywords.length * 100);

    const passed = hasExpectedContent && keywordRate >= 50;

    console.log(`\\n【问题】${tc.question}`);
    console.log(`  期望内容: ${tc.expectedAnswerContains}`);
    console.log(`  实际回答: ${result.answer.substring(0, 150)}...`);
    console.log(`  关键词命中: ${keywordRate}% (${keywordHits}/${tc.expectedKeywords.length})`);
    console.log(`  期望内容存在: ${hasExpectedContent ? '✓' : '✗'}`);
    console.log(`  结果: ${passed ? '✓ 通过' : '✗ 失败'}`);

    if (passed) {
      passedCount++;
      results.push({ question: tc.question, status: 'passed', keywordRate });
    } else {
      failedCount++;
      results.push({ question: tc.question, status: 'failed', keywordRate, answer: result.answer });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\\n========== 测试汇总 ==========\\n');
  console.log(`测试总数: ${testCases.length}`);
  console.log(`通过: ${passedCount}个`);
  console.log(`失败: ${failedCount}个`);
  console.log(`准确率: ${Math.round(passedCount / testCases.length * 100)}%`);

  if (failedCount > 0) {
    console.log('\\n【失败案例详情】\\n');
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`问题: ${r.question}`);
      console.log(`关键词命中率: ${r.keywordRate}%`);
      console.log(`回答: ${r.answer.substring(0, 200)}...\\n`);
    });
  }
}

main();