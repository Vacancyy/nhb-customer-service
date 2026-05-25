// 销售订单查询技能处理器

import { SkillHandler, SkillContext } from '../registry';

const handler: SkillHandler = async (params: Record<string, any>, context: SkillContext) => {
  const orderId = params.order_id;
  const queryType = params.query_type || 'list';

  // TODO: 实际实现 - 调用订单查询服务
  const typeNames: Record<string, string> = {
    status: '订单状态',
    detail: '订单详情',
    list: '订单列表',
  };

  let result = `【订单查询】\n查询类型: ${typeNames[queryType] || queryType}\n`;
  if (orderId) {
    result += `订单号: ${orderId}\n`;
  }
  result += '\n正在查询您的订单信息...';

  return result;
};

export default handler;