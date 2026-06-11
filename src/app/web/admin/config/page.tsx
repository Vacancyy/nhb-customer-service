'use client';

import { useState, useEffect } from 'react';

interface SwitchStatus {
  key: string;
  value: string | null;
  enabled: boolean;
}

export default function ConfigSwitchPage() {
  const [status, setStatus] = useState<SwitchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const API_BASE = '/nhb-customer-service/api/admin-api/config';

  // 获取当前状态
  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/switch?key=review_enabled`);
      const data = await res.json();
      if (data.code === 200) {
        setStatus(data.data);
      }
    } catch (err) {
      console.error('获取状态失败:', err);
      setMessage('获取状态失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  // 启用审核
  const enableReview = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'review_enabled', value: 'true' })
      });
      const data = await res.json();
      if (data.code === 200) {
        setMessage('审核功能已启用');
        fetchStatus();
      } else {
        setMessage(data.msg || '设置失败');
      }
    } catch (err) {
      setMessage('设置失败');
    } finally {
      setSaving(false);
    }
  };

  // 禁用审核
  const disableReview = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'review_enabled', value: '' })
      });
      const data = await res.json();
      if (data.code === 200) {
        setMessage('审核功能已禁用');
        fetchStatus();
      } else {
        setMessage(data.msg || '设置失败');
      }
    } catch (err) {
      setMessage('设置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-lg mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-xl font-bold mb-6">审核功能开关管理</h1>

        {loading ? (
          <div className="text-center py-4 text-gray-500">加载中...</div>
        ) : (
          <>
            {/* 当前状态 */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">当前状态：</span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  status?.enabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {status?.enabled ? '已启用' : '已禁用'}
                </span>
              </div>
              <div className="mt-2 text-sm text-gray-500">
                Redis 值: {status?.value || 'null（不存在）'}
              </div>
            </div>

            {/* 说明 */}
            <div className="mb-6 text-sm text-gray-600">
              <p><strong>启用审核：</strong>用户发送消息后，AI 回答需要管理员审核才能显示</p>
              <p><strong>禁用审核：</strong>用户发送消息后，AI 回答直接显示（绕过审核）</p>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-4">
              <button
                onClick={enableReview}
                disabled={saving || status?.enabled}
                className={`flex-1 py-3 rounded-lg font-medium transition ${
                  status?.enabled
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }`}
              >
                {saving ? '保存中...' : '启用审核'}
              </button>

              <button
                onClick={disableReview}
                disabled={saving || !status?.enabled}
                className={`flex-1 py-3 rounded-lg font-medium transition ${
                  !status?.enabled
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-red-500 text-white hover:bg-red-600'
                }`}
              >
                {saving ? '保存中...' : '禁用审核'}
              </button>
            </div>

            {/* 消息提示 */}
            {message && (
              <div className="mt-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-center">
                {message}
              </div>
            )}

            {/* 刷新按钮 */}
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="mt-4 w-full py-2 text-gray-600 hover:text-gray-800 text-sm"
            >
              刷新状态
            </button>
          </>
        )}

        {/* 返回链接 */}
        <div className="mt-6 text-center">
          <a
            href="/nhb-customer-service/web/admin"
            className="text-blue-500 hover:underline"
          >
            返回管理端首页
          </a>
        </div>
      </div>
    </div>
  );
}