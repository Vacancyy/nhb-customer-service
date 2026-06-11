-- 添加 status 字段到 chat_history 表
-- 用于管理端审核 AI 回答质量

-- 添加 status 字段（pending/success/rejected）
ALTER TABLE chat_history
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';

-- 添加 status 索引，便于快速查询待审核记录
CREATE INDEX IF NOT EXISTS idx_chat_history_status ON chat_history(status);

-- 添加注释说明
COMMENT ON COLUMN chat_history.status IS '审核状态: pending(待审核), success(已通过), rejected(已拒绝)';