// 批量更新所有特药答案，添加进阶版和普通版说明
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { listKnowledge, updateAnswersBatch, getKnowledgeById } from '../src/lib/knowledge/service';
import { CreateKnowledgeAnswerInput } from '../src/lib/knowledge/types';

async function updateDrugAnswersWithVersionInfo() {
  console.log('批量更新特药答案，添加进阶版和普通版说明...\n');

  // 查询所有特药相关的知识条目
  const { data: entries } = await listKnowledge({
    keyword: '在宁惠保特药范围内吗',
    pageSize: 100,
  });

  console.log(`找到 ${entries.length} 个特药条目\n`);

  let updatedCount = 0;
  let errorCount = 0;

  for (const entry of entries) {
    const drugName = entry.std_question.replace('在宁惠保特药范围内吗？', '');
    console.log(`更新: ${drugName}`);

    try {
      // 获取完整的答案列表
      const fullEntry = await getKnowledgeById(entry.id);
      if (!fullEntry || !fullEntry.answers) {
        console.log('  ⚠ 无答案，跳过');
        continue;
      }

      // 更新每个答案，添加进阶版和普通版说明
      const updatedAnswers: CreateKnowledgeAnswerInput[] = fullEntry.answers.map(ans => {
        const isIncluded = ans.answer.includes('在宁惠保第') &&
                          ans.answer.includes('保障范围内') &&
                          !ans.answer.includes('不在保障范围内');

        // 更新答案内容
        let newAnswer = ans.answer;

        if (isIncluded) {
          // 在保障范围内 - 添加进阶版说明
          newAnswer = `${ans.answer}

⚠️ 重要提示：
✓ 特药保障仅限【升级版】用户，基础版不含特药保障
✓ 如需特药保障，请购买升级版宁惠保`;
        } else {
          // 不在保障范围内 - 保持原内容不变
          newAnswer = ans.answer;
        }

        return {
          period: ans.period,
          answer: newAnswer,
          source: ans.source || `${ans.period}期特药清单`,
          std_question_period: ans.std_question_period || `${drugName}在宁惠保第${ans.period}期特药范围内吗？`,
          valid_from: ans.valid_from || `2020-${ans.period}-01-01`,
          valid_to: ans.valid_to || `2020-${ans.period}-12-31`,
        };
      });

      // 批量更新答案
      await updateAnswersBatch(entry.id, updatedAnswers);
      console.log('  ✓ 更新成功');
      updatedCount++;

    } catch (error: any) {
      console.log(`  ✗ 更新失败: ${error.message}`);
      errorCount++;
    }
  }

  console.log('\n更新完成:');
  console.log(`  成功: ${updatedCount}`);
  console.log(`  失败: ${errorCount}`);

  // 验证更新结果（抽查）
  console.log('\n验证更新结果（抽查前3个）:');
  const sampleIds = entries.slice(0, 3).map(e => e.id);

  for (const id of sampleIds) {
    const entry = await getKnowledgeById(id);
    if (entry && entry.answers) {
      console.log(`\n${entry.std_question}:`);
      const hasVersionInfo = entry.answers.some(ans =>
        ans.answer.includes('升级版') && ans.answer.includes('基础版不含特药保障')
      );
      console.log(`  包含版本信息: ${hasVersionInfo ? '✅ 是' : '❌ 否'}`);

      if (hasVersionInfo) {
        const inAnswer = entry.answers.find(ans =>
          ans.answer.includes('在宁惠保第') &&
          !ans.answer.includes('不在保障范围内')
        );
        if (inAnswer) {
          console.log(`  第${inAnswer.period}期答案预览:`);
          console.log(`    ${inAnswer.answer.substring(0, 150)}...`);
        }
      }
    }
  }
}

updateDrugAnswersWithVersionInfo().catch(console.error);