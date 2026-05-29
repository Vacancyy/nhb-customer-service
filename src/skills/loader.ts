// 工具加载器 - 注册为 OpenAI Function Calling 格式

import { toolRegistry, SkillDefinition } from './registry';
import knowledgeQueryHandler from './knowledge_query/handler';
import orderQueryHandler from './order_query/handler';
import claimQueryHandler from './claim_query/handler';

// 知识库查询工具定义（不需要实名认证）
const knowledgeQueryTool: SkillDefinition = {
  type: 'function',
  function: {
    name: 'knowledge_query',
    description: '从知识库中搜索保险产品信息、条款、常见问题等。当用户询问保险内容、保障范围、投保条件、理赔规则等问题时使用。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '用户的查询内容，用于向量搜索知识库',
        },
      },
      required: ['query'],
    },
  },
  auth: false,
};

// 订单查询工具定义（需要实名认证）
const orderQueryTool: SkillDefinition = {
  type: 'function',
  function: {
    name: 'order_query',
    description: '查询用户的保单订单、购买记录、订单状态、支付信息等。当用户询问订单、保单、购买记录时使用。',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  auth: true,
};

// 理赔查询工具定义（需要实名认证）
const claimQueryTool: SkillDefinition = {
  type: 'function',
  function: {
    name: 'claim_query',
    description: '查询理赔进度、理赔材料、理赔流程等。当用户询问理赔相关问题时使用。',
    parameters: {
      type: 'object',
      properties: {
        claim_id: {
          type: 'string',
          description: '理赔单号（可选）',
        },
        query_type: {
          type: 'string',
          description: '查询类型: progress(进度), material(材料), process(流程)',
        },
      },
      required: [],
    },
  },
  auth: true,
};

// 注册所有工具
export function loadAllTools(): void {
  toolRegistry.register(knowledgeQueryTool, knowledgeQueryHandler);
  toolRegistry.register(orderQueryTool, orderQueryHandler);
  toolRegistry.register(claimQueryTool, claimQueryHandler);
}