// 测试批量 embedding 格式
const API_KEY = 'sk-57fbd990f89045ddb5795aa9e405d420';

async function testBatchEmbedding() {
  console.log('测试批量 Embedding API...');

  const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

  // 测试批量输入
  const batchTexts = ['测试文本1', '测试文本2'];

  const formats = [
    { name: '批量-数组', body: { model: 'text-embedding-v3', input: batchTexts } },
    { name: '批量-带dimension', body: { model: 'text-embedding-v3', input: batchTexts, dimension: 1024 } },
  ];

  for (const fmt of formats) {
    console.log(`\n测试 ${fmt.name}:`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fmt.body),
      });

      const data = await res.json();

      if (data.data && data.data.length > 0) {
        console.log(`✅ 成功! 返回 ${data.data.length} 条向量`);
        console.log('向量维度:', data.data[0].embedding.length);
        return true;
      } else if (data.error) {
        console.log(`❌ 错误: ${data.error.message}`);
      } else {
        console.log(`❌ 响应:`, JSON.stringify(data).substring(0, 200));
      }
    } catch (err: any) {
      console.log(`❌ 异常: ${err.message}`);
    }
  }

  return false;
}

testBatchEmbedding();