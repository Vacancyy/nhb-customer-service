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
    description: '搜索知识库回答用户关于宁惠保的问题。适用于保障范围、投保条件、理赔流程、保费、免赔额等知识性查询。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '用户的问题关键词',
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
    description: '查询用户个人保单订单。需要实名认证。',
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
    description: '查询用户个人理赔进度。如果用户只是问理赔流程、材料等知识性问题，应使用knowledge_query。需要实名认证。',
    parameters: {
      type: 'object',
      properties: {
        claim_id: {
          type: 'string',
          description: '理赔单号（可选）',
        },
        query_type: {
          type: 'string',
          description: '查询类型：进度/材料/流程',
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