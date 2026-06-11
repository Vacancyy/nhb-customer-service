// 验证特药清单导入结果
import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { getKnowledgeById, searchKnowledgeByQuestion } from '../src/lib/knowledge/service';

async function verifyImport() {
  const knowledgeId = '3a9db8e0-2292-4ede-9dae-6a0e68f0bfb4';

  console.log('验证导入结果...\n');

  // 1. 直接查询知识条目
  console.log('1. 查询知识条目详情:');
  const entry = await getKnowledgeById(knowledgeId);
  if (entry) {
    console.log(`  ID: ${entry.id}`);
    console.log(`  标准问题: ${entry.std_question}`);
    console.log(`  分类: ${entry.category}`);
    console.log(`  意图: ${entry.intent}`);
    console.log(`  是否已向量化: ${entry.embedding ? '是' : '否'}`);
    console.log(`  答案数量: ${entry.answers?.length || 0}`);

    if (entry.answers && entry.answers.length > 0) {
      console.log('\n  各期答案:');
      entry.answers.forEach(ans => {
        console.log(`\n    第${ans.period}期:`);
        console.log(`    来源: ${ans.source}`);
        console.log(`    有效期: ${ans.valid_from} 至 ${ans.valid_to}`);
        console.log(`    答案长度: ${ans.answer.length} 字符`);
        console.log(`    答案预览: ${ans.answer.substring(0, 100)}...`);
      });
    }
  } else {
    console.log('  未找到知识条目');
  }

  // 2. 测试向量搜索
  console.log('\n\n2. 测试向量搜索:');
  const testQueries = [
    '特药目录有哪些？',
    '癌症用药保障',
    '宁惠保特药清单',
  ];

  for (const query of testQueries) {
    console.log(`\n  查询: "${query}"`);
    const results = await searchKnowledgeByQuestion(query, 3);
    if (results.length > 0) {
      console.log(`  找到 ${results.length} 个结果`);
      results.forEach((result, index) => {
        console.log(`    ${index + 1}. ${result.std_question} (相似度: ${result.similarity.toFixed(3)})`);
        if (result.answers && result.answers.length > 0) {
          console.log(`       第${result.answers[0].period}期答案: ${result.answers[0].answer.substring(0, 80)}...`);
        }
      });
    } else {
      console.log('  未找到相关结果');
    }
  }

  console.log('\n验证完成！');
}

verifyImport().catch(console.error);