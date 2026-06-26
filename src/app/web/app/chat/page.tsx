'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ErudaInit from '../components/ErudaInit';
import { API_BASE_URL, BASE_PATH, PAGE_PATHS } from '../../config';
import { useWebSocket } from './ws-client';

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  type?: 'reply' | 'auth' | 'pending';
  status?: string;
  verifyUrl?: string;
  hasFeedback?: boolean;
  feedback?: string;
  feedbackAt?: number;
  recordId?: number;
  showFeedbackModal?: boolean;
  timestamp?: number;
}

const QUICK_ACTIONS = [
  { label: '订单查询', tag: 'enroll' },
  { label: '理赔进度', tag: 'claim' },
];

// localStorage key
const TOKEN_KEY = 'nhb_customer_service_token';
const CHANNEL_KEY = 'nhb_customer_service_channel';
const DEFAULT_CHANNEL = 'default';
const AUTH_VERIFY_MESSAGE = '查询订单或理赔信息需要先完成实名认证，请点击以下链接进行认证：';
const VERIFY_URL_PATH = 'web/app/verify';

export default function CustomerServicePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string>('');
  const [channel, setChannel] = useState<string>(DEFAULT_CHANNEL);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [humanServiceUrl, setHumanServiceUrl] = useState<string>('');
  const [reviewEnabled, setReviewEnabled] = useState(true); // 默认审核开启（安全策略）
  // 不再使用 messagesEndRef + scrollIntoView，改用 container.scrollTo
  const channelRef = useRef<string>(DEFAULT_CHANNEL);
  const tokenRef = useRef<string>('');
  // WS 流式相关 ref — 不通过 state 传递，避免闭包问题
  const wsBotMessageIdRef = useRef<string>('');     // 当前流式回复的 bot message ID
  const contentBufferRef = useRef<string>('');       // 流式内容缓冲
  const wsActiveRef = useRef(false);                 // 是否有 WS 流式进行中
  const rafIdRef = useRef<number | null>(null);      // requestAnimationFrame ID，用于批量更新
  const lastRenderTimeRef = useRef<number>(0);       // 上次 ReactMarkdown 渲染时间，用于节流

  // WebSocket 连接
  const { wsRef, connected: wsConnected, sendMessage: wsSendMessage, setMessageHandler } = useWebSocket(token);

  // 加载历史聊天记录
  const loadHistory = useCallback(async (ch: string, currentToken: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`${API_BASE_URL}/history?channel=${ch}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` },
      });
      const result = await res.json();

      if (result.code === 200 && result.data.history.length > 0) {
        const historyMessages: Message[] = result.data.history.map(
          (item: { role: string; content: string; timestamp: number; recordId?: number; feedback?: string; feedbackAt?: number }, index: number) => {
            const isBot = item.role === 'assistant';
            const isAuthMessage = isBot && item.content === AUTH_VERIFY_MESSAGE;
            return {
              id: `h-${index}-${item.timestamp}`,
              role: isBot ? 'bot' : 'user',
              content: item.content,
              type: isAuthMessage ? 'auth' : undefined,
              verifyUrl: isAuthMessage ? VERIFY_URL_PATH : undefined,
              hasFeedback: isBot && !isAuthMessage,
              recordId: item.recordId,
              feedback: item.feedback,
              feedbackAt: item.feedbackAt,
              timestamp: item.timestamp,
            };
          }
        );
        setMessages(historyMessages);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error('加载历史记录失败:', error);
      setMessages([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // 初始化用户
  const initUser = useCallback(async (ch: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: ch }),
      });
      const result = await res.json();

      if (result.code === 200 && result.data.token) {
        localStorage.setItem(TOKEN_KEY, result.data.token);
        setToken(result.data.token);
        tokenRef.current = result.data.token;
        console.log('[聊天页面] 初始化用户成功');
        loadHistory(ch, result.data.token);
      }
    } catch (error) {
      console.error('[聊天页面] 初始化用户失败:', error);
      setLoadingHistory(false);
    }
  }, [loadHistory]);

  // 初始化：从缓存读取 token 或初始化新用户
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cachedChannel = localStorage.getItem(CHANNEL_KEY) || DEFAULT_CHANNEL;
    setChannel(cachedChannel);
    channelRef.current = cachedChannel;

    const cachedToken = localStorage.getItem(TOKEN_KEY);
    if (cachedToken) {
      setToken(cachedToken);
      tokenRef.current = cachedToken;
      loadHistory(cachedChannel, cachedToken);
    } else {
      initUser(cachedChannel);
    }

    // 获取人工客服地址
    fetch(`${API_BASE_URL}/config/human-service`)
      .then(res => res.json())
      .then(result => {
        if (result.code === 200 && result.data.url) {
          setHumanServiceUrl(result.data.url);
        }
      })
      .catch(err => console.error('获取人工客服地址失败:', err));

    // 获取审核状态，决定是否使用 WS 流式
    fetch(`${API_BASE_URL}/config/review-status`)
      .then(res => res.json())
      .then(result => {
        if (result.code === 200) {
          setReviewEnabled(result.data.enabled);
        }
      })
      .catch(err => console.error('获取审核状态失败:', err));
  }, [loadHistory, initUser]);

  // 设置 WS 消息处理器 — 通过 setMessageHandler(ref) 模式，不会因 state 更新而丢失事件
  useEffect(() => {
    setMessageHandler((event) => {
      const botMessageId = wsBotMessageIdRef.current;
      if (!botMessageId) return; // 没有进行中的流式回复

      if (event.type === 'content') {
        // 真流式：累积内容到 ref buffer，节流更新 state（200ms 间隔）
        // 降低 ReactMarkdown 重渲染频率
        contentBufferRef.current += event.content || '';

        const now = Date.now();
        const elapsed = now - lastRenderTimeRef.current;

        if (elapsed >= 200 || rafIdRef.current === null) {
          lastRenderTimeRef.current = now;

          if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
          }

          const currentContent = contentBufferRef.current;
          const currentBotId = wsBotMessageIdRef.current;
          const nearBottom = isNearBottom();

          if (currentBotId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === currentBotId
                  ? { ...m, content: currentContent, type: 'reply', status: '' }
                  : m
              )
            );
          }

          // 用户在底部附近时，跟随新内容滚到底部（用 instant，不做动画）
          if (nearBottom) {
            scrollToBottom('instant');
          }
        } else if (rafIdRef.current === null) {
          const delay = 200 - elapsed;
          rafIdRef.current = requestAnimationFrame(() => {
            if (delay > 16) {
              setTimeout(() => {
                const currentContent = contentBufferRef.current;
                const currentBotId = wsBotMessageIdRef.current;
                const nearBottom = isNearBottom();
                rafIdRef.current = null;
                lastRenderTimeRef.current = Date.now();

                if (currentBotId) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === currentBotId
                        ? { ...m, content: currentContent, type: 'reply', status: '' }
                        : m
                    )
                  );
                }
                if (nearBottom) scrollToBottom('instant');
              }, delay);
            } else {
              const currentContent = contentBufferRef.current;
              const currentBotId = wsBotMessageIdRef.current;
              const nearBottom = isNearBottom();
              rafIdRef.current = null;
              lastRenderTimeRef.current = Date.now();

              if (currentBotId) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === currentBotId
                      ? { ...m, content: currentContent, type: 'reply', status: '' }
                      : m
                  )
                );
              }
              if (nearBottom) scrollToBottom('instant');
            }
          });
        }
      } else if (event.type === 'status') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId
              ? { ...m, status: event.status }
              : m
          )
        );
      } else if (event.type === 'done') {
        // 完成时：取消待执行的 RAF，立即更新最终内容
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        const finalContent = contentBufferRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId
              ? { ...m, content: finalContent, hasFeedback: true, recordId: event.recordId, type: 'reply', status: '' }
              : m
          )
        );
        setLoading(false);
        wsBotMessageIdRef.current = '';
        contentBufferRef.current = '';
        wsActiveRef.current = false;
        // 流式完成时平滑滚到底部
        scrollToBottom('smooth');
      } else if (event.type === 'auth') {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId
              ? { ...m, content: event.content || '', type: 'auth', verifyUrl: event.verifyUrl, status: '' }
              : m
          )
        );
        setLoading(false);
        wsBotMessageIdRef.current = '';
        contentBufferRef.current = '';
        wsActiveRef.current = false;
        scrollToBottom('smooth');
      } else if (event.type === 'error') {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId
              ? { ...m, content: event.content || '系统异常，请稍后重试', type: 'reply', status: '' }
              : m
          )
        );
        setLoading(false);
        wsBotMessageIdRef.current = '';
        contentBufferRef.current = '';
        wsActiveRef.current = false;
        scrollToBottom('smooth');
      }
    });
  }, [setMessageHandler]);

  // 滚动到底部 — 用 requestAnimationFrame 确保 React DOM 已更新后再滚动
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      const container = document.getElementById('msg-container');
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior });
      }
    });
  }, []);

  // 判断用户是否在底部附近（距离底部 ≤ 120px 视为"在底部"）
  const isNearBottom = useCallback(() => {
    const container = document.getElementById('msg-container');
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= 120;
  }, []);

  // 加载历史完成后滚到底部
  useEffect(() => {
    if (!loadingHistory && messages.length > 0) {
      scrollToBottom('instant');
    }
  }, [loadingHistory]);

  // 发送消息
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    await sendMessageContent(input.trim());
  };

  // 发送指定内容（用于快捷操作）
  const sendMessageContent = async (content: string) => {
    if (!content || loading) return;

    const currentChannel = channelRef.current;
    const currentToken = tokenRef.current || localStorage.getItem(TOKEN_KEY) || '';
    if (!currentToken) {
      alert('请先初始化用户');
      return;
    }

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: content,
      timestamp: Date.now(),
    };

    const botMessageId = `b-${Date.now()}`;
    const pendingBotMessage: Message = {
      id: botMessageId,
      role: 'bot',
      content: '',
      type: 'pending',
      status: '正在为您生成回答',
      hasFeedback: false,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage, pendingBotMessage]);
    setInput('');
    setLoading(true);
    // 发送消息后滚到底部
    scrollToBottom('smooth');

    // 三路径逻辑：
    // 1. 审核关闭 + WS 可用 → WebSocket 真流式（最快）
    // 2. 审核关闭 + WS 不通 → SSE 流式（快，无需 WS/WSS 配置）
    // 3. 审核开启           → chat-pending + 轮询（需要审核流程）
    if (!reviewEnabled) {
      // 审核关闭：走流式路径（WS 或 SSE）
      wsBotMessageIdRef.current = botMessageId;
      contentBufferRef.current = '';
      wsActiveRef.current = true;

      if (wsConnected) {
        // WS 路径
        wsSendMessage(content, currentChannel);
      } else {
        // SSE 路径 — 直接调用 SSE chat route，解析流式事件
        try {
          const res = await fetch(`${API_BASE_URL}/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentToken}`,
            },
            body: JSON.stringify({
              message: userMessage.content,
              channel: currentChannel,
            }),
          });

          if (!res.ok || !res.body) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botMessageId
                  ? { ...m, content: '请求失败，请稍后重试', type: 'reply', status: '' }
                  : m
              )
            );
            setLoading(false);
            wsActiveRef.current = false;
            wsBotMessageIdRef.current = '';
            contentBufferRef.current = '';
            return;
          }

          // 解析 SSE 流式响应
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

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
                  contentBufferRef.current += event.content || '';
                  // 同样使用 200ms 节流更新 + 智能跟随滚动
                  const now = Date.now();
                  const elapsed = now - lastRenderTimeRef.current;

                  if (elapsed >= 200) {
                    lastRenderTimeRef.current = now;
                    if (rafIdRef.current !== null) {
                      cancelAnimationFrame(rafIdRef.current);
                      rafIdRef.current = null;
                    }
                    const currentContent = contentBufferRef.current;
                    const currentBotId = wsBotMessageIdRef.current;
                    const nearBottom = isNearBottom();
                    if (currentBotId) {
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === currentBotId ? { ...m, content: currentContent, type: 'reply', status: '' } : m
                        )
                      );
                    }
                    if (nearBottom) scrollToBottom('instant');
                  } else if (rafIdRef.current === null) {
                    rafIdRef.current = requestAnimationFrame(() => {
                      const currentContent = contentBufferRef.current;
                      const currentBotId = wsBotMessageIdRef.current;
                      const nearBottom = isNearBottom();
                      rafIdRef.current = null;
                      lastRenderTimeRef.current = Date.now();
                      if (currentBotId) {
                        setMessages((prev) =>
                          prev.map((m) =>
                            m.id === currentBotId ? { ...m, content: currentContent, type: 'reply', status: '' } : m
                          )
                        );
                      }
                      if (nearBottom) scrollToBottom('instant');
                    });
                  }
                } else if (event.type === 'status') {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === botMessageId ? { ...m, status: event.status } : m
                    )
                  );
                } else if (event.type === 'auth') {
                  if (rafIdRef.current !== null) {
                    cancelAnimationFrame(rafIdRef.current);
                    rafIdRef.current = null;
                  }
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === botMessageId
                        ? { ...m, content: event.content || '', type: 'auth', verifyUrl: event.verifyUrl, status: '' }
                        : m
                    )
                  );
                  setLoading(false);
                  wsActiveRef.current = false;
                  wsBotMessageIdRef.current = '';
                  contentBufferRef.current = '';
                  scrollToBottom('smooth');
                  return;
                } else if (event.type === 'done') {
                  if (rafIdRef.current !== null) {
                    cancelAnimationFrame(rafIdRef.current);
                    rafIdRef.current = null;
                  }
                  const finalContent = contentBufferRef.current;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === botMessageId ? { ...m, content: finalContent, hasFeedback: true, recordId: event.recordId, type: 'reply', status: '' } : m
                    )
                  );
                  setLoading(false);
                  wsActiveRef.current = false;
                  wsBotMessageIdRef.current = '';
                  contentBufferRef.current = '';
                  scrollToBottom('smooth');
                  return;
                } else if (event.type === 'error') {
                  if (rafIdRef.current !== null) {
                    cancelAnimationFrame(rafIdRef.current);
                    rafIdRef.current = null;
                  }
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === botMessageId
                        ? { ...m, content: event.content || '系统异常，请稍后重试', type: 'reply', status: '' }
                        : m
                    )
                  );
                  setLoading(false);
                  wsActiveRef.current = false;
                  wsBotMessageIdRef.current = '';
                  contentBufferRef.current = '';
                  scrollToBottom('smooth');
                  return;
                }
              } catch {
                // 忽略 SSE 解析错误
              }
            }
          }
        } catch {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMessageId
                ? { ...m, content: '抱歉，出了点问题，请稍后重试。', type: 'reply', status: '' }
                : m
            )
          );
          setLoading(false);
          wsActiveRef.current = false;
          wsBotMessageIdRef.current = '';
          contentBufferRef.current = '';
        }
      }
    } else {
      // 审核开启：chat-pending + 轮询路径
      try {
        const res = await fetch(`${API_BASE_URL}/chat-pending`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`,
          },
          body: JSON.stringify({
            message: userMessage.content,
            channel: currentChannel,
          }),
        });

        const result = await res.json();

        if (result.code === 200) {
          // 处理实名认证提示
          if (result.data.type === 'auth') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botMessageId
                  ? { ...m, content: result.data.message, type: 'auth', verifyUrl: result.data.verifyUrl, status: '' }
                  : m
              )
            );
            setLoading(false);
            return;
          }

          const { recordId } = result.data;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMessageId ? { ...m, recordId } : m
            )
          );

          pollStatus(recordId, botMessageId, currentToken);
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === botMessageId
                ? { ...m, content: result.msg || '系统异常，请稍后重试', type: 'reply', status: '' }
                : m
            )
          );
          setLoading(false);
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId
              ? { ...m, content: '抱歉，出了点问题，请稍后重试。', type: 'reply', status: '' }
              : m
          )
        );
        setLoading(false);
      }
    }
  };

  // 轮询审核状态（HTTP 路径专用）
  const pollStatus = (recordId: number, botMessageId: string, currentToken: string) => {
    const maxAttempts = 60;
    const pollInterval = 2000;
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId
              ? { ...m, content: '回答生成超时，请重新提问', type: 'reply', status: '' }
              : m
          )
        );
        setLoading(false);
        return;
      }

      attempts++;

      try {
        const currentChannel = channelRef.current;

        const res = await fetch(
          `${API_BASE_URL}/check-status?recordId=${recordId}&channel=${currentChannel}`,
          { headers: { 'Authorization': `Bearer ${currentToken}` } }
        );
        const result = await res.json();

        if (result.code === 200) {
          const { status, output } = result.data;

          if (status === 'success') {
            simulateStreamingOutput(output, botMessageId);
            setLoading(false);
            return;
          } else if (status === 'rejected') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botMessageId
                  ? { ...m, content: '回答生成失败，请重新提问', type: 'reply', status: '' }
                  : m
              )
            );
            setLoading(false);
            return;
          }
        }
      } catch (error) {
        console.error('轮询失败:', error);
      }

      setTimeout(poll, pollInterval);
    };

    poll();
  };

  // 模拟流式输出（HTTP 路径专用，审核开启时）
  const simulateStreamingOutput = (fullContent: string, botMessageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === botMessageId ? { ...m, type: 'reply', status: '', content: '' } : m
      )
    );

    const words = fullContent.split('');
    let index = 0;
    const interval = 30;

    const timer = setInterval(() => {
      if (index >= words.length) {
        clearInterval(timer);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botMessageId ? { ...m, hasFeedback: true } : m
          )
        );
        return;
      }

      const chunk = words.slice(0, index + 1).join('');
      index++;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMessageId ? { ...m, content: chunk } : m
        )
      );
    }, interval);
  };

  const handleFeedback = (id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, showFeedbackModal: true } : m))
    );
  };

  const submitFeedback = async (id: string, feedbackText: string) => {
    const message = messages.find((m) => m.id === id);
    if (!message?.recordId) {
      alert('无法提交反馈：缺少记录ID');
      return;
    }

    const currentToken = tokenRef.current || localStorage.getItem(TOKEN_KEY) || '';
    try {
      const res = await fetch(`${API_BASE_URL}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
        body: JSON.stringify({
          recordId: message.recordId,
          feedback: feedbackText,
        }),
      });

      const result = await res.json();
      if (result.code === 200) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, feedback: feedbackText, feedbackAt: Date.now(), showFeedbackModal: false }
              : m
          )
        );
      } else {
        alert(result.msg || '反馈提交失败');
      }
    } catch {
      alert('反馈提交失败');
    }
  };

  const closeFeedbackModal = (id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, showFeedbackModal: false } : m))
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 清空用户信息并跳转到入口页面
  const clearUser = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CHANNEL_KEY);
    window.location.href = PAGE_PATHS.root;
  };

  return (
    <>
      <ErudaInit />
      <div className="flex flex-col h-screen bg-[#f5f5f5]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
        {/* 消息列表 */}
        <div id="msg-container" className="flex-1 overflow-y-auto px-3 py-4" style={{ overflowAnchor: 'none' }}>
          {loadingHistory && (
            <div className="flex justify-center items-center py-8">
              <div className="text-gray-400 text-sm">正在加载历史记录...</div>
            </div>
          )}

          {!loadingHistory && messages.length === 0 && (
            <div className="flex flex-col items-center mt-16 mb-6">
              <div className="text-center text-gray-400 mb-6">
                <p className="text-lg">你好，我是宁惠保客服</p>
                <p className="text-sm mt-1">有什么可以帮你的？</p>
              </div>
              {humanServiceUrl && (
                <div className="bg-white rounded-xl px-3 py-2 shadow-sm text-sm max-w-xs">
                  <span className="text-gray-600">您还可以点击 </span>
                  <a
                    href={humanServiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 font-medium cursor-pointer hover:underline"
                  >
                    转人工
                  </a>
                  <span className="text-gray-600"> 接入人工客服</span>
                </div>
              )}
            </div>
          )}

          {!loadingHistory && messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 mb-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'bot' && (
                <div className="relative flex-shrink-0 mt-1">
                  <div className="w-9 h-9 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[#f5f5f5] rounded-full" />
                </div>
              )}
              <div className={msg.role === 'user' ? 'max-w-[70%]' : 'max-w-[80%]'}>
                {msg.role === 'user' && (
                  <div className="bg-gradient-to-r from-teal-400 to-teal-500 text-white rounded-xl rounded-tr-md px-3 py-2 shadow-sm text-sm">
                    {msg.content}
                  </div>
                )}
                {msg.role === 'bot' && (
                  <div className="bg-white rounded-xl shadow-sm text-sm min-h-[40px]">
                    <div className="px-3 py-2 text-gray-800">
                      {msg.status ? (
                        <div className="flex gap-1.5 py-1">
                          <span className="w-2 h-2 bg-teal-500 rounded-full animate-dot-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-teal-500 rounded-full animate-dot-bounce" style={{ animationDelay: '160ms' }} />
                          <span className="w-2 h-2 bg-teal-500 rounded-full animate-dot-bounce" style={{ animationDelay: '320ms' }} />
                        </div>
                      ) : msg.type === 'auth' ? (
                        <div>
                          <p className="mb-2">{msg.content}</p>
                          <a
                            href={`${BASE_PATH}/${msg.verifyUrl}`}
                            className="inline-block bg-teal-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-teal-600 transition"
                          >
                            前往实名认证
                          </a>
                        </div>
                      ) : (
                        <div>
                          <div className="markdown-content" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                            {/* 始终用 ReactMarkdown 渲染，避免流式→完成时纯文本→Markdown 切换导致布局跳变 */}
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                                  ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                                  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                                  li: ({ children }) => <li className="mb-1">{children}</li>,
                                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                  code: ({ className, children, ...props }) => {
                                    const isInline = !className;
                                    return isInline
                                      ? <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>{children}</code>
                                      : <code className="block bg-gray-100 p-2 rounded text-sm overflow-x-auto" {...props}>{children}</code>;
                                  },
                                  a: ({ href, children }) => (
                                    <a href={href} className="text-teal-600 hover:underline" target="_blank" rel="noopener noreferrer">
                                      {children}
                                    </a>
                                  ),
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                          </div>
                          <p className="text-xs text-gray-400 mt-2">建议仅供参考，保险保障详情以保险合同为准</p>
                        </div>
                      )}
                    </div>
                    {msg.hasFeedback && (
                      <div className="border-t border-gray-100 px-3 py-2">
                        {msg.feedback ? (
                          <div className="text-xs text-gray-500">
                            <span className="text-teal-600">已反馈：</span>
                            {msg.feedback}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleFeedback(msg.id)}
                            className="text-xs text-gray-500 hover:text-teal-600 transition"
                          >
                            反馈
                          </button>
                        )}
                        {msg.showFeedbackModal && (
                          <div className="mt-2">
                            <textarea
                              className="w-full border border-gray-200 rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-teal-500"
                              placeholder="请输入您的反馈内容..."
                              rows={3}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  const target = e.target as HTMLTextAreaElement;
                                  if (target.value.trim()) {
                                    submitFeedback(msg.id, target.value.trim());
                                  }
                                }
                              }}
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => {
                                  const textarea = document.querySelector(`textarea`) as HTMLTextAreaElement;
                                  if (textarea?.value.trim()) {
                                    submitFeedback(msg.id, textarea.value.trim());
                                  }
                                }}
                                className="flex-1 bg-teal-500 text-white text-xs py-1.5 rounded-lg hover:bg-teal-600 transition"
                              >
                                提交
                              </button>
                              <button
                                onClick={() => closeFeedbackModal(msg.id)}
                                className="flex-1 bg-gray-100 text-gray-600 text-xs py-1.5 rounded-lg hover:bg-gray-200 transition"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

        </div>

        {/* 底部区域 */}
        <div className="bg-[#f5f5f5] px-3 pb-3 pt-1">
          <div className="flex gap-2 mb-2 overflow-x-auto">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.tag}
                onClick={() => sendMessageContent(action.label)}
                className="flex-shrink-0 bg-white border border-gray-300 text-gray-700 text-xs px-2.5 py-1 rounded-full hover:bg-gray-50 transition"
              >
                {action.label}
              </button>
            ))}
            <button
              onClick={clearUser}
              className="flex-shrink-0 bg-gray-100 border border-gray-300 text-gray-500 text-xs px-2.5 py-1 rounded-full hover:bg-gray-200 transition"
            >
              清理缓存
            </button>
            {humanServiceUrl && (
              <a
                href={humanServiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 bg-gray-100 border border-gray-300 text-gray-500 text-xs px-2.5 py-1 rounded-full hover:bg-gray-200 transition"
              >
                转人工
              </a>
            )}
          </div>

          <div className="flex items-center gap-2 bg-white rounded-full px-3 py-2 shadow-sm">
            <button className="flex-shrink-0 text-gray-400 hover:text-teal-600 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 18v-6a9 9 0 0118 0v6M3 18a3 3 0 003 3h0a3 3 0 003-3v-1a3 3 0 00-3-3h0a3 3 0 00-3 3v1M21 18a3 3 0 01-3 3h0a3 3 0 01-3-3v-1a3 3 0 013-3h0a3 3 0 013 3v1" />
              </svg>
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="请输入您的问题..."
              className="flex-1 text-sm focus:outline-none placeholder-gray-400"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition ${
                input.trim()
                  ? 'bg-teal-500 text-white hover:bg-teal-600'
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
            <button className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
