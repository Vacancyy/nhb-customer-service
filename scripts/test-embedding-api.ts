// 测试不同的 DashScope API Key 格式
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const API_KEYS = [
  process.env.DASHSCOPE_API_KEY,
];

async function testEmbedding(apiKey: string, label: string) {
  console.log(`\n测试 ${label}: ${apiKey?.substring(0, 10)}...`);

  try {
    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-v3',
        input: ['测试文本'],
        dimension: 1024,
      }),
    });

    const data = await response.json();
    if (data.error) {
      console.log(`  ❌ 失败: ${data.error.message}`);
    } else {
      console.log(`  ✅ 成功! 向量维度: ${data.data[0].embedding.length}`);
      return true;
    }
  } catch (err: any) {
    console.log(`  ❌ 请求失败: ${err.message}`);
  }
  return false;
}

async function main() {
  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i];
    if (key) {
      const success = await testEmbedding(key, `Key ${i + 1}`);
      if (success) {
        console.log('\n找到有效的 API Key!');
        process.exit(0);
      }
    }
  }
  console.log('\n所有 API Key 都无效，请检查 DashScope 控制台');
  process.exit(1);
}

main();