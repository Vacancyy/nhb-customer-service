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
- **向量模型**: OpenAI `text-embedding-3-small`（1024 维向量）
- **ID 生成**: 雪花算法（`src/lib/snowflake.ts`）
- **日志**: Winston + 按日滚动文件传输
- **Token**: AES-256-CBC 加密的 URL-safe Base64 token

### 用户认证机制

用户身份通过 token 传递：
1. **初始化**：调用 `/api/app-api/user` 获取 token（AES 加密的 userId）
2. **请求携带**：前端在 `Authorization: Bearer <token>` header 中传递
3. **后端解析**：通过 `extractUserIdFromHeader()` 从 token 解析 userId
4. **URL 传参**：支持 URL 参数 `?token=xxx` 直接带入 token 跳转

token 使用 URL-safe Base64 编码，可在 URL 中安全传递。

### 请求流转

1. 用户发送消息至 `/api/app-api/chat-pending`
2. Chat 路由从 token 解析 userId，从 Redis 加载会话历史
3. LLM 执行意图路由，判断调用哪个技能/插件
4. 匹配的技能 handler 执行（知识库查询、订单查询、理赔查询）
5. 对话保存为 pending 状态，等待审核
6. 客户端轮询 `/api/app-api/check-status` 获取审核结果
7. 审核通过后返回 AI 回答

### 技能/插件系统（`src/skills/`）

技能是核心扩展机制。每个技能包含：
- `config.json` — 元数据：名称、描述、触发关键词、参数定义
- `handler.ts` — 执行逻辑

当前技能：
- **knowledge_query** — 基于 RAG 的知识库查询（无需认证）
- **order_query** — 保单订单查询（需认证）
- **claim_query** — 理赔进度查询（需认证）

技能由 `src/skills/loader.ts` 自动加载、`src/skills/registry.ts` 注册。新增技能：在 `src/skills/<名称>/` 下创建 `config.json` 和 `handler.ts`。

### API 路由（`src/app/api/`）

API 分为两组：

**应用 API（`src/app/api/app-api/`）** — 前缀 `/api/app-api/`：
- `user/route.ts` — 用户初始化，生成 token（POST）
- `chat/route.ts` — 流式对话接口（POST，SSE）
- `chat-pending/route.ts` — 非流式对话，返回待审核记录（POST）
- `check-status/route.ts` — 轮询审核状态（GET）
- `history/route.ts` — 会话历史（GET）
- `verify/send-code/route.ts` — 发送短信验证码（POST）
- `verify/submit/route.ts` — 提交实名认证（POST）

**管理 API（`src/app/api/admin-api/`）** — 前缀 `/api/admin-api/`：
- `knowledge/route.ts` — 知识库 CRUD（GET/POST/PUT/DELETE）
- `knowledge/embed/route.ts` — 文档向量化入库（POST）
- `knowledge/search/route.ts` — 向量相似度搜索（POST）
- `knowledge/import-drugs/route.ts` — 药品数据导入（POST）
- `review/route.ts` — 待审核列表（GET）
- `review/approve/route.ts` — 审核通过（POST）
- `review/reject/route.ts` — 审核拒绝（POST）
- `review/update/route.ts` — 修改 AI 回答（POST）
- `review/auto-handle/route.ts` — 自动处理超时消息（POST）
- `config/switch/route.ts` — 系统配置开关（GET/POST）
- `config/prompt/route.ts` — 系统提示词配置（GET/POST）

### 核心模块（`src/lib/`）

- `postgres.ts` — PostgreSQL 连接池（pg.Pool）、原生 SQL 查询、pgvector 向量检索
- `redis.ts` — Redis 客户端单例（ioredis），含用户认证缓存
- `session.ts` — 会话生命周期：初始化、构建模型消息、保存历史
- `history.ts` — 对话持久化至 PostgreSQL（`chat_history` 表，支持软删除）
- `prompts.ts` — LLM 系统提示词模板（从 Redis 动态加载）
- `auth-token.ts` — AES-256-CBC token 加解密，URL-safe Base64 编码
- `embedding/service.ts` — 向量生成与知识库入库
- `knowledge/service.ts` — 知识库增删改查与向量搜索编排
- `knowledge/config.ts` — pgvector 表名、索引名及 SQL 模板
- `knowledge/types.ts` — 知识库类型定义
- `user-auth.ts` — 用户认证状态管理（PostgreSQL + Redis 缓存）
- `verification-code.ts` — 短信验证码生成、存储与校验（Redis）
- `AjaxResult.ts` — 统一 API 响应封装（`{code, msg, data}`）
- `snowflake.ts` — 雪花 ID 生成器（用于用户 ID）
- `logger.ts` — Winston 日志 + 按日滚动文件
- `rsa.ts` — RSA 加解密（用于我的南京渠道数据解密）
- `langfuse.ts` — Langfuse 可观测性集成
- `miaoxin-sdk.ts` — 秒信短信 SDK
- `claimmysql.ts` — 理赔数据库连接（MySQL）
- `jkxmysql.ts` — 健康险数据库连接（MySQL）

