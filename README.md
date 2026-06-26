# 宁惠保智能客服

基于 Next.js 14 全栈应用构建的 AI 保险客服系统，支持 RAG 知识库检索、意图插件路由、短信实名认证和多轮对话。

## 技术栈

- **框架**: Next.js 14 (App Router) + TypeScript + TailwindCSS
- **LLM**: 阿里 DashScope（OpenAI 兼容接口），支持 qwen-plus / qwen3-max / qwen3.5-35b 等模型
- **向量模型**: DashScope text-embedding-v3（1024 维）
- **数据库**: PostgreSQL + pgvector 扩展（原生 SQL，无 ORM）
- **缓存**: Redis（ioredis）
- **业务数据库**: MySQL（健康险 jkx、理赔 claim）
- **ID 生成**: 雪花算法
- **日志**: Winston + 按日滚动文件
- **可观测性**: Langfuse
- **短信**: 秒信 SDK
- **部署**: Docker + standalone 输出，自定义 server.js 支持 WebSocket

## 项目结构

```
src/
  app/
    api/
      app-api/          # 用户端 API（聊天、历史、认证等）
      admin-api/        # 管理端 API（审核、知识库、配置等）
    web/
      app/              # 用户端页面（聊天、认证）
      admin/            # 管理端页面（审核、知识库、对话记录、配置）
  lib/                  # 核心模块
    postgres.ts         # PG 连接池 + pgvector 向量检索
    redis.ts            # Redis 单例 + 用户认证缓存
    session.ts          # 会话生命周期
    history.ts          # 对话持久化（chat_history 表）
    prompts.ts          # LLM 系统提示词（从 Redis 动态加载）
    llm-streaming.ts    # LLM Agent Loop 流式调用
    auth-token.ts       # AES-256-CBC Token 加解密
    embedding/          # 向量生成与入库
    knowledge/          # 知识库增删改查 + 向量搜索
    snowflake.ts        # 雪花 ID 生成器
    logger.ts           # Winston 日志
    langfuse.ts         # 可观测性集成
    claimmysql.ts       # 理赔 MySQL 连接
    jkxmysql.ts         # 健康险 MySQL 连接
    rsa.ts              # RSA 加解密（我的南京渠道）
    miaoxin-sdk.ts      # 秒信短信 SDK
    verification-code.ts # 短信验证码
    user-auth.ts        # 用户认证状态管理
    AjaxResult.ts       # 统一 API 响应 {code, msg, data}
  skills/               # 技能/插件系统
    knowledge_query/    # RAG 知识库查询（无需认证）
    order_query/        # 保单订单查询（需认证）
    claim_query/        # 理赔进度查询（需认证）
server.js               # 自定义服务器（HTTP + WebSocket）
docs/                   # 数据库初始化脚本、迁移脚本、测试方案
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.local` 模板并填写：

```bash
# 必需
DASHSCOPE_API_KEY=你的DashScope密钥
DASHSCOPE_CHAT_MODEL=qwen-plus

# PostgreSQL
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=nhb_customer_service
PG_USER=nhb
PG_PASSWORD=你的密码

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=你的密码
REDIS_DB=0

# 可选
AUTH_TOKEN_KEY=32字节加密密钥
SNOWFLAKE_WORKER_ID=1
MAX_AGENT_ITERATIONS=3
MAX_HISTORY_LENGTH=50
```

### 3. 初始化数据库

```bash
psql -U nhb -d nhb_customer_service -f docs/postgres_init.sql
```

### 4. 导入知识库

通过管理后台 `http://localhost:3000/nhb-customer-service/web/admin/knowledge` 上传知识库 JSON 文件并嵌入向量。

### 5. 启动开发服务器

```bash
npm run dev
```

访问聊天页面: `http://localhost:3000/nhb-customer-service/web/app/chat`

## 生产部署

### 构建

```bash
npm run build
```

