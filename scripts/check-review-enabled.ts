import 'dotenv/config';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0')
});

async function main() {
  const reviewEnabled = await redis.get('system_config:review_enabled');
  console.log('system_config:review_enabled =', reviewEnabled);

  // 显示逻辑
  if (reviewEnabled === 'true' || reviewEnabled === '1') {
    console.log('审核功能状态: 已启用（需要管理员审核）');
  } else {
    console.log('审核功能状态: 已禁用（绕过审核直接返回）');
  }

  await redis.quit();
}

main().catch(console.error);