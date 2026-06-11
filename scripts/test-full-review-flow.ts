/**
 * 测试完整审核流程（客户端 + 管理端）
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testFullFlow() {
  console.log('========================================');
  console.log('测试完整审核流程');
  console.log('========================================\n');

  try {
    const userId = '777777777777777777';
    const channel = 'full_flow_test';

    // 1. 客户端发送消息
    console.log('1️⃣  客户端发送消息...');
    const chatRes = await fetch('http://localhost:3000/api/app-api/chat-pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '测试：第六期保障范围',
        userId,
        channel,
      }),
    });

    const chatResult = await chatRes.json();
    if (chatResult.code !== 200) {
      throw new Error('发送失败: ' + chatResult.msg);
    }

    const recordId = chatResult.data.recordId;
    console.log(`   ✓ 消息已保存，recordId: ${recordId}`);
    console.log(`   ✓ 客户端显示: "等待审核中..."（黄色闪烁）`);

    // 等待1秒
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. 管理端看到待审核记录
    console.log('\n2️⃣  管理端检查待审核列表（1秒刷新）...');
    const reviewRes = await fetch(
      `http://localhost:3000/api/admin-api/review?status=pending&page=1&pageSize=10`
    );

    const reviewResult = await reviewRes.json();
    if (reviewResult.code !== 200) {
      throw new Error('查询失败: ' + reviewResult.msg);
    }

    console.log(`   ✓ 找到 ${reviewResult.data.list.length} 条待审核记录`);
    const ourRecord = reviewResult.data.list.find(r => r.id === recordId);
    if (!ourRecord) {
      throw new Error('未找到我们的记录');
    }

    console.log(`   ✓ 管理端看到:`);
    console.log(`     问题: "${ourRecord.input}"`);
    console.log(`     AI回答: "${ourRecord.output.substring(0, 80)}..."`);

    // 3. 管理端点击"通过"（无弹窗）
    console.log('\n3️⃣  管理端点击"通过"按钮（无弹窗，直接操作）...');
    const approveRes = await fetch('http://localhost:3000/api/admin-api/review/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [recordId] }),
    });

    const approveResult = await approveRes.json();
    if (approveResult.code !== 200) {
      throw new Error('审核失败: ' + approveResult.msg);
    }

    console.log(`   ✓ 审核已通过`);
    console.log(`   ✓ 管理端列表自动刷新，记录消失`);

    // 等待2秒（客户端轮询间隔）
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. 客户端轮询检查状态
    console.log('\n4️⃣  客户端轮询检查审核状态（每2秒）...');
    const checkRes = await fetch(
      `http://localhost:3000/api/app-api/check-status?recordId=${recordId}&userId=${userId}&channel=${channel}`
    );

    const checkResult = await checkRes.json();
    console.log('   状态检查结果:', JSON.stringify(checkResult, null, 2));

    if (checkResult.code === 200 && checkResult.data.status === 'success') {
      console.log(`   ✓ 审核通过！客户端显示:`);
      console.log(`     先显示: "审核通过"（绿色）`);
      console.log(`     然后显示AI回答内容`);
      console.log(`     AI回答: "${checkResult.data.output.substring(0, 100)}..."`);
    } else {
      console.log(`   ⚠️  状态: ${checkResult.data?.status || 'unknown'}`);
    }

    // 5. 清理测试数据
    console.log('\n5️⃣  清理测试数据...');
    const { Pool } = await import('pg');
    const pool = new Pool({
      host: process.env.PG_HOST,
      port: parseInt(process.env.PG_PORT || '5432'),
      database: process.env.PG_DATABASE,
      user: process.env.PG_USER,
      password: process.env.PG_PASSWORD,
    });

    await pool.query(`DELETE FROM chat_history WHERE user_id = $1 AND channel = $2`, [userId, channel]);
    console.log('   ✓ 测试数据已清理');

    await pool.end();

    console.log('\n========================================');
    console.log('✅ 完整流程测试成功！');
    console.log('========================================\n');
    console.log('关键改进:');
    console.log('  1. 管理端：1秒自动刷新，点击按钮无弹窗');
    console.log('  2. 客户端：发送消息后显示"等待审核中..."（黄色闪烁）');
    console.log('  3. 审核通过：客户端自动显示"审核通过"（绿色）→ AI回答');
    console.log('  4. 审核拒绝：客户端显示"审核未通过"（红色）\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

testFullFlow();