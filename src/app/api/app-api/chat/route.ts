import { NextRequest, NextResponse } from 'next/server';
import { toolRegistry, loadAllTools, ToolCall, ToolResult, ToolContext } from '@/skills';

import {
  initSession,
  buildModelMessages,
  saveConversationToHistory,
} from '@/lib/session';
import { AjaxResult } from '@/lib/AjaxResult';
import { getSystemPrompt, ERROR_MESSAGES, AUTH_CONFIG } from '@/lib/prompts';
import { logInfo, logError } from '@/lib/logger';
import { getUserAuthCache } from '@/lib/redis';
import { createTrace, flushLangfuse, generateTraceId, updateTraceOutput, logGeneration, LangfuseTraceClient } from '@/lib/langfuse';
import { extractUserIdFromHeader } from '@/lib/auth-token';

const DASHSCOPE_API_KEY = 'sk-57fbd990f89045ddb5795aa9e405d420';
const DASHSCOPE_CHAT_MODEL = process.env.DASHSCOPE_CHAT_MODEL || 'qwen-plus';
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const VERIFY_URL = process.env.VERIFY_URL || '/nhb-customer-service/web/app/verify';

// 从环境变量获取 Agent 最大循环次数，默认 5
const MAX_ITERATIONS = parseInt(process.env.MAX_AGENT_ITERATIONS || '5');

// 初始化
let toolsLoaded = false;
function ensureToolsLoaded() {
  if (!toolsLoaded) {
    loadAllTools();
    toolsLoaded = true;
  }
}

