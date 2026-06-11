import Redis from 'ioredis';

// Redis Sentinel 配置
const redis = new Redis({
  sentinels: [
    { host: '172.29.4.125', port: 26379 }
  ],
  name: 'mymaster',  // Sentinel 监控的主节点名称
  password: 'r1-zqr8PUZ@cmg',  // Redis 数据节点密码
  sentinelPassword: 'r1-zqr8PUZ@cmg',  // Sentinel 密码（如果有）
  db: 0,
  connectTimeout: 10000,
});

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
});

async function main() {
  try {
    const key = 'system_config:review_enabled';

    // 先检查当前值
    const currentValue = await redis.get(key);
    console.log('线上 Redis 当前值:', currentValue);

    // 设置为 true（启用审核）
    await redis.set(key, 'true');
    console.log('已设置 system_config:review_enabled = true');

    // 验证设置成功
    const newValue = await redis.get(key);
    console.log('验证新值:', newValue);

    await redis.quit();
  } catch (err) {
    console.error('操作失败:', err);
    await redis.quit();
  }
}

main();