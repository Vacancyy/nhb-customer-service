/**
 * Chat API意图路由测试
 */

async function testChat(question: string) {
  const res = await fetch('http://localhost:3000/nhb-customer-service-api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId: 'test',
      visitorId: `test_${Date.now()}`,
      message: question
    })
  });

  const data = await res.json();
  return data;
}

async function main() {
  console.log('========== Chat API 意图路由测试 ==========\n');

  const testQuestions = [
    '什么是南京宁惠保？',
    '保费是多少？',
    '免赔额是多少？',
    '可以给家人买吗？',
    '如何理赔？'
  ];

  for (const q of testQuestions) {
    console.log(`问题: "${q}"`);
    const result = await testChat(q);
    console.log(`回答: ${result.data?.message?.substring(0, 200) || 'N/A'}\n`);
    await new Promise(r => setTimeout(r, 500));
  }
}

main();