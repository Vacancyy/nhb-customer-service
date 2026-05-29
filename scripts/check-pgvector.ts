// 检查 pgvector 安装状态
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
});

async function check() {
  const client = await pool.connect();
  try {
    // 检查 PostgreSQL 版本
    const version = await client.query('SELECT version()');
    console.log('PostgreSQL 版本:', version.rows[0].version);

    // 尝试创建扩展
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('\n✅ pgvector 扩展已成功创建!');

      // 验证扩展
      const ext = await client.query("SELECT * FROM pg_extension WHERE extname = 'vector'");
      console.log('扩展信息:', ext.rows);
    } catch (e: any) {
      console.log('\n❌ 创建扩展失败:', e.message);
      console.log('\n可能原因:');
      console.log('  1. pgvector 未在服务器上编译安装');
      console.log('  2. 当前用户权限不足（需要 superuser）');
    }

    // 检查扩展是否可用（已编译但未安装）
    const available = await client.query(
      "SELECT name, installed_version, default_version, comment FROM pg_available_extensions WHERE name = 'vector'"
    );
    console.log('\n扩展可用状态:', available.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

check();