// 查看特药知识条目的分期答案结构
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { getKnowledgeById } from '../src/lib/knowledge/service';

async function checkPeriodAnswers() {
  console.log('检查特药知识条目的分期答案结构...\n');

  // 查询几个示例药品
  const sampleDrugs = [
    '35e86fb3-9fec-424c-b1b1-72c29a72e15d', // 艾拉司群
    'd3528bdf-c76b-490b-9956-3bc7ea262044', // 注射用贝林妥欧单抗
    'df9024e4-2339-4000-9aa3-0a9c4a2e6f6c', // 注射用维泊妥珠单抗
  ];

  for (const drugId of sampleDrugs) {
    const entry = await getKnowledgeById(drugId);
    if (entry) {
      console.log(`药品: ${entry.std_question}`);
      console.log(`答案数量: ${entry.answers?.length || 0}`);
      console.log(`适用期数: ${entry.answers?.map(a => a.period).join(', ') || '无'}`);

      if (entry.answers && entry.answers.length > 0) {
        console.log('\n各期答案详情:');
        entry.answers.forEach(ans => {
          console.log(`\n  第${ans.period}期:`);
          console.log(`    有效期: ${ans.valid_from} 至 ${ans.valid_to}`);
          console.log(`    答案预览: ${ans.answer.substring(0, 150)}...`);
        });
      }
      console.log('\n---\n');
    }
  }

  // 查询一个药品在多个期数都存在的例子
  const multiPeriodDrugId = 'd3528bdf-c76b-490b-9956-3bc7ea262044'; // 注射用贝林妥欧单抗
  const multiPeriodEntry = await getKnowledgeById(multiPeriodDrugId);

  if (multiPeriodEntry && multiPeriodEntry.answers) {
    console.log('多期药品示例（注射用贝林妥欧单抗）:');
    console.log(`  适用期数: ${multiPeriodEntry.answers.map(a => `第${a.period}期`).join(', ')}`);
    console.log('\n  第3期答案:');
    console.log(`    ${multiPeriodEntry.answers.find(a => a.period === 3)?.answer.substring(0, 200)}...`);
    console.log('\n  第6期答案:');
    console.log(`    ${multiPeriodEntry.answers.find(a => a.period === 6)?.answer.substring(0, 200)}...`);
  }
}

checkPeriodAnswers().catch(console.error);