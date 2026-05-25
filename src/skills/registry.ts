// 技能注册系统 - 支持动态注册和调用技能

export interface SkillDefinition {
  name: string;
  description: string;
  triggerKeywords: string[];
  params: SkillParam[];
}

export interface SkillParam {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description: string;
}

export interface SkillHandler {
  (params: Record<string, any>, context: SkillContext): Promise<string>;
}

export interface SkillContext {
  userId?: string;
  sessionId?: string;
  originalMessage: string;
}

export interface RegisteredSkill {
  definition: SkillDefinition;
  handler: SkillHandler;
}

export interface SkillSelectionResult {
  skill: string;
  params: Record<string, any>;
  reason: string;
}

class SkillRegistry {
  private skills: Map<string, RegisteredSkill> = new Map();

  // 注册技能
  register(definition: SkillDefinition, handler: SkillHandler): void {
    this.skills.set(definition.name, { definition, handler });
  }

  // 获取所有技能定义（用于构建 prompt）
  getDefinitions(): SkillDefinition[] {
    return Array.from(this.skills.values()).map((s) => s.definition);
  }

  // 获取技能处理函数
  getHandler(skillName: string): SkillHandler | undefined {
    return this.skills.get(skillName)?.handler;
  }

  // 构建 skill 选择 prompt
  buildSelectionPrompt(): string {
    const skillList = this.getDefinitions()
      .map(
        (s) =>
          `- ${s.name}: ${s.description}\n  参数: ${s.params
            .map((p) => `${p.name}${p.required ? '' : '?'}(${p.type})`)
            .join(', ')}\n  触发词: ${s.triggerKeywords.join(', ')}`
      )
      .join('\n');

    return `你是一个智能客服助手，需要根据用户的问题选择合适的技能来处理。

## 可用技能
${skillList}

## 响应规则
1. 分析用户意图，选择最合适的技能
2. 如果用户意图不匹配任何技能，选择 "general"
3. 必须以 JSON 格式响应，不要有其他内容
4. 响应格式：
{
  "skill": "技能名称",
  "params": {
    "参数名": "从用户消息中提取的参数值"
  },
  "reason": "选择该技能的原因（简短说明）"
}

## 示例
用户: "这个保险保什么？"
响应: {"skill": "knowledge_query", "params": {"query": "这个保险保什么？"}, "reason": "用户询问产品保障内容"}

用户: "你好"
响应: {"skill": "general", "params": {"query": "你好"}, "reason": "用户打招呼，无需特定技能"}
`;
  }

  // 执行技能调用
  async execute(skillName: string, params: Record<string, any>, context: SkillContext): Promise<string> {
    const handler = this.getHandler(skillName);
    if (handler) {
      return handler(params, context);
    }
    // 默认通用处理
    return '您好，有什么可以帮您的吗？';
  }
}

// 导出全局注册实例
export const skillRegistry = new SkillRegistry();