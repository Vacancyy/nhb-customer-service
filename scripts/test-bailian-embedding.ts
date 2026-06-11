// 测试阿里云百炼 Embedding API
const API_KEY = 'sk-57fbd990f89045ddb5795aa9e405d420';

async function testEmbedding() {
  console.log('测试阿里云百炼 Embedding API...');
  console.log('API Key:', API_KEY.substring(0, 15) + '...');

  const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

  // 测试不同的请求格式
  const formats = [
    { name: 'OpenAI兼容-v3', body: { model: 'text-embedding-v3', input: '测试' } },
    { name: 'OpenAI兼容-v2', body: { model: 'text-embedding-v2', input: '测试' } },
    { name: 'OpenAI兼容-数组', body: { model: 'text-embedding-v3', input: ['测试'] } },
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

      if (data.data && data.data[0]?.embedding) {
        console.log(`✅ 成功! 向量维度: ${data.data[0].embedding.length}`);
        console.log('模型:', data.model);
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

  console.log('\n所有格式都失败');
  return false;
}

testEmbedding();