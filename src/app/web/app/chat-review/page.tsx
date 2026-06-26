'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  type?: 'reply' | 'auth' | 'pending'; // pending=等待审核
  status?: string; // 状态提示
  recordId?: number; // 记录ID（用于轮询）
  timestamp?: number;
}

const QUICK_ACTIONS = [
  { label: '保费查询', tag: '保费' },
  { label: '理赔流程', tag: '理赔' },
];

// localStorage key
const USER_ID_KEY = 'nhb_customer_service_user_id';
const CHANNEL_KEY = 'nhb_customer_service_channel';
const DEFAULT_CHANNEL = 'default';

// 从 URL 获取 channel 参数
function getChannelFromUrl(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('channel');
}

export default function CustomerServicePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [channel, setChannel] = useState<string>(DEFAULT_CHANNEL);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [pendingRecords, setPendingRecords] = useState<Map<number, string>>(new Map()); // 待审核记录
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<string>(DEFAULT_CHANNEL);

  // 加载历史聊天记录（只显示已审核通过的）
  const loadHistory = useCallback(async (uid: string, ch: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/app-api/history?userId=${uid}&channel=${ch}`);
      const result = await res.json();

      if (result.code === 200 && result.data.history.length > 0) {
        const historyMessages: Message[] = result.data.history.map(
          (item: { role: string; content: string; timestamp: number }, index: number) => ({
            id: `h-${index}-${item.timestamp}`,
            role: item.role === 'assistant' ? 'bot' : 'user',
            content: item.content,
            type: 'reply',
            timestamp: item.timestamp,
          })
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

  // 轮询检查审核状态
  const checkReviewStatus = useCallback(async (recordId: number) => {
    try {
      const res = await fetch(`/api/app-api/check-status?recordId=${recordId}&userId=${userId}&channel=${channel}`);
      const result = await res.json();

      if (result.code === 200) {
        const { status, input, output } = result.data;

        if (status === 'success') {
          // 审核通过，显示AI回答
          setMessages(prev => {
            const updated = prev.map(msg => {
              if (msg.recordId === recordId && msg.type === 'pending') {
                return {
                  ...msg,
                  type: 'reply' as const,
                  content: output,
                  status: '审核已通过',
                };
              }
              return msg;
            });
            return updated;
          });

          // 移除待审核记录
          setPendingRecords(prev => {
            const newMap = new Map(prev);
            newMap.delete(recordId);
            return newMap;
          });

          return true; // 完成
        } else if (status === 'rejected') {
          // 审核拒绝
          setMessages(prev => {
            return prev.map(msg => {
              if (msg.recordId === recordId && msg.type === 'pending') {
                return {
                  ...msg,
                  type: 'reply' as const,
                  content: '您的提问审核未通过，请重新提问。',
                  status: '审核未通过',
                };
              }
              return msg;
            });
          });

          setPendingRecords(prev => {
            const newMap = new Map(prev);
            newMap.delete(recordId);
            return newMap;
          });

          return true; // 完成
        }
      }

      return false; // 继续
    } catch (error) {
      console.error('检查审核状态失败:', error);
      return false;
    }
  }, [userId, channel]);

  // 轮询所有待审核记录
  useEffect(() => {
    if (pendingRecords.size === 0) return;

    const pollInterval = setInterval(async () => {
      const recordIds = Array.from(pendingRecords.keys());

      for (const recordId of recordIds) {
        const completed = await checkReviewStatus(recordId);
        if (completed) {
          break; // 如果有完成的，刷新历史记录
        }
      }
    }, 3000); // 每3秒检查一次

    return () => clearInterval(pollInterval);
  }, [pendingRecords, checkReviewStatus]);

  // 初始化
  useEffect(() => {
    const urlChannel = getChannelFromUrl();
    const finalChannel = urlChannel || localStorage.getItem(CHANNEL_KEY) || DEFAULT_CHANNEL;
    setChannel(finalChannel);
    channelRef.current = finalChannel;
    localStorage.setItem(CHANNEL_KEY, finalChannel);

    const storedUserId = localStorage.getItem(USER_ID_KEY);
    if (storedUserId) {
      setUserId(storedUserId);
      loadHistory(storedUserId, finalChannel);
    } else {
      setLoadingHistory(false);
    }

    const handleUrlChange = () => {
      const newUrlChannel = getChannelFromUrl();
      const currentChannel = channelRef.current;

      if (newUrlChannel && newUrlChannel !== currentChannel) {
        setChannel(newUrlChannel);
        channelRef.current = newUrlChannel;
        localStorage.setItem(CHANNEL_KEY, newUrlChannel);

        const currentUserId = localStorage.getItem(USER_ID_KEY);
        if (currentUserId) {
          loadHistory(currentUserId, newUrlChannel);
        } else {
          setMessages([]);
        }
      }
    };

    window.addEventListener('popstate', handleUrlChange);
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, [loadHistory]);

  // 滚动到底部
  useEffect(() => {
    if (!loadingHistory) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loadingHistory]);

  // 发送消息（审核流程）
  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const currentChannel = channelRef.current;
    const userMessage: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      type: 'pending',
      status: '等待审核中...',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // 发送到审核API
      const res = await fetch('/api/app-api/chat-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          userId: userId,
          channel: currentChannel,
        }),
      });

      const result = await res.json();

      if (result.code === 200) {
        const { recordId, status } = result.data;

        // 更新消息，添加recordId
        setMessages(prev => prev.map(msg => {
          if (msg.id === userMessage.id) {
            return {
              ...msg,
              recordId,
              status: '等待审核中...',
            };
          }
          return msg;
        }));

        // 添加到待审核列表
        setPendingRecords(prev => new Map(prev).set(recordId, userMessage.id));

        // 如果是新用户，保存 userId
        if (result.data.isNewUser && result.data.userId) {
          localStorage.setItem(USER_ID_KEY, result.data.userId);
          setUserId(result.data.userId);
        }
      } else {
        // 失败
        setMessages(prev => prev.map(msg => {
          if (msg.id === userMessage.id) {
            return {
              ...msg,
              type: 'reply',
              content: '提交失败：' + result.msg,
              status: '',
            };
          }
          return msg;
        }));
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      setMessages(prev => prev.map(msg => {
        if (msg.id === userMessage.id) {
          return {
            ...msg,
            type: 'reply',
            content: '网络错误，请重试',
            status: '',
          };
        }
        return msg;
      }));
    } finally {
      setLoading(false);
    }
  };

  // 快捷提问
  const handleQuickAction = (tag: string) => {
    setInput(tag);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* 顶部栏 */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">宁惠保智能客服</h1>
              <p className="text-sm text-gray-500">您的提问将在审核后显示回答</p>
            </div>
            <div className="text-sm text-gray-600">
              渠道: {channel}
            </div>
          </div>
        </div>
      </div>

      {/* 聊天区域 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 加载历史 */}
        {loadingHistory && (
          <div className="text-center py-8">
            <div className="text-gray-500">加载历史记录...</div>
          </div>
        )}

        {/* 消息列表 */}
        {!loadingHistory && messages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">暂无对话记录</div>
            <div className="text-gray-500">发送消息开始对话</div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
              message.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-white border shadow-sm'
            }`}>
              {/* 用户消息 */}
              {message.role === 'user' && (
                <div>{message.content}</div>
              )}

              {/* Bot消息 */}
              {message.role === 'bot' && (
                <div>
                  {/* 状态提示 */}
                  {message.type === 'pending' && (
                    <div className="flex items-center mb-2 text-yellow-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
                      <span className="text-sm">{message.status}</span>
                    </div>
                  )}

                  {/* 内容 */}
                  {message.type === 'reply' && (
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* 审核状态 */}
                  {message.status && message.type !== 'pending' && (
                    <div className="mt-2 text-xs text-gray-500">{message.status}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* 快捷提问 */}
      <div className="max-w-4xl mx-auto px-4 mb-4">
        <div className="flex gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.tag}
              onClick={() => handleQuickAction(action.label)}
              className="px-4 py-2 bg-white border rounded-lg text-sm hover:bg-gray-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* 输入框 */}
      <div className="max-w-4xl mx-auto px-4 pb-6 sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pt-4">
        <div className="bg-white rounded-lg shadow-lg border flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="输入您的提问..."
            className="flex-1 px-4 py-3 outline-none"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-6 py-3 bg-blue-500 text-white rounded-r-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? '发送中...' : '发送'}
          </button>
        </div>

        <div className="mt-2 text-center text-xs text-gray-500">
          提问后需等待管理员审核，审核通过后才会显示回答
        </div>
      </div>
    </div>
  );
}