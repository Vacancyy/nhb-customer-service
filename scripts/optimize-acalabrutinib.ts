// 优化阿可替尼胶囊的检索文本，提高识别准确度
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { updateKnowledge, embedKnowledgeById, getKnowledgeById } from '../src/lib/knowledge/service';

async function optimizeAcalabrutinib() {
  const knowledgeId = '9603e1ec-44f4-4559-8a95-0eea1c29c57b'; // 阿可替尼胶囊

  console.log('优化阿可替尼胶囊的检索文本...\n');

  // 更新检索文本，加入更多区分性关键词
  const newRetrievalText = `阿可替尼胶囊 康可期 Acalabrutinib 阿可替尼 特药 特药目录 宁惠保特药 阿可替尼胶囊是特药吗 康可期在特药范围内吗 阿可替尼胶囊报销 阿可替尼胶囊保障范围 康可期药品 康可期特药 阿可替尼在特药吗 阿可替尼胶囊特药查询`;

  await updateKnowledge(knowledgeId, {
    retrieval_text: newRetrievalText,
    similar_questions: [
      '阿可替尼胶囊是特药吗？',
      '康可期在特药目录里吗？',
      '宁惠保包含阿可替尼胶囊吗？',
      '阿可替尼胶囊能报销吗？',
      '康可期属于特药保障吗？',
      '阿可替尼胶囊是否在特药中？',
      '阿可替尼在特药保障范围吗？',
      '康可期药品可以报销吗？',
      '阿可替尼胶囊特药查询',
    ],
    keywords: [
      '阿可替尼胶囊',
      '康可期',
      'Acalabrutinib',
      '阿可替尼',
      '特药',
      '保障',
      '报销',
      '药品',
      '胶囊',
    ],
  });

  console.log('检索文本已更新');

  // 重新向量化
  console.log('\n重新向量化...');
  await embedKnowledgeById(knowledgeId);
  console.log('向量化完成');

  // 验证更新结果
  console.log('\n验证更新结果:');
  const entry = await getKnowledgeById(knowledgeId);
  console.log('检索文本:', entry?.retrieval_text);
  console.log('相似问题:', entry?.similar_questions);
  console.log('关键词:', entry?.keywords);

  console.log('\n优化完成！');
}

optimizeAcalabrutinib().catch(console.error);