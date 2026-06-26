// 前端 WebSocket Hook — 连接管理、心跳、消息发送
// 使用 handlerRef 模式：ws.onmessage 只注册一次，通过 ref 动态切换处理逻辑

import { useRef, useEffect, useState, useCallback } from 'react';
import { WS_BASE_URL } from '../../config';

interface WsMessage {
  type: 'chat' | 'ping';
  message?: string;
  channel?: string;
}

interface WsEvent {
  type: 'connected' | 'pong' | 'status' | 'content' | 'done' | 'error' | 'auth';
  content?: string;
  status?: string;
  userId?: string;
  verifyUrl?: string;
  recordId?: number;
}

type WsEventHandler = (event: WsEvent) => void;

export function useWebSocket(token: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef<WsEventHandler | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectInterval = 3000;
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 内部消息分发：ws.onmessage 只注册一次，将事件转发到 handlerRef
  const dispatchMessage = useCallback((data: string) => {
    try {
      const event: WsEvent = JSON.parse(data);
      const handler = handlerRef.current;
      if (handler) {
        handler(event);
      }
    } catch {
      console.error('[ws] Failed to parse message:', data);
    }
  }, []);

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (!token) return;
    // 如果已有连接且正常，不重复连接
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    // 如果正在连接中，不重复连接
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) return;

    const wsUrl = `${WS_BASE_URL}?token=${encodeURIComponent(token)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      // HTTPS 页面创建 ws:// 连接时浏览器会抛出 SecurityError
      // 捕获后静默降级为 HTTP 路径，不崩溃页面
      console.warn('[ws] WebSocket creation failed:', e instanceof Error ? e.message : String(e));
      setConnected(false);
      return;
    }

    ws.onopen = () => {
      setConnected(true);
      reconnectAttemptsRef.current = 0;
      console.log('[ws] Connected');

      // 启动心跳
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = (msgEvent) => {
      dispatchMessage(msgEvent.data);
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('[ws] Disconnected');

      // 自动重连
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        console.log(`[ws] Reconnecting (${reconnectAttemptsRef.current}/${maxReconnectAttempts})...`);
        setTimeout(connect, reconnectInterval);
      }
    };

    ws.onerror = (error) => {
      console.error('[ws] Error:', error);
    };

    wsRef.current = ws;
  }, [token, dispatchMessage]);

  // 设置消息处理器（通过 ref，不会触发重新注册）
  const setMessageHandler = useCallback((handler: WsEventHandler | null) => {
    handlerRef.current = handler;
  }, []);

  // 发送 chat 消息
  const sendMessage = useCallback((message: string, channel: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[ws] Cannot send message, not connected');
      return false;
    }

    ws.send(JSON.stringify({
      type: 'chat',
      message,
      channel,
    }));

    return true;
  }, []);

  // 断开连接
  const disconnect = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Client disconnect');
      wsRef.current = null;
    }
    // 注意：不清空 handlerRef，因为 handler 由 page 组件的 useEffect 设置，
    // 在 WS reconnect 后 handlerRef 应仍然有效，否则所有事件会被丢弃
    setConnected(false);
  }, []);

  // mount 时连接，unmount 时断开
  useEffect(() => {
    if (token) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [token, connect, disconnect]);

  return {
    wsRef,
    connected,
    sendMessage,
    disconnect,
    setMessageHandler,
  };
}
