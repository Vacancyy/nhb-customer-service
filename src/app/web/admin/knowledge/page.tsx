'use client';

import { useState, useEffect, useCallback } from 'react';

const ADMIN_API_BASE_URL = '/nhb-customer-service/api/admin-api';

interface KnowledgeAnswer {
  id: number;
  period: number;
  answer: string;
  source: string | null;
  std_question_period: string | null;
}

interface KnowledgeEntry {
  id: string;
  std_question: string;
  category: string | null;
  intent: string | null;
  keywords: string[] | null;
  embedding: number[] | null;
  created_at: string;
  answers?: KnowledgeAnswer[];
}

interface ApiResponse {
  code: number;
  msg: string;
  data: KnowledgeEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingEntry, setEditingEntry] = useState<KnowledgeEntry | null>(null);
  const [isAdding, setIsAdding] = useState(false); // 新增模式
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    std_question: '',
    category: '',
    intent: '',
    keywords: '',
    answers: [] as { period: number; answer: string; source: string }[],
  });
  const [saving, setSaving] = useState(false);
  const [embeddingLoading, setEmbeddingLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 获取知识库列表
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (keyword) params.set('keyword', keyword);

      const res = await fetch(`${ADMIN_API_BASE_URL}/knowledge?${params}`);
      const data: ApiResponse = await res.json();

      if (data.code === 200) {
        setEntries(data.data);
        setTotal(data.total);
      } else {
        setMessage({ type: 'error', text: data.msg });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '获取列表失败' });
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // 搜索
  const handleSearch = () => {
    setPage(1);
    fetchEntries();
  };

  // 选择切换
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // 全选
  const toggleSelectAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map(e => e.id)));
    }
  };

  // 开始新增
  const handleAdd = () => {
    setIsAdding(true);
    setEditingEntry({} as KnowledgeEntry); // 空对象表示新增
    setEditForm({
      std_question: '',
      category: '',
      intent: '',
      keywords: '',
      answers: [{ period: 6, answer: '', source: '六期知识库' }],
    });
  };

  // 开始编辑（获取完整数据含答案）
  const handleEdit = async (entry: KnowledgeEntry) => {
    setIsAdding(false);
    setEditLoading(true);
    try {
      // 获取完整数据（含答案）
      const res = await fetch(`${ADMIN_API_BASE_URL}/knowledge?id=${entry.id}`);
      const data = await res.json();

      if (data.code === 200) {
        const fullEntry = data.data;
        setEditingEntry(fullEntry);
        setEditForm({
          std_question: fullEntry.std_question,
          category: fullEntry.category || '',
          intent: fullEntry.intent || '',
          keywords: fullEntry.keywords?.join(', ') || '',
          answers: (fullEntry.answers || []).map((a: KnowledgeAnswer) => ({
            period: a.period,
            answer: a.answer,
            source: a.source || '',
          })),
        });
      } else {
        setMessage({ type: 'error', text: '获取详情失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '获取详情失败' });
    } finally {
      setEditLoading(false);
    }
  };

  // 添加答案
  const handleAddAnswer = () => {
    setEditForm(prev => ({
      ...prev,
      answers: [...prev.answers, { period: 1, answer: '', source: '' }],
    }));
  };

  // 删除答案
  const handleRemoveAnswer = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      answers: prev.answers.filter((_, i) => i !== index),
    }));
  };

  // 更新答案
  const handleUpdateAnswer = (index: number, field: 'period' | 'answer' | 'source', value: string | number) => {
    setEditForm(prev => ({
      ...prev,
      answers: prev.answers.map((a, i) => i === index ? { ...a, [field]: value } : a),
    }));
  };

  // 保存编辑或新增
  const handleSaveEdit = async () => {
    if (!editForm.std_question.trim()) {
      setMessage({ type: 'error', text: '标准问题不能为空' });
      return;
    }

    setSaving(true);
    try {
      if (isAdding) {
        // 新增模式：POST
        const res = await fetch(`${ADMIN_API_BASE_URL}/knowledge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            std_question: editForm.std_question,
            category: editForm.category,
            intent: editForm.intent,
            keywords: editForm.keywords.split(',').map(k => k.trim()).filter(Boolean),
            answers: editForm.answers.filter(a => a.answer.trim()).map(a => ({
              period: a.period,
              answer: a.answer,
              source: a.source,
            })),
          }),
        });
        const data = await res.json();
        if (data.code === 200) {
          setMessage({ type: 'success', text: '新增成功' });
          setIsAdding(false);
          setEditingEntry(null);
          fetchEntries();
        } else {
          setMessage({ type: 'error', text: data.msg });
        }
      } else {
        // 编辑模式：PUT
        if (!editingEntry?.id) return;
        const res = await fetch(`${ADMIN_API_BASE_URL}/knowledge`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingEntry.id,
            std_question: editForm.std_question,
            category: editForm.category,
            intent: editForm.intent,
            keywords: editForm.keywords.split(',').map(k => k.trim()).filter(Boolean),
            answers: editForm.answers.filter(a => a.answer.trim()).map(a => ({
              period: a.period,
              answer: a.answer,
              source: a.source,
            })),
          }),
        });
        const data = await res.json();
        if (data.code === 200) {
          setMessage({ type: 'success', text: '保存成功' });
          setIsAdding(false);
          setEditingEntry(null);
          fetchEntries();
        } else {
          setMessage({ type: 'error', text: data.msg });
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: isAdding ? '新增失败' : '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  // 删除
  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此条目？')) return;
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/knowledge?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.code === 200) {
        setMessage({ type: 'success', text: '删除成功' });
        fetchEntries();
      } else {
        setMessage({ type: 'error', text: data.msg });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '删除失败' });
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除 ${selectedIds.size} 条记录？`)) return;
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/knowledge?ids=${Array.from(selectedIds).join(',')}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.code === 200) {
        setMessage({ type: 'success', text: `成功删除 ${selectedIds.size} 条` });
        setSelectedIds(new Set());
        fetchEntries();
      } else {
        setMessage({ type: 'error', text: data.msg });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '删除失败' });
    }
  };

  // 向量化（单个）
  const handleEmbedOne = async (id: string) => {
    setEmbeddingLoading(true);
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/knowledge/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.code === 200) {
        setMessage({ type: 'success', text: '向量化成功' });
        fetchEntries();
      } else {
        setMessage({ type: 'error', text: data.msg });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '向量化失败' });
    } finally {
      setEmbeddingLoading(false);
    }
  };

  // 批量向量化
  const handleBatchEmbed = async () => {
    if (selectedIds.size === 0) return;
    setEmbeddingLoading(true);
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/knowledge/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.code === 200) {
        setMessage({ type: 'success', text: data.msg });
        fetchEntries();
      } else {
        setMessage({ type: 'error', text: data.msg });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '向量化失败' });
    } finally {
      setEmbeddingLoading(false);
    }
  };

  // 全量向量化
  const handleEmbedAll = async () => {
    if (!confirm('确定对所有未向量化的条目进行向量化？')) return;
    setEmbeddingLoading(true);
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/knowledge/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (data.code === 200) {
        setMessage({ type: 'success', text: data.msg });
        fetchEntries();
      } else {
        setMessage({ type: 'error', text: data.msg });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '向量化失败' });
    } finally {
      setEmbeddingLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4">
      {/* 标题和操作栏 */}
      <div className="bg-white rounded-lg shadow mb-4 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-900">知识库管理</h1>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              新增
            </button>
            <button
              onClick={handleEmbedAll}
              disabled={embeddingLoading}
              className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 disabled:opacity-50"
            >
              {embeddingLoading ? '处理中...' : '全量向量化'}
            </button>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索关键词..."
            className="border rounded px-3 py-2 w-64"
          />
          <button
            onClick={handleSearch}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            搜索
          </button>
        </div>

        {/* 消息提示 */}
        {message && (
          <div className={`mt-4 p-3 rounded ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {message.text}
          </div>
        )}
      </div>

      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg mb-4 p-3 flex items-center justify-between">
          <span className="text-yellow-700">已选择 {selectedIds.size} 条</span>
          <div className="flex gap-2">
            <button
              onClick={handleBatchEmbed}
              disabled={embeddingLoading}
              className="bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600 disabled:opacity-50"
            >
              批量向量化
            </button>
            <button
              onClick={handleBatchDelete}
              className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
            >
              批量删除
            </button>
          </div>
        </div>
      )}

      {/* 编辑/新增弹窗 */}
      {(editingEntry || isAdding) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl my-8">
            <h2 className="text-lg font-bold mb-4">{isAdding ? '新增知识条目' : '编辑知识条目'}</h2>

            {editLoading ? (
              <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : (
              <div className="space-y-4">
                {/* 主表字段 */}
                <div>
                  <label className="block text-sm font-medium mb-1">标准问题</label>
                  <input
                    type="text"
                    value={editForm.std_question}
                    onChange={(e) => setEditForm({ ...editForm, std_question: e.target.value })}
                    className="border rounded px-3 py-2 w-full"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">分类</label>
                    <input
                      type="text"
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                      className="border rounded px-3 py-2 w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">意图</label>
                    <input
                      type="text"
                      value={editForm.intent}
                      onChange={(e) => setEditForm({ ...editForm, intent: e.target.value })}
                      className="border rounded px-3 py-2 w-full"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">关键词（逗号分隔）</label>
                  <input
                    type="text"
                    value={editForm.keywords}
                    onChange={(e) => setEditForm({ ...editForm, keywords: e.target.value })}
                    className="border rounded px-3 py-2 w-full"
                  />
                </div>

                {/* 答案表 */}
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="block text-sm font-medium">跨期答案</label>
                    <button
                      onClick={handleAddAnswer}
                      className="text-blue-500 hover:text-blue-600 text-sm"
                    >
                      + 添加答案
                    </button>
                  </div>

                  {editForm.answers.length === 0 ? (
                    <div className="text-gray-400 text-sm py-2">暂无答案，点击上方添加</div>
                  ) : (
                    <div className="space-y-3">
                      {editForm.answers.map((ans, index) => (
                        <div key={index} className="bg-gray-50 rounded p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <label className="text-sm">期数:</label>
                              <select
                                value={ans.period}
                                onChange={(e) => handleUpdateAnswer(index, 'period', Number(e.target.value))}
                                className="border rounded px-2 py-1 text-sm"
                              >
                                <option value={1}>第1期</option>
                                <option value={2}>第2期</option>
                                <option value={3}>第3期</option>
                                <option value={4}>第4期</option>
                                <option value={5}>第5期</option>
                                <option value={6}>第6期</option>
                                <option value={7}>第7期</option>
                                <option value={8}>第8期</option>
                              </select>
                            </div>
                            <button
                              onClick={() => handleRemoveAnswer(index)}
                              className="text-red-500 hover:text-red-600 text-sm"
                            >
                              删除
                            </button>
                          </div>
                          <div className="mb-2">
                            <label className="text-sm text-gray-500 mb-1 block">答案内容:</label>
                            <textarea
                              value={ans.answer}
                              onChange={(e) => handleUpdateAnswer(index, 'answer', e.target.value)}
                              className="border rounded px-3 py-2 w-full text-sm min-h-[80px]"
                              placeholder="输入答案内容..."
                            />
                          </div>
                          <div>
                            <label className="text-sm text-gray-500 mb-1 block">来源:</label>
                            <input
                              type="text"
                              value={ans.source}
                              onChange={(e) => handleUpdateAnswer(index, 'source', e.target.value)}
                              className="border rounded px-2 py-1 w-full text-sm"
                              placeholder="如：六期知识库"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => { setIsAdding(false); setEditingEntry(null); }}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || editLoading}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 列表 */}
      {loading && entries.length === 0 ? (
        <div className="text-center py-8 text-gray-500">加载中...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-gray-500">暂无数据</div>
      ) : (
        <div className="space-y-3">
          {/* 全选 */}
          <div className="bg-white rounded-lg shadow px-4 py-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={selectedIds.size === entries.length && entries.length > 0}
                onChange={toggleSelectAll}
                className="mr-2"
              />
              <span className="text-sm">全选</span>
            </label>
          </div>

          {/* 条目列表 */}
          {entries.map((entry) => (
            <div key={entry.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  checked={selectedIds.has(entry.id)}
                  onChange={() => toggleSelect(entry.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                    <span className="font-medium">ID: {entry.id.slice(0, 8)}...</span>
                    {entry.category && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{entry.category}</span>}
                    {entry.intent && <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">{entry.intent}</span>}
                    {entry.embedding ? (
                      <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded">已向量化</span>
                    ) : (
                      <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded">未向量化</span>
                    )}
                    {entry.answers && entry.answers.length > 0 && (
                      <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                        {entry.answers.length}条答案
                      </span>
                    )}
                  </div>
                  <div className="text-gray-900 font-medium mb-2">{entry.std_question}</div>
                  {entry.keywords && entry.keywords.length > 0 && (
                    <div className="text-sm text-gray-500">关键词: {entry.keywords.join(', ')}</div>
                  )}
                  {/* 显示答案摘要 */}
                  {entry.answers && entry.answers.length > 0 && (
                    <div className="mt-2 text-sm">
                      <div className="text-gray-500 mb-1">答案:</div>
                      {entry.answers.slice(0, 2).map((ans, i) => (
                        <div key={i} className="bg-gray-50 rounded px-2 py-1 mb-1">
                          <span className="text-orange-600 font-medium">第{ans.period}期:</span>
                          <span className="text-gray-600 ml-1">{ans.answer.slice(0, 100)}{ans.answer.length > 100 ? '...' : ''}</span>
                        </div>
                      ))}
                      {entry.answers.length > 2 && (
                        <div className="text-gray-400">还有 {entry.answers.length - 2} 条答案...</div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(entry)}
                    className="text-blue-500 hover:text-blue-600 text-sm"
                  >
                    编辑
                  </button>
                  {!entry.embedding && (
                    <button
                      onClick={() => handleEmbedOne(entry.id)}
                      disabled={embeddingLoading}
                      className="text-purple-500 hover:text-purple-600 text-sm disabled:opacity-50"
                    >
                      向量化
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="text-red-500 hover:text-red-600 text-sm"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="bg-white rounded-lg shadow px-4 py-3 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                共 {total} 条，第 {page} / {totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="border rounded px-2 py-1"
                >
                  <option value="10">10条/页</option>
                  <option value="20">20条/页</option>
                  <option value="50">50条/页</option>
                </select>
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page === totalPages}
                  className="px-3 py-1 border rounded disabled:opacity-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}