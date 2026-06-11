/**
 * 深入诊断：为什么测试时返回异常回复
 * 对比测试脚本和实际API的行为差异
 */

const API_BASE = 'http://localhost:3000/nhb-customer-service-api';

// 从失败案例中选取测试问题
const failedQuestions = [
  // 原测试中关键词命中率0%的问题
  '投保这款产品是否需要健康告知/体检？',
  '其他城市什么时候上线？',
  '有理赔次数限制吗？',
  '医院等级在哪里查看？',
  '在哪里查询投保须知？',
  '快赔系统没带出来这一段时间的就诊记录，走的传统通道',
  '钱已经被扣了，怎么退回来？',
  '为什么显示还在出单？',
  '住院花了很多钱，怎么才赔这么点？',
  '怎么查宁惠保的电子保单？',
  '打哪个电话找客服？',
  '投保人的手机号码是哪个？',
  '怎么查这家医院是什么级别的？',
  '为什么直付没看到赔款？',
  // 回答不完整的问题
  '外籍人士可以投保这款产品吗？',
  '人工客服电话是多少？',
  '这款产品的犹豫期有多久？',
  '什么是商业保险？',
  '什么是个人自付和个人自费？',
  '保险人是指什么？',
  '种植牙是否可以报销'
];

// 知识库标准答案（用于对比）
const expectedAnswers: Record<string, { keywords: string[], answer: string }> = {
  '投保这款产品是否需要健康告知/体检？': {
    keywords: ['不需要', '健康告知', '体检'],
    answer: '这款产品不需要健康告知，也不需要体检。'
  },
  '其他城市什么时候上线？': {
    keywords: ['正在', '积极', '沟通'],
    answer: '我们正在积极与各地政府沟通产品方案'
  },
  '有理赔次数限制吗？': {
    keywords: ['没有限制', '理赔次数'],
    answer: '理赔次数没有限制'
  },
  '医院等级在哪里查看？': {
    keywords: ['医疗机构查询系统', 'http'],
    answer: '通过全国医疗机构查询系统确认医院等级'
  },
  '人工客服电话是多少？': {
    keywords: ['4000040181', '电话'],
    answer: '可拨打咨询电话4000040181咨询'
  },
  '外籍人士可以投保这款产品吗？': {
    keywords: ['无法', '投保'],
    answer: '外籍人士无法在线上完成投保'
  },
  '这款产品的犹豫期有多久？': {
    keywords: ['无', '犹豫期'],
    answer: '这款产品无犹豫期'
  },
  '什么是商业保险？': {
    keywords: ['商业保险', '保险合同', '营利'],
    answer: '商业保险是指通过订立保险合同运营，以营利为目的的保险形式'
  },
  '保险人是指什么？': {
    keywords: ['保险人', '承保人', '保险公司'],
    answer: '保险人又称承保人，是指与投保人订立保险合同，并承担赔偿或者给付保险金责任的保险公司'
  },
  '种植牙是否可以报销': {
    keywords: ['种植牙', '报销', '赔付范围'],
    answer: '具体报销范围需以保险条款为准'
  }
};

async function callChat(question: string) {
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: 'deep-diagnostic',
        visitorId: `diag_${Date.now()}`,
        message: question
      })
    });

    const data = await res.json();
    return {
      success: res.ok,
      answer: data.data?.message || '无回答',
      type: data.data?.type || '未知',
      fullData: data
    };
  } catch (e) {
    return {
      success: false,
      answer: `请求失败: ${e}`,
      type: 'error',
      fullData: null
    };
  }
}

