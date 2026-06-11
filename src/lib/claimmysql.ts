// CLAIM MySQL 数据库连接服务

import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { logInfo, logError } from './logger';

// CLAIM MySQL 配置 - 延迟读取环境变量，确保 .env 已加载
// 注意：Next.js standalone 模式下，server.js 先导入模块再加载 .env
// 所以不能在模块顶层读取环境变量，否则会使用默认值

// 连接池单例
let claimPool: Pool | null = null;

function getPoolConfig() {
  return {
    host: process.env.CLAIM_MYSQL_HOST || 'localhost',
    port: parseInt(process.env.CLAIM_MYSQL_PORT || '3306'),
    database: process.env.CLAIM_MYSQL_DATABASE || 'claim',
    user: process.env.CLAIM_MYSQL_USER || 'root',
    password: process.env.CLAIM_MYSQL_PASSWORD || '',
  };
}

function getPool(): Pool {
  if (!claimPool) {
    const config = getPoolConfig();
    claimPool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      timezone: '+08:00', // 设置时区为北京时间
    });

    logInfo('CLAIM MySQL pool created', { host: config.host, database: config.database });
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
    logInfo('CLAIM MySQL pool closed');
  }
}

export { getPool };