'use client';

import { useState, useEffect } from 'react';

const ADMIN_API_BASE_URL = '/nhb-customer-service/api/admin-api';

export default function PromptPage() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 获取当前提示词
  useEffect(() => {
    fetch(`${ADMIN_API_BASE_URL}/config/prompt`)
      .then(res => res.json())
      .then(data => {
        if (data.code === 200) {
          setPrompt(data.data.prompt);
        } else {
          setMessage({ type: 'error', text: data.msg });
        }
      })
      .catch(err => {
        setMessage({ type: 'error', text: '获取提示词失败' });
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  // 保存提示词
  const handleSave = async () => {
    if (!prompt.trim()) {
      setMessage({ type: 'error', text: '提示词不能为空' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/config/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      const data = await res.json();

      if (data.code === 200) {
        setMessage({ type: 'success', text: '保存成功' });
      } else {
        setMessage({ type: 'error', text: data.msg });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '保存失败' });
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-4">系统提示词配置</h1>

        {loading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : (
            <>
              {/* 提示说明 */}
              <div className="mb-4 text-sm text-gray-500">
                <p>系统提示词用于定义 AI 客服的行为规则和回答风格。</p>
                <p>修改后立即生效，无需重启服务。</p>
              </div>

              {/* 消息提示 */}
              {message && (
                <div className={`mb-4 p-3 rounded ${
                  message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {message.text}
                </div>
              )}

              {/* 编辑区 */}
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full border rounded-lg p-4 text-sm min-h-[400px] focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="输入系统提示词..."
              />

              {/* 字数统计 */}
              <div className="mt-2 text-sm text-gray-500 text-right">
                当前字数：{prompt.length}
              </div>

              {/* 操作按钮 */}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={handleSave}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  disabled={saving}
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
}