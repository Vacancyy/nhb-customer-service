// 会话服务 - 处理用户会话和历史消息管理

import { v4 as uuidv4 } from 'uuid';
import { getHistory, saveMessage, HistoryMessage } from './redis';

// 默认 channel
export const DEFAULT_CHANNEL = 'default';

export interface SessionContext {
  userId: string;
  channel: string;
  isNewUser: boolean;
}

// 创建或获取用户会话
export async function initSession(userId?: string, channel?: string): Promise<SessionContext> {
  const finalChannel = channel || DEFAULT_CHANNEL;

  if (userId) {
    return { userId, channel: finalChannel, isNewUser: false };
  }

  const newUserId = uuidv4();
  return { userId: newUserId, channel: finalChannel, isNewUser: true };
}

// 构建发送给模型的完整消息列表（包含历史）
export async function buildModelMessages(
  userId: string,
  channel: string,
  systemPrompt: string,
  currentMessage: string
): Promise<Array<{ role: string; content: string }>> {
  const history = await getHistory(userId, channel);

  // 构建消息列表：系统提示 + 历史消息 + 当前用户消息
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // 添加历史消息（过滤掉系统消息，因为已经重新设置了）
  for (const msg of history) {
    if (msg.role !== 'system') {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // 添加当前用户消息
  messages.push({ role: 'user', content: currentMessage });

  return messages;
}

// 保存用户消息到历史
export async function saveUserMessage(userId: string, channel: string, content: string): Promise<void> {
  await saveMessage(userId, channel, {
    role: 'user',
    content,
    timestamp: Date.now(),
  });
}

// 保存助手回复到历史
export async function saveAssistantMessage(
  userId: string,
  channel: string,
  content: string,
  skill?: string
): Promise<void> {
  await saveMessage(userId, channel, {
    role: 'assistant',
    content,
    timestamp: Date.now(),
    skill,
  });
}

// 获取用户历史会话记录
export async function getUserHistory(userId: string, channel: string): Promise<HistoryMessage[]> {
  return getHistory(userId, channel);
}