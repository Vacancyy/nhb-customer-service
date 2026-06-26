-- Migration: Add metadata columns to chat_history for conversation records
-- 对话记录管理页面需要的元数据：首字延迟、总耗时、模型、token usage、工具调用详情等

ALTER TABLE chat_history
  ADD COLUMN IF NOT EXISTS first_token_time INTEGER DEFAULT NULL,       -- 首字延迟(ms)，从请求开始到第一个 content chunk
  ADD COLUMN IF NOT EXISTS generation_time INTEGER DEFAULT NULL,        -- 总生成耗时(ms)
  ADD COLUMN IF NOT EXISTS model_used VARCHAR(50) DEFAULT NULL,         -- 使用的模型名(如 qwen-plus)
  ADD COLUMN IF NOT EXISTS has_tool_calls BOOLEAN DEFAULT FALSE,        -- 是否有工具调用
  ADD COLUMN IF NOT EXISTS tool_calls_detail JSONB DEFAULT NULL,        -- 工具调用详情：[{name, arguments, result}]
  ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT NULL,          -- prompt token 数
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT NULL,      -- completion token 数
  ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT NULL,           -- 总 token 数
  ADD COLUMN IF NOT EXISTS agent_iterations INTEGER DEFAULT NULL;       -- agent loop 迭代次数

-- 索引
CREATE INDEX IF NOT EXISTS idx_chat_history_tool_calls_detail ON chat_history USING GIN (tool_calls_detail);
CREATE INDEX IF NOT EXISTS idx_chat_history_model_used ON chat_history (model_used);
CREATE INDEX IF NOT EXISTS idx_chat_history_has_tool_calls ON chat_history (has_tool_calls);
