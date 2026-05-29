// 检查知识库表结构和向量列状态
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: (process.env.PG_PASSWORD || '').trim(),
});

async function check() {
  const client = await pool.connect();
  try {
    // 检查表是否存在
    const tables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'knowledge_%'
    `);
    console.log('知识库表:', tables.rows.map(r => r.table_name).join(', ') || '不存在');

    if (tables.rows.length === 0) {
      console.log('\n需要重新创建表并导入数据');
      return;
    }

    // 检查 knowledge_entries 列结构
    const cols = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'knowledge_entries'
      ORDER BY ordinal_position
    `);
    console.log('\nknowledge_entries 列:');
    for (const col of cols.rows) {
      console.log(`  - ${col.column_name}: ${col.data_type || col.udt_name}`);
    }

    // 检查是否有 embedding 列
    const hasEmbedding = cols.rows.some(r => r.column_name === 'embedding');
    console.log(`\n向量列: ${hasEmbedding ? '✅ 已存在' : '❌ 不存在'}`);

    // 统计数据
    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM knowledge_entries) as entries,
        (SELECT COUNT(*) FROM knowledge_answers) as answers,
        (SELECT COUNT(*) FROM knowledge_entries WHERE embedding IS NOT NULL) as with_embedding
    `);
    console.log('\n数据统计:', stats.rows[0]);

  } finally {
    client.release();
    await pool.end();
  }
}

check();