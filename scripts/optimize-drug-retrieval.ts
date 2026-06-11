// 更新特药清单的检索文本，优化向量搜索效果
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { updateKnowledge, embedKnowledgeById, getKnowledgeById } from '../src/lib/knowledge/service';

async function optimizeRetrieval() {
  const knowledgeId = '3a9db8e0-2292-4ede-9dae-6a0e68f0bfb4';

  console.log('优化检索文本...\n');

  // 更新检索文本，加入更多关键词和相似问题
  const newRetrievalText = `特药目录 特药清单 特药保障 癌症用药 特药报销 特药查询 特药名单 特药范围 特药列表 宁惠保特药 特药目录有哪些 特药保障范围 癌症特药 哪些特药 特药品种`;

  await updateKnowledge(knowledgeId, {
    retrieval_text: newRetrievalText,
    similar_questions: [
      '宁惠保包含哪些特药？',
      '特药目录是什么？',
      '有什么特药保障？',
      '癌症用药有哪些？',
      '特药清单查询',
      '宁惠保特药名单',
      '特药目录有哪些？',
      '宁惠保特药有哪些品种？',
      '特药保障范围是什么？',
      '特药包含哪些药品？',
    ],
    keywords: [
      '特药',
      '目录',
      '清单',
      '癌症',
      '用药',
      '保障',
      '名单',
      '品种',
      '范围',
      '药品',
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

  console.log('\n优化完成！');
}

optimizeRetrieval().catch(console.error);