import { NextRequest, NextResponse } from 'next/server';
import { toolRegistry, loadAllTools, ToolContext } from '@/skills';
import {
  initSession,
  buildModelMessages,
  saveConversationToHistory,
} from '@/lib/session';
import { ConversationMetadata } from '@/lib/history';
import { AjaxResult } from '@/lib/AjaxResult';
import { getSystemPrompt, AUTH_CONFIG } from '@/lib/prompts';
import { logInfo, logError } from '@/lib/logger';
import { getUserAuthCache, getRedisClient, REDIS_KEY_PREFIX } from '@/lib/redis';
import { createTrace, flushLangfuse, generateTraceId, updateTraceOutput, logGeneration, LangfuseTraceClient } from '@/lib/langfuse';
import { extractUserIdFromHeader } from '@/lib/auth-token';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';
const DASHSCOPE_CHAT_MODEL = process.env.DASHSCOPE_CHAT_MODEL || 'qwen-plus';
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const VERIFY_URL = process.env.VERIFY_URL || 'web/app/verify';
const MAX_ITERATIONS = parseInt(process.env.MAX_AGENT_ITERATIONS || '5');

// 初始化工具
let toolsLoaded = false;
function ensureToolsLoaded() {
  if (!toolsLoaded) {
    loadAllTools();
    toolsLoaded = true;
  }
}

