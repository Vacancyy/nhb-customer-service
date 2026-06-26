// 知识库查询工具处理器（跨期版）

import { ToolHandler, ToolContext } from '../registry';
import { searchKnowledgeByQuestion } from '@/lib/knowledge/service';
import { ERROR_MESSAGES } from '@/lib/prompts';
import { CURRENT_PERIOD } from '@/lib/knowledge/config';
import { logInfo, logError } from '@/lib/logger';

// 时间敏感关键词检测 - 涵盖所有可能导致 LLM 误解当前时间状态的词汇
const TIME_SENSITIVE_KEYWORDS = [
  '截止日期', '参保时间', '即日起', '销售期', '开放时间', '停售', '截止时间',
  '最后期限', '什么时候截止', '还能买', '现在参保', '当前', '目前', '今年',
  '明年', '去年', '暂未', '保障期', '生效时间', '立即参保', '请及时参保',
  '别错过', '尽早办理', '保障开始', '开放参保'
];

// 时间敏感场景标识
const TIME_SENSITIVE_SCENES = ['销售期-产品介绍'];

const handler: ToolHandler = async (args: Record<string, any>, context: ToolContext): Promise<string> => {
  const query = args.query || '';

  logInfo('[knowledge_query] called', { userId: context.userId, query, period: CURRENT_PERIOD });

  try {
    // 调用知识库向量搜索，传入当前期数，只查询当前期的答案
    const results = await searchKnowledgeByQuestion(query, undefined, CURRENT_PERIOD);

    if (results.length === 0) {
      return `${ERROR_MESSAGES.KNOWLEDGE_NOT_FOUND}。【请直接告知用户，不要再调用工具】`;
    }

    // 当前日期
    const now = new Date();
    const currentDateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

    // 格式化搜索结果 - 只保留当前期的有效答案，过滤掉过期答案
    const knowledgeContext = results
      .map((r, i) => {
        // 过滤答案：只保留当前期且未过期的答案
        const validAnswers = (r.answers || []).filter(a => {
          // 只保留当前期的答案
          if (a.period !== CURRENT_PERIOD) return false;
          // 过滤已过期答案
          const validToDate = a.valid_to ? new Date(a.valid_to + 'T23:59:59') : null;
          if (validToDate && validToDate < now) return false;
          return true;
        });

        // 如果当前期无有效答案，尝试用最近一期未过期答案作为备选（标注备选）
        let answersToUse = validAnswers;
        let isFallback = false;
        if (validAnswers.length === 0 && r.answers && r.answers.length > 0) {
          // 按期数降序排列，找最近一期未过期的
          const sorted = [...r.answers].sort((a, b) => b.period - a.period);
          for (const a of sorted) {
            const validToDate = a.valid_to ? new Date(a.valid_to + 'T23:59:59') : null;
            if (!validToDate || validToDate >= now) {
              answersToUse = [a];
              isFallback = true;
              break;
            }
          }
        }

        // 构建答案部分
        let answerSection = '';
        if (answersToUse.length > 0) {
          answerSection = answersToUse
            .map((a) => {
              const fallbackLabel = isFallback ? `⚠️【第${a.period}期备选答案，非当前第${CURRENT_PERIOD}期 - 如与当前期政策不符请告知用户以官方公告为准】` : `【第${CURRENT_PERIOD}期答案 - 请直接引用此内容回答用户】`;
              return `${fallbackLabel}\n有效期: ${a.valid_from || '未知'} 至 ${a.valid_to || '未知'}\n${a.answer}\n（来源: ${a.source || '知识库'}）`;
            })
            .join('\n');
        } else {
          answerSection = '（当前期无有效答案，全部已过期或不存在）';
        }

        // 构建关键词部分
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

    // 检测是否包含时间敏感内容
    const hasTimeSensitiveContent = results.some(r =>
      TIME_SENSITIVE_KEYWORDS.some(k => (r.keywords?.includes(k)) || (r.std_question?.includes(k)))
      || r.answers?.some(a => TIME_SENSITIVE_KEYWORDS.some(k => a.answer?.includes(k)))
      || (r.scene && TIME_SENSITIVE_SCENES.includes(r.scene))
    );

    // 检测是否使用了备选答案
    const hasFallbackAnswers = results.some(r => {
      const validAnswers = (r.answers || []).filter(a => {
        if (a.period !== CURRENT_PERIOD) return false;
        const validToDate = a.valid_to ? new Date(a.valid_to + 'T23:59:59') : null;
        if (validToDate && validToDate < now) return false;
        return true;
      });
      return validAnswers.length === 0;
    });

    // 添加明确的回答指引
    const timeSensitiveGuidance = hasTimeSensitiveContent
      ? `\n5. 当前日期为${currentDateStr}。如果知识库答案包含"即日起"、"截止日期"、"参保时间"、"开放时间"、"现在参保"、"请及时参保"、"别错过"、"尽早办理"等时间敏感或鼓励参保的信息，且当前日期已超过答案中的截止日期，必须告知用户该参保期已结束，当前无法参保，不要回复鼓励参保的措辞。后续是否开放新一期参保请以官方公告为准。`
      : '';

    const fallbackGuidance = hasFallbackAnswers
      ? `\n6. 部分结果使用了非当前期的备选答案，可能不完全适用于第${CURRENT_PERIOD}期宁惠保，回答时须提醒用户以官方公告为准。`
      : '';

    const answerGuidance = `
【回答指引】
1. 请使用第一条匹配结果的答案内容直接回答用户问题
2. 必须包含"必须包含的关键词"中的所有关键词
3. 不要对答案进行概括或省略，保持答案完整性
4. 电话号码、客服时间、保费金额、参保规则等时效性数据必须原样引用知识库内容，严禁使用自身记忆替代
${timeSensitiveGuidance}${fallbackGuidance}
`;

    return `✅ 找到 ${results.length} 条相关知识:\n\n${knowledgeContext}\n\n${answerGuidance}`;
  } catch (error) {
    logError('[knowledge_query] 错误', { error: error instanceof Error ? error.message : String(error) });
    return `${ERROR_MESSAGES.KNOWLEDGE_NOT_FOUND}。【请直接告知用户，不要再调用工具】`;
  }
};

export default handler;