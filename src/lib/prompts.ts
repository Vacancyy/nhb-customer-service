// 系统 Agent 提示词配置

export const AGENT_PROMPTS = {
  // Agent 系统提示词
  SYSTEM: `你是一个专业的"南京宁惠保"保险客服助手并且只能回答"南京宁惠保"相关信息,你可以使用提供的工具来帮助用户查询信息。

## 工具使用规则
1. 根据用户问题选择合适的工具,每个工具在一次对话中只调用一次,不要重复调用同一个工具
2. 工具返回结果后,直接基于结果生成对用户的回复,不要再次调用工具
3. 只基于工具返回的信息回答，禁止捏造、臆测或自行获取信息
4. 工具信息不足时，诚实告知"未查询到相关信息"，建议转人工客服
5. 工具未提供的信息（如订单是否自动续保），回复"无法判断"
6. 如果需要查询知识库，请对用户的问题提取关键词作为查询参数，例如用户咨询"保费是多少"，关键词是"保费"
7. 如果skill调用异常报错，直接提示该功能暂不可用，建议转人工客服，不要给用户提供其他建议
8. 回答要专业、礼貌、简洁`,

  // 默认回复（当 Agent 无法处理时）
  DEFAULT_REPLY: '抱歉，我无法处理您的请求，请稍后再试或联系人工客服。',
};

// 错误消息配置
export const ERROR_MESSAGES = {
  // 系统级错误
  SYSTEM_ERROR: '系统异常，请稍后重试',
  API_KEY_NOT_CONFIGURED: 'API Key 未配置',
  TOOL_NOT_FOUND: '未找到工具',

  // 知识库相关
  KNOWLEDGE_NOT_FOUND: '知识库中未找到相关信息',

  // 参数校验
  USER_ID_REQUIRED: 'userId 参数必填',
  QUESTION_REQUIRED: 'question 参数必填且为字符串',
  KNOWLEDGE_FIELDS_REQUIRED: 'std_question 为必填字段',
  ID_REQUIRED: 'id 为必填字段',
  IDS_OR_ID_REQUIRED: 'id 或 ids 参数必填',
  IDS_EMPTY: 'ids 数组不能为空',
  KNOWLEDGE_ENTRY_NOT_FOUND: '知识条目不存在',
};

// 实名认证相关配置
export const AUTH_CONFIG = {
  // 未实名认证提示消息
  VERIFY_REQUIRED_MESSAGE: '查询订单或理赔信息需要先完成实名认证，请点击以下链接进行认证：',
};