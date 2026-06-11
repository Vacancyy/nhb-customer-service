// 检查伊那利塞片的查询情况
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { searchKnowledgeByQuestion, listKnowledge, getKnowledgeById } from '../src/lib/knowledge/service';

async function checkInalinib() {
  console.log('检查伊那利塞片查询情况...\n');

  // 1. 查询所有特药知识条目，看是否包含伊那利塞片
  console.log('1. 查询所有特药知识条目:');
  const { data: entries } = await listKnowledge({
    keyword: '伊那利塞',
    pageSize: 100,
  });

  console.log(`找到 ${entries.length} 个相关条目`);
  entries.forEach(entry => {
    console.log(`  - ${entry.std_question} (${entry.id})`);
  });

  // 2. 直接向量搜索测试
  console.log('\n2. 直接向量搜索测试:');
  const queries = [
    '伊那利塞片是否属于南京宁惠保特药目录',
    '伊那利塞片在特药范围内吗',
    '伊赫莱是特药吗',
    '伊那利塞片可以报销吗',
  ];

  for (const query of queries) {
    console.log(`\n查询: "${query}"`);
    const results = await searchKnowledgeByQuestion(query, 3);

    if (results.length > 0) {
      console.log(`找到 ${results.length} 个结果:`);
      results.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.std_question} (相似度: ${result.similarity.toFixed(3)})`);
        if (result.answers && result.answers.length > 0) {
          console.log(`     答案预览: ${result.answers[0].answer.substring(0, 100)}...`);
        }
      });
    } else {
      console.log('❌ 未找到任何结果');
    }
  }

  // 3. 查看伊那利塞片的详细信息
  console.log('\n3. 查看伊那利塞片知识条目详情:');
  const inalinibEntries = entries.filter(e => e.std_question.includes('伊那利塞片'));

  if (inalinibEntries.length > 0) {
    const entry = inalinibEntries[0];
    const fullEntry = await getKnowledgeById(entry.id);

    if (fullEntry) {
      console.log('条目详情:');
      console.log(`  ID: ${fullEntry.id}`);
      console.log(`  标准问题: ${fullEntry.std_question}`);
      console.log(`  检索文本: ${fullEntry.retrieval_text}`);
      console.log(`  是否向量化: ${fullEntry.embedding ? '是' : '否'}`);
      console.log(`  答案数量: ${fullEntry.answers?.length || 0}`);

      if (fullEntry.answers) {
        console.log(`  覆盖期数: ${fullEntry.answers.map(a => a.period).join(',')}`);
        fullEntry.answers.forEach(ans => {
          const isIncluded = ans.answer.includes('保障范围内') && !ans.answer.includes('不在保障范围内');
          console.log(`    第${ans.period}期: ${isIncluded ? '✅ 在保障范围' : '❌ 不在保障范围'}`);
        });
      }

      console.log(`  相似问题: ${fullEntry.similar_questions?.join(', ')}`);
      console.log(`  关键词: ${fullEntry.keywords?.join(', ')}`);
    }
  } else {
    console.log('❌ 未找到伊那利塞片的知识条目');
  }
}

checkInalinib().catch(console.error);