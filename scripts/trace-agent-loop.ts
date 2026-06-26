/**
 * 追踪 Agent Loop 详细过程 - 诊断为什么某些问题返回默认错误
 */

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const DASHSCOPE_CHAT_MODEL = 'qwen-plus';
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// 模拟系统提示词
const SYSTEM_PROMPT = `你是一个专业的"南京宁惠保"保险客服助手并且只能回答"南京宁惠保"相关信息,你可以使用提供的工具来帮助用户查询信息。

## 工具使用规则
1. 根据用户问题选择合适的工具,每个工具在一次对话中只调用一次,不要重复调用同一个工具
2. 工具返回结果后,直接基于结果生成对用户的回复,不要再次调用工具
3. 只基于工具返回的信息回答，禁止捏造、臆测或自行获取信息
4. 工具信息不足时，诚实告知"未查询到相关信息"，建议转人工客服
5. 工具未提供的信息（如订单是否自动续保），回复"无法判断"
6. 如果需要查询知识库，请对用户的问题提取关键词作为查询参数，例如用户咨询"保费是多少"，关键词是"保费"
7. 如果skill调用异常报错，直接提示该功能暂不可用，建议转人工客服，不要给用户提供其他建议
8. 回答要专业、礼貌、简洁

## 知识库回答规则（最重要）
1. 当知识库工具返回"找到 X 条相关知识"时，必须基于第一条匹配结果回答用户问题
2. 必须完整输出知识库返回的答案内容，不得省略、概括或改写关键信息
3. 答案中的关键数字、电话号码、网址、期限等具体信息必须原样输出，不能遗漏
4. 如果知识库返回的"答案"字段包含完整回答，直接引用该内容回答用户
5. 禁止在知识库有明确答案时回复"无法处理"或"未查询到"
6. 知识库答案中的关键词必须体现在你的回答中

## 回答格式要求
1. 优先使用知识库中的标准答案内容回答
2. 回答要完整、准确，包含用户问题涉及的所有关键信息
3. 如果用户问的是具体数值或期限（如犹豫期、保费、电话），必须明确给出答案`;

// 工具定义
const tools = [
  {
    type: 'function',
    function: {
      name: 'knowledge_query',
      description: '查询南京宁惠保知识库，获取保险产品相关信息、投保规则、理赔流程等知识。用于回答用户关于产品的一般性问题。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '查询关键词，提取用户问题中的核心关键词'
          },
          period: {
            type: 'number',
            description: '指定期数（可选），如5表示第5期'
          }
        },
        required: ['query']
      }
    }
  }
];

// 模拟知识库返回
function simulateKnowledgeReturn(query: string): string {
  const knowledgeBase: Record<string, string> = {
    '健康告知': `✅ 找到 1 条相关知识:

━━━ 知识库匹配结果 #1 ━━━
标准问题: 投保这款产品是否需要健康告知/体检？
【必须包含的关键词】: 健康告知, 体检, 是否需要, 带病投保, 免告知

【第6期答案 - 请直接引用此内容回答用户】
您好，这款产品不需要健康告知，也不需要体检。
（来源: 知识库）

匹配相似度: 0.85 (高度匹配)

【回答指引】
1. 请使用第一条匹配结果的答案内容直接回答用户问题
2. 必须包含"必须包含的关键词"中的所有关键词
3. 不要对答案进行概括或省略，保持答案完整性`,
    '犹豫期': `✅ 找到 1 条相关知识:

━━━ 知识库匹配结果 #1 ━━━
标准问题: 这款产品的犹豫期有多久？
【必须包含的关键词】: 犹豫期, 无

【第6期答案 - 请直接引用此内容回答用户】
这款产品无犹豫期。
（来源: 知识库）

匹配相似度: 0.82 (高度匹配)

【回答指引】
1. 请使用第一条匹配结果的答案内容直接回答用户问题
2. 必须包含"必须包含的关键词"中的所有关键词
3. 不要对答案进行概括或省略，保持答案完整性`
  };

  // 简单关键词匹配
  for (const key of Object.keys(knowledgeBase)) {
    if (query.includes(key)) {
      return knowledgeBase[key];
    }
  }

  return '知识库中未找到相关信息。【请直接告知用户，不要再调用工具】';
}

async function callQwen(messages: Array<{ role: string; content: string; tool_call_id?: string }>) {
  console.log('\n>>> 调用 LLM...');
  console.log('消息数量:', messages.length);

  const response = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: DASHSCOPE_CHAT_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
    }),
  });

  if (!response.ok) {
    throw new Error(`千问 API 调用失败: ${await response.text()}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;

  console.log('<<< LLM 返回:');
  if (message?.content) {
    console.log('  content:', message.content.substring(0, 200) + '...');
  }
  if (message?.tool_calls) {
    console.log('  tool_calls:', message.tool_calls.map(tc => tc.function.name + '(' + tc.function.arguments + ')'));
  }

  return {
    content: message?.content || null,
    tool_calls: message?.tool_calls || null,
  };
}

async function runAgentLoop(userMessage: string) {
  console.log('\n========== Agent Loop 详细追踪 ==========');
  console.log('用户问题:', userMessage);

  const messages: Array<{ role: string; content: string; tool_call_id?: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage }
  ];

  const MAX_ITERATIONS = 5;
  let iterations = 0;
  let finalReply = '';

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log('\n--- Iteration', iterations, '---');

    const response = await callQwen(messages);

    if (response.content) {
      finalReply = response.content;
      console.log('>>> 记录最终回复:', finalReply.substring(0, 100) + '...');
    }

    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        console.log('\n>>> 执行工具:', toolCall.function.name);
        const args = JSON.parse(toolCall.function.arguments);
        console.log('    参数:', args);

        // 模拟知识库返回
        const toolResult = simulateKnowledgeReturn(args.query || userMessage);
        console.log('<<< 工具返回:', toolResult.substring(0, 150) + '...');

        messages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
        });
      }
      continue;
    }

    // 没有工具调用，结束循环
    console.log('\n>>> 无工具调用，结束循环');
    break;
  }

  console.log('\n========== 最终结果 ==========');
  console.log('迭代次数:', iterations);
  console.log('finalReply 是否为空:', !finalReply);
  if (finalReply) {
    console.log('最终回复:', finalReply);
  } else {
    console.log('最终回复: [DEFAULT_REPLY] 抱歉，我无法处理您的请求，请稍后再试或联系人工客服。');
  }

  return finalReply || '[DEFAULT_REPLY]';
}

async function main() {
  // 测试失败的问题
  await runAgentLoop('投保这款产品是否需要健康告知/体检？');

  console.log('\n\n========================================\n\n');

  await runAgentLoop('这款产品的犹豫期有多久？');
}

main();