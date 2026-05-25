// PostgreSQL 数据库连接服务

import { Pool, PoolClient } from 'pg';

const PG_HOST = process.env.PG_HOST || 'localhost';
const PG_PORT = parseInt(process.env.PG_PORT || '5432');
const PG_DATABASE = process.env.PG_DATABASE || 'nhb_customer_service';
const PG_USER = process.env.PG_USER || 'postgres';
const PG_PASSWORD = process.env.PG_PASSWORD || '';

// 连接池单例
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: PG_HOST,
      port: PG_PORT,
      database: PG_DATABASE,
      user: PG_USER,
      password: PG_PASSWORD,
      max: 10, // 最大连接数
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('PostgreSQL pool error:', err);
    });

    pool.on('connect', () => {
      console.log('PostgreSQL connected successfully');
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