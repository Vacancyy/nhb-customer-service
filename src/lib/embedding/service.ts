// 阿里云 DashScope 向量嵌入服务

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
// OpenAI 兼容模式的嵌入接口
const DASHSCOPE_EMBEDDING_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings';

export interface EmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// 调用 text-embedding 模型生成向量
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!DASHSCOPE_API_KEY) {
    throw new Error('DASHSCOPE_API_KEY 未配置');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('文本内容不能为空');
  }

  const response = await fetch(DASHSCOPE_EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-v3',
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`嵌入 API 调用失败: ${errorText}`);
  }

  const data: EmbeddingResponse = await response.json();

  if (!data.data || data.data.length === 0) {
    throw new Error('嵌入结果为空');
  }

  return data.data[0].embedding;
}

// 批量生成向量（最多支持 10 条文本，阿里云百炼限制）
export async function generateEmbeddingBatch(texts: string[]): Promise<number[][]> {
  if (!DASHSCOPE_API_KEY) {
    throw new Error('DASHSCOPE_API_KEY 未配置');
  }

  if (!texts || texts.length === 0) {
    throw new Error('文本列表不能为空');
  }

  // 过滤空文本
  const validTexts = texts.filter(t => t && t.trim().length > 0);
  if (validTexts.length === 0) {
    throw new Error('没有有效的文本内容');
  }

  const response = await fetch(DASHSCOPE_EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-v3',
      input: validTexts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`嵌入 API 调用失败: ${errorText}`);
  }

  const data: EmbeddingResponse = await response.json();

  if (!data.data || data.data.length === 0) {
    throw new Error('嵌入结果为空');
  }

  // 按索引排序返回
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}