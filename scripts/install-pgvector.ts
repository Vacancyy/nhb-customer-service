// SSH 连接脚本 - 安装 pgvector
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { Client } from 'ssh2';

const SSH_HOST = process.env.PG_HOST || '192.168.10.187';
const SSH_USER = 'nhb';
const SSH_PASSWORD = process.env.SSH_PASSWORD || '';

console.log(`尝试 SSH 连接 ${SSH_USER}@${SSH_HOST}...`);

const conn = new Client();

conn.on('ready', () => {
  console.log('✅ SSH 连接成功!\n');

  // 检查 Docker 容器
  conn.exec('docker ps --format "{{.Names}} {{.Image}}"', (err, stream) => {
    if (err) {
      console.log('检查 Docker 失败:', err);
      conn.end();
      return;
    }

    let output = '';
    stream.on('close', () => {
      console.log('Docker 容器列表:\n', output);

      // 找 PostgreSQL 容器
      const pgLine = output.split('\n').find(line =>
        line.toLowerCase().includes('postgres')
      );

      if (pgLine) {
        const containerName = pgLine.split(' ')[0];
        console.log(`\n找到 PostgreSQL 容器: ${containerName}`);
        installInDocker(conn, containerName);
      } else {
        console.log('\n未找到 Docker PostgreSQL，尝试原生安装...');
        installNative(conn);
      }
    }).on('data', (data: Buffer) => {
      output += data.toString();
    }).stderr.on('data', (data: Buffer) => {
      console.log('stderr:', data.toString());
    });
  });
});

conn.on('error', (err) => {
  console.log('❌ SSH 连接失败:', err.message);
  process.exit(1);
});

conn.connect({
  host: SSH_HOST,
  port: 22,
  username: SSH_USER,
  password: SSH_PASSWORD,
  readyTimeout: 10000
});

function installInDocker(conn: Client, containerName: string) {
  console.log(`\n在 Docker 容器 ${containerName} 中安装 pgvector...\n`);

  const commands = [
    // 安装编译工具
    `docker exec ${containerName} sh -c "apk add --no-cache git make gcc musl-dev postgresql16-dev || apk add --no-cache git make gcc musl-dev postgresql-dev"`,
    // 克隆并编译 pgvector
    `docker exec ${containerName} sh -c "cd /tmp && rm -rf pgvector && git clone https://github.com/pgvector/pgvector.git && cd pgvector && make && make install"`,
    // 在数据库中启用扩展
    `docker exec ${containerName} psql -U nhb_admin -d nhb_customer_service -c "CREATE EXTENSION IF NOT EXISTS vector;"`,
    // 验证安装
    `docker exec ${containerName} psql -U nhb_admin -d nhb_customer_service -c "SELECT * FROM pg_extension WHERE extname = 'vector';"`
  ];

  runCommands(conn, commands, () => {
    console.log('\n✅ pgvector 安装完成!');
    conn.end();
    process.exit(0);
  });
}

function installNative(conn: Client) {
  console.log('\n原生安装 pgvector...\n');

  const commands = [
    // 安装编译工具 (Alpine)
    'apk add --no-cache git make gcc musl-dev postgresql16-dev || apk add --no-cache git make gcc musl-dev postgresql-dev',
    // 克隆并编译
    'cd /tmp && rm -rf pgvector && git clone https://github.com/pgvector/pgvector.git && cd pgvector && make && make install',
    // 启用扩展
    'psql -U nhb_admin -d nhb_customer_service -c "CREATE EXTENSION IF NOT EXISTS vector;"',
    // 验证
    'psql -U nhb_admin -d nhb_customer_service -c "SELECT * FROM pg_extension WHERE extname = \'vector\';"'
  ];

  runCommands(conn, commands, () => {
    console.log('\n✅ pgvector 安装完成!');
    conn.end();
    process.exit(0);
  });
}

function runCommands(conn: Client, commands: string[], callback: () => void) {
  let index = 0;

  function runNext() {
    if (index >= commands.length) {
      callback();
      return;
    }

    const cmd = commands[index];
    console.log(`\n执行: ${cmd}`);

    conn.exec(cmd, (err, stream) => {
      if (err) {
        console.log('命令执行失败:', err);
        index++;
        runNext();
        return;
      }

      stream.on('close', (code: number) => {
        console.log(`完成 (exit code: ${code})`);
        index++;
        runNext();
      }).on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text) console.log('输出:', text);
      }).stderr.on('data', (data: Buffer) => {
        const text = data.toString().trim();
        if (text) console.log('错误:', text);
      });
    });
  }

  runNext();
}