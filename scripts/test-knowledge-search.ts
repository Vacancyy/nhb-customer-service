/**
 * 直接测试知识库向量搜索API
 */

const API_BASE = 'http://localhost:3000/nhb-customer-service-api';

async function testKnowledgeSearch(query: string) {
  console.log(`\n测试查询: "${query}"`);

  const res = await fetch(`${API_BASE}/knowledge/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: query, topK: 3 })
  });

  const data = await res.json();
  console.log('响应状态:', res.status);

  if (data.code === 200 && data.data) {
    console.log('找到', data.data.length, '条结果:');
    data.data.forEach((r: any, i: number) => {
      console.log(`  #${i+1}: 相似度=${r.similarity?.toFixed(4)}, "${r.std_question?.substring(0, 40)}..."`);
      if (r.answers && r.answers.length > 0) {
        console.log(`      答案: ${r.answers[0].answer?.substring(0, 60)}...`);
      }
    });
  } else {
    console.log('错误:', data.msg);
  }
}

async function main() {
  console.log('========== 知识库向量搜索测试 ==========\n');

  // 测试失败问题的搜索
  await testKnowledgeSearch('健康告知');
  await testKnowledgeSearch('体检');
  await testKnowledgeSearch('投保这款产品是否需要健康告知/体检');

  console.log('\n--- 分割线 ---\n');

  await testKnowledgeSearch('犹豫期');
  await testKnowledgeSearch('这款产品的犹豫期有多久');
}

main();