// 将特药清单导入到测试环境数据库
import dotenv from 'dotenv';
import path from 'path';

// 强制加载测试环境配置
dotenv.config({ path: path.join(__dirname, '../', '.env.stage') });

// 确认连接的是测试环境数据库
console.log('数据库配置:');
console.log(`  PG_HOST: ${process.env.PG_HOST}`);
console.log(`  PG_PORT: ${process.env.PG_PORT}`);
console.log(`  PG_DATABASE: ${process.env.PG_DATABASE}`);
console.log(`  PG_USER: ${process.env.PG_USER}`);
console.log('\n请确认这是测试环境的数据库配置！');
console.log('预期的测试环境配置:');
console.log('  PG_HOST: 172.29.4.125');
console.log('  PG_PORT: 25432');
console.log('  PG_DATABASE: nhb_customer_service');

if (process.env.PG_HOST !== '172.29.4.125') {
  console.error('\n❌ 错误：当前连接的不是测试环境数据库！');
  console.error('请确保 .env.stage 文件中的 PG_HOST=172.29.4.125');
  process.exit(1);
}

console.log('\n✅ 确认连接测试环境数据库');

// 导入原有的导入逻辑
import './create-drug-entries';