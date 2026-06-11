// 测试不同情况的特药查询
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { searchKnowledgeByQuestion, getKnowledgeById } from '../src/lib/knowledge/service';

async function testVariousDrugQueries() {
  console.log('测试不同情况的特药查询...\n');

  // 测试不同的特药
  const testCases = [
    {
      name: '奥雷巴替尼（只在第3期有）',
      query: '奥雷巴替尼在特药范围内吗？',
      expectedPeriod: '第3期在，第4、5、6期不在',
    },
    {
      name: '格菲妥单抗注射液（只在第6期有）',
      query: '格菲妥单抗注射液是特药吗？',
      expectedPeriod: '第6期在，第3、4、5期不在',
    },
    {
      name: '注射用贝林妥欧单抗（第3-6期都有）',
      query: '注射用贝林妥欧单抗可以报销吗？',
      expectedPeriod: '第3-6期都在',
    },
    {
      name: '注射用维泊妥珠单抗（第4-5期有）',
      query: '注射用维泊妥珠单抗在特药中吗？',
      expectedPeriod: '第4、5期在，第3、6期不在',
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n========================================`);
    console.log(`测试: ${testCase.name}`);
    console.log(`预期: ${testCase.expectedPeriod}`);
    console.log(`查询: "${testCase.query}"`);
    console.log(`========================================`);

    const results = await searchKnowledgeByQuestion(testCase.query, 3);

    if (results.length > 0) {
      const topResult = results[0];
      console.log(`✓ 找到匹配条目 (相似度: ${topResult.similarity.toFixed(3)})`);
      console.log(`  标准问题: ${topResult.std_question}`);

      if (topResult.answers && topResult.answers.length > 0) {
        console.log(`  答案数量: ${topResult.answers.length}`);
        console.log(`  覆盖期数: ${topResult.answers.map(a => a.period).join(',')}`);

        // 打印各期答案摘要
        topResult.answers.forEach(ans => {
          const isIncluded = ans.answer.includes('在宁惠保第') && ans.answer.includes('保障范围内') && !ans.answer.includes('不在保障范围内');
          const status = isIncluded ? '✅ 在保障范围内' : '❌ 不在保障范围内';
          console.log(`    第${ans.period}期: ${status}`);
          console.log(`      答案预览: ${ans.answer.substring(0, 100)}...`);
        });
      }
    } else {
      console.log('❌ 未找到匹配结果');
    }
  }

  console.log('\n测试完成！');
}

testVariousDrugQueries().catch(console.error);