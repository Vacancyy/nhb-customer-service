-- 宁惠保智能客服 数据库初始化脚本
-- 数据库: nhb_customer_service (与 .env.local 中 PG_DATABASE 一致)
-- 依赖: pgvector 扩展

-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- ========================================
-- 知识库主表
-- ========================================
CREATE TABLE IF NOT EXISTS knowledge_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id VARCHAR(20),                    -- 原始ID (如 qa_4e245e)
    std_question TEXT NOT NULL,                -- 标准问题
    retrieval_text TEXT,                       -- 检索文本（用于 embedding 匹配）
    category VARCHAR(50),                      -- 主分类
    intent VARCHAR(50),                        -- 意图标签
    scene VARCHAR(100),                        -- 场景标签
    answer_mode VARCHAR(30),                   -- single_period / cross_period_compare / need_ask_period
    requires_verification VARCHAR(10),         -- always / never / depends
    requires_business_confirm BOOLEAN DEFAULT FALSE,
    similar_questions TEXT[],                  -- 相似问题数组
    keywords TEXT[],                           -- 关键词数组
    channels TEXT[],                           -- 渠道数组 (claim/sales)
    embedding VECTOR(1024),                    -- 1024维向量（DashScope text-embedding-v3）
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 向量索引：数据量较小（<1000条）时使用 HNSW 索引
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding ON knowledge_entries
    USING hnsw (embedding vector_cosine_ops);
-- 分类索引
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_entries (category);
-- 意图索引
CREATE INDEX IF NOT EXISTS idx_knowledge_intent ON knowledge_entries (intent);
-- 渠道索引（GIN 支持数组包含查询）
CREATE INDEX IF NOT EXISTS idx_knowledge_channels ON knowledge_entries USING GIN (channels);

-- ========================================
-- 知识库跨期答案表
-- ========================================
CREATE TABLE IF NOT EXISTS knowledge_answers (
    id SERIAL PRIMARY KEY,
    knowledge_id UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
    period INT NOT NULL,                       -- 期数 (4/5/6)
    answer TEXT NOT NULL,                      -- 本期答案
    source VARCHAR(50),                        -- 来源 (如 "六期知识库")
    std_question_period TEXT,                  -- 本期标准问题（可能与主表不同）
    valid_from DATE,                           -- 生效开始日期
    valid_to DATE,                             -- 生效结束日期
    UNIQUE(knowledge_id, period)              -- 同一条目同期只能有一个答案
);

-- 按期数查询索引
CREATE INDEX IF NOT EXISTS idx_knowledge_answers_period ON knowledge_answers (period);
-- 按知识条目查询索引
CREATE INDEX IF NOT EXISTS idx_knowledge_answers_knowledge_id ON knowledge_answers (knowledge_id);
-- 按期数+条目联合查询
CREATE INDEX IF NOT EXISTS idx_knowledge_answers_period_knowledge ON knowledge_answers (period, knowledge_id);

-- ========================================
-- 历史会话表（一条记录存储一次完整对话）
-- ========================================
CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    channel VARCHAR(50) NOT NULL,
    input TEXT NOT NULL,
    output TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',     -- pending/success/rejected
    feedback TEXT DEFAULT NULL,                -- 用户反馈内容
    feedback_at TIMESTAMP DEFAULT NULL,        -- 反馈时间
    deleted_at TIMESTAMP DEFAULT NULL,         -- 软删除时间
    created_at TIMESTAMP DEFAULT NOW()
);

-- 用户+渠道查询索引（常用查询组合）
CREATE INDEX IF NOT EXISTS idx_chat_history_user_channel ON chat_history(user_id, channel);
-- 创建时间索引
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at);
-- 状态索引（审核查询）
CREATE INDEX IF NOT EXISTS idx_chat_history_status ON chat_history(status);
-- 软删除索引
CREATE INDEX IF NOT EXISTS idx_chat_history_deleted_at ON chat_history(deleted_at);
-- 用户+渠道+软删除复合索引
CREATE INDEX IF NOT EXISTS idx_chat_history_user_channel_deleted ON chat_history(user_id, channel, deleted_at);
-- 状态+软删除复合索引
CREATE INDEX IF NOT EXISTS idx_chat_history_status_deleted ON chat_history(status, deleted_at);
-- 反馈时间索引
CREATE INDEX IF NOT EXISTS idx_chat_history_feedback_at ON chat_history(feedback_at);

-- ========================================
-- 用户实名认证表
-- 使用三要素（姓名+证件号码+手机号）作为唯一标识
-- ========================================
CREATE TABLE IF NOT EXISTS user_auth (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    id_card VARCHAR(18) NOT NULL,
    phone VARCHAR(11) NOT NULL,
    verified_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 三要素联合唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_auth_unique ON user_auth(name, id_card, phone);
-- 索引：按手机号查询
CREATE INDEX IF NOT EXISTS idx_user_auth_phone ON user_auth(phone);
-- 索引：按证件号码查询
CREATE INDEX IF NOT EXISTS idx_user_auth_id_card ON user_auth(id_card);