// 调用千问模型
interface ModelResponse {
  content: string | null;
  tool_calls: ToolCall[] | null;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface QwenCallOptions {
  trace?: LangfuseTraceClient | null;
  iteration?: number;
  userMessage?: string; // 用户原始问题
}

async function callQwen(
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
    }),
  });

  if (!response.ok) {
    throw new Error(`千问 API 调用失败: ${await response.text()}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  const usage = data.usage;

  const endTime = new Date();

  // 记录到 Langfuse - 只记录关键信息，避免重复存储历史
  if (options?.trace) {
    // 计算历史长度
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

// 流式调用千问模型（用于最终回复）
async function* callQwenStreaming(
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
      stream: true,  // 启用流式输出
    }),
  });

  if (!response.ok) {
    throw new Error(`千问 API 流式调用失败: ${await response.text()}`);
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

// 流式事件类型
interface StreamEvent {
  type: 'session' | 'status' | 'content' | 'done' | 'error' | 'auth';
  content?: string;
  status?: string;
  verifyUrl?: string;
  userId?: string;
  channel?: string;
  isNewUser?: boolean;
}

// 流式 Agent Loop - 全程流式输出，包含中间状态
async function* runAgentLoopStreaming(
  userMessage: string,
  userId: bigint,
  channel: string,
  trace: LangfuseTraceClient | null
): AsyncGenerator<StreamEvent> {
  // 发送会话信息
  yield {
    type: 'session',
    userId: userId.toString(),
    channel,
    isNewUser: false, // 将在外部设置
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

    // 如果有工具调用，执行并继续循环
    if (response.tool_calls && response.tool_calls.length > 0) {
      // 检查是否有需要实名认证的工具
      const authRequiredTools = response.tool_calls.filter(tc => toolRegistry.requiresAuth(tc.function.name));

      if (authRequiredTools.length > 0 && !userAuth) {
        // 需要实名认证但用户未认证
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

        // 添加工具结果到消息
        messages.push({
          role: 'tool',
          content: result.content,
          tool_call_id: result.tool_call_id,
        });
      }

      // 发送"正在生成回答"状态
      yield { type: 'status', status: '正在生成回答...' };

      // 继续循环，让模型处理工具结果
      continue;
    }

    // 没有工具调用，流式输出最终回复
    break;
  }

  // 流式输出 LLM 回复
  for await (const chunk of callQwenStreaming(messages)) {
    yield { type: 'content', content: chunk };
  }

  // 发送完成信号
  yield { type: 'done' };
}

// Agent Loop 返回结果（保留用于兼容）
interface AgentResult {
  type: 'reply' | 'auth' | 'stream';
  message?: string;
  verifyUrl?: string;
  stream?: AsyncGenerator<string>;
  messages?: Array<{ role: string; content: string; tool_call_id?: string }>;
}

// Agent Loop - 非流式版本（已弃用，保留兼容）
async function runAgentLoop(
  userMessage: string,
  userId: bigint,
  channel: string,
  trace: LangfuseTraceClient | null
): Promise<AgentResult> {
  // 从 Redis 获取用户实名认证信息
  const userAuth = await getUserAuthCache(userId.toString());

  // 构建工具上下文（直接传递给 execute，避免并发问题）
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

    // 如果有工具调用，执行并继续循环
    if (response.tool_calls && response.tool_calls.length > 0) {
      // 检查是否有需要实名认证的工具
      const authRequiredTools = response.tool_calls.filter(tc => toolRegistry.requiresAuth(tc.function.name));

      if (authRequiredTools.length > 0 && !userAuth) {
        // 需要实名认证但用户未认证，返回认证提示
        return {
          type: 'auth',
          message: AUTH_CONFIG.VERIFY_REQUIRED_MESSAGE,
          verifyUrl: VERIFY_URL,
        };
      }

      // 执行所有工具调用
      for (const toolCall of response.tool_calls) {
        const result = await toolRegistry.execute(toolCall, context);

        // 添加工具结果到消息
        messages.push({
          role: 'tool',
          content: result.content,
          tool_call_id: result.tool_call_id,
        });
      }
      // 继续循环，让模型处理工具结果
      continue;
    }

    // 没有工具调用，使用流式输出最终回复
    break;
  }

  // 返回流式生成器和消息历史（用于后续保存）
  return {
    type: 'stream',
    stream: callQwenStreaming(messages),
    messages,
  };
}

export async function POST(req: NextRequest) {
  try {
    ensureToolsLoaded();

    if (!DASHSCOPE_API_KEY) {
      return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.API_KEY_NOT_CONFIGURED));
    }

    const body = await req.json();
    const { message, channel } = body;

    // 从 Header 获取 userId
    const authHeader = req.headers.get('Authorization');
    const userId = extractUserIdFromHeader(authHeader);

    if (!userId) {
      return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.USER_ID_REQUIRED, 400));
    }

    // 初始化用户会话
    const session = await initSession(userId, channel);

    // 创建 Langfuse trace（记录用户输入）
    const traceId = generateTraceId(session.userId.toString());
    const trace = createTrace({
      id: traceId,
      userId: session.userId.toString(),
      sessionId: `${session.userId}_${session.channel}`,
      name: 'chat_session',
      input: message,
      metadata: {
        channel: session.channel,
        isNewUser: session.isNewUser,
      },
    });

    // 使用全程流式 Agent Loop
    const encoder = new TextEncoder();
    let fullReply = '';

    // 创建 SSE 流响应
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 运行流式 Agent Loop
          const agentStream = runAgentLoopStreaming(message, session.userId, session.channel, trace);

          for await (const event of agentStream) {
            // 处理不同类型的事件
            if (event.type === 'session') {
              // 更新 isNewUser 并发送会话信息
              event.isNewUser = session.isNewUser;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (event.type === 'status') {
              // 发送状态更新
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (event.type === 'auth') {
              // 认证提示
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              controller.close();
              if (trace) {
                updateTraceOutput(trace, event.content || '');
              }
              flushLangfuse();
              return;
            } else if (event.type === 'content') {
              // 流式内容
              fullReply += event.content || '';
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (event.type === 'done') {
              // 完成
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              controller.close();

              // 保存对话和更新 trace
              if (trace) {
                updateTraceOutput(trace, fullReply);
              }
              await saveConversationToHistory(session.userId, session.channel, message, fullReply);
              flushLangfuse();
            }
          }
        } catch (err) {
          logError('Streaming error', { error: err });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: '流式输出出错' })}\n\n`));
          controller.close();
          flushLangfuse();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    logError('Chat API error', { error: errMsg });
    flushLangfuse();
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}