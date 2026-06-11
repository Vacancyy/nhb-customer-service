// 更新阿可替尼胶囊答案，明确说明适用期数
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { updateAnswersBatch, getKnowledgeById } from '../src/lib/knowledge/service';
import { CreateKnowledgeAnswerInput } from '../src/lib/knowledge/types';

async function updateAcalabrutinibAnswers() {
  const knowledgeId = '9603e1ec-44f4-4559-8a95-0eea1c29c57b'; // 阿可替尼胶囊

  console.log('更新阿可替尼胶囊答案，明确说明适用期数...\n');

  // 构建新的答案，明确说明哪些期数有，哪些期数没有
  const answers: CreateKnowledgeAnswerInput[] = [
    // 第6期 - 明确说明不在保障范围内
    {
      period: 6,
      answer: `阿可替尼胶囊在宁惠保第6期特药保障范围内吗？

❌ 不在保障范围内

阿可替尼胶囊（商品名：康可期）在第6期特药目录中已移除。

该药品曾在第4期、第5期特药目录中，但第6期已不再包含。

如需查询其他期数的特药信息，请明确指明期数。`,
      source: '6期特药清单（已移除）',
      std_question_period: '阿可替尼胶囊在宁惠保第6期特药范围内吗？',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
    },
    // 第5期 - 在保障范围内
    {
      period: 5,
      answer: `阿可替尼胶囊在宁惠保第5期特药保障范围内。

商品名：康可期（阿可替尼胶囊）

说明：
✓ 该药品属于第5期特药目录，可在保障范围内报销
✓ 使用该特药需符合适应症限制
✓ 特药理赔需提供相关医疗证明和用药证明
✓ 具体理赔流程请咨询客服热线 4000040181

注：该药品在第6期特药目录中已移除。`,
      source: '5期特药清单',
      std_question_period: '阿可替尼胶囊在宁惠保第5期特药范围内吗？',
      valid_from: '2025-01-01',
      valid_to: '2025-12-31',
    },
    // 第4期 - 在保障范围内
    {
      period: 4,
      answer: `阿可替尼胶囊在宁惠保第4期特药保障范围内。

商品名：康可期（阿可替尼胶囊）

说明：
✓ 该药品属于第4期特药目录，可在保障范围内报销
✓ 使用该特药需符合适应症限制
✓ 特药理赔需提供相关医疗证明和用药证明
✓ 具体理赔流程请咨询客服热线 4000040181

注：该药品在第5期特药目录中也有，但在第6期已移除。`,
      source: '4期特药清单',
      std_question_period: '阿可替尼胶囊在宁惠保第4期特药范围内吗？',
      valid_from: '2024-01-01',
      valid_to: '2024-12-31',
    },
  ];

  // 更新答案
  await updateAnswersBatch(knowledgeId, answers);
  console.log('答案已更新');

  // 验证更新结果
  console.log('\n验证更新结果:');
  const entry = await getKnowledgeById(knowledgeId);
  if (entry && entry.answers) {
    console.log('答案数量:', entry.answers.length);
    entry.answers.forEach(ans => {
      console.log(`\n第${ans.period}期答案:`);
      console.log(ans.answer.substring(0, 200) + '...');
    });
  }

  console.log('\n更新完成！');
}

updateAcalabrutinibAnswers().catch(console.error);