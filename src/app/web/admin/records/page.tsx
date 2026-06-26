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
  timestamp: number | string;
  first_token_time: number | null;
  generation_time: number | null;
  model_used: string | null;
  has_tool_calls: boolean | null;
  tool_calls_detail: Array<{ name: string; arguments: Record<string, any>; result: string }> | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  agent_iterations: number | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function formatTime(ms: number | null): string {
  if (ms === null || ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(prompt: number | null, completion: number | null, total: number | null): string {
  if (total === null) return '-';
  return `输入${prompt || 0} / 输出${completion || 0} / 共${total}`;
}

function formatTimestamp(ts: number | string): string {
  const num = typeof ts === 'string' ? parseFloat(ts) : ts;
  return new Date(num).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    success: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };
  const labels: Record<string, string> = {
    pending: '待审核',
    success: '已通过',
    rejected: '已拒绝',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {labels[status] || status}
    </span>
  );
}

export default function RecordsPage() {
  // 数据状态
  const [records, setRecords] = useState<ChatRecord[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);

  // 篮选状态
  const [statusFilter, setStatusFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [keywordFilter, setKeywordFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [hasToolCallsFilter, setHasToolCallsFilter] = useState('');
  const [modelUsedFilter, setModelUsedFilter] = useState('');

  // 展开状态
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedToolId, setExpandedToolId] = useState<number | null>(null);

  const fetchRecords = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pagination.pageSize),
        status: statusFilter,
      });
      if (channelFilter) params.set('channel', channelFilter);
      if (userIdFilter) params.set('userId', userIdFilter);
      if (keywordFilter) params.set('keyword', keywordFilter);
      if (startDateFilter) params.set('startDate', startDateFilter);
      if (endDateFilter) params.set('endDate', endDateFilter);
      if (hasToolCallsFilter) params.set('hasToolCalls', hasToolCallsFilter);
      if (modelUsedFilter) params.set('modelUsed', modelUsedFilter);

      const res = await fetch(`${ADMIN_API_BASE_URL}/records?${params.toString()}`);
      const data = await res.json();

      if (data.code === 200) {
        setRecords(data.data.list || []);
        setPagination(data.data.pagination || { page, pageSize: 20, total: 0, totalPages: 0 });
      }
    } catch (err) {
      console.error('获取对话记录失败:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, channelFilter, userIdFilter, keywordFilter, startDateFilter, endDateFilter, hasToolCallsFilter, modelUsedFilter, pagination.pageSize]);

  useEffect(() => {
    fetchRecords(1);
  }, [fetchRecords]);

  const handleSearch = () => fetchRecords(1);
  const handleReset = () => {
    setStatusFilter('all');
    setChannelFilter('');
    setUserIdFilter('');
    setKeywordFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
    setHasToolCallsFilter('');
    setModelUsedFilter('');
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">对话记录</h1>

      {/* 篮选栏 */}
      <div className="bg-white rounded-lg shadow mb-4 p-4">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">状态</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="all">全部</option>
              <option value="pending">待审核</option>
              <option value="success">已通过</option>
              <option value="rejected">已拒绝</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">渠道</label>
            <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">全部</option>
              <option value="default">default</option>
              <option value="wdn">wdn</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">用户ID</label>
            <input type="text" value={userIdFilter} onChange={e => setUserIdFilter(e.target.value)}
              placeholder="输入用户ID" className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">关键词</label>
            <input type="text" value={keywordFilter} onChange={e => setKeywordFilter(e.target.value)}
              placeholder="搜索提问或回答..." className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">开始日期</label>
            <input type="date" value={startDateFilter} onChange={e => setStartDateFilter(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">结束日期</label>
            <input type="date" value={endDateFilter} onChange={e => setEndDateFilter(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">工具调用</label>
            <select value={hasToolCallsFilter} onChange={e => setHasToolCallsFilter(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">全部</option>
              <option value="true">有工具调用</option>
              <option value="false">无工具调用</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">模型</label>
            <select value={modelUsedFilter} onChange={e => setModelUsedFilter(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm">
              <option value="">全部</option>
              <option value="qwen-plus">qwen-plus</option>
              <option value="qwen-turbo">qwen-turbo</option>
              <option value="qwen-max">qwen-max</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={handleSearch}
            className="bg-blue-500 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-600">
            搜索
          </button>
          <button onClick={handleReset}
            className="bg-gray-200 text-gray-700 px-4 py-1.5 rounded text-sm hover:bg-gray-300">
            重置
          </button>
        </div>
      </div>

      {/* 记录列表 */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      ) : records.length === 0 ? (
        <div className="text-center py-8 text-gray-500">暂无记录</div>
      ) : (
        <div className="space-y-3">
          {records.map(record => (
            <div key={record.id} className="bg-white rounded-lg shadow overflow-hidden">
              {/* 元数据行 */}
              <div className="px-4 pt-3 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                  <span className="font-semibold text-gray-700">#ID {record.id}</span>
                  <span className="text-gray-400">|</span>
                  <span>用户 {record.user_id}</span>
                  <span>渠道 {record.channel}</span>
                  <span>{formatTimestamp(record.timestamp)}</span>
                  {statusBadge(record.status)}
                  {record.model_used && <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs">{record.model_used}</span>}
                  <span>总耗时 {formatTime(record.generation_time)}</span>
                  <span>首字延迟 {formatTime(record.first_token_time)}</span>
                  <span>Token {formatTokens(record.prompt_tokens, record.completion_tokens, record.total_tokens)}</span>
                  {record.has_tool_calls && (
                    <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-xs">
                      工具调用{(record.tool_calls_detail?.length || 0) > 0 ? `(${record.tool_calls_detail!.length}次)` : ''}
                    </span>
                  )}
                  {record.agent_iterations !== null && <span>迭代 {record.agent_iterations}轮</span>}
                </div>
              </div>

              {/* 内容区域 */}
              <div className="cursor-pointer" onClick={() => setExpandedId(expandedId === record.id ? null : record.id)}>
                {expandedId === record.id ? (
                  <div className="px-4 py-3 space-y-3">
                    {/* 用户提问 */}
                    <div className="border-l-[3px] border-blue-400 bg-blue-50/50 rounded-r-lg pl-3 py-2.5 pr-3">
                      <div className="text-xs text-blue-500 font-semibold mb-1.5 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>
                        用户提问
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">{record.input}</div>
                    </div>

                    {/* AI 回答 */}
                    <div className="border-l-[3px] border-emerald-400 bg-emerald-50/50 rounded-r-lg pl-3 py-2.5 pr-3">
                      <div className="text-xs text-emerald-500 font-semibold mb-1.5 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14.83 14.83a4 4 0 11-5.66 5.66 4 4 0 015.66-5.66zM4 8a2 2 0 100-4 2 2 0 000 4z"/></svg>
                        AI 回答
                      </div>
                      <div className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed">{record.output}</div>
                    </div>

                    {/* 工具调用详情 */}
                    {record.tool_calls_detail && record.tool_calls_detail.length > 0 && (
                      <div className="border-l-[3px] border-orange-400 bg-orange-50/50 rounded-r-lg pl-3 py-2.5 pr-3">
                        <div className="text-xs text-orange-500 font-semibold mb-1.5 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/></svg>
                          工具调用详情
                        </div>
                        {record.tool_calls_detail.map((tc, idx) => (
                          <div key={idx} className="bg-white rounded p-2 mb-2 border border-orange-100 shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-semibold text-orange-700">{tc.name}</span>
                              <button onClick={(e) => { e.stopPropagation(); setExpandedToolId(expandedToolId === idx ? null : idx); }}
                                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded border border-gray-200">
                                {expandedToolId === idx ? '收起详情' : '查看详情'}
                              </button>
                            </div>
                            {expandedToolId === idx && (
                              <div className="mt-2 space-y-2">
                                <div>
                                  <span className="text-xs font-medium text-gray-500">调用参数</span>
                                  <pre className="text-xs bg-gray-50 rounded p-2 mt-1 overflow-auto max-h-40 border border-gray-100">{JSON.stringify(tc.arguments, null, 2)}</pre>
                                </div>
                                <div>
                                  <span className="text-xs font-medium text-gray-500">返回结果</span>
                                  <pre className="text-xs bg-gray-50 rounded p-2 mt-1 overflow-auto max-h-40 border border-gray-100 whitespace-pre-wrap">{tc.result}</pre>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="text-center">
                      <span className="text-xs text-blue-500 hover:text-blue-700">收起</span>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3">
                    {/* 用户提问预览 */}
                    <div className="flex items-start gap-2 mb-2">
                      <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-500 flex items-center justify-center text-xs font-bold">Q</span>
                      <div className="text-sm text-gray-800 line-clamp-2 leading-relaxed min-w-0">{record.input}</div>
                    </div>
                    {/* AI 回答预览 */}
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center text-xs font-bold">A</span>
                      <div className="text-sm text-gray-600 line-clamp-2 leading-relaxed min-w-0">{record.output}</div>
                    </div>
                    <div className="text-center mt-1.5">
                      <span className="text-xs text-blue-500 hover:text-blue-700">展开详情</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {pagination.totalPages > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>共 {pagination.total} 条，第 {pagination.page}/{pagination.totalPages} 页</span>
          <div className="flex gap-2">
            <button onClick={() => fetchRecords(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              上一页
            </button>
            <button onClick={() => fetchRecords(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
