/**
 * 数据库迁移脚本 - 添加 status 字段到 chat_history 表
 */

// 加载环境变量（必须在其他import之前）
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Pool } from 'pg';

async function migrate() {
  console.log('开始执行数据库迁移...');
  console.log('数据库配置:', {
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    database: process.env.PG_DATABASE,
    user: process.env.PG_USER,
  });

  // 创建连接池
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'nhb_customer_service',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  try {
    // 添加 status 字段
    const alterTableSql = `
      ALTER TABLE chat_history
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
    `;
    await pool.query(alterTableSql);
    console.log('✓ 已添加 status 字段');

    // 添加索引
    const createIndexSql = `
      CREATE INDEX IF NOT EXISTS idx_chat_history_status ON chat_history(status);
    `;
    await pool.query(createIndexSql);
    console.log('✓ 已创建 status 索引');

    // 添加注释
    const commentSql = `
      COMMENT ON COLUMN chat_history.status IS '审核状态: pending(待审核), success(已通过), rejected(已拒绝)';
    `;
    await pool.query(commentSql);
    console.log('✓ 已添加字段注释');

    // 验证字段是否存在
    const checkSql = `
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'chat_history' AND column_name = 'status';
    `;
    const result = await pool.query(checkSql);

    if (result.rows.length > 0) {
      console.log('\n✅ 迁移成功！字段信息：');
      console.log(`  字段名: ${result.rows[0].column_name}`);
      console.log(`  数据类型: ${result.rows[0].data_type}`);
      console.log(`  默认值: ${result.rows[0].column_default}`);
    } else {
      console.error('\n❌ 迁移失败：字段未创建成功');
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    await pool.end();
    process.exit(1);
  }
}

migrate();