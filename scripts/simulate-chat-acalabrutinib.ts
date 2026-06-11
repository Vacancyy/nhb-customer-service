// 模拟完整的聊天流程测试阿可替尼查询
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { searchKnowledgeByQuestion } from '../src/lib/knowledge/service';

async function simulateChatFlow() {
  console.log('模拟完整聊天流程测试阿可替尼查询...\n');

  // 用户的原始查询（各种可能的措辞）
  const userQueries = [
    '阿可替尼胶囊是否在特药中？',
    '康可期是特药吗',
    '我想知道阿可替尼在不在保障范围',
    '阿可替尼胶囊可以报销吗',
    '宁惠保有没有阿可替尼这个药',
  ];

  for (const userQuery of userQueries) {
    console.log(`\n========================================`);
    console.log(`用户问题: "${userQuery}"`);
    console.log(`========================================`);

    // 调用知识库查询（模拟knowledge_query工具）
    const results = await searchKnowledgeByQuestion(userQuery, 3);

    if (results.length === 0) {
      console.log('❌ 知识库未找到相关结果');
      continue;
    }

    // 模拟handler.ts的格式化逻辑
    const knowledgeContext = results
      .map((r, i) => {
        let answerSection = '';
        if (r.answers && r.answers.length > 0) {
          answerSection = r.answers
            .map((a) => `【第${a.period}期答案 - 请直接引用此内容回答用户】\n${a.answer}\n（来源: ${a.source || '知识库'}）`)
            .join('\n');
        } else {
          answerSection = '（无跨期答案）';
        }

        const keywordsSection = r.keywords && r.keywords.length > 0
          ? `【必须包含的关键词】: ${r.keywords.join(', ')}`
          : '';

        return `━━━ 知识库匹配结果 #${i + 1} ━━━
标准问题: ${r.std_question}
${keywordsSection}

${answerSection}

匹配相似度: ${r.similarity.toFixed(2)} (${r.similarity >= 0.8 ? '高度匹配' : r.similarity >= 0.6 ? '中度匹配' : '基本匹配'})`;
      })
      .join('\n\n');

    console.log('知识库返回给LLM的内容:');
    console.log(knowledgeContext);

    // 判断是否能回答
    const topResult = results[0];
    if (topResult.similarity >= 0.5 && topResult.answers && topResult.answers.length > 0) {
      console.log('\n✅ 应该能回答:');
      const topAnswer = topResult.answers[0];
      console.log(`   根据第${topAnswer.period}期答案回答`);
      console.log(`   答案预览: ${topAnswer.answer.substring(0, 100)}...`);
    } else {
      console.log('\n❌ 可能无法回答:');
      if (!topResult.answers || topResult.answers.length === 0) {
        console.log('   原因: 没有答案内容');
      } else if (topResult.similarity < 0.5) {
        console.log('   原因: 相似度过低');
      }
    }
  }
}

simulateChatFlow().catch(console.error);