async function main() {
  console.log('========== 深入诊断：异常回复原因分析 ==========\n');

  // 检查服务器状态
  try {
    const res = await fetch(API_BASE.replace('/nhb-customer-service-api/chat', '/'), { method: 'GET' });
    console.log(`服务器状态: ${res.ok ? '✓ 运行中' : '✗ 无响应'}\n`);
  } catch {
    console.log('❌ 无法连接服务器，请先启动 npm run dev\n');
    return;
  }

  let successCount = 0;
  let failedCount = 0;
  let authBlockedCount = 0;
  let errorCount = 0;

  const results: any[] = [];

  for (const question of failedQuestions) {
    const expected = expectedAnswers[question];
    const result = await callChat(question);

    console.log(`\n【问题】${question.substring(0, 40)}...`);
    console.log('-'.repeat(40));

    // 分析返回类型
    if (result.type === 'auth') {
      console.log('【返回类型】auth - 需要实名认证');
      console.log('【回答】' + result.answer.substring(0, 60) + '...');
      authBlockedCount++;
      results.push({ question, status: 'auth_blocked', reason: '需要实名认证' });
    } else if (!result.success || result.answer.includes('无法处理') || result.answer.includes('稍后再试')) {
      console.log('【返回类型】error - 系统错误');
      console.log('【回答】' + result.answer);
      errorCount++;
      results.push({ question, status: 'error', reason: result.answer });
    } else {
      // 检查关键词
      const answerLower = result.answer.toLowerCase();
      let keywordHits = 0;

      if (expected) {
        for (const keyword of expected.keywords) {
          if (answerLower.includes(keyword.toLowerCase())) {
            keywordHits++;
          }
        }
      }

      const keywordRate = expected ? Math.round(keywordHits / expected.keywords.length * 100) : 0;
      console.log(`【返回类型】${result.type}`);
      console.log(`【关键词命中】${keywordRate}% (${keywordHits}/${expected?.keywords.length || 0})`);
      console.log(`【回答摘要】${result.answer.substring(0, 100)}...`);

      if (keywordRate >= 50) {
        console.log('✓ 回答正确');
        successCount++;
        results.push({ question, status: 'success', keywordRate });
      } else if (keywordRate > 0) {
        console.log('⚠ 回答不完整');
        failedCount++;
        results.push({ question, status: 'incomplete', keywordRate, reason: '关键词命中率低于50%' });
      } else {
        console.log('❌ 回答错误（关键词0%）');
        failedCount++;
        results.push({ question, status: 'failed', keywordRate: 0, reason: '关键词命中率0%' });
      }
    }

    await new Promise(r => setTimeout(r, 300));
  }

  // 统计汇总
  console.log('\n========== 诊断汇总 ==========\n');
  console.log(`测试问题总数: ${failedQuestions.length}`);
  console.log(`✓ 回答正确: ${successCount}个`);
  console.log(`⚠ 回答不完整: ${failedCount}个`);
  console.log(`🔒 实名认证拦截: ${authBlockedCount}个`);
  console.log(`❌ 系统错误: ${errorCount}个`);

  const totalValid = failedQuestions.length - authBlockedCount - errorCount;
  const accuracyRate = totalValid > 0 ? Math.round(successCount / totalValid * 100) : 0;
  console.log(`\n【修正后准确率】${accuracyRate}% (${successCount}/${totalValid})`);

  // 问题分类
  console.log('\n========== 问题分类 ==========\n');

  const authBlocked = results.filter(r => r.status === 'auth_blocked');
  const errors = results.filter(r => r.status === 'error');
  const incomplete = results.filter(r => r.status === 'incomplete');
  const failed = results.filter(r => r.status === 'failed');

  if (authBlocked.length > 0) {
    console.log(`【实名认证拦截】${authBlocked.length}个（正常行为）`);
    authBlocked.forEach(r => console.log(`  - ${r.question.substring(0, 30)}...`));
  }

  if (errors.length > 0) {
    console.log(`\n【系统错误】${errors.length}个（需要排查）`);
    errors.forEach(r => console.log(`  - ${r.question.substring(0, 30)}...`));
    console.log(`  原因: LLM返回了无法处理的回复`);
  }

  if (incomplete.length > 0) {
    console.log(`\n【回答不完整】${incomplete.length}个`);
    incomplete.forEach(r => console.log(`  - ${r.question.substring(0, 30)}... (命中率${r.keywordRate}%)`));
    console.log(`  原因: LLM输出时缺少部分关键信息`);
  }

  if (failed.length > 0) {
    console.log(`\n【完全错误】${failed.length}个`);
    failed.forEach(r => console.log(`  - ${r.question.substring(0, 30)}...`));
    console.log(`  原因: LLM未输出知识库中的关键信息`);
  }

  // 根本原因分析
  console.log('\n========== 根本原因分析 ==========\n');
  console.log(`当前问题类型分布:`);
  console.log(`  - 系统错误(${errors.length}个): LLM返回"无法处理"等默认回复`);
  console.log(`  - 完全错误(${failed.length}个): LLM未输出知识库关键信息`);
  console.log(`  - 回答不完整(${incomplete.length}个): LLM输出不完整`);

  console.log(`\n可能原因:`);
  console.log(`  1. LLM有时未能正确理解或使用知识库工具返回的结果`);
  console.log(`  2. 系统提示词可能不够明确，未强制LLM输出完整知识库答案`);
  console.log(`  3. 某些问题可能触发了LLM的异常处理逻辑`);

  console.log(`\n建议优化:`);
  console.log(`  1. 修改系统提示词，要求LLM必须完整输出知识库返回的答案内容`);
  console.log(`  2. 增加提示词中的强制输出规则："必须包含知识库答案中的所有关键信息"`);
  console.log(`  3. 检查knowledge_query返回格式是否足够清晰，便于LLM理解`);
}

main();