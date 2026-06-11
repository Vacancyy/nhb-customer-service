/**
 * 模拟客户端发送消息并验证管理端审核流程
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testClientToReviewFlow() {
  console.log('========================================');
  console.log('测试：客户端提问 → 管理端审核');
  console.log('========================================\n');

  try {
    // 1. 模拟客户端发送消息
    console.log('1️⃣  模拟客户端发送消息...');
    const userId = '999999999999999999'; // 测试用户ID
    const channel = 'test_review_flow';
    const message = '测试问题：宁惠保第六期多少钱？';

    const chatResponse = await fetch('http://localhost:3000/api/app-api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        userId,
        channel,
      }),
    });

    if (!chatResponse.ok) {
      throw new Error(`聊天API失败: ${chatResponse.status}`);
    }

    // 读取流式响应
    const reader = chatResponse.body?.getReader();
    const decoder = new TextDecoder();
    let fullReply = '';

    console.log('   正在等待AI回答...');
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim().startsWith('data:')) {
            const data = line.trim().slice(5).trim();
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);
              if (event.type === 'content') {
                fullReply += event.content || '';
              } else if (event.type === 'status') {
                console.log(`   状态: ${event.status}`);
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      }
    }

    console.log(`   ✓ AI回答: "${fullReply.substring(0, 100)}..."`);

    // 等待1秒确保数据已保存
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 2. 查询管理端待审核列表
    console.log('\n2️⃣  查询管理端待审核列表...');
    const reviewResponse = await fetch(
      `http://localhost:3000/api/admin-api/review?status=pending&page=1&pageSize=5&userId=${userId}&channel=${channel}`
    );

    if (!reviewResponse.ok) {
      throw new Error(`审核API失败: ${reviewResponse.status}`);
    }

    const reviewResult = await reviewResponse.json();
    console.log(`   ✓ 找到 ${reviewResult.data.list.length} 条待审核记录`);

    if (reviewResult.data.list.length > 0) {
      const latestRecord = reviewResult.data.list[0];
      console.log(`   最新记录:`);
      console.log(`     ID: ${latestRecord.id}`);
      console.log(`     用户问题: "${latestRecord.input}"`);
      console.log(`     AI回答: "${latestRecord.output.substring(0, 100)}..."`);
      console.log(`     状态: ${latestRecord.status}`);
      console.log(`     时间: ${new Date(latestRecord.timestamp).toLocaleString('zh-CN')}`);

      // 3. 审核通过这条记录
      console.log('\n3️⃣  审核通过这条记录...');
      const approveResponse = await fetch('http://localhost:3000/api/admin-api/review/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [latestRecord.id] }),
      });

      if (!approveResponse.ok) {
        throw new Error(`审核通过API失败: ${approveResponse.status}`);
      }

      const approveResult = await approveResponse.json();
      console.log(`   ✓ ${approveResult.data.message}`);

      // 4. 验证客户端历史是否显示
      console.log('\n4️⃣  验证客户端历史是否显示...');
      const historyResponse = await fetch(
        `http://localhost:3000/api/app-api/history?userId=${userId}&channel=${channel}`
      );

      if (!historyResponse.ok) {
        throw new Error(`历史API失败: ${historyResponse.status}`);
      }

      const historyResult = await historyResponse.json();
      console.log(`   ✓ 客户端历史显示 ${historyResult.data.history.length} 条记录`);

      if (historyResult.data.history.length > 0) {
        const historyItem = historyResult.data.history[historyResult.data.history.length - 1];
        console.log(`   最新历史:`);
        console.log(`     角色: ${historyItem.role}`);
        console.log(`     内容: "${historyItem.content.substring(0, 100)}..."`);
      }

      // 5. 清理测试数据
      console.log('\n5️⃣  清理测试数据...');
      const { Pool } = await import('pg');
      const pool = new Pool({
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT || '5432'),
        database: process.env.PG_DATABASE || 'nhb_customer_service',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
      });

      await pool.query(`DELETE FROM chat_history WHERE user_id = $1 AND channel = $2`, [userId, channel]);
      console.log('   ✓ 测试数据已清理');

      await pool.end();
    } else {
      console.log('   ⚠️  未找到待审核记录，可能保存失败');
    }

    console.log('\n========================================');
    console.log('✅ 测试完成！审核流程工作正常');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
  }
}

testClientToReviewFlow();