// 技能加载器 - 预定义技能导入并注册
// 注意：Next.js App Router 不支持 fs 模块，改用静态导入

import { skillRegistry } from './registry';

// 导入各技能的配置和处理函数
import knowledgeQueryConfig from './knowledge_query/config.json';
import knowledgeQueryHandler from './knowledge_query/handler';

import orderQueryConfig from './order_query/config.json';
import orderQueryHandler from './order_query/handler';

import claimQueryConfig from './claim_query/config.json';
import claimQueryHandler from './claim_query/handler';

// 注册所有技能
export function loadAllSkills(): void {
  // 注册知识库查询技能
  skillRegistry.register(knowledgeQueryConfig, knowledgeQueryHandler);

  // 注册订单查询技能
  skillRegistry.register(orderQueryConfig, orderQueryHandler);

  // 注册理赔查询技能
  skillRegistry.register(claimQueryConfig, claimQueryHandler);

  // 注册通用技能（兜底）
  skillRegistry.register(
    {
      name: 'general',
      description: '通用对话 - 处理打招呼、闲聊、无法匹配其他技能的情况',
      triggerKeywords: ['你好', '您好', '在吗', '谢谢', '再见'],
      params: [{ name: 'query', type: 'string', required: true, description: '用户消息' }],
    },
    async (params) => {
      const query = params.query || '';
      if (query.includes('你好') || query.includes('您好')) {
        return '您好，我是智能客服助手，有什么可以帮您的吗？';
      }
      return '您好，有什么可以帮您的吗？';
    }
  );
}

// 导出注册表供外部使用
export { skillRegistry };