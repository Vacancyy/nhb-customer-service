// 历史会话服务 - PostgreSQL 存储

import { query } from './postgres';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// 从环境变量获取最大历史长度，默认 50
const MAX_HISTORY_LENGTH = parseInt(process.env.MAX_HISTORY_LENGTH || '50');

// 获取用户历史会话（将 input/output 拆分成两条消息）
export async function getHistory(userId: bigint, channel: string): Promise<HistoryMessage[]> {
  const sql = `
    SELECT input, output, EXTRACT(EPOCH FROM created_at) * 1000 as timestamp
    FROM chat_history
    WHERE user_id = $1 AND channel = $2
    ORDER BY created_at ASC
    LIMIT $3
  `;
  const rows = await query<{ input: string; output: string; timestamp: string }>(sql, [userId.toString(), channel, MAX_HISTORY_LENGTH]);

  // 将每条记录拆分成 user 和 assistant 两条消息
  const messages: HistoryMessage[] = [];
  for (const row of rows) {
    const ts = parseFloat(row.timestamp);
    messages.push({
      role: 'user',
      content: row.input,
      timestamp: ts,
    });
    messages.push({
      role: 'assistant',
      content: row.output,
      timestamp: ts,
    });
  }

  return messages;
}

// 保存一次完整对话（用户问题 + 系统回答）
export async function saveConversation(
  userId: bigint,
  channel: string,
  input: string,
  output: string
): Promise<void> {
  const sql = `
    INSERT INTO chat_history (user_id, channel, input, output)
    VALUES ($1, $2, $3, $4)
  `;
  await query(sql, [userId.toString(), channel, input, output]);
}

// 清空用户历史会话
export async function clearHistory(userId: bigint, channel: string): Promise<void> {
  const sql = `
    DELETE FROM chat_history
    WHERE user_id = $1 AND channel = $2
  `;
  await query(sql, [userId.toString(), channel]);
}

// 删除过旧的历史记录（可选，用于定期清理）
export async function cleanOldHistory(daysToKeep: number = 7): Promise<number> {
  const sql = `
    DELETE FROM chat_history
    WHERE created_at < NOW() - INTERVAL '1 day' * $1
    RETURNING id
  `;
  const rows = await query<{ id: number }>(sql, [daysToKeep]);
  return rows.length;
}