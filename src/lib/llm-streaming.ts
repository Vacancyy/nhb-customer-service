// 共享 LLM 流式逻辑 — SSE route 和 WS handler 共用

import { toolRegistry, loadAllTools, ToolCall, ToolContext } from '@/skills';
import { buildModelMessages } from '@/lib/session';
import { getSystemPrompt, AUTH_CONFIG } from '@/lib/prompts';
import { getUserAuthCache } from '@/lib/redis';
import { logInfo, logError } from '@/lib/logger';
import { createTrace, flushLangfuse, generateTraceId, logGeneration, LangfuseTraceClient } from '@/lib/langfuse';
import { ConversationMetadata } from '@/lib/history';

// 从环境变量获取配置
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const DASHSCOPE_CHAT_MODEL = process.env.DASHSCOPE_CHAT_MODEL || 'qwen-plus';
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const VERIFY_URL = process.env.VERIFY_URL || 'web/app/verify';
const MAX_ITERATIONS = parseInt(process.env.MAX_AGENT_ITERATIONS || '5');

// 初始化工具加载
let toolsLoaded = false;
export function ensureToolsLoaded() {
  if (!toolsLoaded) {
    loadAllTools();
    toolsLoaded = true;
  }
}

// 模型响应类型
export interface ModelResponse {
  content: string | null;
  tool_calls: ToolCall[] | null;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// 流式事件类型
export interface StreamEvent {
  type: 'session' | 'status' | 'content' | 'done' | 'error' | 'auth' | 'metadata';
  content?: string;
  status?: string;
  verifyUrl?: string;
  userId?: string;
  channel?: string;
  isNewUser?: boolean;
  metadata?: ConversationMetadata;
}

// 调用千问模型（非流式，用于判断工具调用）
interface QwenCallOptions {
  trace?: LangfuseTraceClient | null;
  iteration?: number;
  userMessage?: string;
}

export async function callQwen(
  messages: Array<{ role: string; content: string; tool_call_id?: string }>,
  options?: QwenCallOptions
): Promise<ModelResponse> {
  const startTime = new Date();

  const response = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: DASHSCOPE_CHAT_MODEL,
      messages,
      tools: toolRegistry.getDefinitions(),
      tool_choice: 'auto',
      enable_thinking: false,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    logError('DashScope API non-200 response', { status: response.status, body: errBody });
    throw new Error('功能暂不可用，建议转人工客服');
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  const usage = data.usage;

  const endTime = new Date();

  if (options?.trace) {
    const historyLength = messages.filter(m => m.role !== 'tool').length;

    logGeneration({
      trace: options.trace,
      name: `model_call_${options.iteration || 1}`,
      input: messages,
      output: message?.content || JSON.stringify(message?.tool_calls),
      model: DASHSCOPE_CHAT_MODEL,
      startTime,
      endTime,
      historyLength,
      usage: usage ? {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        total: usage.total_tokens,
      } : undefined,
      metadata: {
        iteration: options.iteration,
        hasToolCalls: !!message?.tool_calls,
        toolCallCount: message?.tool_calls?.length || 0,
      },
    });
  }

  return {
    content: message?.content || null,
    tool_calls: message?.tool_calls || null,
    usage,
  };
}

// 纯流式输出（不含工具定义，用于最终回复）
// DashScope 只有在不带 tools 参数时才能逐字符流式输出
export async function* callQwenStreaming(
  messages: Array<{ role: string; content: string; tool_call_id?: string }>
): AsyncGenerator<string> {
  const response = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: DASHSCOPE_CHAT_MODEL,
      messages,
      stream: true,
      enable_thinking: false,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    logError('DashScope streaming API non-200 response', { status: response.status, body: errBody });
    throw new Error('功能暂不可用，建议转人工客服');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('无法获取响应流');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data:')) continue;

        const data = trimmedLine.slice(5).trim();
        if (data === '[DONE]') break;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // 忽略解析错误，继续处理下一行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// 流式 Agent Loop — 真流式输出
// 流程：callQwen(非流式判断工具) → 有工具则执行 → callQwenStreaming(纯流式输出最终回复)
// 为什么最终回复用 callQwenStreaming(不含 tools)：
//   DashScope 带 tools 参数的流式调用不会逐字符输出 content，会大块甚至一次性输出
//   不带 tools 的纯流式调用才是真流式（逐字符 yield）
export async function* runAgentLoopStreaming(
  userMessage: string,
  userId: bigint,
  channel: string,
  trace: LangfuseTraceClient | null,
  isNewUser: boolean = false
): AsyncGenerator<StreamEvent> {
  // 元数据捕获
  const requestStartTime = Date.now();
  let firstTokenTime: number | undefined;
  const toolCallsDetail: Array<{ name: string; arguments: Record<string, any>; result: string }> = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokensCount = 0;
  let hasToolCalls = false;

  // 发送会话信息
  yield {
    type: 'session',
    userId: userId.toString(),
    channel,
    isNewUser,
  };

  // 发送初始状态
  yield { type: 'status', status: '正在思考...' };

  // 从 Redis 获取用户实名认证信息
  const userAuth = await getUserAuthCache(userId.toString());

  // 构建工具上下文
  const context: ToolContext = {
    userId: userId.toString(),
    channel,
    trace: trace || undefined,
    userAuth: userAuth ? { name: userAuth.name, idCard: userAuth.idCard, phone: userAuth.phone } : undefined,
  };

  // 构建包含历史的消息列表
  const systemPrompt = await getSystemPrompt();
  const historyMessages = await buildModelMessages(userId, channel, systemPrompt, userMessage);

  // 转换为支持 tool_call_id 的格式
  const messages: Array<{ role: string; content: string; tool_call_id?: string }> = historyMessages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const response = await callQwen(messages, { trace, iteration: iterations, userMessage });
    logInfo(`Agent loop iteration: ${iterations}`);

    // 累积 token usage
    if (response.usage) {
      totalPromptTokens += response.usage.prompt_tokens;
      totalCompletionTokens += response.usage.completion_tokens;
      totalTokensCount += response.usage.total_tokens;
    }

    // 如果有工具调用，执行并继续循环
    if (response.tool_calls && response.tool_calls.length > 0) {
      hasToolCalls = true;

      // 检查是否有需要实名认证的工具
      const authRequiredTools = response.tool_calls.filter(tc => toolRegistry.requiresAuth(tc.function.name));

      if (authRequiredTools.length > 0 && !userAuth) {
        // 保存认证对话的元数据（内部事件，不推送给客户端）
        yield {
          type: 'metadata',
          metadata: {
            generation_time: Date.now() - requestStartTime,
            model_used: DASHSCOPE_CHAT_MODEL,
            has_tool_calls: true,
            tool_calls_detail: toolCallsDetail.length > 0 ? toolCallsDetail : null,
            prompt_tokens: totalPromptTokens,
            completion_tokens: totalCompletionTokens,
            total_tokens: totalTokensCount,
            agent_iterations: iterations,
          },
        };
        yield {
          type: 'auth',
          content: AUTH_CONFIG.VERIFY_REQUIRED_MESSAGE,
          verifyUrl: VERIFY_URL,
        };
        return;
      }

      // 发送工具调用状态
      const toolNames = response.tool_calls.map(tc => tc.function.name);
      const statusMap: Record<string, string> = {
        'knowledge_query': '正在查询知识库...',
        'order_query': '正在查询保单信息...',
        'claim_query': '正在查询理赔记录...',
      };
      const primaryTool = toolNames[0];
      yield { type: 'status', status: statusMap[primaryTool] || '正在处理...' };

      // 执行所有工具调用
      for (const toolCall of response.tool_calls) {
        const result = await toolRegistry.execute(toolCall, context);
        toolCallsDetail.push({
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
          result: result.content,
        });

        // 添加工具结果到消息
        messages.push({
          role: 'tool',
          content: result.content,
          tool_call_id: result.tool_call_id,
        });
      }

      // 发送"正在生成回答"状态
      yield { type: 'status', status: '正在生成回答...' };

      // 工具执行完毕，直接跳到流式输出最终回复（不再多调一次非流式）
      break;
    }

    // 没有工具调用，直接流式输出最终回复
    break;
  }

  // 真流式输出最终回复（不含 tools，逐字符 yield）
  let gotFirstToken = false;
  for await (const chunk of callQwenStreaming(messages)) {
    if (!gotFirstToken) {
      firstTokenTime = Date.now() - requestStartTime;
      gotFirstToken = true;
    }
    yield { type: 'content', content: chunk };
  }

  const generationTime = Date.now() - requestStartTime;

  // 发送元数据事件（内部事件，不推送给客户端）
  yield {
    type: 'metadata',
    metadata: {
      first_token_time: firstTokenTime,
      generation_time: generationTime,
      model_used: DASHSCOPE_CHAT_MODEL,
      has_tool_calls: hasToolCalls,
      tool_calls_detail: toolCallsDetail.length > 0 ? toolCallsDetail : null,
      prompt_tokens: totalPromptTokens,
      completion_tokens: totalCompletionTokens,
      total_tokens: totalTokensCount,
      agent_iterations: iterations,
    },
  };

  // 发送完成信号
  yield { type: 'done' };
}

// 创建 Langfuse trace（方便外部调用）
export function createChatTrace(userId: string, channel: string, isNewUser: boolean, input: string) {
  const traceId = generateTraceId(userId);
  return createTrace({
    id: traceId,
    userId,
    sessionId: `${userId}_${channel}`,
    name: 'chat_session',
    input,
    metadata: { channel, isNewUser },
  });
}
