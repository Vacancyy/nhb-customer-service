// WebSocket 服务端管理 — 处理连接、认证、消息路由

import WebSocket from 'ws';
import { parseToken } from '@/lib/auth-token';
import { logInfo, logError } from '@/lib/logger';

// WebSocket 消息类型（客户端 → 服务端）
interface WsClientMessage {
  type: 'chat' | 'ping';
  message?: string;
  channel?: string;
}

// WebSocket 消息类型（服务端 → 客户端）
interface WsServerMessage {
  type: 'connected' | 'pong' | 'status' | 'content' | 'done' | 'error' | 'auth';
  content?: string;
  status?: string;
  userId?: string;
  verifyUrl?: string;
  recordId?: number;
}

class WsServerManager {
  private wss: WebSocket.Server | null = null;
  // userId → WebSocket 连接
  private connections: Map<string, WebSocket> = new Map();
  // userId → 是否正在处理 agent loop
  private activeLoops: Map<string, boolean> = new Map();
  // 心跳定时器
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * 将 WebSocket Server attach 到 HTTP server
   */
  attachToServer(server: import('http').Server) {
    this.wss = new WebSocket.Server({
      noServer: true,  // 不自动监听，由 HTTP server 的 upgrade 事件触发
    });

    // 处理 HTTP upgrade 请求（只处理 /nhb-customer-service/ws 路径）
    server.on('upgrade', (request: import('http').IncomingMessage, socket: import('stream').Duplex, head: Buffer) => {
      const url = new URL(request.url || '', `http://${request.headers.host}`);
      const pathname = url.pathname;

      if (pathname === '/nhb-customer-service/ws') {
        // 从 URL 参数提取 token
        const token = url.searchParams.get('token');

        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\r\n\r\n');
          socket.destroy();
          return;
        }

        // 验证 token，提取 userId
        const userId = parseToken(token);
        if (!userId) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // 手动完成 WebSocket 升级
        this.wss!.handleUpgrade(request, socket, head, (ws) => {
          this.handleConnection(ws, userId);
        });
      } else {
        // 非 WS 路径，拒绝升级
        socket.write('HTTP/1.1 404 Not Found\r\r\n\r\n');
        socket.destroy();
      }
    });

    // WebSocket 连接事件
    this.wss.on('connection', (ws) => {
      // handleUpgrade 后已经在 handleConnection 中处理
      logInfo('[ws-server] Raw connection (should be handled by handleUpgrade)');
    });

    logInfo('[ws-server] WebSocket server attached');
  }

  /**
   * 处理新 WebSocket 连接
   */
  private handleConnection(ws: WebSocket, userId: string) {
    // 同一 userId 新连接替换旧连接
    const existingWs = this.connections.get(userId);
    if (existingWs && existingWs.readyState === WebSocket.OPEN) {
      existingWs.close(1000, '新连接替换旧连接');
      this.stopHeartbeat(userId);
    }

    this.connections.set(userId, ws);
    logInfo(`[ws-server] User connected: ${userId}`);

    // 发送连接确认
    this.sendToUser(userId, { type: 'connected', userId });

    // 启动心跳
    this.startHeartbeat(userId, ws);

    // 处理客户端消息
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg: WsClientMessage = JSON.parse(data.toString());
        this.handleMessage(userId, msg);
      } catch (error) {
        logError('[ws-server] 消息解析失败', { userId, error });
        this.sendToUser(userId, { type: 'error', content: '消息格式错误' });
      }
    });

    // 处理断开连接
    ws.on('close', (code: number, reason: string) => {
      if (this.connections.get(userId) === ws) {
        this.connections.delete(userId);
        this.stopHeartbeat(userId);
        logInfo(`[ws-server] User disconnected: ${userId}, code: ${code}`);
      }
    });

    ws.on('error', (error: Error) => {
      logError('[ws-server] WebSocket error', { userId, error: error.message });
      if (this.connections.get(userId) === ws) {
        this.connections.delete(userId);
        this.stopHeartbeat(userId);
      }
    });
  }

  /**
   * 处理客户端消息
   */
  private handleMessage(userId: string, msg: WsClientMessage) {
    if (msg.type === 'ping') {
      this.sendToUser(userId, { type: 'pong' });
      return;
    }

    if (msg.type === 'chat') {
      // 并发控制：同一 userId 同时只允许一个 agent loop
      if (this.activeLoops.get(userId)) {
        this.sendToUser(userId, { type: 'error', content: '请等待当前回答完成' });
        return;
      }

      const message = msg.message || '';
      const channel = msg.channel || 'default';

      if (!message.trim()) {
        this.sendToUser(userId, { type: 'error', content: '消息不能为空' });
        return;
      }

      // 动态导入 agent loop 处理模块，避免循环依赖
      import('./ws-agent-loop').then(({ handleWsChat }) => {
        handleWsChat(userId, message, channel, this);
      }).catch((error) => {
        logError('[ws-server] 动态导入 ws-agent-loop 失败', { userId, error });
        this.sendToUser(userId, { type: 'error', content: '系统异常' });
      });
    }
  }

  /**
   * 向指定用户发送消息
   */
  sendToUser(userId: string, msg: WsServerMessage): boolean {
    const ws = this.connections.get(userId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch (error) {
      logError('[ws-server] 发送消息失败', { userId, error });
      return false;
    }
  }

  /**
   * 设置/清除活跃 agent loop 标记
   */
  setActiveLoop(userId: string, active: boolean) {
    this.activeLoops.set(userId, active);
    if (!active) {
      this.activeLoops.delete(userId);
    }
  }

  /**
   * 检查用户连接是否活跃
   */
  isConnected(userId: string): boolean {
    const ws = this.connections.get(userId);
    return ws != null && ws.readyState === WebSocket.OPEN;
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(userId: string, ws: WebSocket) {
    // 每30秒检查一次连接状态
    const timer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat(userId);
        return;
      }
      // 检测 pong 响应（ws 库自带 ping/pong）
      ws.ping();
    }, 30000);

    this.heartbeatTimers.set(userId, timer);
  }

  /**
   * 停止心跳检测
   */
  private stopHeartbeat(userId: string) {
    const timer = this.heartbeatTimers.get(userId);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(userId);
    }
  }
}

// 全局单例
let wsServerInstance: WsServerManager | null = null;

export function getWsServer(): WsServerManager {
  if (!wsServerInstance) {
    wsServerInstance = new WsServerManager();
  }
  return wsServerInstance;
}

export { WsServerManager };
