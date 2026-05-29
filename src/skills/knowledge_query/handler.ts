// 知识库查询工具处理器（跨期版）

import { ToolHandler, ToolContext } from '../registry';
import { searchKnowledgeByQuestion } from '@/lib/knowledge/service';
import { ERROR_MESSAGES } from '@/lib/prompts';
import { logInfo, logError } from '@/lib/logger';

const handler: ToolHandler = async (args: Record<string, any>, context: ToolContext): Promise<string> => {
  const query = args.query || '';
  const period = args.period; // 可选：指定期数

  logInfo('[knowledge_query] called', { userId: context.userId, query, period });

  // 调用知识库向量搜索
  const results = await searchKnowledgeByQuestion(query, undefined, period);

  if (results.length === 0) {
    return `${ERROR_MESSAGES.KNOWLEDGE_NOT_FOUND}。【请直接告知用户，不要再调用工具】`;
  }

  // 格式化搜索结果，包含跨期答案
  const knowledgeContext = results
    .map((r, i) => {
      // 构建答案部分
      let answerSection = '';
      if (r.answers && r.answers.length > 0) {
        answerSection = r.answers
          .map((a) => `【第${a.period}期】\n答案: ${a.answer}\n来源: ${a.source || '未知'}`)
          .join('\n');
      } else {
        answerSection = '（无跨期答案）';
      }

      // 构建相似问题部分
      const similarSection = r.similar_questions && r.similar_questions.length > 0
        ? `相似问题: ${r.similar_questions.join(', ')}`
        : '';

      // 构建关键词部分
      const keywordsSection = r.keywords && r.keywords.length > 0
        ? `关键词: ${r.keywords.join(', ')}`
        : '';

      return `[${i + 1}] 标准问题: ${r.std_question}
分类: ${r.category || '未分类'}
意图: ${r.intent || '未标记'}
场景: ${r.scene || '未标记'}
答案模式: ${r.answer_mode || '未指定'}
需核实: ${r.requires_verification || '未指定'}
${similarSection}
${keywordsSection}

跨期答案:
${answerSection}

相似度: ${r.similarity.toFixed(2)}`;
    })
    .join('\n\n');

  return `找到 ${results.length} 条相关知识:\n\n${knowledgeContext}`;
};

export default handler;