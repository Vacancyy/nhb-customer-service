// JKX MySQL 数据库连接服务

import mysql, { Pool, PoolConnection } from 'mysql2/promise';

// JKX MySQL 配置
const JKX_MYSQL_HOST = process.env.JKX_MYSQL_HOST || 'localhost';
const JKX_MYSQL_PORT = parseInt(process.env.JKX_MYSQL_PORT || '3306');
const JKX_MYSQL_DATABASE = process.env.JKX_MYSQL_DATABASE || 'jkx';
const JKX_MYSQL_USER = process.env.JKX_MYSQL_USER || 'root';
const JKX_MYSQL_PASSWORD = process.env.JKX_MYSQL_PASSWORD || '';

// 连接池单例
let jkxPool: Pool | null = null;

function getPool(): Pool {
  if (!jkxPool) {
    jkxPool = mysql.createPool({
      host: JKX_MYSQL_HOST,
      port: JKX_MYSQL_PORT,
      database: JKX_MYSQL_DATABASE,
      user: JKX_MYSQL_USER,
      password: JKX_MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });

    console.log('JKX MySQL pool created');
  }
  return jkxPool;
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
  if (jkxPool) {
    await jkxPool.end();
    jkxPool = null;
    console.log('JKX MySQL pool closed');
  }
}

export { getPool };