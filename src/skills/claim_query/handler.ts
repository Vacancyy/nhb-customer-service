// 理赔进度查询工具处理器

import { ToolHandler, ToolContext } from '../registry';
import { logInfo, logError } from '@/lib/logger';
import { query } from '@/lib/claimmysql';

// 理赔记录数据结构
interface ClaimRecord {
  claim_type: string;           // 理赔类型：传统理赔/特药理赔
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
    const claims = await query<ClaimRecord>(
      `SELECT * FROM (
                 SELECT
                     '传统理赔'  as claim_type,
                     c.id,
                     c.product_name,
                     a.name                                                                          as apply_name,
                     CONCAT(LEFT(a.credential_number, 6), '********', RIGHT(a.credential_number, 4)) as apply_id_card,
                     i.name                                                                          as ins_name,
                     CONCAT(LEFT(i.credential_number, 6), '********', RIGHT(i.credential_number, 4)) as ins_id_card,
                     c.\`status\`                                                                    as claim_status,
                     c.create_time
                 FROM insurance_claim c
                   JOIN claim_applicant a on c.id = a.claim_id
                   JOIN claim_insurant i on c.id = i.claim_id
                WHERE a.name = ? AND a.credential_number = ?
                UNION ALL
                SELECT 
                   '特药理赔' as claim_type,
                   m.claim_id as id,
                   m.policy_type as product_name ,
                   u.nick_name                                                                          as apply_name,
                   CONCAT(LEFT(u.user_name, 6), '********', RIGHT(u.user_name, 4)) as apply_id_card,
                   p.patient_name                                                                          as ins_name,
                   CONCAT(LEFT(p.credential_num, 6), '********', RIGHT(p.credential_num, 4)) as ins_id_card,
                   m.apply_status as claim_status,
                   m.create_time
                FROM drug_claim_apply_main m
                    JOIN drug_claim_insurance_patient p on m.patient_id = p.id
                    JOIN drug_sys_user u on m.user_id = u.user_id
                WHERE p.patient_name = ? AND p.credential_num = ?
          ) as claim
       ORDER BY create_time DESC
       LIMIT 20`,
      [name, idCard, name, idCard]
    );

    if (claims.length === 0) {
      return `未查询到 ${name} 的理赔记录。【请直接告知用户，不要再调用工具】`;
    }

    // 理赔状态映射（传统理赔 + 特药理赔）
    const statusMap: Record<string, string> = {
      // 传统理赔状态
      'NOT_SUBMITTED': '未提交',
      'CLAIM_APPLICATION_WAIT_AUDIT': '待审核索赔申请书',
      'CLAIM_APPLICATION_AUDITED': '索赔申请书审核通过',
      'TEMPORARY_SAVED': '暂存待处理',
      'REVIEW_TEMPORARY_SAVED': '复审暂存待处理',
      'WAIT_REVIEW': '待复审',
      'REVIEW_REJECTED': '复审拒绝',
      'SYSTEM_AUDITED': '系统审核通过',
      'SYSTEM_REJECTED': '系统驳回',
      'WAIT_INSURANCE_COMPANY_AUDITED': '待保司审核',
      'INSURANCE_COMPANY_ACCEPTED': '保司受理中',
      'INSURANCE_COMPANY_REJECTED': '保司驳回',
      'INSURANCE_COMPANY_COMPLETED': '保司已结案',
      'INSURANCE_COMPANY_ANNUL_OR_REFUSED': '保司案件注销/拒赔',
      'CANCELED': '用户已取消',
      'CANCEL_WAIT_CONFIRM': '取消待确认',
      // 特药理赔状态
      'UN_SUBMIT': '未提交',
      'CANCEL': '已取消',
      'INVALID': '无效理赔申请',
      'UN_AUDIT_YX_INFO': '待审方',
      'AUDIT_PASS_SF': '审方通过',
      'AUDIT_REFUSE_SF': '审方驳回',
      // 事前理赔
      'UN_PAY': '待支付',
      'UN_AUDIT_DRUG_INFO': '待药房审核',
      'UN_TAKE_DRUG': '待取药',
      'TAKE_DRUG': '已取药',
      'REMIT_ACCOUNT': '已划账',
      // 事后理赔
      'INS_UN_AUDIT': '保司审核中',
      'AUDIT_PASS': '二级审核通过',
      'INS_REFUSE': '保司驳回',
      'INS_ABANDON': '保司拒赔',
      'INS_PASS': '保司审核通过',
      'INS_END': '保司已结案',
      // 审核阶段
      'UN_AUDIT_LEVEL_ONE': '待初审',
      'UN_AUDIT_LEVEL_TWO': '待2级审核',
      'UN_AUDIT_LEVEL_THREE': '待3级审核',
      'UN_AUDIT_LEVEL_FOUR': '待4级审核',
      'AUDIT_REFUSE_ONE': '初审驳回',
    };

    const claimList = claims.map((claim, index) => {
      const statusText = statusMap[claim.claim_status] || claim.claim_status;
      const isSpecialDrug = claim.claim_type === '特药理赔';
      return `${index + 1}. 【${claim.claim_type}】理赔单号: ${claim.id}
   产品: ${claim.product_name}
   报案人姓名: ${claim.apply_name}
   保险人姓名: ${claim.ins_name}
   报案人证件号码: ${claim.apply_id_card}
   保险人证件号码: ${claim.ins_id_card}
   理赔状态: ${statusText}
   申请时间: ${claim.create_time}`;
    }).join('\n\n');

    // 检测是否有特药理赔记录
    const hasSpecialDrugClaims = claims.some(c => c.claim_type === '特药理赔');

    logInfo('[claim_query] 查询成功', { count: claims.length, specialDrugCount: claims.filter(c => c.claim_type === '特药理赔').length });

    const guidance = `
【回答指引】
1. 请按理赔类型分别列出用户的理赔记录，传统理赔和特药理赔要分开说明
2. ${hasSpecialDrugClaims ? '用户有特药理赔记录，回答时必须明确告知：特药保障仅限升级版用户，基础版不含特药保障' : ''}
3. 不要对理赔结果做任何赔付承诺或保证，只如实告知当前理赔状态
4. 如果用户询问理赔金额或能否赔付，只告知当前状态，不做预测`;

    return `${name} 的理赔记录（共 ${claims.length} 条）:\n\n${claimList}\n\n${guidance}`;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    logError(`[claim_query] 查询失败: ${errMsg}\n${stack}`);
    return `理赔查询功能暂不可用，建议转人工客服。【请直接告知用户，不要再调用工具】`;
  }
};

export default handler;