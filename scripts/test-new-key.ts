// 测试用户提供的新 API Key
const API_KEY = 'sk-sp-16f59be221c64174b5b00d9d20f0b57e';
const url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

async function test() {
  console.log('测试 API Key: ' + API_KEY.substring(0, 15) + '...');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-v3',
      input: ['测试文本'],
      dimension: 1024,
    }),
  });

  const data = await res.json();

  if (data.error) {
    console.log('❌ 失败:', data.error.message);
  } else if (data.data && data.data[0].embedding) {
    console.log('✅ 成功! 向量维度:', data.data[0].embedding.length);
    return true;
  } else {
    console.log('❌ 响应异常:', JSON.stringify(data, null, 2));
  }
  return false;
}

test();