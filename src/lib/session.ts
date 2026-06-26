// 会话服务 - 处理用户会话和历史消息管理

import { generateId } from './snowflake';
import { getHistory, saveConversation, clearHistory, HistoryMessage, ConversationMetadata } from './history';

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

// 构建时间上下文消息
function buildTimeContextMessage(): { role: string; content: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const currentDateStr = `${year}年${month}月${day}日`;

  return {
    role: 'system',
    content: `【时间上下文】当前日期: ${currentDateStr}。六期宁惠保参保截止日期为2026年12月31日，当前参保期已结束。涉及参保时间、截止日期、停售、销售期、开放时间、即日起、还能买、现在参保、保障期、生效时间等问题时，必须告知用户当前已无法参保六期，后续是否开放新一期参保请以官方公告为准。严禁回复"建议尽早办理"、"请及时参保"、"别错过"、"您现在参保"等鼓励参保的措辞，因为参保期已过。`,
  };
}

// 构建发送给模型的完整消息列表（包含历史）
export async function buildModelMessages(
  userId: bigint,
  channel: string,
  systemPrompt: string,
  currentMessage: string
): Promise<Array<{ role: string; content: string }>> {
  const history = await getHistory(userId, channel);

  // 构建消息列表：系统提示 + 时间上下文 + 历史消息 + 当前用户消息
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  // 在系统提示词后插入时间上下文
  messages.push(buildTimeContextMessage());

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
  output: string,
  status: 'pending' | 'success' | 'rejected' = 'pending',
  metadata?: ConversationMetadata
): Promise<number> {
  return saveConversation(userId, channel, input, output, status, metadata);
}

// 获取用户历史会话记录
export async function getUserHistory(userId: bigint, channel: string): Promise<HistoryMessage[]> {
  return getHistory(userId, channel);
}

// 清空用户历史会话
export async function clearUserHistory(userId: bigint, channel: string): Promise<void> {
  await clearHistory(userId, channel);
}