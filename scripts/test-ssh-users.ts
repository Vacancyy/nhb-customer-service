// 尝试多个 SSH 用户名
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { Client } from 'ssh2';

const SSH_HOST = process.env.PG_HOST || '192.168.10.187';
const PASSWORD = 'nhb@2026dev';

// 尝试的用户名列表
const users = ['root', 'nhb', 'admin', 'postgres', 'ubuntu', 'nhb_admin'];

async function tryConnect(user: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`尝试 ${user}@${SSH_HOST}...`);

    const conn = new Client();
    conn.on('ready', () => {
      console.log(`✅ 成功连接! 用户: ${user}`);
      resolve(true);
      conn.end();
    }).on('error', (err) => {
      console.log(`  失败: ${err.message}`);
      resolve(false);
    }).connect({
      host: SSH_HOST,
      port: 22,
      username: user,
      password: PASSWORD,
      readyTimeout: 5000
    });
  });
}

async function main() {
  for (const user of users) {
    const success = await tryConnect(user);
    if (success) {
      console.log(`\n可用的 SSH 用户名是: ${user}`);
      process.exit(0);
    }
  }
  console.log('\n所有用户名都失败了，请检查密码是否正确');
  process.exit(1);
}

main();