/**
 * 测试新的审核流程
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testReviewFlow() {
  console.log('========================================');
  console.log('测试新的审核流程（chat-pending）');
  console.log('========================================\n');

  try {
    const userId = '888888888888888888';
    const channel = 'review_test';

    // 1. 客户端发送消息（不立即显示回复）
    console.log('1️⃣  客户端发送消息...');
    const chatRes = await fetch('http://localhost:3000/api/app-api/chat-pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '测试问题：宁惠保第六期保障范围是什么？',
        userId,
        channel,
      }),
    });

    const chatResult = await chatRes.json();
    console.log('响应:', JSON.stringify(chatResult, null, 2));

    if (chatResult.code !== 200) {
      throw new Error('发送失败: ' + chatResult.msg);
    }

    const recordId = chatResult.data.recordId;
    console.log(`   ✓ 消息已保存，记录ID: ${recordId}`);
    console.log(`   ✓ 状态: ${chatResult.data.status}`);
    console.log(`   ✓ 提示: "${chatResult.data.message}"`);

    // 等待1秒确保数据已保存
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. 查看管理端是否有pending记录
    console.log('\n2️⃣  查看管理端待审核列表...');
    const reviewRes = await fetch(
      `http://localhost:3000/api/admin-api/review?status=pending&page=1&pageSize=10`
    );

    const reviewResult = await reviewRes.json();
    if (reviewResult.code !== 200) {
      throw new Error('查询审核列表失败: ' + reviewResult.msg);
    }

    console.log(`   ✓ 找到 ${reviewResult.data.list.length} 条待审核记录`);

    // 检查是否包含我们的记录
    const ourRecord = reviewResult.data.list.find(r => r.id === recordId);
    if (ourRecord) {
      console.log(`   ✓ 找到我们的记录:`);
      console.log(`     ID: ${ourRecord.id}`);
      console.log(`     问题: "${ourRecord.input}"`);
      console.log(`     回答: "${ourRecord.output.substring(0, 100)}..."`);
      console.log(`     状态: ${ourRecord.status}`);
    } else {
      console.log(`   ⚠️  未在待审核列表中找到ID=${recordId}的记录`);
    }

    // 3. 审核通过
    console.log('\n3️⃣  管理员审核通过...');
    const approveRes = await fetch('http://localhost:3000/api/admin-api/review/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [recordId] }),
    });

    const approveResult = await approveRes.json();
    console.log(`   ✓ ${approveResult.data.message}`);

    // 等待1秒确保状态更新
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 4. 客户端轮询检查状态
    console.log('\n4️⃣  客户端轮询检查审核状态...');
    const checkRes = await fetch(
      `http://localhost:3000/api/app-api/check-status?recordId=${recordId}&userId=${userId}&channel=${channel}`
    );

    const checkResult = await checkRes.json();
    console.log('状态检查响应:', JSON.stringify(checkResult, null, 2));

    if (checkResult.code === 200 && checkResult.data.status === 'success') {
      console.log(`   ✓ 审核已通过！`);
      console.log(`   用户问题: "${checkResult.data.input}"`);
      console.log(`   AI回答: "${checkResult.data.output.substring(0, 100)}..."`);
    } else {
      console.log(`   状态: ${checkResult.data?.status || 'unknown'}`);
    }

    // 5. 验证客户端历史是否显示
    console.log('\n5️⃣  验证客户端历史是否显示...');
    const historyRes = await fetch(
      `http://localhost:3000/api/app-api/history?userId=${userId}&channel=${channel}`
    );

    const historyResult = await historyRes.json();
    console.log(`   ✓ 客户端历史显示 ${historyResult.data.history.length} 条记录`);

    if (historyResult.data.history.length > 0) {
      console.log(`   最新历史:`);
      historyResult.data.history.slice(-2).forEach(item => {
        console.log(`     角色: ${item.role}`);
        console.log(`     内容: "${item.content.substring(0, 80)}..."`);
      });
    }

    // 6. 清理测试数据
    console.log('\n6️⃣  清理测试数据...');
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
    console.log('✅ 新的审核流程测试成功！');
    console.log('========================================\n');
    console.log('访问地址:');
    console.log('  客户端: http://localhost:3000/web/app/chat-review');
    console.log('  管理端: http://localhost:3000/web/admin/review\n');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

testReviewFlow();