// JKX MySQL 数据库连接服务

import mysql, { Pool, PoolConnection } from 'mysql2/promise';

// CLAIM MySQL 配置
const CLAIM_MYSQL_HOST = process.env.CLAIM_MYSQL_HOST || 'localhost';
const CLAIM_MYSQL_PORT = parseInt(process.env.CLAIM_MYSQL_PORT || '3306');
const CLAIM_MYSQL_DATABASE = process.env.CLAIM_MYSQL_DATABASE || 'jkx';
const CLAIM_MYSQL_USER = process.env.CLAIM_MYSQL_USER || 'root';
const CLAIM_MYSQL_PASSWORD = process.env.CLAIM_MYSQL_PASSWORD || '';

// 连接池单例
let claimPool: Pool | null = null;

function getPool(): Pool {
  if (!claimPool) {
    claimPool = mysql.createPool({
      host: CLAIM_MYSQL_HOST,
      port: CLAIM_MYSQL_PORT,
      database: CLAIM_MYSQL_DATABASE,
      user: CLAIM_MYSQL_USER,
      password: CLAIM_MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    console.log('CLAIM MySQL pool created');
  }
  return claimPool;
}

// 获取连接
export async function getConnection(): Promise<PoolConnection> {
  const pool = getPool();
  return pool.getConnection();
}

// 执行查询
export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
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
  if (claimPool) {
    await claimPool.end();
    claimPool = null;
    console.log('CLAIM MySQL pool closed');
  }
}

export { getPool };