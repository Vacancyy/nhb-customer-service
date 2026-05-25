// Redis 服务 - 用于存储历史会话数据

import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0');

// Redis 客户端单例
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      db: REDIS_DB,
      lazyConnect: true, // 延迟连接，首次使用时才连接
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis connected successfully');
    });
  }
  return redisClient;
}

// 历史会话 key 格式: chat_history:{userId}:{channel}
const HISTORY_KEY_PREFIX = 'chat_history:';
const MAX_HISTORY_LENGTH = 50; // 最多保存 50 条历史消息

export interface HistoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  skill?: string;
}

// 构建 Redis key（包含 userId 和 channel）
function buildHistoryKey(userId: string, channel: string): string {
  return `${HISTORY_KEY_PREFIX}${userId}:${channel}`;
}

// 获取用户历史会话
export async function getHistory(userId: string, channel: string): Promise<HistoryMessage[]> {
  const client = getRedisClient();
  const key = buildHistoryKey(userId, channel);

  try {
    const data = await client.get(key);
    if (!data) {
      return [];
    }
    return JSON.parse(data) as HistoryMessage[];
  } catch (error) {
    console.error('Failed to get history:', error);
    return [];
  }
}

// 保存消息到历史会话
export async function saveMessage(
  userId: string,
  channel: string,
  message: HistoryMessage
): Promise<void> {
  const client = getRedisClient();
  const key = buildHistoryKey(userId, channel);

  try {
    const history = await getHistory(userId, channel);
    history.push(message);

    // 限制历史长度，超出则删除最早的
    if (history.length > MAX_HISTORY_LENGTH) {
      history.splice(0, history.length - MAX_HISTORY_LENGTH);
    }

    // 设置过期时间为 7 天
    await client.setex(key, 7 * 24 * 60 * 60, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save message:', error);
  }
}

// 清空用户历史会话
export async function clearHistory(userId: string, channel: string): Promise<void> {
  const client = getRedisClient();
  const key = buildHistoryKey(userId, channel);

  try {
    await client.del(key);
  } catch (error) {
    console.error('Failed to clear history:', error);
  }
}

// 关闭 Redis 连接（用于优雅关闭）
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export { getRedisClient };