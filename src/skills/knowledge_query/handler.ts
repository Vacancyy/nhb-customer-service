// 知识库查询工具处理器（跨期版）

import { ToolHandler, ToolContext } from '../registry';
import { searchKnowledgeByQuestion } from '@/lib/knowledge/service';
import { ERROR_MESSAGES } from '@/lib/prompts';
import { logInfo, logError } from '@/lib/logger';

const handler: ToolHandler = async (args: Record<string, any>, context: ToolContext): Promise<string> => {
  const query = args.query || '';
  const period = args.period; // 可选：指定期数

  logInfo('[knowledge_query] called', { userId: context.userId, query, period });

  try {
    // 调用知识库向量搜索
    const results = await searchKnowledgeByQuestion(query, undefined, period);

    if (results.length === 0) {
      return `${ERROR_MESSAGES.KNOWLEDGE_NOT_FOUND}。【请直接告知用户，不要再调用工具】`;
    }

    // 格式化搜索结果，包含跨期答案 - 优化格式让LLM更容易理解
    const knowledgeContext = results
      .map((r, i) => {
        // 构建答案部分 - 突出显示答案内容
        let answerSection = '';
        if (r.answers && r.answers.length > 0) {
          answerSection = r.answers
            .map((a) => `【第${a.period}期答案 - 请直接引用此内容回答用户】\n${a.answer}\n（来源: ${a.source || '知识库'}）`)
            .join('\n');
        } else {
          answerSection = '（无跨期答案）';
        }

        // 构建关键词部分 - 提醒LLM必须包含这些关键词
        const keywordsSection = r.keywords && r.keywords.length > 0
          ? `【必须包含的关键词】: ${r.keywords.join(', ')}`
          : '';

        // 构建相似问题部分
        const similarSection = r.similar_questions && r.similar_questions.length > 0
          ? `相似问题: ${r.similar_questions.join(', ')}`
          : '';

        return `━━━ 知识库匹配结果 #${i + 1} ━━━
标准问题: ${r.std_question}
${keywordsSection}
${similarSection}

${answerSection}

匹配相似度: ${r.similarity.toFixed(2)} (${r.similarity >= 0.8 ? '高度匹配' : r.similarity >= 0.6 ? '中度匹配' : '基本匹配'})`;
      })
      .join('\n\n');

    // 添加明确的回答指引
    const answerGuidance = `
【回答指引】
1. 请使用第一条匹配结果的答案内容直接回答用户问题
2. 必须包含"必须包含的关键词"中的所有关键词
3. 不要对答案进行概括或省略，保持答案完整性
`;

    return `✅ 找到 ${results.length} 条相关知识:\n\n${knowledgeContext}\n\n${answerGuidance}`;
  } catch (error) {
    logError('[knowledge_query] 错误', { error: error instanceof Error ? error.message : String(error) });
    return `${ERROR_MESSAGES.KNOWLEDGE_NOT_FOUND}。【请直接告知用户，不要再调用工具】`;
  }
};

export default handler;