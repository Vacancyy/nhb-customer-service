// 历史会话服务 - PostgreSQL 存储

import { query } from './postgres';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  recordId?: number;
  feedback?: string;
  feedbackAt?: number;
}

// 从环境变量获取最大历史长度，默认 50
const MAX_HISTORY_LENGTH = parseInt(process.env.MAX_HISTORY_LENGTH || '50');

// 获取用户历史会话（将 input/output 拆分成两条消息）
// 只查询 status 为 'success' 的已审核通过的对话，且未删除的记录
export async function getHistory(userId: bigint, channel: string): Promise<HistoryMessage[]> {
  // 注意：created_at 存储的是本地时间（北京时间），需要先指定时区再提取 epoch
  const sql = `
    SELECT id, input, output, feedback, feedback_at,
           EXTRACT(EPOCH FROM (created_at AT TIME ZONE 'Asia/Shanghai' AT TIME ZONE 'UTC')) * 1000 as timestamp,
           EXTRACT(EPOCH FROM (feedback_at AT TIME ZONE 'Asia/Shanghai' AT TIME ZONE 'UTC')) * 1000 as feedback_timestamp
    FROM chat_history
    WHERE user_id = $1 AND channel = $2 AND status = 'success' AND deleted_at IS NULL
    ORDER BY created_at ASC
    LIMIT $3
  `;
  const rows = await query<{ id: number; input: string; output: string; feedback: string | null; feedback_at: string | null; timestamp: string; feedback_timestamp: string | null }>(sql, [userId.toString(), channel, MAX_HISTORY_LENGTH]);

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
      recordId: row.id,
      feedback: row.feedback || undefined,
      feedbackAt: row.feedback_timestamp ? parseFloat(row.feedback_timestamp) : undefined,
    });
  }

  return messages;
}

// 保存一次完整对话（用户问题 + 系统回答）
// status 默认为 'pending'，需要管理端审核通过后才能在客户端展示
export async function saveConversation(
  userId: bigint,
  channel: string,
  input: string,
  output: string,
  status: 'pending' | 'success' | 'rejected' = 'pending'
): Promise<number> {
  const sql = `
    INSERT INTO chat_history (user_id, channel, input, output, status, deleted_at)
    VALUES ($1, $2, $3, $4, $5, NULL)
    RETURNING id
  `;
  const result = await query<{ id: number }>(sql, [userId.toString(), channel, input, output, status]);
  return result[0]?.id || 0;
}

// 软删除用户历史会话（设置 deleted_at）
export async function clearHistory(userId: bigint, channel: string): Promise<void> {
  const sql = `
    UPDATE chat_history
    SET deleted_at = NOW()
    WHERE user_id = $1 AND channel = $2 AND deleted_at IS NULL
  `;
  await query(sql, [userId.toString(), channel]);
}

// 删除过旧的历史记录（可选，用于定期清理，软删除）
export async function cleanOldHistory(daysToKeep: number = 7): Promise<number> {
  const sql = `
    UPDATE chat_history
    SET deleted_at = NOW()
    WHERE created_at < NOW() - INTERVAL '1 day' * $1 AND deleted_at IS NULL
    RETURNING id
  `;
  const rows = await query<{ id: number }>(sql, [daysToKeep]);
  return rows.length;
}