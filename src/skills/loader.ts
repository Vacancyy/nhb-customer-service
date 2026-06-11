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
    description: '从知识库中搜索保险产品信息、条款、常见问题解答等。用于回答知识性问题，如：保障范围、投保条件、理赔流程说明、理赔材料要求、保费标准、免赔额规则等通用信息。注意：这是查询知识库文章，不是查询用户的个人数据。',
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
    description: '查询用户个人的保单订单信息。当用户要查询"我的保单"、"我的订单"、"我买了什么"等个人数据时使用。需要用户实名认证后才能查询。',
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
    description: '查询用户个人的理赔申请进度和状态。当用户要查询"我的理赔进度"、"我的理赔单状态"等个人理赔数据时使用。注意：如果用户只是询问理赔流程、理赔材料要求等知识性问题，应该使用knowledge_query工具，不是这个工具。需要用户实名认证后才能查询。',
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