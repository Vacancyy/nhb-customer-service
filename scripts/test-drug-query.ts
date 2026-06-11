// 测试具体药品查询功能
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { searchKnowledgeByQuestion } from '../src/lib/knowledge/service';

async function testDrugQuery() {
  console.log('测试具体药品查询功能...\n');

  // 测试不同的查询方式
  const testQueries = [
    '格列卫在特药范围内吗？',
    '艾拉司群是特药吗？',
    '优赫得在特药目录里吗？',
    '注射用德曲妥珠单抗能报销吗？',
    'Orserdu属于特药保障吗？',
    '宁惠保包含伊赫莱吗？',
  ];

  for (const query of testQueries) {
    console.log(`\n查询: "${query}"`);
    const results = await searchKnowledgeByQuestion(query, 5);

    if (results.length > 0) {
      console.log(`找到 ${results.length} 个结果:`);
      results.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.std_question} (相似度: ${result.similarity.toFixed(3)})`);

        if (result.std_question.includes('特药目录')) {
          console.log(`     ✓ 这是特药目录列表`);
          if (result.answers && result.answers.length > 0) {
            const latestAnswer = result.answers[0];
            console.log(`     第${latestAnswer.period}期特药数量: ${latestAnswer.answer.includes('共') ? latestAnswer.answer.match(/共(\d+)种/)?.[1] : '未知'}`);
          }
        } else if (result.std_question.includes('格列卫')) {
          console.log(`     ✓ 这是格列卫相关的特定问题`);
          if (result.answers && result.answers.length > 0) {
            console.log(`     答案: ${result.answers[0].answer.substring(0, 100)}...`);
          }
        }
      });

      // 判断是否能回答
      const topResult = results[0];
      if (topResult.similarity >= 0.5) {
        console.log(`\n  ✓ 可以回答 (相似度 >= 0.5)`);
      } else {
        console.log(`\n  ✗ 相似度较低，可能无法准确回答`);
      }
    } else {
      console.log('未找到相关结果');
    }
  }

  console.log('\n测试完成！');
}

testDrugQuery().catch(console.error);