// 非流式调用千问模型（生成完整回答）
interface ModelResponse {
  content: string | null;
  tool_calls: any[] | null;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function callQwenNonStreaming(
  messages: Array<{ role: string; content: string; tool_call_id?: string }>,
  trace?: LangfuseTraceClient | null,
  iteration?: number
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
    logError('DashScope API non-200 response (pending)', { status: response.status, body: errBody });
    throw new Error('功能暂不可用，建议转人工客服');
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  const usage = data.usage;
  const endTime = new Date();

  // 记录到 Langfuse
  if (trace) {
    logGeneration({
      trace,
      name: `model_call_${iteration || 1}`,
      input: messages,
      output: message?.content || JSON.stringify(message?.tool_calls),
      model: DASHSCOPE_CHAT_MODEL,
      startTime,
      endTime,
      usage: usage ? {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        total: usage.total_tokens,
      } : undefined,
      metadata: {
        iteration,
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

// Agent Loop - 非流式版本，生成完整回答后保存为 pending
async function runAgentLoopPending(
  userMessage: string,
  userId: bigint,
  channel: string,
  trace: LangfuseTraceClient | null,
  saveStatus: 'pending' | 'success' = 'pending'
): Promise<{ reply: string; recordId: number | null; type?: string; verifyUrl?: string; metadata?: ConversationMetadata }> {
  // 元数据捕获
  const requestStartTime = Date.now();
  const toolCallsDetail: Array<{ name: string; arguments: Record<string, any>; result: string }> = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokensCount = 0;
  let hasToolCalls = false;

  // 获取用户实名认证信息
  const userAuth = await getUserAuthCache(userId.toString());

  // 构建工具上下文
  const context: ToolContext = {
    userId: userId.toString(),
    channel,
    trace: trace || undefined,
    userAuth: userAuth ? { name: userAuth.name, idCard: userAuth.idCard, phone: userAuth.phone } : undefined,
  };

  // 构建包含历史的消息列表（只包含已审核通过的）
  const systemPrompt = await getSystemPrompt();
  const historyMessages = await buildModelMessages(userId, channel, systemPrompt, userMessage);

  // 转换为支持 tool_call_id 的格式
  const messages: Array<{ role: string; content: string; tool_call_id?: string }> = historyMessages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));

  let iterations = 0;
  let fullReply = '';

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const response = await callQwenNonStreaming(messages, trace, iterations);
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

      // 检查是否需要实名认证
      const authRequiredTools = response.tool_calls.filter(tc => toolRegistry.requiresAuth(tc.function.name));

      if (authRequiredTools.length > 0 && !userAuth) {
        // 需要实名认证但未认证，返回 auth 类型响应（不走审核流程）
        const metadata: ConversationMetadata = {
          generation_time: Date.now() - requestStartTime,
          model_used: DASHSCOPE_CHAT_MODEL,
          has_tool_calls: true,
          tool_calls_detail: toolCallsDetail.length > 0 ? toolCallsDetail : null,
          prompt_tokens: totalPromptTokens,
          completion_tokens: totalCompletionTokens,
          total_tokens: totalTokensCount,
          agent_iterations: iterations,
        };
        return {
          reply: AUTH_CONFIG.VERIFY_REQUIRED_MESSAGE,
          recordId: null,
          type: 'auth',
          verifyUrl: VERIFY_URL,
          metadata,
        };
      }

      // 执行所有工具调用
      for (const toolCall of response.tool_calls) {
        const result = await toolRegistry.execute(toolCall, context);
        toolCallsDetail.push({
          name: toolCall.function.name,
          arguments: JSON.parse(toolCall.function.arguments),
          result: result.content,
        });
        messages.push({
          role: 'tool',
          content: result.content,
          tool_call_id: result.tool_call_id,
        });
      }

      // 继续循环
      continue;
    }

    // 没有工具调用，获取最终回复
    fullReply = response.content || '';
    break;
  }

  const generationTime = Date.now() - requestStartTime;

  // 构建元数据（pending 路径无 first_token_time）
  const metadata: ConversationMetadata = {
    generation_time: generationTime,
    model_used: DASHSCOPE_CHAT_MODEL,
    has_tool_calls: hasToolCalls,
    tool_calls_detail: toolCallsDetail.length > 0 ? toolCallsDetail : null,
    prompt_tokens: totalPromptTokens,
    completion_tokens: totalCompletionTokens,
    total_tokens: totalTokensCount,
    agent_iterations: iterations,
  };

  // 保存到数据库 — 由调用方决定 status
  const recordId = await saveConversationToHistory(userId, channel, userMessage, fullReply, saveStatus, metadata);

  return { reply: fullReply, recordId, metadata };
}

export async function POST(req: NextRequest) {
  try {
    ensureToolsLoaded();

    if (!DASHSCOPE_API_KEY) {
      return NextResponse.json(AjaxResult.error('API Key 未配置'));
    }

    const body = await req.json();
    const { message, channel } = body;

    // 从 Header 获取 userId
    const authHeader = req.headers.get('Authorization');
    const userId = extractUserIdFromHeader(authHeader);

    if (!userId) {
      return NextResponse.json(AjaxResult.error('缺少用户标识'));
    }

    // 初始化会话
    const session = await initSession(userId, channel);

    // 检查审核开关：审核关闭时直接保存 success，避免被 auto-handle 覆盖
    // Redis 不可用时默认审核关闭（安全降级）
    let saveStatus: 'pending' | 'success' = 'success';
    try {
      const redisClient = getRedisClient();
      const reviewEnabledValue = await redisClient.get(`${REDIS_KEY_PREFIX.SYSTEM_CONFIG}review_enabled`);
      const reviewEnabled = reviewEnabledValue === 'true' || reviewEnabledValue === '1';
      saveStatus = reviewEnabled ? 'pending' : 'success';
    } catch (redisErr) {
      logError('Redis 不可用，审核开关默认关闭', { error: redisErr instanceof Error ? redisErr.message : String(redisErr) });
    }

    // 创建 Langfuse trace
    const traceId = generateTraceId(session.userId.toString());
    const trace = createTrace({
      id: traceId,
      userId: session.userId.toString(),
      sessionId: `${session.userId}_${session.channel}`,
      name: 'chat_pending',
      input: message,
      metadata: {
        channel: session.channel,
        isNewUser: session.isNewUser,
        mode: 'review_pending',
      },
    });

    // 执行 Agent Loop，根据审核开关保存为 pending 或 success
    const result = await runAgentLoopPending(message, session.userId, session.channel, trace, saveStatus);

    // 处理实名认证提示（不走审核流程）
    if (result.type === 'auth') {
      // 保存认证提示对话到历史（不走审核，直接 success）
      await saveConversationToHistory(session.userId, session.channel, message, result.reply, 'success', result.metadata);

      return NextResponse.json(AjaxResult.success({
        status: 'auth',
        type: 'auth',
        message: result.reply,
        verifyUrl: result.verifyUrl,
        channel: session.channel,
        isNewUser: session.isNewUser,
      }));
    }

    // 更新 trace
    if (trace) {
      updateTraceOutput(trace, `保存为待审核，ID: ${result.recordId}`);
    }
    flushLangfuse();

    // 返回结果（不返回AI回答，只返回记录ID和状态）
    return NextResponse.json(AjaxResult.success({
      recordId: result.recordId,
      status: 'pending',
      message: '您的提问已收到，正在审核中，请稍后查看回复',
      channel: session.channel,
      isNewUser: session.isNewUser,
    }));

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logError('Chat pending API error', { error: errMsg });
    flushLangfuse();
    return NextResponse.json(AjaxResult.error('功能暂不可用，建议转人工客服'));
  }
}