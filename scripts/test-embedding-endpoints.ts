// 测试不同的 DashScope Embedding 端点
const API_KEY = 'sk-sp-16f59be221c64174b5b00d9d20f0b57e';

const endpoints = [
  {
    name: 'OpenAI兼容模式',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
    body: { model: 'text-embedding-v3', input: ['测试'], dimension: 1024 }
  },
  {
    name: '原生API端点',
    url: 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding',
    body: {
      model: 'text-embedding-v3',
      input: { texts: ['测试'] },
      parameters: { dimension: 1024, text_type: 'query' }
    }
  },
];

async function testEndpoint(ep: { name: string; url: string; body: any }) {
  console.log(`\n测试 ${ep.name}: ${ep.url}`);

  try {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ep.body),
    });

    const data = await res.json();

    if (data.error) {
      console.log(`  ❌ 失败: ${data.error.message || data.error.code}`);
    } else if (data.data && data.data[0]?.embedding) {
      console.log(`  ✅ 成功! 向量维度: ${data.data[0].embedding.length}`);
      return true;
    } else if (data.output && data.output.embeddings) {
      console.log(`  ✅ 成功! 向量维度: ${data.output.embeddings[0].embedding.length}`);
      return true;
    } else {
      console.log(`  ❌ 响应: ${JSON.stringify(data).substring(0, 200)}`);
    }
  } catch (err: any) {
    console.log(`  ❌ 网络错误: ${err.message}`);
  }
  return false;
}

async function main() {
  for (const ep of endpoints) {
    const ok = await testEndpoint(ep);
    if (ok) {
      console.log('\n找到可用的端点!');
      process.exit(0);
    }
  }
  console.log('\n所有端点都失败');
}

main();