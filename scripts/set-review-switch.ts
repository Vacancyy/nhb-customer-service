import 'dotenv/config';
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0')
});

const action = process.argv[2] || 'status';

async function main() {
  const key = 'system_config:review_enabled';

  switch (action) {
    case 'enable':
      await redis.set(key, 'true');
      console.log('审核功能已启用 (设置为 true)');
      console.log('客户端需要等待管理员审核才能看到内容');
      break;

    case 'disable':
      await redis.del(key);
      console.log('审核功能已禁用 (删除 key)');
      console.log('客户端可以直接看到内容，无需审核');
      break;

    case 'status':
      const value = await redis.get(key);
      console.log(`当前状态: ${value}`);
      if (value === 'true' || value === '1') {
        console.log('审核功能: 已启用');
      } else {
        console.log('审核功能: 已禁用');
      }
      break;

    default:
      console.log('用法: npx tsx scripts/set-review-switch.ts [enable|disable|status]');
  }

  await redis.quit();
}

main().catch(console.error);