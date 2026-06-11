// 测试连接测试环境数据库
import dotenv from 'dotenv';
import path from 'path';

// 清除本地环境变量
delete process.env.PG_HOST;
delete process.env.PG_PORT;
delete process.env.PG_DATABASE;
delete process.env.PG_USER;
delete process.env.PG_PASSWORD;

// 强制加载测试环境配置
dotenv.config({ path: path.join(__dirname, '../', '.env.stage') });

console.log('测试环境数据库配置:');
console.log(`  PG_HOST: ${process.env.PG_HOST}`);
console.log(`  PG_PORT: ${process.env.PG_PORT}`);
console.log(`  PG_DATABASE: ${process.env.PG_DATABASE}`);
console.log(`  PG_USER: ${process.env.PG_USER}`);

if (process.env.PG_HOST !== '172.29.4.125') {
  console.error('错误：未加载正确的测试环境配置');
  process.exit(1);
}

// 测试数据库连接
import { query } from '../src/lib/postgres';

async function testConnection() {
  try {
    console.log('\n尝试连接测试环境数据库...');
    const result = await query('SELECT current_database(), current_user, version()');
    console.log('✅ 连接成功！');
    console.log(`数据库: ${result[0].current_database}`);
    console.log(`用户: ${result[0].current_user}`);
    console.log(`版本: ${result[0].version}`);

    // 检查知识库表是否存在
    console.log('\n检查知识库表...');
    const tables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('knowledge_entries', 'knowledge_answers')
    `);
    console.log(`找到表: ${tables.map(t => t.table_name).join(', ') || '无'}`);

    // 检查现有特药数据
    console.log('\n检查现有特药数据...');
    const count = await query(`
      SELECT COUNT(*) as count
      FROM knowledge_entries
      WHERE std_question LIKE '%在宁惠保特药范围内吗%'
    `);
    console.log(`现有特药条目: ${count[0].count} 条`);

  } catch (error: any) {
    console.error('❌ 连接失败:', error.message);
    console.error('\n可能的原因:');
    console.error('1. 网络不通（防火墙限制）');
    console.error('2. 数据库服务未启动');
    console.error('3. 连接参数错误');
    process.exit(1);
  }
}

testConnection();