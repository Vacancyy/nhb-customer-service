// PostgreSQL 数据库连接服务
// 延迟读取环境变量，确保 .env 已加载

import { Pool, PoolClient } from 'pg';
import { logError, logInfo } from './logger';

// 连接池单例
let pool: Pool | null = null;

function getPoolConfig() {
  return {
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'nhb_customer_service',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
  };
}

function getPool(): Pool {
  if (!pool) {
    const config = getPoolConfig();
    pool = new Pool({
      ...config,
      max: 10, // 最大连接数
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      logError('PostgreSQL pool error', err);
    });

    pool.on('connect', async (client) => {
      logInfo('PostgreSQL connected successfully');
      // 设置时区为北京时间
      await client.query("SET TIME ZONE 'Asia/Shanghai'");
    });
  }
  return pool;
}

// 获取连接客户端
export async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return pool.connect();
}

// 执行查询
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const client = await getClient();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

// 执行单条查询
export async function queryOne<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// 关闭连接池
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export { getPool };