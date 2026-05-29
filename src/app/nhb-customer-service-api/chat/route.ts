import { NextRequest, NextResponse } from 'next/server';
import { toolRegistry, loadAllTools, ToolCall, ToolResult, ToolContext } from '@/skills';

import {
  initSession,
  buildModelMessages,
  saveConversationToHistory,
} from '@/lib/session';
import { AjaxResult } from '@/lib/AjaxResult';
import { AGENT_PROMPTS, ERROR_MESSAGES, AUTH_CONFIG } from '@/lib/prompts';
import { logInfo, logError } from '@/lib/logger';
import { getUserAuthCache } from '@/lib/redis';
import { createTrace, flushLangfuse, generateTraceId, updateTraceOutput, logGeneration, LangfuseTraceClient } from '@/lib/langfuse';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_CHAT_MODEL = process.env.DASHSCOPE_CHAT_MODEL || 'qwen-plus';
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const VERIFY_URL = process.env.VERIFY_URL || '/nhb-customer-service/verify';

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

// Agent Loop 返回结果
interface AgentResult {
  type: 'reply' | 'auth';
  message: string;
  verifyUrl?: string;
}

// Agent Loop
async function runAgentLoop(
  userMessage: string,
  userId: bigint,
  channel: string,
  trace: LangfuseTraceClient | null
): Promise<AgentResult> {
  // 从 Redis 获取用户实名认证信息
  const userAuth = await getUserAuthCache(userId.toString());

  // 设置工具上下文
  const context: ToolContext = {
    userId: userId.toString(),
    channel,
    trace: trace || undefined,
    userAuth: userAuth ? { name: userAuth.name, idCard: userAuth.idCard, phone: userAuth.phone } : undefined,
  };
  toolRegistry.setContext(context);

  // 构建包含历史的消息列表
  const historyMessages = await buildModelMessages(userId, channel, AGENT_PROMPTS.SYSTEM, userMessage);

  // 转换为支持 tool_call_id 的格式
  const messages: Array<{ role: string; content: string; tool_call_id?: string }> = historyMessages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  let iterations = 0;
  let finalReply = '';

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const response = await callQwen(messages, { trace, iteration: iterations, userMessage });
    logInfo(`Agent loop iteration: ${iterations}`);
    // 如果有文本回复，记录并可能结束
    if (response.content) {
      finalReply = response.content;
    }

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
        const result = await toolRegistry.execute(toolCall);

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

    // 没有工具调用，结束循环
    break;
  }

  if (!finalReply) {
    finalReply = AGENT_PROMPTS.DEFAULT_REPLY;
  }

  return {
    type: 'reply',
    message: finalReply,
  };
}

export async function POST(req: NextRequest) {
  try {
    ensureToolsLoaded();

    if (!DASHSCOPE_API_KEY) {
      return NextResponse.json(AjaxResult.error(ERROR_MESSAGES.API_KEY_NOT_CONFIGURED));
    }

    const body = await req.json();
    const { message, userId, channel } = body;

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

    // 运行 Agent Loop
    const agentResult = await runAgentLoop(message, session.userId, session.channel, trace);

    // 更新 Langfuse trace 输出（记录最终回复）
    if (trace) {
      updateTraceOutput(trace, agentResult.message);
    }

    // 保存完整对话（用户问题 + 系统回答）
    await saveConversationToHistory(session.userId, session.channel, message, agentResult.message);

    // Flush Langfuse 数据（异步非阻塞）
    flushLangfuse();

    // 返回响应
    return NextResponse.json(
      AjaxResult.success({
        type: agentResult.type,
        message: agentResult.message,
        verifyUrl: agentResult.verifyUrl,
        userId: session.userId.toString(),
        channel: session.channel,
        isNewUser: session.isNewUser,
      })
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : ERROR_MESSAGES.SYSTEM_ERROR;
    logError('Chat API error', { error: errMsg });
    // 确保出错时也 flush（异步非阻塞）
    flushLangfuse();
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}