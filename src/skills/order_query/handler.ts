// 订单查询工具处理器

import { ToolHandler, ToolContext } from '../registry';
import { logInfo, logError } from '@/lib/logger';
import { query } from '@/lib/jkxmysql';

// 订单数据结构（示例，根据实际表结构调整）
interface OrderRecord {
  id: string;
  product_set_name: string;    // 产品集名称
  product_name: string;         // 产品名称
  buyer_name: string;           // 购买人姓名
  buyer_id_card: string;        // 购买人证件号码
  ins_name: string;             // 被保险人姓名
  ins_id_card: string;          // 被险人证件号码
  status: string;               // 状态
  create_time: string;          // 购买时间
  premium: number;              // 保费
}

const handler: ToolHandler = async (args: Record<string, any>, context: ToolContext): Promise<string> => {
  // 从实名认证信息获取用户姓名和证件号码
  const userAuth = context.userAuth;

  if (!userAuth) {
    return '用户实名认证信息缺失，无法查询订单';
  }

  const { name, idCard } = userAuth;

  logInfo('[order_query] 开始查询', { userId: context.userId, name, idCard });
  try {
    //查询订单表，使用姓名和证件号码作为条件
    const orders = await query<OrderRecord>(
      `SELECT
        o.id as id,
        ps.name as 'product_set_name',
        p.name as 'product_name',
        o.order_status as 'status',
        o.create_time as 'create_time',
        b.name as buyer_name,
        CONCAT(LEFT(b.credential_number, 6), '********', RIGHT(b.credential_number, 4)) as buyer_id_card,
        c.name as ins_name,
        CONCAT(LEFT(c.credential_number, 6), '********', RIGHT(c.credential_number, 4)) as ins_id_card,
        oic.premium as 'premium'
      FROM \`order\` o
        JOIN product_set ps ON o.product_set_id = ps.id
        JOIN order_item oi ON o.id = oi.order_id
        JOIN product p ON p.id = oi.product_id
        JOIN order_item_client oic ON oic.order_item_id = oi.id
        JOIN \`user\` b ON b.id = o.buyer_id
        JOIN \`user\` c ON c.id = oic.client_id
      WHERE o.order_status = 'PAID_SUCCESS'
            AND oic.is_return = 0
            AND ps.product_serial = 'ninghuibao'
            AND ((b.name = ? AND b.credential_number = ?) OR (c.name = ? AND c.credential_number = ?))
      ORDER BY o.create_time DESC
      LIMIT 10`,
      [name, idCard,name, idCard]
    );

    if (orders.length === 0) {
      return `未查询到 ${name} 的订单记录。【请直接告知用户，不要再调用工具】`;
    }

    // 格式化订单列表
    const statusMap: Record<string, string> = {
      'PAID_SUCCESS': '支付成功',
    };

    const orderList = orders.map((order, index) => {
      const statusText = statusMap[order.status] || order.status;
      return `${index + 1}. 订单号: ${order.id}\n  
        产品集 ${order.product_set_name}\n 
        产品: ${order.product_name}\n  
        购买人姓名: ${order.buyer_name}\n  
        购买人证件号码: ${order.buyer_id_card}\n  
        被保险人姓名: ${order.ins_name}\n  
        被险人证件号码: ${order.ins_id_card}\n  
        状态: ${statusText}\n  
        购买时间: ${order.create_time}\n  
        保费: ¥${order.premium}`;
    }).join('\n\n');

    logInfo('[order_query] 查询成功', { count: orders.length });

    return `${name} 的订单记录（共 ${orders.length} 条）:\n\n${orderList}`;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    logError(`[order_query] 查询失败: ${errMsg}\n${stack}`);
    return `订单查询失败: ${errMsg}`;
  }
};

export default handler;