/**
 * 将现有所有记录改为已审核通过状态
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Pool } from 'pg';

async function updateStatus() {
  console.log('开始更新现有记录状态...');

  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    database: process.env.PG_DATABASE || 'nhb_customer_service',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
  });

  try {
    // 先查询当前有多少条 pending 记录
    const countSql = `SELECT COUNT(*) as count FROM chat_history WHERE status = 'pending';`;
    const countResult = await pool.query(countSql);
    const pendingCount = parseInt(countResult.rows[0].count);
    console.log(`当前有 ${pendingCount} 条待审核记录`);

    // 更新所有 pending 为 success
    const updateSql = `UPDATE chat_history SET status = 'success' WHERE status = 'pending';`;
    const updateResult = await pool.query(updateSql);
    console.log(`✓ 已将 ${updateResult.rowCount} 条记录状态更新为 success`);

    // 验证更新结果
    const verifySql = `
      SELECT status, COUNT(*) as count
      FROM chat_history
      GROUP BY status;
    `;
    const verifyResult = await pool.query(verifySql);
    console.log('\n当前状态统计：');
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.status}: ${row.count} 条`);
    });

    await pool.end();
    console.log('\n✅ 更新完成！现有所有对话记录都可在客户端显示');
    process.exit(0);
  } catch (error) {
    console.error('❌ 更新失败:', error);
    await pool.end();
    process.exit(1);
  }
}

updateStatus();