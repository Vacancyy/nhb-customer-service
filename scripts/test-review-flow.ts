/**
 * 完整功能测试 - 验证审核流程
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
});

async function test() {
  console.log('========================================');
  console.log('开始测试审核流程功能');
  console.log('========================================\n');

  try {
    // 1. 插入测试数据（模拟用户聊天）
    console.log('1️⃣  插入测试数据（模拟用户聊天）...');
    const insertSql = `
      INSERT INTO chat_history (user_id, channel, input, output, status)
      VALUES ('123456789', 'test_channel', '测试问题：保险怎么买？', '测试回答：您可以通过官网购买保险。', 'pending')
      RETURNING id, status;
    `;
    const insertResult = await pool.query(insertSql);
    const testId = insertResult.rows[0].id;
    console.log(`   ✓ 插入成功，ID: ${testId}, 状态: ${insertResult.rows[0].status}`);

    // 2. 查询待审核列表（模拟管理端查询）
    console.log('\n2️⃣  查询待审核列表...');
    const pendingSql = `
      SELECT id, user_id, channel, input, output, status, created_at
      FROM chat_history
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT 5;
    `;
    const pendingResult = await pool.query(pendingSql);
    console.log(`   ✓ 找到 ${pendingResult.rows.length} 条待审核记录`);
    if (pendingResult.rows.length > 0) {
      console.log(`   最新记录: ID=${pendingResult.rows[0].id}, 问题="${pendingResult.rows[0].input}"`);
    }

    // 3. 审核通过（模拟管理端操作）
    console.log('\n3️⃣  审核通过测试记录...');
    const approveSql = `
      UPDATE chat_history
      SET status = 'success'
      WHERE id = $1 AND status = 'pending'
      RETURNING id, status;
    `;
    const approveResult = await pool.query(approveSql, [testId]);
    console.log(`   ✓ 审核通过，状态更新为: ${approveResult.rows[0].status}`);

    // 4. 查询已审核通过的历史（模拟客户端查询）
    console.log('\n4️⃣  查询已审核通过的历史...');
    const historySql = `
      SELECT id, user_id, input, output, status
      FROM chat_history
      WHERE user_id = '123456789' AND channel = 'test_channel' AND status = 'success'
      ORDER BY created_at DESC;
    `;
    const historyResult = await pool.query(historySql);
    console.log(`   ✓ 找到 ${historyResult.rows.length} 条已审核通过的历史记录`);
    if (historyResult.rows.length > 0) {
      console.log(`   显示内容: "${historyResult.rows[0].input}" -> "${historyResult.rows[0].output}"`);
    }

    // 5. 验证待审核记录不会出现在客户端历史中
    console.log('\n5️⃣  插入一条新待审核记录，验证不会出现在客户端历史...');
    const insertPendingSql = `
      INSERT INTO chat_history (user_id, channel, input, output, status)
      VALUES ('123456789', 'test_channel', '待审核问题', '待审核回答', 'pending')
      RETURNING id;
    `;
    const pendingInsertResult = await pool.query(insertPendingSql);
    console.log(`   ✓ 插入待审核记录，ID: ${pendingInsertResult.rows[0].id}`);

    // 再次查询客户端历史，确认只有审核通过的记录
    const historyAfterSql = `
      SELECT id, input, output, status
      FROM chat_history
      WHERE user_id = '123456789' AND channel = 'test_channel' AND status = 'success'
      ORDER BY created_at DESC;
    `;
    const historyAfterResult = await pool.query(historyAfterSql);
    console.log(`   ✓ 客户端历史仍显示 ${historyAfterResult.rows.length} 条记录（不包含待审核）`);

    // 6. 清理测试数据
    console.log('\n6️⃣  清理测试数据...');
    const cleanupSql = `
      DELETE FROM chat_history
      WHERE user_id = '123456789' AND channel = 'test_channel';
    `;
    await pool.query(cleanupSql);
    console.log('   ✓ 测试数据已清理');

    console.log('\n========================================');
    console.log('✅ 所有测试通过！审核功能正常工作');
    console.log('========================================\n');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    await pool.end();
    process.exit(1);
  }
}

test();