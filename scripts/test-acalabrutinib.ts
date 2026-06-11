// 测试阿可替尼胶囊查询问题
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { searchKnowledgeByQuestion, getKnowledgeById } from '../src/lib/knowledge/service';

async function testAcalabrutinibQuery() {
  console.log('测试阿可替尼胶囊查询...\n');

  // 测试多种查询方式
  const queries = [
    '阿可替尼胶囊是否在特药中？',
    '阿可替尼胶囊在特药范围内吗？',
    '阿可替尼是特药吗？',
    '康可期在特药目录里吗？',
    'Acalabrutinib属于特药保障吗？',
  ];

  for (const query of queries) {
    console.log(`\n查询: "${query}"`);
    const results = await searchKnowledgeByQuestion(query, 5);

    if (results.length > 0) {
      console.log(`找到 ${results.length} 个结果:`);
      results.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.std_question} (相似度: ${result.similarity.toFixed(3)})`);

        // 检查是否是阿可替尼相关的条目
        if (result.std_question.includes('阿可替尼') || result.std_question.includes('康可期')) {
          console.log(`     ✓ 这是阿可替尼相关条目`);
          if (result.answers && result.answers.length > 0) {
            const latestAnswer = result.answers[0];
            console.log(`     第${latestAnswer.period}期答案: ${latestAnswer.answer.substring(0, 150)}...`);
          }
        }
      });
    } else {
      console.log('未找到相关结果');
    }
  }

  // 直接查询阿可替尼的知识条目ID（从导入日志中查找）
  console.log('\n\n直接查询阿可替尼胶囊知识条目:');
  const acalabrutinibId = '9603e1ec-44f4-4559-8a95-0eea1c29c57b'; // 从导入日志中的ID

  const entry = await getKnowledgeById(acalabrutinibId);
  if (entry) {
    console.log('找到条目:', entry.std_question);
    console.log('检索文本:', entry.retrieval_text);
    console.log('相似问题:', entry.similar_questions);
    console.log('关键词:', entry.keywords);
    console.log('是否已向量化:', entry.embedding ? '是' : '否');
    console.log('答案数量:', entry.answers?.length || 0);

    if (entry.answers && entry.answers.length > 0) {
      console.log('\n各期答案:');
      entry.answers.forEach(ans => {
        console.log(`  第${ans.period}期: ${ans.answer.substring(0, 100)}...`);
      });
    }
  } else {
    console.log('未找到该条目');
  }
}

testAcalabrutinibQuery().catch(console.error);