输出 standalone 模式，`server.js` 自定义启动，支持 WebSocket 升级。

### Docker 部署

```bash
docker build -t nhb-customer-service .
docker run -d -p 3001:3000 --env-file .env.prod nhb-customer-service
```

### 多实例部署

多实例时需配置不同的 `SNOWFLAKE_WORKER_ID`，WebSocket 连接只在用户所在实例生效。

## 用户认证机制

用户身份通过 AES-256-CBC 加密的 URL-safe Base64 token 传递：

1. 前端调用 `/api/app-api/user` 获取加密 token
2. 请求通过 `Authorization: Bearer <token>` header 传递
3. 后端 `extractUserIdFromHeader()` 解密获取 userId
4. 支持 URL 参数 `?token=xxx` 直接带入

### 实名认证

需查询保单或理赔时触发短信三要素认证（姓名+身份证+手机号），认证后数据缓存到 Redis。

## 聊天流程

前端根据审核开关自动选择三条路径：

| 条件 | 路径 | 机制 |
|------|------|------|
| 审核关闭 + WebSocket 可用 | WS 流式 | 最快，实时推送 |
| 审核关闭 + WS 不通 | SSE 流式 | HTTP POST + streaming response |
| 审核开启 | chat-pending + 轮询 | 非流式，保存后轮询审核结果 |

### Agent Loop

LLM 通过多轮迭代执行意图路由和工具调用：

1. 用户消息 + 历史 + 系统提示词发送给 LLM
2. LLM 返回工具调用 → 执行对应技能（知识库查询、保单查询、理赔查询）
3. 工具结果返回 LLM → 生成最终回复
4. 最大迭代次数由 `MAX_AGENT_ITERATIONS` 控制（默认 3）

### 技能系统

每个技能包含 `config.json`（元数据+参数定义）和 `handler.ts`（执行逻辑）。新增技能只需在 `src/skills/<名称>/` 下创建这两个文件，系统自动加载注册。

需要实名认证的技能在 `config.json` 中声明 `requiresAuth: true`，触发认证流程时自动返回认证提示而非执行查询。

## 知识库

### 跨期答案机制

知识库数据具有跨期结构——回答随保险期数不同而变化：

- `knowledge_entries` — 主表，存储标准问题、检索文本、向量
- `knowledge_answers` — 跨期答案表，按期数（4/5/6）存储不同答案
- 向量搜索匹配主表后，根据当前期数返回对应答案

### 向量搜索配置

```env
KNOWLEDGE_SEARCH_TOPK=5          # 返回前 5 个最相似结果
KNOWLEDGE_SEARCH_MIN_SIMILARITY=0.3  # 最低相似度阈值
```

## 管理后台

| 页面 | 路径 | 功能 |
|------|------|------|
| 审核管理 | /web/admin/review | 审核/拒绝/修改 AI 回答 |
| 知识库管理 | /web/admin/knowledge | 知识库增删改查 + 向量嵌入 |
| 对话记录 | /web/admin/records | 查看全部对话记录 + 元数据 |
| 系统配置 | /web/admin/config | 审核开关、系统提示词 |

审核开关通过 Redis 键 `nhb:system_config:review_enabled` 控制，关闭时对话直接保存为 success 状态，绕过审核流程。

## 数据库表

| 表 | 说明 |
|----|------|
| `knowledge_entries` | 知识库主表，含 1024 维 embedding + HNSW 索引 |
| `knowledge_answers` | 跨期答案表 |
| `chat_history` | 对话记录，status=pending/success/rejected，支持软删除 |
| `user_auth` | 用户实名认证（三要素） |

完整 DDL 见 `docs/postgres_init.sql`，元数据列迁移见 `docs/migration_add_metadata.sql`。

## API 接口

### 用户端 (`/api/app-api/`)

