'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  hasFeedback?: boolean;
  helpful?: boolean;
  timestamp?: number;
}

const QUICK_ACTIONS = [
  { label: '立即参保', tag: 'enroll' },
  { label: '24年25年理赔申请', tag: 'claim' },
];

// localStorage key
const USER_ID_KEY = 'nhb_customer_service_user_id';
const CHANNEL_KEY = 'nhb_customer_service_channel';
const DEFAULT_CHANNEL = 'default';

export default function CustomerServicePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [channel, setChannel] = useState<string>(DEFAULT_CHANNEL);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 初始化：加载 userId、channel 和历史记录
  useEffect(() => {
    // 从 URL 参数获取 channel
    const urlParams = new URLSearchParams(window.location.search);
    const urlChannel = urlParams.get('channel');

    // channel 优先级：URL 参数 > localStorage > default
    const finalChannel = urlChannel || localStorage.getItem(CHANNEL_KEY) || DEFAULT_CHANNEL;
    setChannel(finalChannel);
    localStorage.setItem(CHANNEL_KEY, finalChannel);

    // 加载 userId
    const storedUserId = localStorage.getItem(USER_ID_KEY);
    if (storedUserId) {
      setUserId(storedUserId);
      loadHistory(storedUserId, finalChannel);
    } else {
      setLoadingHistory(false);
    }
  }, []);

  // 滚动到底部
  useEffect(() => {
    if (!loadingHistory) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loadingHistory]);

  // 加载历史聊天记录
  const loadHistory = async (uid: string, ch: string) => {
    try {
      const res = await fetch(`/nhb-customer-service-api/history?userId=${uid}&channel=${ch}`);
      const result = await res.json();

      if (result.code === 200 && result.data.history.length > 0) {
        const historyMessages: Message[] = result.data.history.map(
          (item: { role: string; content: string; timestamp: number }, index: number) => ({
            id: `h-${index}-${item.timestamp}`,
            role: item.role === 'assistant' ? 'bot' : 'user',
            content: item.content,
            hasFeedback: item.role === 'assistant',
            timestamp: item.timestamp,
          })
        );
        setMessages(historyMessages);
      }
    } catch (error) {
      console.error('加载历史记录失败:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // 发送消息
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/nhb-customer-service-api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          userId: userId || undefined,
          channel: channel,
        }),
      });
      const result = await res.json();

      if (result.code === 200) {
        // 如果是新用户，保存 userId 到 localStorage
        if (result.data.isNewUser && result.data.userId) {
          localStorage.setItem(USER_ID_KEY, result.data.userId);
          setUserId(result.data.userId);
        }

        // 保存返回的 channel
        if (result.data.channel) {
          localStorage.setItem(CHANNEL_KEY, result.data.channel);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            role: 'bot',
            content: result.data.message,
            hasFeedback: true,
            timestamp: Date.now(),
          },
        ]);
      } else {
        alert(result.msg || '系统异常，请稍后重试');
        setMessages((prev) => [
          ...prev,
          { id: `b-${Date.now()}`, role: 'bot', content: result.msg || '抱歉，出了点问题，请稍后重试。', hasFeedback: true },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `b-${Date.now()}`, role: 'bot', content: '抱歉，出了点问题，请稍后重试。', hasFeedback: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = (id: string, helpful: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, helpful } : m))
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 清空历史记录
  const clearHistory = async () => {
    if (!userId) return;
    try {
      await fetch(`/nhb-customer-service-api/history?userId=${userId}&channel=${channel}`, { method: 'DELETE' });
      setMessages([]);
    } catch (error) {
      console.error('清空历史失败:', error);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#f5f5f5]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto px-3 py-4">
        {/* 加载历史记录提示 */}
        {loadingHistory && (
          <div className="flex justify-center items-center py-8">
            <div className="text-gray-400 text-sm">正在加载历史记录...</div>
          </div>
        )}

        {/* 欢迎消息 */}
        {!loadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center mt-16 mb-6">
            <div className="text-center text-gray-400 mb-6">
              <p className="text-lg">你好，我是宁惠保智能客服</p>
              <p className="text-sm mt-1">有什么可以帮你的？</p>
            </div>
            <div className="bg-white rounded-xl px-3 py-2 shadow-sm text-sm max-w-xs">
              <span className="text-gray-600">您还可以点击 </span>
              <a
                href="https://im1c5366d.7x24cc.com/phone_webChat.html?accountId=N000000036181&chatId=be4c52b5-0ee1-46cb-b431-310d2f1147c9"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-600 font-medium cursor-pointer hover:underline"
              >
                转人工
              </a>
              <span className="text-gray-600"> 接入人工客服</span>
            </div>
          </div>
        )}

        {/* 消息列表 */}
        {!loadingHistory && messages.map((msg) => (
          <div key={msg.id} className={`flex gap-2 mb-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'bot' && (
              <div className="relative flex-shrink-0 mt-1">
                <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-lg shadow-sm">
                  🤖
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[#f5f5f5] rounded-full" />
              </div>
            )}
            <div className={msg.role === 'user' ? 'max-w-[70%]' : 'max-w-[80%]'}>
              {msg.role === 'bot' && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-800">机器人</span>
                </div>
              )}
              {/* 用户气泡：青绿色渐变 */}
              {msg.role === 'user' && (
                <div className="bg-gradient-to-r from-teal-400 to-teal-500 text-white rounded-xl rounded-tr-md px-3 py-2 shadow-sm text-sm">
                  {msg.content}
                </div>
              )}
              {/* 机器人气泡 */}
              {msg.role === 'bot' && (
                <>
                  {/* 反馈按钮 - 卡片格式 */}
                  <div className="mt-2 bg-white rounded-xl shadow-sm text-sm max-w-xs">
                    <div className="px-3 py-2 text-gray-800">
                      {msg.content}
                    </div>
                    <div className="flex items-center border-t border-gray-100">
                      <button
                        onClick={() => handleFeedback(msg.id, true)}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs transition ${
                          msg.helpful === true ? 'text-teal-600 font-medium' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        👍 有帮助
                      </button>
                      <div className="w-px h-4 bg-gray-200" />
                      <button
                        onClick={() => handleFeedback(msg.id, false)}
                        className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs transition ${
                          msg.helpful === false ? 'text-red-500 font-medium' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        👎 无帮助
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {/* 加载动画 */}
        {loading && (
          <div className="flex gap-2 mb-3 justify-start">
            <div className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-lg shadow-sm flex-shrink-0">
              🤖
            </div>
            <div className="bg-white rounded-xl rounded-tl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 底部区域 */}
      <div className="bg-[#f5f5f5] px-3 pb-3 pt-1">
        {/* 快捷操作按钮 */}
        <div className="flex gap-2 mb-2 overflow-x-auto">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.tag}
              onClick={() => { setInput(action.label); }}
              className="flex-shrink-0 bg-white border border-gray-300 text-gray-700 text-sm px-3 py-1.5 rounded-full hover:bg-gray-50 transition"
            >
              {action.label}
            </button>
          ))}
          {/* 清空历史按钮（仅在已有消息时显示） */}
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="flex-shrink-0 bg-white border border-gray-300 text-gray-500 text-sm px-3 py-1.5 rounded-full hover:bg-gray-50 transition"
            >
              清空对话
            </button>
          )}
        </div>

        {/* 输入框 */}
        <div className="flex items-center gap-2 bg-white rounded-full px-3 py-2 shadow-sm">
          {/* 耳机图标 - 转人工 */}
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
          {/* 发送按钮 */}
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
          {/* 加号按钮 */}
          <button className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}