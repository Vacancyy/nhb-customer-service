import { NextRequest, NextResponse } from 'next/server';

import {
  initSession,
  saveConversationToHistory,
} from '@/lib/session';
import { AjaxResult } from '@/lib/AjaxResult';
import { ERROR_MESSAGES } from '@/lib/prompts';
import { logError } from '@/lib/logger';
import { flushLangfuse, updateTraceOutput } from '@/lib/langfuse';
import { extractUserIdFromHeader } from '@/lib/auth-token';
import { getRedisClient, REDIS_KEY_PREFIX } from '@/lib/redis';
import { ConversationMetadata } from '@/lib/history';
import {
  ensureToolsLoaded,
  runAgentLoopStreaming,
  createChatTrace,
  StreamEvent,
} from '@/lib/llm-streaming';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || '';

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

    // 检查审核开关：审核关闭时直接保存 success，避免被 auto-handle 覆盖
    // Redis 不可用时默认审核关闭（安全降级：保证聊天可用）
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
    const trace = createChatTrace(session.userId.toString(), session.channel, session.isNewUser, message);

    // 使用全程流式 Agent Loop
    const encoder = new TextEncoder();
    let fullReply = '';
    let capturedMetadata: ConversationMetadata | undefined;

    // 创建 SSE 流响应
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const agentStream = runAgentLoopStreaming(message, session.userId, session.channel, trace, session.isNewUser);

          for await (const event of agentStream) {
            if (event.type === 'metadata') {
              // 内部事件：捕获元数据，不发送给 SSE 客户端
              capturedMetadata = event.metadata;
              continue;
            } else if (event.type === 'session') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (event.type === 'status') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (event.type === 'auth') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              controller.close();
              if (trace) {
                updateTraceOutput(trace, event.content || '');
              }
              // 保存认证提示对话到历史（不走审核，直接 success）
              await saveConversationToHistory(session.userId, session.channel, message, fullReply || event.content || '', saveStatus, capturedMetadata);
              flushLangfuse();
              return;
            } else if (event.type === 'content') {
              fullReply += event.content || '';
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } else if (event.type === 'done') {
              if (trace) {
                updateTraceOutput(trace, fullReply);
              }
              // 先保存以获取 recordId，再随 done 事件下发，供前端提交反馈使用
              const recordId = await saveConversationToHistory(session.userId, session.channel, message, fullReply, saveStatus, capturedMetadata);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ ...event, recordId })}\n\n`));
              controller.close();
              flushLangfuse();
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const errStack = err instanceof Error ? err.stack : undefined;
          logError('Streaming error', { error: errMsg, stack: errStack });
          // 保存部分对话到历史（避免用户提问和部分回复丢失）
          try {
            await saveConversationToHistory(session.userId, session.channel, message, fullReply || '功能暂不可用，建议转人工客服', saveStatus, capturedMetadata);
          } catch (saveErr) {
            logError('Save conversation on streaming error failed', { error: saveErr instanceof Error ? saveErr.message : String(saveErr) });
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', content: '功能暂不可用，建议转人工客服' })}\n\n`));
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
    const errMsg = error instanceof Error ? error.message : String(error);
    logError('Chat API error', { error: errMsg });
    flushLangfuse();
    return NextResponse.json(AjaxResult.error('功能暂不可用，建议转人工客服'));
  }
}
