# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指引。

## 项目概述

宁惠保智能客服 — 基于 Next.js 全栈应用构建的 AI 保险客服系统，支持 RAG（检索增强生成）、意图插件路由、短信实名认证和多轮对话。

## 常用命令

```bash
npm run dev       # 启动开发服务器（端口 3000）
npm run build     # 生产构建
npm run start     # 启动生产服务器
npm run lint      # 运行 ESLint（next lint）
```

当前未配置测试框架。

## 架构

### 技术栈

- **框架**: Next.js 14 (App Router) + TypeScript + TailwindCSS
- **数据库**: PostgreSQL + pgvector 扩展（使用 `pg` 驱动原生 SQL，无 ORM）
- **缓存/会话**: Redis（ioredis）
- **LLM**: OpenAI 兼容 SDK（通过 `LLM_BASE_URL` 支持 OpenAI 或阿里 DashScope）
- **向量模型**: OpenAI `text-embedding-3-small`（1536 维向量）
- **ID 生成**: 雪花算法（`src/lib/snowflake.ts`）
- **日志**: Winston + 按日滚动文件传输

### 请求流转

1. 用户发送消息至 `/nhb-customer-service-api/chat`
2. Chat 路由从 Redis 加载会话历史，构建含知识库上下文的系统提示词
3. LLM 执行意图路由，判断调用哪个技能/插件
4. 匹配的技能 handler 执行（知识库查询、订单查询、理赔查询）
5. LLM 基于技能返回结果生成最终回答
6. 对话保存至 Redis（历史）和 PostgreSQL（审计日志 `conversation_logs`）

### 技能/插件系统（`src/skills/`）

技能是核心扩展机制。每个技能包含：
- `config.json` — 元数据：名称、描述、触发关键词、参数定义
- `handler.ts` — 执行逻辑

当前技能：
- **knowledge_query** — 基于 RAG 的知识库查询（无需认证）
- **order_query** — 保单订单查询（需认证，当前返回 mock 数据）
- **claim_query** — 理赔进度查询（需认证，当前返回 mock 数据）

技能由 `src/skills/loader.ts` 自动加载、`src/skills/registry.ts` 注册。新增技能：在 `src/skills/<名称>/` 下创建 `config.json` 和 `handler.ts`。

### API 路由（`src/app/nhb-customer-service-api/`）

所有 API 路由前缀为 `/nhb-customer-service-api/`：
- `chat/route.ts` — 主对话接口（POST）
- `history/route.ts` — 会话历史（GET/DELETE）
- `knowledge/route.ts` — 知识库管理（GET）
- `knowledge/embed/route.ts` — 文档向量化入库（POST）
- `knowledge/search/route.ts` — 向量相似度搜索（POST）
- `verify/send-code/route.ts` — 发送短信验证码（POST）
- `verify/submit/route.ts` — 提交实名认证（POST）

### 核心模块（`src/lib/`）

- `postgres.ts` — PostgreSQL 连接池（pg.Pool）、原生 SQL 查询、pgvector 向量检索
- `redis.ts` — Redis 客户端单例（ioredis）
- `session.ts` — 会话生命周期：初始化（雪花 ID）、构建模型消息、保存/清空历史
- `history.ts` — 对话持久化至 Redis（列表）和 PostgreSQL（`conversation_logs` 表）
- `prompts.ts` — LLM 系统提示词模板
- `embedding/service.ts` — 向量生成与知识库入库
- `knowledge/service.ts` — 知识库增删改查与向量搜索编排
- `knowledge/config.ts` — pgvector 表名、索引名及 SQL 模板
- `user-auth.ts` — 用户认证状态管理（Redis 存储）
- `verification-code.ts` — 短信验证码生成、存储与校验（内存 Map，非生产环境默认验证码：`888888`）
- `AjaxResult.ts` — 统一 API 响应封装（`{code, msg, data}`）
- `snowflake.ts` — 雪花 ID 生成器（用于用户 ID）
- `logger.ts` — Winston 日志 + 按日滚动文件

### 数据库表结构

PostgreSQL 数据库 `nhb_smart_cs`，启用 pgvector 扩展。DDL 详见 `docs/postgres_init.sql`。核心表：
- `knowledge_entries` — 知识库，含 `embedding VECTOR(1536)` 列、JSONB 结构化数据、IVFFlat 索引
- `conversation_logs` — 对话审计日志（session_id, role, content, intent_plugin, period, metadata）
- `auth_sessions` — 实名认证会话（channel, user_id, id_card_hash, auth_method, authed 状态）

### 前端页面（`src/app/nhb-customer-service/`）

- `page.tsx` — 聊天界面（客户端组件）
- `verify/page.tsx` — 实名认证表单（姓名 + 身份证号 + 手机号 + 短信验证码）

## 环境变量

必需项（完整清单见 `docs/开发计划.md`）：
- `DATABASE_URL` — PostgreSQL 连接字符串
- `REDIS_URL` — Redis 连接字符串
- `OPENAI_API_KEY` 或 `DASHSCOPE_API_KEY` — LLM API 密钥
- `LLM_BASE_URL` — OpenAI 兼容 API 地址（阿里 DashScope 模型使用 DashScope URL）
- `LLM_MODEL` — 模型名称（如 `qwen-plus`、`gpt-4o-mini`）
- `EMBEDDING_MODEL` — 向量模型名称（如 `text-embedding-3-small`）

## 重要注意事项

- 本项目使用 `pg` 驱动执行原生 SQL，无 ORM。向量操作（`VECTOR(1536)`、`<=>` 余弦距离）通过原生查询实现，因为 Node.js ORM 均不原生支持 pgvector。
- 代码库为中文（注释、提示词、UI 文本）。`src/lib/prompts.ts` 中的系统提示词为中文，要求模型仅依据最新知识库结果回答。
- 知识库数据具有跨期结构——回答随保险期数不同而变化，以键值形式存储在 JSONB `structured_data` 中。
- AGENTS.md 中关于 Next.js 存在破坏性变更的规则仍然适用——如不确定 API 用法，请先查阅 `node_modules/next/dist/docs/`。
