// 验证导入数据脚本
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

async function verify() {
  const client = await pool.connect();
  try {
    // 查询表
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'knowledge_%'"
    );
    console.log('表:', tables.rows);

    // 查询主表列结构
    const cols = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'knowledge_entries' ORDER BY ordinal_position"
    );
    console.log('knowledge_entries 列:', cols.rows);

    // 查询答案表列结构
    const ansCols = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'knowledge_answers' ORDER BY ordinal_position"
    );
    console.log('knowledge_answers 列:', ansCols.rows);

    // 查询一条示例数据（JOIN）
    const sample = await client.query(`
      SELECT e.id, e.std_question, e.category, e.intent, e.keywords, a.period, a.answer
      FROM knowledge_entries e
      LEFT JOIN knowledge_answers a ON e.id = a.knowledge_id
      LIMIT 3
    `);
    console.log('示例数据:', JSON.stringify(sample.rows, null, 2));

    // 统计
    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM knowledge_entries) as entries,
        (SELECT COUNT(*) FROM knowledge_answers) as answers
    `);
    console.log('统计:', stats.rows[0]);

    // 查询分类分布
    const categories = await client.query(`
      SELECT category, COUNT(*) as count
      FROM knowledge_entries
      WHERE category IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `);
    console.log('分类分布:', categories.rows);
  } finally {
    client.release();
    await pool.end();
  }
}

verify();