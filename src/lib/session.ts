// 会话服务 - 处理用户会话和历史消息管理

import { generateId } from './snowflake';
import { getHistory, saveConversation, clearHistory, HistoryMessage } from './history';

// 默认 channel
export const DEFAULT_CHANNEL = 'default';

export interface SessionContext {
  userId: bigint;
  channel: string;
  isNewUser: boolean;
}

// 创建或获取用户会话
export async function initSession(userId?: string | bigint, channel?: string): Promise<SessionContext> {
  const finalChannel = channel || DEFAULT_CHANNEL;

  if (userId) {
    // 如果传入的是字符串，转换为 bigint
    const finalUserId = typeof userId === 'string' ? BigInt(userId) : userId;
    return { userId: finalUserId, channel: finalChannel, isNewUser: false };
  }

  // 生成新的雪花 ID
  const newUserId = generateId();
  return { userId: newUserId, channel: finalChannel, isNewUser: true };
}

// 构建发送给模型的完整消息列表（包含历史）
export async function buildModelMessages(
  userId: bigint,
  channel: string,
  systemPrompt: string,
  currentMessage: string
): Promise<Array<{ role: string; content: string }>> {
  const history = await getHistory(userId, channel);

  // 构建消息列表：系统提示 + 历史消息 + 当前用户消息
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // 添加历史消息
  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // 添加当前用户消息
  messages.push({ role: 'user', content: currentMessage });

  return messages;
}

// 保存一次完整对话
export async function saveConversationToHistory(
  userId: bigint,
  channel: string,
  input: string,
  output: string
): Promise<void> {
  await saveConversation(userId, channel, input, output);
}

// 获取用户历史会话记录
export async function getUserHistory(userId: bigint, channel: string): Promise<HistoryMessage[]> {
  return getHistory(userId, channel);
}

// 清空用户历史会话
export async function clearUserHistory(userId: bigint, channel: string): Promise<void> {
  await clearHistory(userId, channel);
}