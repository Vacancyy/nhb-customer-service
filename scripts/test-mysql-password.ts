import { config } from 'dotenv';
import { resolve } from 'path';
import { Client } from 'ssh2';

config({ path: resolve(process.cwd(), '.env.local') });

const SSH_HOST = process.env.SSH_HOST || process.env.PG_HOST || '192.168.10.187';

const credentials = (process.env.SSH_PASSWORDS || process.env.SSH_PASSWORD || '')
  .split(',')
  .map((password) => password.trim())
  .filter(Boolean)
  .map((password) => ({ user: process.env.SSH_USER || 'root', password }));

if (credentials.length === 0) {
  throw new Error('SSH_PASSWORD or SSH_PASSWORDS is required');
}

async function tryConnect(cred: { user: string; password: string }): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`Trying ${cred.user}@${SSH_HOST}...`);

    const conn = new Client();
    conn
      .on('ready', () => {
        console.log('SSH connected successfully');
        resolve(true);
        conn.end();
      })
      .on('error', (err) => {
        console.log(`  failed: ${err.message}`);
        resolve(false);
      })
      .connect({
        host: SSH_HOST,
        port: 22,
        username: cred.user,
        password: cred.password,
        readyTimeout: 5000,
      });
  });
}

async function main() {
  for (const cred of credentials) {
    const success = await tryConnect(cred);
    if (success) {
      console.log('\nFound a working SSH credential');
      process.exit(0);
    }
  }
  console.log('\nAll SSH credentials failed');
  process.exit(1);
}

main();
