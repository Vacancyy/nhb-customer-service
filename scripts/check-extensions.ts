// 检查 pgvector 是否已编译但未启用
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: process.env.PG_PASSWORD || 'nhb@2026dev',
});

async function check() {
  const client = await pool.connect();
  try {
    // 检查所有可用扩展
    const available = await client.query(`
      SELECT name, default_version, installed_version, comment
      FROM pg_available_extensions
      ORDER BY name
    `);
    console.log('可用扩展列表:');
    for (const ext of available.rows) {
      console.log(`  - ${ext.name}: ${ext.default_version || 'N/A'} (${ext.comment || ''})`);
    }

    // 检查 vector 扩展是否可用
    const vector = await client.query(`
      SELECT name, default_version, installed_version
      FROM pg_available_extensions
      WHERE name = 'vector'
    `);
    console.log('\nvector 扩展状态:', vector.rows.length > 0 ? vector.rows[0] : '未找到');

    // 检查 PostgreSQL 版本和扩展目录
    const pgConfig = await client.query(`
      SELECT setting FROM pg_config WHERE name = 'PKGLIBDIR'
    `);
    console.log('\n扩展目录:', pgConfig.rows[0]?.setting || '无法获取');

  } finally {
    client.release();
    await pool.end();
  }
}

check();