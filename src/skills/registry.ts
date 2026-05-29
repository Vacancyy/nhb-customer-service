// 技能注册系统 - OpenAI Function Calling 格式

import { ERROR_MESSAGES } from '@/lib/prompts';
import { logSpan, LangfuseTraceClient } from '@/lib/langfuse';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        description: string;
      }>;
      required?: string[];
    };
  };
}

export interface SkillDefinition extends ToolDefinition {
  auth?: boolean; // 是否需要实名认证
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
}

export interface ToolContext {
  userId: string;
  channel: string;
  trace?: LangfuseTraceClient; // Langfuse 追踪对象
  userAuth?: { // 用户实名信息
    name: string;
    idCard: string;
    phone: string;
  };
}

export interface ToolHandler {
  (args: Record<string, any>, context: ToolContext): Promise<string>;
}

class ToolRegistry {
  private tools: Map<string, { definition: SkillDefinition; handler: ToolHandler }> = new Map();
  private context: ToolContext | null = null;

  setContext(context: ToolContext) {
    this.context = context;
  }

  getContext(): ToolContext {
    if (!this.context) {
      throw new Error('Tool context not set');
    }
    return this.context;
  }

  register(definition: SkillDefinition, handler: ToolHandler) {
    this.tools.set(definition.function.name, { definition, handler });
  }

  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler;
  }

  // 检查 skill 是否需要实名认证
  requiresAuth(name: string): boolean {
    const skill = this.tools.get(name);
    return skill?.definition.auth === true;
  }

  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const handler = this.getHandler(toolCall.function.name);
    if (!handler) {
      return {
        tool_call_id: toolCall.id,
        content: `错误: ${ERROR_MESSAGES.TOOL_NOT_FOUND} ${toolCall.function.name}`,
      };
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      const context = this.getContext();

      // 记录 skill 调用开始
      const startTime = new Date();
      const result = await handler(args, context);
      const endTime = new Date();

      // 记录到 Langfuse（如果有 trace）
      if (context.trace) {
        logSpan({
          trace: context.trace,
          name: toolCall.function.name,
          input: args,
          output: result,
          startTime,
          endTime,
          metadata: {
            tool_call_id: toolCall.id,
          },
        });
      }

      return {
        tool_call_id: toolCall.id,
        content: result,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '工具执行失败';
      return {
        tool_call_id: toolCall.id,
        content: `错误: ${errMsg}`,
      };
    }
  }
}

export const toolRegistry = new ToolRegistry();