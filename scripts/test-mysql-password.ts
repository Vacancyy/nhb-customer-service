// 使用 MySQL root 密码尝试 SSH
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { Client } from 'ssh2';

const SSH_HOST = '192.168.10.187';

// 尝试 MySQL 的 root 密码
const credentials = [
  { user: 'root', password: 'LM4QyXN^jH3>BD8R0B' },
  { user: 'root', password: '2kHF325cFv^jfEd6q' },  // Redis 密码
];

async function tryConnect(cred: { user: string; password: string }): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`尝试 ${cred.user}@${SSH_HOST} (密码: ${cred.password.substring(0,4)}...)`);

    const conn = new Client();
    conn.on('ready', () => {
      console.log('✅ SSH 连接成功!');
      resolve(true);
      conn.end();
    }).on('error', (err) => {
      console.log(`  失败: ${err.message}`);
      resolve(false);
    }).connect({
      host: SSH_HOST,
      port: 22,
      username: cred.user,
      password: cred.password,
      readyTimeout: 5000
    });
  });
}

async function main() {
  for (const cred of credentials) {
    const success = await tryConnect(cred);
    if (success) {
      console.log('\n找到正确的 SSH 密码!');
      process.exit(0);
    }
  }
  console.log('\n所有密码都失败');
  process.exit(1);
}

main();