### 数据库表结构

PostgreSQL 数据库 `nhb_customer_service`，启用 pgvector 扩展。DDL 详见 `docs/postgres_init.sql`。核心表：

**知识库表：**
- `knowledge_entries` — 知识库主表，含 `embedding VECTOR(1024)` 列、HNSW 索引
- `knowledge_answers` — 跨期答案表，按期数存储不同答案

**对话历史表：**
- `chat_history` — 对话记录，支持软删除（`deleted_at` 字段）
  - `status` — pending/success/rejected（审核状态）
  - `deleted_at` — 软删除时间，NULL 表示未删除
  - 所有查询默认添加 `deleted_at IS NULL` 条件

**用户认证表：**
- `user_auth` — 用户实名认证（三要素：姓名+身份证+手机号）

### 软删除机制

`chat_history` 表使用软删除：
- 删除操作：设置 `deleted_at = NOW()`，不真正删除记录
- 查询条件：所有查询默认添加 `deleted_at IS NULL`
- 索引优化：复合索引 `(user_id, channel, deleted_at)`、`(status, deleted_at)`

### 前端页面（`src/app/web/app/`）

- `page.tsx` — 入口初始化页（解析 URL token、判断渠道、调用初始化接口）
- `chat/page.tsx` — 聊天界面（客户端组件，轮询审核状态）
- `verify/page.tsx` — 实名认证表单（姓名 + 身份证号 + 手机号 + 短信验证码）

**入口页面加载流程：**
1. 检查 URL 参数 `?token=xxx`，有则缓存并直接跳转
2. 检查 localStorage 缓存的 token，有则直接跳转
3. 判断是否我的南京渠道（SDK 环境）
4. 调用 `/api/app-api/user` 获取 token，缓存后跳转

### 前端配置（`src/app/web/config/`）

- `API_BASE_URL` — API 基础路径
- `PAGE_PATHS` — 页面路径常量
- `BASE_PATH` — 应用基础路径

## 环境变量

必需项：
- `PG_HOST`、`PG_PORT`、`PG_DATABASE`、`PG_USER`、`PG_PASSWORD` — PostgreSQL 连接
- `REDIS_HOST`、`REDIS_PORT`、`REDIS_PASSWORD`、`REDIS_DB` — Redis 连接
- `DASHSCOPE_API_KEY` — 阿里 DashScope API 密钥
- `DASHSCOPE_CHAT_MODEL` — 模型名称（如 `qwen-plus`）
- `THREE_ELEMENTS_VERIFY_URL` — 三要素认证接口地址

可选项：
- `AUTH_TOKEN_KEY` — Token 加密密钥（32字节，默认内置）
- `SNOWFLAKE_WORKER_ID` — 雪花算法机器ID（多实例部署需配置不同值）
- `WDN_PRIVATE_KEY` — 我的南京 RSA 私钥（PEM 格式）
- `VERIFY_URL` — 实名认证页面路径
- `MAX_AGENT_ITERATIONS` — Agent 最大循环次数

## 重要注意事项

- 本项目使用 `pg` 驱动执行原生 SQL，无 ORM。向量操作通过原生查询实现。
- 代码库为中文（注释、提示词、UI 文本）。
- 知识库数据具有跨期结构——回答随保险期数不同而变化。
- 所有后端 API 使用 logger 模块记录日志，不使用 console。
- 用户 ID 从 token 解析，前端不传递 userId 参数。
- 多实例部署时需配置不同的 `SNOWFLAKE_WORKER_ID`。