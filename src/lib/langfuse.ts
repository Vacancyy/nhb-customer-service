// Langfuse 追踪服务 - 用于记录 LLM 交互链路（异步非阻塞模式）

import { Langfuse, LangfuseTraceClient, LangfuseGenerationClient, LangfuseSpanClient } from 'langfuse';
import { logError } from './logger';

// Langfuse 配置
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;
const LANGFUSE_BASE_URL = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';

// Langfuse 客户端单例
let langfuseClient: Langfuse | null = null;

function getLangfuseClient(): Langfuse | null {
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
    return null;
  }

  if (!langfuseClient) {
    try {
      langfuseClient = new Langfuse({
        publicKey: LANGFUSE_PUBLIC_KEY,
        secretKey: LANGFUSE_SECRET_KEY,
        baseUrl: LANGFUSE_BASE_URL,
        flushInterval: 1000,
      });
    } catch (error) {
      logError('[Langfuse] 初始化客户端失败', { error });
      return null;
    }
  }

  return langfuseClient;
}

// 安全执行 Langfuse 操作（异步非阻塞，错误不影响主流程）
function safeLangfuseCall<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch (error) {
    logError('[Langfuse] 操作失败', { error });
    return null;
  }
}

// 生成 traceId
export function generateTraceId(userId: string): string {
  return `trace_${userId}_${Date.now()}`;
}

// 创建追踪（记录用户输入）- 非阻塞
export function createTrace(params: {
  id: string;
  userId?: string;
  sessionId?: string;
  name?: string;
  input: string;
  metadata?: Record<string, any>;
}): LangfuseTraceClient | null {
  return safeLangfuseCall(() => {
    const client = getLangfuseClient();
    if (!client) return null;

    return client.trace({
      id: params.id,
      userId: params.userId,
      sessionId: params.sessionId,
      name: params.name || 'chat',
      input: params.input,
      metadata: params.metadata,
    });
  });
}

// 更新追踪输出（记录最终回复）- 非阻塞
export function updateTraceOutput(trace: LangfuseTraceClient | null, output: string) {
  if (!trace) return;

  // 异步执行，不等待结果
  safeLangfuseCall(() => {
    trace.update({ output });
  });
}

// 记录模型调用（Generation）- 非阻塞
export interface GenerationParams {
  trace: LangfuseTraceClient | null;
  name?: string;
  input: string | Record<string, any> | Array<any>;
  output?: string | Record<string, any>;
  model?: string;
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, any>;
  usage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  historyLength?: number;
}

export function logGeneration(params: GenerationParams): LangfuseGenerationClient | null {
  if (!params.trace) return null;

  return safeLangfuseCall(() => {
    return params.trace!.generation({
      name: params.name || 'model_call',
      input: params.input,
      output: params.output,
      model: params.model,
      startTime: params.startTime,
      endTime: params.endTime,
      metadata: {
        ...params.metadata,
        historyLength: params.historyLength,
      },
      usage: params.usage,
    });
  });
}

// 记录 Skill/Tool 调用（Span）- 非阻塞
export interface SpanParams {
  trace: LangfuseTraceClient | null;
  name: string;
  input: Record<string, any>;
  output?: string;
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, any>;
}

export function logSpan(params: SpanParams): LangfuseSpanClient | null {
  if (!params.trace) return null;

  return safeLangfuseCall(() => {
    return params.trace!.span({
      name: params.name,
      input: params.input,
      output: params.output,
      startTime: params.startTime,
      endTime: params.endTime,
      metadata: params.metadata,
    });
  });
}

// 异步 flush 数据到 Langfuse（非阻塞，不等待完成）
export function flushLangfuse() {
  const client = getLangfuseClient();
  if (!client) return;

  // 异步执行 flush，不等待结果，错误不影响主流程
  client.flushAsync().catch((error) => {
    logError('[Langfuse] Flush 失败', { error });
  });
}

export { getLangfuseClient };
export type { LangfuseTraceClient };