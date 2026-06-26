// WebSocket Agent 循环处理 — 接收 chat 消息，通过 WS 推送流式事件

import { initSession, saveConversationToHistory } from '@/lib/session';
import { ensureToolsLoaded, runAgentLoopStreaming, createChatTrace } from '@/lib/llm-streaming';
import { flushLangfuse, updateTraceOutput } from '@/lib/langfuse';
import { logInfo, logError } from '@/lib/logger';
import { WsServerManager } from '@/lib/ws-server';

/**
 * 处理 WebSocket chat 消息
 * 调用 runAgentLoopStreaming() 获取流式事件，逐个推送给前端
 */
export async function handleWsChat(
  userIdStr: string,
  message: string,
  channel: string,
  wsServer: WsServerManager
): Promise<void> {
  // 标记活跃 agent loop
  wsServer.setActiveLoop(userIdStr, true);

  let fullReply = '';
  const userId = BigInt(userIdStr);

  try {
    // 初始化会话
    const session = await initSession(userId, channel);

    // 确保工具已加载
    ensureToolsLoaded();

    // 创建 Langfuse trace
    const trace = createChatTrace(session.userId.toString(), session.channel, session.isNewUser, message);

    // 运行流式 Agent Loop
    const agentStream = runAgentLoopStreaming(message, session.userId, session.channel, trace, session.isNewUser);

    for await (const event of agentStream) {
      // WebSocket 断连检测
      if (!wsServer.isConnected(userIdStr)) {
        logInfo(`[ws-agent-loop] WebSocket disconnected during streaming: ${userIdStr}`);
        // 保存已累积内容到 DB（前端可通过轮询恢复）
        if (fullReply) {
          await saveConversationToHistory(session.userId, session.channel, message, fullReply);
        }
        if (trace) {
          updateTraceOutput(trace, fullReply);
        }
        flushLangfuse();
        break;
      }

      if (event.type === 'content') {
        fullReply += event.content || '';
        wsServer.sendToUser(userIdStr, { type: 'content', content: event.content });
      } else if (event.type === 'status') {
        wsServer.sendToUser(userIdStr, { type: 'status', status: event.status });
      } else if (event.type === 'auth') {
        wsServer.sendToUser(userIdStr, {
          type: 'auth',
          content: event.content,
          verifyUrl: event.verifyUrl,
        });
        // 认证提示不保存历史
        if (trace) {
          updateTraceOutput(trace, event.content || '');
        }
        flushLangfuse();
        break;  // auth 事件后结束循环
      } else if (event.type === 'done') {
        wsServer.sendToUser(userIdStr, { type: 'done' });
        // 保存对话到 DB
        await saveConversationToHistory(session.userId, session.channel, message, fullReply, 'success');
        if (trace) {
          updateTraceOutput(trace, fullReply);
        }
        flushLangfuse();
      } else if (event.type === 'session') {
        wsServer.sendToUser(userIdStr, {
          type: 'connected',
          userId: userIdStr,
        });
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : '系统异常';
    logError('[ws-agent-loop] 错误', { userId: userIdStr, error: errMsg });
    wsServer.sendToUser(userIdStr, { type: 'error', content: '系统异常，请稍后重试' });

    // 保存已累积的内容（如果有）
    if (fullReply) {
      try {
        await saveConversationToHistory(userId, channel, message, fullReply, 'success');
      } catch (saveErr) {
        logError('[ws-agent-loop] 保存历史失败', { userId: userIdStr, error: saveErr });
      }
    }
    flushLangfuse();
  } finally {
    // 清除活跃标记
    wsServer.setActiveLoop(userIdStr, false);
  }
}
