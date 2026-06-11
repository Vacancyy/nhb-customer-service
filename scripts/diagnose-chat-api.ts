/**
 * 直接测试Chat API返回内容
 * 看LLM具体返回了什么答案
 */

const API_BASE = 'http://localhost:3000/nhb-customer-service-api';

// 失败的标准问题
const testQuestions = [
  '投保这款产品是否需要健康告知/体检？',
  '其他城市什么时候上线？',
  '有理赔次数限制吗？',
  '人工客服电话是多少？',
  '外籍人士可以投保这款产品吗？',
  '什么是商业保险？',
  '这款产品的犹豫期有多久？',
  '种植牙是否可以报销'
];

async function callChat(question: string) {
  const startTime = Date.now();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: 'diagnostic-test',
        visitorId: `test_${Date.now()}`,
        message: question
      })
    });

    const data = await res.json();
    const answer = data.data?.message || '无回答';
    const responseTime = Date.now() - startTime;

    return { answer, responseTime, fullData: data };
  } catch (e) {
    return { answer: `错误: ${e}`, responseTime: Date.now() - startTime, fullData: null };
  }
}

async function main() {
  console.log('========== Chat API 实际返回内容诊断 ==========\n');
  console.log('测试服务器是否运行...');

  // 检查服务器
  try {
    const healthCheck = await fetch(API_BASE.replace('/chat', '/health'), { method: 'GET' });
    console.log(`服务器状态: ${healthCheck.ok ? '✓ 运行中' : '✗ 无响应'}`);
  } catch {
    console.log('服务器状态: ✗ 无法连接，请先启动 npm run dev');
    return;
  }

  console.log('\n========== 开始测试 ==========\n');

  for (const question of testQuestions) {
    console.log(`\n【问题】${question}`);
    console.log('-'.repeat(50));

    const result = await callChat(question);

    console.log(`【响应时间】${result.responseTime}ms`);
    console.log(`【返回类型】${result.fullData?.data?.type || '未知'}`);
    console.log(`【完整回答】`);
    console.log(result.answer);

    // 检查关键信息
    const answerLower = result.answer.toLowerCase();

    // 根据问题检查关键信息是否包含
    const keyInfoChecks: Record<string, string[]> = {
      '投保这款产品是否需要健康告知/体检？': ['不需要', '健康告知', '体检'],
      '其他城市什么时候上线？': ['正在', '积极', '沟通'],
      '有理赔次数限制吗？': ['没有限制', '理赔次数'],
      '人工客服电话是多少？': ['400', '电话'],
      '外籍人士可以投保这款产品吗？': ['外籍', '无法', '投保'],
      '什么是商业保险？': ['商业保险', '保险合同', '营利'],
      '这款产品的犹豫期有多久？': ['犹豫期', '无'],
      '种植牙是否可以报销': ['种植牙', '报销', '赔付']
    };

    const expectedKeys = keyInfoChecks[question] || [];
    const foundKeys = expectedKeys.filter(k => answerLower.includes(k.toLowerCase()));
    const missingKeys = expectedKeys.filter(k => !answerLower.includes(k.toLowerCase()));

    console.log(`\n【关键词检查】`);
    console.log(`  期望关键词: ${expectedKeys.join(', ')}`);
    console.log(`  已命中: ${foundKeys.length > 0 ? foundKeys.join(', ') : '无'}`);
    console.log(`  未命中: ${missingKeys.length > 0 ? missingKeys.join(', ') : '无'}`);

    if (missingKeys.length > 0) {
      console.log(`  ❌ 问题: 回答中缺少关键信息！`);
    } else {
      console.log(`  ✓ 回答包含所有关键信息`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n========== 诊断结论 ==========\n');
  console.log('如果回答中缺少关键信息，说明：');
  console.log('  1. 知识库内容存在但LLM未正确输出');
  console.log('  2. LLM可能对知识库结果进行了过度概括或改写');
  console.log('  3. 需要优化系统提示词，要求LLM完整输出知识库内容');
}

main();