| 接口 | 方法 | 说明 |
|------|------|------|
| `/user` | POST | 用户初始化，生成 token |
| `/chat` | POST | 流式对话（SSE） |
| `/chat-pending` | POST | 非流式对话，保存待审核 |
| `/check-status` | GET | 轮询审核状态 |
| `/history` | GET | 会话历史 |
| `/verify/send-code` | POST | 发送短信验证码 |
| `/verify/submit` | POST | 提交实名认证 |
| `/config/review-status` | GET | 获取审核开关状态 |
| `/config/human-service` | GET | 获取人工客服链接 |
| `/feedback` | POST | 提交对话反馈 |

### 管理端 (`/api/admin-api/`)

| 接口 | 方法 | 说明 |
|------|------|------|
| `/review` | GET | 待审核列表 |
| `/review/approve` | POST | 审核通过 |
| `/review/reject` | POST | 审核拒绝 |
| `/review/update` | POST | 修改 AI 回答 |
| `/review/auto-handle` | POST | 自动处理超时消息 |
| `/knowledge` | GET/POST/PUT/DELETE | 知识库 CRUD |
| `/knowledge/embed` | POST | 文档向量化入库 |
| `/knowledge/search` | POST | 向量相似度搜索 |
| `/records` | GET | 对话记录列表 + 元数据 |
| `/config/switch` | GET/POST | 系统开关配置 |
| `/config/prompt` | GET/POST | 系统提示词配置 |

## 对话元数据

每次对话自动记录以下元数据（保存到 `chat_history` 表）：

| 字段 | 说明 |
|------|------|
| `first_token_time` | 首字延迟(ms)，流式路径独有 |
| `generation_time` | 总生成耗时(ms) |
| `model_used` | 使用的模型名 |
| `has_tool_calls` | 是否有工具调用 |
| `tool_calls_detail` | 工具调用详情（JSONB） |
| `prompt_tokens` | prompt token 数 |
| `completion_tokens` | completion token 数 |
| `total_tokens` | 总 token 数 |
| `agent_iterations` | agent loop 迭代次数 |

## 常用命令

```bash
npm run dev       # 启动开发服务器（端口 3000）
npm run build     # 生产构建
npm run start     # 启动生产服务器
npm run lint      # 运行 ESLint
```

## 环境变量

### 必需

| 变量 | 说明 |
|------|------|
| `DASHSCOPE_API_KEY` | 阿里 DashScope API 密钥 |
| `DASHSCOPE_CHAT_MODEL` | 模型名称 |
| `PG_HOST/PORT/DATABASE/USER/PASSWORD` | PostgreSQL 连接 |
| `REDIS_HOST/PORT/PASSWORD/DB` | Redis 连接 |

### 可选

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AUTH_TOKEN_KEY` | 内置32字节密钥 | Token 加密密钥 |
| `SNOWFLAKE_WORKER_ID` | 1 | 雪花算法机器ID（多实例需不同值） |
| `MAX_AGENT_ITERATIONS` | 3 | Agent 最大循环次数 |
| `MAX_HISTORY_LENGTH` | 50 | 最大历史消息数 |
| `VERIFY_URL` | web/app/verify | 认证页面路径 |
| `WDN_PRIVATE_KEY` | — | 我的南京 RSA 私钥 |
| `THREE_ELEMENTS_VERIFY_URL` | — | 三要素认证接口地址 |

## 注意事项

- 所有后端 API 使用 `logger` 模块记录日志，不使用 `console`
- 用户 ID 从 token 解密获取，前端不直接传递 userId
- 知识库数据有跨期结构，回答随期数变化
- `chat_history` 使用软删除（`deleted_at` 字段），查询默认加 `deleted_at IS NULL`
- `pg` 驱动原生 SQL，无 ORM，向量操作通过 pgvector 原生查询
- 代码库语言为中文（注释、提示词、UI 文本）
- embedding 模块和 LLM 模块共用 DashScope API Key 的 QPS 限额
