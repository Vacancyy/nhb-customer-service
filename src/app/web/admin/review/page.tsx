'use client';

import { useState, useEffect, useCallback } from 'react';
import { ADMIN_API_BASE_URL } from '../../config';

interface ChatRecord {
  id: number;
  user_id: string;
  channel: string;
  input: string;
  output: string;
  status: string;
  created_at: string;
  timestamp: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ApiResponse {
  code: number;
  msg: string;
  data: {
    list: ChatRecord[];
    pagination: Pagination;
  };
}

export default function ReviewPage() {
  const [records, setRecords] = useState<ChatRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState('pending');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(1000); // 1秒刷新一次
  const [editingId, setEditingId] = useState<number | null>(null); // 正在编辑的记录ID
  const [editedOutput, setEditedOutput] = useState<string>(''); // 编辑后的内容
  const [processedTimeoutIds, setProcessedTimeoutIds] = useState<Set<number>>(new Set()); // 已处理的超时ID
  const [timeoutSeconds] = useState(10); // 超时时间（秒）
  const [currentTime, setCurrentTime] = useState(Date.now()); // 用于倒计时更新

  // 审核开关状态
  const [reviewEnabled, setReviewEnabled] = useState(false);
  const [switchLoading, setSwitchLoading] = useState(true);
  const [switchSaving, setSwitchSaving] = useState(false);

  // 倒计时更新定时器
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 获取审核开关状态
  useEffect(() => {
    fetch('/nhb-customer-service/api/admin-api/config/switch?key=review_enabled')
      .then(res => res.json())
      .then(data => {
        if (data.code === 200) {
          setReviewEnabled(data.data.enabled);
        }
      })
      .catch(console.error)
      .finally(() => setSwitchLoading(false));
  }, []);

  // 切换审核开关
  const toggleReviewSwitch = async () => {
    setSwitchSaving(true);
    try {
      const newValue = !reviewEnabled;
      const res = await fetch('/nhb-customer-service/api/admin-api/config/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'review_enabled',
          value: newValue ? 'true' : ''
        })
      });
      const data = await res.json();
      if (data.code === 200) {
        setReviewEnabled(newValue);
      }
    } catch (err) {
      console.error('切换失败:', err);
    } finally {
      setSwitchSaving(false);
    }
  };

  // 自动处理超时消息
  const handleAutoTimeout = async (id: number) => {
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/review/auto-handle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const result = await res.json();

      if (result.code === 200) {
        console.log(`消息 ${id} 自动处理成功（超时）`);
        setProcessedTimeoutIds(prev => new Set([...prev, id]));
        fetchRecords(); // 刷新列表
      } else {
        console.error('自动处理失败:', result.msg);
      }
    } catch (error) {
      console.error('自动处理失败:', error);
    }
  };

  // 检查超时消息
  const checkTimeoutMessages = useCallback(() => {
    if (statusFilter !== 'pending') return; // 只在待审核页面检查

    const now = Date.now();
    records.forEach((record) => {
      if (record.status !== 'pending') return;
      if (processedTimeoutIds.has(record.id)) return; // 已处理过

      const ts = typeof record.timestamp === 'string' ? parseFloat(record.timestamp) : record.timestamp;
      if (!ts) return;

      const elapsedSeconds = (now - ts) / 1000;
      if (elapsedSeconds >= timeoutSeconds) {
        console.log(`消息 ${record.id} 超时 ${elapsedSeconds.toFixed(1)}秒，自动处理`);
        handleAutoTimeout(record.id);
      }
    });
  }, [records, statusFilter, processedTimeoutIds, timeoutSeconds]);

  // 每次刷新后检查超时
  useEffect(() => {
    checkTimeoutMessages();
  }, [checkTimeoutMessages]);

  // 获取审核列表
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${ADMIN_API_BASE_URL}/review?page=${pagination.page}&pageSize=${pagination.pageSize}&status=${statusFilter}`
      );
      const result: ApiResponse = await res.json();

      if (result.code === 200) {
        setRecords(result.data.list);
        setPagination(result.data.pagination);
      } else {
        console.error('获取列表失败:', result.msg);
      }
    } catch (error) {
      console.error('获取列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, statusFilter]);

  // 自动刷新
  useEffect(() => {
    fetchRecords();

    if (autoRefresh) {
      const timer = setInterval(fetchRecords, refreshInterval);
      return () => clearInterval(timer);
    }
  }, [fetchRecords, autoRefresh, refreshInterval]);

  // 开始编辑
  const handleEdit = (record: ChatRecord) => {
    setEditingId(record.id);
    setEditedOutput(record.output);
  };

  // 保存编辑
  const handleSaveEdit = async (id: number) => {
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/review/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, output: editedOutput }),
      });
      const result = await res.json();

      if (result.code === 200) {
        setEditingId(null);
        setEditedOutput('');
        fetchRecords(); // 刷新列表
      } else {
        console.error('保存失败:', result.msg);
      }
    } catch (error) {
      console.error('保存失败:', error);
    }
  };

  // 取消编辑
  const handleCancelEdit = () => {
    setEditingId(null);
    setEditedOutput('');
  };

  // 审核通过
  const handleApprove = async (ids: number[]) => {
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/review/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const result = await res.json();

      if (result.code === 200) {
        setSelectedIds(new Set());
        fetchRecords(); // 立即刷新列表
      } else {
        console.error('操作失败:', result.msg);
      }
    } catch (error) {
      console.error('审核失败:', error);
    }
  };

  // 审核拒绝
  const handleReject = async (ids: number[]) => {
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/review/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const result = await res.json();

      if (result.code === 200) {
        setSelectedIds(new Set());
        fetchRecords(); // 立即刷新列表
      } else {
        console.error('操作失败:', result.msg);
      }
    } catch (error) {
      console.error('拒绝失败:', error);
    }
  };

  // 切换选择
  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(records.map((r) => r.id)));
    }
  };

  // 格式化时间
  const formatTime = (timestamp: number | string) => {
    const ts = typeof timestamp === 'string' ? parseFloat(timestamp) : timestamp;
    if (!ts || isNaN(ts)) return '未知时间';
    return new Date(ts).toLocaleString('zh-CN');
  };

  // 计算剩余时间（秒）
  const getRemainingSeconds = (timestamp: number | string): number => {
    const ts = typeof timestamp === 'string' ? parseFloat(timestamp) : timestamp;
    if (!ts) return 0;
    const elapsed = (currentTime - ts) / 1000;
    return Math.max(0, Math.floor(timeoutSeconds - elapsed));
  };

  return (
    <div className="p-4">
      {/* 工具栏 */}
      <div className="bg-white rounded-lg shadow mb-4 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">AI 客服审核管理</h1>
          <div className="flex items-center space-x-4">
            {/* 审核开关 */}
            <div className="flex items-center space-x-2 bg-gray-100 rounded-lg px-3 py-2">
              <span className="text-sm font-medium">审核功能：</span>
              <button
                  onClick={toggleReviewSwitch}
                  disabled={switchLoading || switchSaving}
                  className={`w-10 h-5 rounded-full transition-colors ${
                    reviewEnabled ? 'bg-green-500' : 'bg-gray-300'
                  } ${switchLoading || switchSaving ? 'opacity-50' : ''}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${
                    reviewEnabled ? 'translate-x-5' : 'translate-x-1'
                  }`} />
                </button>
                <span className={`text-xs font-medium ${reviewEnabled ? 'text-green-600' : 'text-gray-500'}`}>
                  {reviewEnabled ? '已启用' : '已禁用'}
                </span>
              </div>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm">自动刷新</span>
              </label>
              {autoRefresh && (
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value={1000}>1秒</option>
                  <option value={3000}>3秒</option>
                  <option value={5000}>5秒</option>
                  <option value={10000}>10秒</option>
                </select>
              )}
            </div>
      </div>

      {/* 筛选和操作栏 */}
      <div className="bg-white rounded-lg shadow mb-4 p-4">
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium">状态筛选：</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPagination({ ...pagination, page: 1 });
                }}
                className="border rounded px-3 py-1"
              >
                <option value="pending">待审核</option>
                <option value="success">已通过</option>
                <option value="rejected">已拒绝</option>
                <option value="all">全部</option>
              </select>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">已选择 {selectedIds.size} 条</span>
                <button
                  onClick={() => handleApprove(Array.from(selectedIds))}
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                >
                  批量通过
                </button>
                <button
                  onClick={() => handleReject(Array.from(selectedIds))}
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                >
                  批量拒绝
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 列表 */}
        {loading && records.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-500">加载中...</div>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-500">暂无数据</div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 全选 */}
            <div className="bg-white rounded-lg shadow px-4 py-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedIds.size === records.length && records.length > 0}
                  onChange={toggleSelectAll}
                  className="mr-2"
                />
                <span className="text-sm font-medium">全选</span>
              </label>
            </div>

            {/* 记录列表 */}
            {records.map((record) => (
              <div
                key={record.id}
                className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start space-x-4">
                  {/* 选择框 */}
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(record.id)}
                      onChange={() => toggleSelect(record.id)}
                    />
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    {/* 元数据 */}
                    <div className="flex items-center space-x-4 text-sm text-gray-500 mb-2">
                      <span className="font-medium">ID: {record.id}</span>
                      <span>用户: {record.user_id}</span>
                      <span>渠道: {record.channel}</span>
                      <span>{formatTime(record.timestamp)}</span>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          record.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : record.status === 'success'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {record.status === 'pending'
                          ? '待审核'
                          : record.status === 'success'
                          ? '已通过'
                          : '已拒绝'}
                      </span>
                      {/* 超时倒计时 */}
                      {record.status === 'pending' && !processedTimeoutIds.has(record.id) && (
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          getRemainingSeconds(record.timestamp) <= 3
                            ? 'bg-red-100 text-red-700 animate-pulse'
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {getRemainingSeconds(record.timestamp)}秒后自动处理
                        </span>
                      )}
                    </div>

                    {/* 用户提问 */}
                    <div className="mb-3">
                      <div className="text-xs text-gray-500 mb-1">用户提问：</div>
                      <div className="bg-blue-50 rounded p-3 text-sm">{record.input}</div>
                    </div>

                    {/* AI 回答 */}
                    <div>
                      <div className="text-xs text-gray-500 mb-1">AI 回答：</div>
                      {editingId === record.id ? (
                        // 编辑模式
                        <div className="space-y-2">
                          <textarea
                            value={editedOutput}
                            onChange={(e) => setEditedOutput(e.target.value)}
                            className="w-full border rounded p-3 text-sm min-h-[150px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="编辑AI回答..."
                          />
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleSaveEdit(record.id)}
                              className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
                            >
                              保存
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-400"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        // 显示模式
                        <div className="bg-gray-50 rounded p-3 text-sm whitespace-pre-wrap flex items-start justify-between gap-2">
                          <div className="flex-1">{record.output}</div>
                          <button
                            onClick={() => handleEdit(record)}
                            className="text-blue-500 hover:text-blue-600 text-xs whitespace-nowrap"
                          >
                            编辑
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  {record.status === 'pending' && (
                    <div className="flex flex-col space-y-2 pt-1">
                      <button
                        onClick={() => handleApprove([record.id])}
                        className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                      >
                        通过
                      </button>
                      <button
                        onClick={() => handleReject([record.id])}
                        className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                      >
                        拒绝
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* 分页 */}
            {pagination.totalPages > 1 && (
              <div className="bg-white rounded-lg shadow px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    共 {pagination.total} 条记录，第 {pagination.page} / {pagination.totalPages} 页
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>
                    <button
                      onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                      disabled={pagination.page === pagination.totalPages}
                      className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}