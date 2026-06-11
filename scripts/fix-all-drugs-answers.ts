// 批量修复所有特药的答案，补充缺失期数
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { listKnowledge, updateAnswersBatch, getKnowledgeById } from '../src/lib/knowledge/service';
import { CreateKnowledgeAnswerInput } from '../src/lib/knowledge/types';

async function fixAllDrugsAnswers() {
  console.log('批量修复所有特药的答案...\n');

  // 查询所有特药相关的知识条目
  const { data: entries } = await listKnowledge({
    keyword: '在宁惠保特药范围内吗',
    pageSize: 100,
  });

  console.log(`找到 ${entries.length} 个特药条目\n`);

  // 为每个药品补充缺失期数的答案
  let fixedCount = 0;
  let errorCount = 0;

  for (const entry of entries) {
    const drugName = entry.std_question.replace('在宁惠保特药范围内吗？', '');
    const hasPeriods = entry.answers?.map(a => a.period) || [];
    const missingPeriods: number[] = [];

    // 找出缺失的期数（第3-6期）
    for (let period = 3; period <= 6; period++) {
      if (!hasPeriods.includes(period)) {
        missingPeriods.push(period);
      }
    }

    if (missingPeriods.length === 0) {
      continue; // 不需要修复
    }

    console.log(`修复: ${drugName} (已有第${hasPeriods.join(',')}期，补充第${missingPeriods.join(',')}期)`);
    console.log(`  ID: ${entry.id}`);

    try {
      // 构建完整的答案列表（包含已有和新增的）
      const allAnswers: CreateKnowledgeAnswerInput[] = [];

      // 保留已有答案，补充说明
      if (entry.answers) {
        for (const ans of entry.answers) {
          const validYear = 2020 + ans.period;
          allAnswers.push({
            period: ans.period,
            answer: `${ans.answer}\n\n注：该药品在宁惠保第${ans.period}期特药目录中，其他期数情况请咨询客服。`,
            source: ans.source || `${ans.period}期特药清单`,
            std_question_period: ans.std_question_period || `${drugName}在宁惠保第${ans.period}期特药范围内吗？`,
            valid_from: ans.valid_from || `${validYear}-01-01`,
            valid_to: ans.valid_to || `${validYear}-12-31`,
          });
        }
      }

      // 补充缺失期数的答案（明确告知不在保障范围内）
      for (const period of missingPeriods) {
        const validYear = 2020 + period;
        allAnswers.push({
          period,
          answer: `${drugName}在宁惠保第${period}期特药保障范围内吗？

❌ 不在保障范围内

${drugName}在宁惠保第${period}期特药目录中未包含。

该药品曾在第${hasPeriods.length > 0 ? `第${hasPeriods.join('、')}期` : '早期'}特药目录中${hasPeriods.length > 0 ? '有包含' : '可能有包含'}，但在第${period}期已${hasPeriods.length > 0 ? '移除' : '未纳入'}。

如需查询其他期数的特药信息，请明确指明期数或咨询客服热线 4000040181。`,
          source: `${period}期特药清单（未包含）`,
          std_question_period: `${drugName}在宁惠保第${period}期特药范围内吗？`,
          valid_from: `${validYear}-01-01`,
          valid_to: `${validYear}-12-31`,
        });
      }

      // 更新答案
      await updateAnswersBatch(entry.id, allAnswers);
      console.log('  ✓ 成功修复');
      fixedCount++;
    } catch (error: any) {
      console.log(`  ✗ 修复失败: ${error.message}`);
      errorCount++;
    }
  }

  console.log('\n修复完成:');
  console.log(`  成功修复: ${fixedCount} 个药品`);
  console.log(`  失败: ${errorCount} 个药品`);

  // 验证修复结果（抽查几个）
  console.log('\n验证修复结果（抽查）:');
  const sampleIds = entries.slice(0, 3).map(e => e.id);

  for (const id of sampleIds) {
    const entry = await getKnowledgeById(id);
    if (entry) {
      console.log(`\n${entry.std_question}:`);
      console.log(`  答案数量: ${entry.answers?.length || 0}`);
      console.log(`  覆盖期数: ${entry.answers?.map(a => a.period).join(',') || '无'}`);
    }
  }
}

fixAllDrugsAnswers().catch(console.error);