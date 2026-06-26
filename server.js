// 自定义 Next.js 服务器 — 支持 WebSocket 升级
// WS 消息通过内部 SSE chat route 代理获取流式结果，复用全部 Agent Loop 逻辑

const { createServer } = require('http');
const { parse } = require('url');
const path = require('path');
const fs = require('fs');
const next = require('next');
const crypto = require('crypto');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);

// 清除 shell 环境中可能覆盖 .env.local 的变量
// Next.js 中系统环境变量优先级高于 .env.local，如果 shell 中有错误的值会导致覆盖
// 这里只清除特定变量，让 .env.local 中的值生效
delete process.env.DASHSCOPE_API_KEY;

// ========== 生产模式 standalone 配置 ==========

// Next.js standalone 输出不包含 next.config.mjs，
// 生产模式下需要从 .next/required-server-files.json 读取配置并设置 __NEXT_PRIVATE_STANDALONE_CONFIG
// 默认 standalone server.js 中也做了同样的处理
let nextConfig = null;
if (!dev) {
  // standalone 模式下 chdir 到实际运行目录，确保 Next.js 路径正确
  process.chdir(__dirname);

  try {
    const serverFilesPath = path.join(__dirname, '.next', 'required-server-files.json');
    const serverFiles = JSON.parse(fs.readFileSync(serverFilesPath, 'utf8'));
    nextConfig = serverFiles.config;
    // 修正构建时的路径（如 D:\Project\... 或 /app）为运行时的 __dirname
    nextConfig.outputFileTracingRoot = __dirname;
    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);
  } catch (err) {
    console.error('[server] Failed to load standalone config:', err.message);
    process.exit(1);
  }
}

const app = next({ dev, hostname, port, conf: nextConfig });
const handle = app.getRequestHandler();

// ========== Token 解密配置 ==========

const AUTH_TOKEN_KEY = process.env.AUTH_TOKEN_KEY || '';

function getKey() {
  const key = AUTH_TOKEN_KEY;
  if (key.length < 32) return Buffer.from(key.padEnd(32, '0'));
  if (key.length > 32) return Buffer.from(key.slice(0, 32));
  return Buffer.from(key);
}

function parseToken(token) {
  try {
    const key = getKey();
    const normalizedToken = token
      .replace(/\s/g, '+')
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const paddedToken = normalizedToken + '='.repeat((4 - normalizedToken.length % 4) % 4);
    const combined = Buffer.from(paddedToken, 'base64');
    const iv = combined.slice(0, 16);
    const ciphertext = combined.slice(16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

// ========== WebSocket 连接管理 ==========

const connections = new Map();  // userId → ws
const activeLoops = new Map();  // userId → boolean

function setupWebSocket(server) {
  const { WebSocketServer } = require('ws');

  // 使用 path 选项，只拦截 /nhb-customer-service/ws 升级请求
  // 其他升级请求（如 /_next/webpack-hmr HMR）不会被拦截，允许 Next.js 处理
  const wss = new WebSocketServer({
    server: server,
    path: '/nhb-customer-service/ws',
    verifyClient: (info, callback) => {
      // 验证 token
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        callback(false, 401, 'Unauthorized');
        return;
      }

      const userId = parseToken(token);
      if (!userId) {
        callback(false, 401, 'Unauthorized');
        return;
      }

      // 将 userId 和 token 存储在 request 上，供 connection 事件使用
      info.req._wsUserId = userId;
      info.req._wsToken = token;
      callback(true);
    }
  });

  wss.on('connection', (ws, req) => {
    const userId = req._wsUserId;
    const token = req._wsToken;
    handleNewConnection(ws, userId, token);
  });
}

function handleNewConnection(ws, userId, token) {
  // 同一 userId 新连接替换旧连接
  const existingWs = connections.get(userId);
  if (existingWs && existingWs.readyState === 1) {
    existingWs.close(1000, '新连接替换旧连接');
  }

  connections.set(userId, ws);
  console.log(`[ws] User connected: ${userId}`);

  // 发送连接确认
  ws.send(JSON.stringify({ type: 'connected', userId }));

  // 心跳检测
  const heartbeatTimer = setInterval(() => {
    if (ws.readyState === 1) ws.ping();
    else clearInterval(heartbeatTimer);
  }, 30000);

  // 处理客户端消息
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (msg.type === 'chat') {
        handleChatMessage(ws, userId, token, msg);
      }
    } catch {
      ws.send(JSON.stringify({ type: 'error', content: '消息格式错误' }));
    }
  });

  ws.on('close', (code) => {
    console.log(`[ws] User disconnected: ${userId}, code: ${code}`);
    connections.delete(userId);
    clearInterval(heartbeatTimer);
  });

  ws.on('error', (error) => {
    console.error(`[ws] Error for ${userId}:`, error.message);
    if (connections.get(userId) === ws) {
      connections.delete(userId);
      clearInterval(heartbeatTimer);
    }
  });
}

async function handleChatMessage(ws, userId, token, msg) {
  const message = msg.message || '';
  const channel = msg.channel || 'default';

  if (!message.trim()) {
    ws.send(JSON.stringify({ type: 'error', content: '消息不能为空' }));
    return;
  }

  // 并发控制
  if (activeLoops.get(userId)) {
    ws.send(JSON.stringify({ type: 'error', content: '请等待当前回答完成' }));
    return;
  }

  activeLoops.set(userId, true);

  try {
    // 通过内部 HTTP 调用 SSE chat route，复用完整的 Agent Loop 逻辑
    const fetchUrl = `http://localhost:${port}/nhb-customer-service/api/app-api/chat`;
    const fetchRes = await fetch(fetchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ message, channel }),
    });

    if (!fetchRes.ok) {
      ws.send(JSON.stringify({ type: 'error', content: '请求失败' }));
      return;
    }

    // 处理 SSE 流式响应 → 转为 WS 事件推送
    const reader = fetchRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullReply = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 检查 WS 连接是否还活着
      if (ws.readyState !== 1) {
        console.log(`[ws] Connection lost during streaming: ${userId}`);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const dataStr = trimmed.slice(5).trim();
        try {
          const event = JSON.parse(dataStr);

          if (event.type === 'content') {
            fullReply += event.content || '';
            ws.send(JSON.stringify(event));
          } else if (event.type === 'status') {
            ws.send(JSON.stringify(event));
          } else if (event.type === 'auth') {
            ws.send(JSON.stringify(event));
          } else if (event.type === 'done') {
            ws.send(JSON.stringify({ type: 'done', recordId: event.recordId }));
          } else if (event.type === 'error') {
            ws.send(JSON.stringify(event));
          }
          // session 事件不推送给前端
        } catch {
          // 忽略 JSON 解析错误
        }
      }
    }
  } catch (error) {
    console.error(`[ws] Chat handler error for ${userId}:`, error.message);
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'error', content: '系统异常，请稍后重试' }));
    }
  } finally {
    activeLoops.delete(userId);
  }
}

// ========== 启动服务器 ==========

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  setupWebSocket(server);

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket on ws://${hostname}:${port}/nhb-customer-service/ws?token=xxx`);
    if (dev) console.log(`> Development mode (HMR enabled)`);
  });
});
