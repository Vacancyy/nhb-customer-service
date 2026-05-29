// 理赔进度查询工具处理器

import { ToolHandler, ToolContext } from '../registry';
import { logInfo, logError } from '@/lib/logger';
import { query } from '@/lib/claimmysql';

// 理赔记录数据结构（示例，根据实际表结构调整）
interface ClaimRecord {
  id: string;                   // 理赔单号
  product_name: string;         // 产品名称
  apply_name: string;           // 报案人姓名
  apply_id_card: string;        // 报案人证件号码
  ins_name: string;             // 保险人姓名
  ins_id_card: string;          // 保险人证件号码
  claim_status: string;         // 理赔状态
  create_time: string;          // 申请时间
}

const handler: ToolHandler = async (args: Record<string, any>, context: ToolContext): Promise<string> => {
  // 从实名认证信息获取用户姓名和证件号码
  const userAuth = context.userAuth;

  if (!userAuth) {
    return '用户实名认证信息缺失，无法查询理赔进度';
  }

  const { name, idCard } = userAuth;

  logInfo('[claim_query] 开始查询', { userId: context.userId, name, idCard });

  try {
    // 查询理赔表，使用姓名和证件号码作为条件
    // TODO: 根据实际表结构调整 SQL
    const claims = await query<ClaimRecord>(
      `SELECT c.id,
              c.product_name,
              a.name as apply_name,
              CONCAT(LEFT(a.credential_number, 6), '********', RIGHT(a.credential_number, 4)) as apply_id_card,
              i.name as ins_name,
              CONCAT(LEFT(i.credential_number, 6), '********', RIGHT(i.credential_number, 4)) as ins_id_card,
              c.\`status\` as claim_status,
              c.create_time
       FROM insurance_claim c
              JOIN claim_applicant a on c.id = a.claim_id
              JOIN claim_insurant i on c.id = i.claim_id
       WHERE c.product_set_code like 'ninghuibao%'
         AND ((a.name = ? AND a.credential_number = ?) OR (i.name = ? AND i.credential_number = ?))
       ORDER BY c.create_time DESC
       LIMIT 10`,
      [name, idCard, name, idCard]
    );

    if (claims.length === 0) {
      return `未查询到 ${name} 的理赔记录。【请直接告知用户，不要再调用工具】`;
    }

    // 格式化理赔列表
    const statusMap: Record<string, string> = {
      'PENDING': '待审核',
      'REVIEWING': '审核中',
      'APPROVED': '已通过',
      'REJECTED': '已拒绝',
      'PAID': '已赔付',
    };

    const claimList = claims.map((claim, index) => {
      const statusText = statusMap[claim.claim_status] || claim.claim_status;
      return `${index + 1}. 理赔单号: ${claim.id}
   产品: ${claim.product_name}
   报案人姓名: ${claim.apply_name}
   保险人姓名: ${claim.ins_name}
   报案人证件号码: ${claim.apply_id_card}
   保险人证件号码: ${claim.ins_id_card}
   理赔状态: ${statusText}
   申请时间: ${claim.create_time}`;
    }).join('\n\n');

    logInfo('[claim_query] 查询成功', { count: claims.length });

    return `${name} 的理赔记录（共 ${claims.length} 条）:\n\n${claimList}`;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    logError(`[claim_query] 查询失败: ${errMsg}\n${stack}`);
    return `理赔查询失败: ${errMsg}`;
  }
};

export default handler;