/**
 * 会话数据准确率测试脚本
 * 基于 CSV 会话日志测试 AI 客服准确率
 * 将用户问题发送给 AI，对比人工客服的回答
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

// 配置
const API_BASE = 'http://localhost:3000/nhb-customer-service/api/app-api';
const CSV_FILE = path.join(__dirname, '../docs/sessions_20260608_103120.csv');

// 会话消息结构
interface SessionMessage {
  sessionId: string;
  channelId: string;
  channelName: string;
  beginTime: string;
  endTime: string;
  agentId: string;
  agentName: string;
  visitorId: string;
  cusNickName: string;
  custSendMessageCount: number;
  finishedBy: string;
  msgIndex: number;
  msgId: string;
  msgType: string;
  content: string;
  fromUserName: string;
  toUserName: string;
  createTime: string;
}

// 解析 CSV 文件
function parseCSV(filePath: string): SessionMessage[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const messages: SessionMessage[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    const msg: SessionMessage = {
      sessionId: values[0] || '',
      channelId: values[1] || '',
      channelName: values[2] || '',
      beginTime: values[3] || '',
      endTime: values[4] || '',
      agentId: values[5] || '',
      agentName: values[6] || '',
      visitorId: values[7] || '',
      cusNickName: values[8] || '',
      custSendMessageCount: parseInt(values[9]) || 0,
      finishedBy: values[10] || '',
      msgIndex: parseInt(values[11]) || 0,
      msgId: values[12] || '',
      msgType: values[13] || '',
      content: values[14] || '',
      fromUserName: values[15] || '',
      toUserName: values[16] || '',
      createTime: values[17] || ''
    };

    messages.push(msg);
  }

  return messages;
}

// 解析 CSV 行（处理逗号和引号）
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

// 提取有效的问答对
function extractQuestionAnswerPairs(messages: SessionMessage[]): {
  question: string;
  humanAnswer: string;
  sessionId: string;
  visitorId: string;
}[] {
  const pairs: { question: string; humanAnswer: string; sessionId: string; visitorId: string }[] = [];

  // 按会话分组
  const sessionGroups: Map<string, SessionMessage[]> = new Map();
  for (const msg of messages) {
    if (!sessionGroups.has(msg.sessionId)) {
      sessionGroups.set(msg.sessionId, []);
    }
    sessionGroups.get(msg.sessionId)!.push(msg);
  }

  // 遍历每个会话，提取问答对
  for (const [sessionId, sessionMsgs] of sessionGroups) {
    // 过滤出用户问题（访客发送的消息）
    const userQuestions = sessionMsgs.filter(msg =>
      msg.msgType === 'text' &&
      msg.fromUserName !== msg.channelId && // 不是频道（机器人）发的
      !msg.content.includes('访客已离开') &&
      !msg.content.includes('访客回来了') &&
      !msg.content.includes('访客超时') &&
      !msg.content.includes('我是智能机器人') &&
      !msg.content.includes('人工') &&
      !msg.content.includes('问题列表中无您想咨询') &&
      msg.content.trim().length > 3 // 忽略短消息如"您好"、"好的"
    );

    // 过滤出人工客服回答（客服发送的有实质内容消息）
    const humanAnswers = sessionMsgs.filter(msg =>
      msg.msgType === 'text' &&
      msg.agentId && msg.agentId.trim() !== '' && // 有客服ID表示人工客服参与
      msg.fromUserName === msg.channelId && // 频道（客服）发的
      !msg.content.includes('访客已离开') &&
      !msg.content.includes('访客回来了') &&
      !msg.content.includes('访客超时') &&
      !msg.content.includes('我时刻都准备') &&
      !msg.content.includes('长时间未对话') &&
      !msg.content.includes('客服正在努力') &&
      !msg.content.includes('Hi，我是在线客服') &&
      !msg.content.includes('您好') &&
      msg.content.trim().length > 20 // 忽略短回复
    );

    // 匹配问题和回答（按时间顺序）
    for (const q of userQuestions) {
      // 找到该问题之后的人工回答
      const qTime = new Date(q.createTime).getTime();
      const matchingAnswer = humanAnswers.find(a =>
        new Date(a.createTime).getTime() > qTime &&
        a.sessionId === q.sessionId
      );

      if (matchingAnswer) {
        pairs.push({
          question: cleanContent(q.content),
          humanAnswer: cleanContent(matchingAnswer.content),
          sessionId: q.sessionId,
          visitorId: q.visitorId
        });
      }
    }
  }

  return pairs;
}

// 清理消息内容（去除HTML标签）
function cleanContent(content: string): string {
  // 去除 HTML 标签
  let cleaned = content.replace(/<[^>]*>/g, '');
  // 去除多余空格
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  // 去除特殊字符
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  return cleaned;
}

// 调用 Chat API（处理 SSE 流式响应）
async function callChat(question: string): Promise<{ answer: string; responseTime: number }> {
  const startTime = Date.now();

  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: 'session-test',
        visitorId: `test_${Date.now()}`,
        message: question
      })
    });

    // 处理 SSE 流式响应
    const text = await res.text();
    let fullAnswer = '';

    // 解析 SSE 格式: data: {type: "content", content: "..."}\n\n
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const jsonStr = line.substring(6).trim();
          if (jsonStr) {
            const data = JSON.parse(jsonStr);
            if (data.type === 'content' && data.content) {
              fullAnswer += data.content;
            } else if (data.type === 'done') {
              // 流结束
              break;
            }
          }
        } catch {
          // 解析失败，跳过
        }
      }
    }

    // 如果没有解析到内容，尝试直接解析为 JSON（兼容非流式响应）
    if (!fullAnswer) {
      try {
        const json = JSON.parse(text);
        fullAnswer = json.data?.message || '无回答';
      } catch {
        fullAnswer = text || '无回答';
      }
    }

    const responseTime = Date.now() - startTime;
    return { answer: fullAnswer, responseTime };
  } catch (e) {
    return { answer: `错误: ${e}`, responseTime: Date.now() - startTime };
  }
}

// 评估 AI 回答与人工回答的相似度
function evaluateResponse(
  aiAnswer: string,
  humanAnswer: string
): {
  similarity: number;
  isAcceptable: boolean;
  reason: string;
  matchedKeywords: string[];
} {
  const aiLower = aiAnswer.toLowerCase();
  const humanLower = humanAnswer.toLowerCase();

  // 提取人工回答中的关键词（数字、专有名词等）
  const numbers = humanAnswer.match(/\d+[.\d]*[%元万年月日个]/g) || [];
  const keyPhrases = extractKeyPhrases(humanAnswer);

  // 检查数字匹配
  const matchedNumbers = numbers.filter(n => aiAnswer.includes(n));
  const numberMatchRate = numbers.length > 0 ? matchedNumbers.length / numbers.length : 0;

  // 检查关键短语匹配
  const matchedPhrases = keyPhrases.filter(p => aiLower.includes(p.toLowerCase()));
  const phraseMatchRate = keyPhrases.length > 0 ? matchedPhrases.length / keyPhrases.length : 0;

  // 计算综合相似度
  const similarity = Math.round((numberMatchRate * 0.4 + phraseMatchRate * 0.6) * 100);

  // 判断是否可接受
  let isAcceptable = false;
  let reason = '';

  // 检查是否是无效回答
  const isInvalid = aiAnswer.includes('功能暂不可用') ||
    aiAnswer.includes('请联系人工') ||
    aiAnswer.includes('需要实名认证') ||
    aiAnswer.length < 30;

  if (isInvalid) {
    isAcceptable = false;
    reason = 'AI 回答无效或不完整';
  } else if (similarity >= 50) {
    isAcceptable = true;
    reason = `内容匹配度较高 (${similarity}%)`;
  } else if (similarity >= 30 && aiAnswer.length > 100) {
    isAcceptable = true;
    reason = `回答内容丰富 (${similarity}%)`;
  } else if (aiAnswer.length > 150) {
    isAcceptable = true;
    reason = '回答内容充实';
  } else {
    isAcceptable = false;
    reason = `内容匹配度不足 (${similarity}%)`;
  }

  return {
    similarity,
    isAcceptable,
    reason,
    matchedKeywords: [...matchedNumbers, ...matchedPhrases]
  };
}

// 提取关键短语
function extractKeyPhrases(text: string): string[] {
  const phrases: string[] = [];

  // 提取重要词汇（宁惠保、医保、理赔、保单等）
  const keywords = ['宁惠保', '医保', '理赔', '保单', '发票', '续保', '保障', '免赔额',
    '微信公众号', '支付宝', '下载', '查询', '报销', '保费', '参保'];

  for (const kw of keywords) {
    if (text.includes(kw)) {
      phrases.push(kw);
    }
  }

  // 提取渠道相关词汇
  const channels = ['公众号', '我的南京', '支付宝', '江苏人保'];
  for (const ch of channels) {
    if (text.includes(ch)) {
      phrases.push(ch);
    }
  }

  return phrases;
}

// 生成 CSV 报告
function generateCSVReport(results: any[]): string {
  const headers = [
    '序号', '用户问题', '人工回答摘要', 'AI回答摘要',
    '相似度%', '可接受', '原因', '命中关键词', '响应时间ms'
  ];

  const rows = results.map((r, i) => [
    i + 1,
    r.question.substring(0, 50),
    r.humanAnswer.substring(0, 80),
    r.aiAnswer.substring(0, 80),
    r.similarity,
    r.isAcceptable ? '是' : '否',
    r.reason,
    r.matchedKeywords.join(',') || '无',
    r.responseTime
  ]);

  const escape = (v: any) => {
    const s = String(v || '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const detailRows = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');

  // 添加汇总统计
  const total = results.length;
  const acceptable = results.filter(r => r.isAcceptable).length;
  const avgSimilarity = Math.round(results.reduce((s, r) => s + r.similarity, 0) / total);
  const avgResponseTime = Math.round(results.reduce((s, r) => s + r.responseTime, 0) / total);

  const summary = `
\n
===== 汇总统计 =====
总测试数,${total}
可接受数,${acceptable}
准确率,${Math.round(acceptable / total * 100)}%
平均相似度,${avgSimilarity}%
平均响应时间,${avgResponseTime}ms
`;

  return detailRows + summary;
}

// 主函数
async function main() {
  console.log('========== 会话数据准确率测试 ==========\n');

  // 1. 解析 CSV
  console.log('步骤1: 解析 CSV 会话数据...');
  const messages = parseCSV(CSV_FILE);
  console.log(`解析 ${messages.length} 条消息记录\n`);

  // 2. 提取问答对
  console.log('步骤2: 提取有效问答对...');
  const pairs = extractQuestionAnswerPairs(messages);
  console.log(`提取 ${pairs.length} 个有效问答对\n`);

  if (pairs.length === 0) {
    console.log('未找到有效的问答对，测试终止');
    return;
  }

  // 显示提取的问答
  console.log('提取的问答对:');
  pairs.forEach((p, i) => {
    console.log(`  ${i + 1}. 问: "${p.question.substring(0, 30)}..."`);
    console.log(`     答: "${p.humanAnswer.substring(0, 50)}..."`);
  });
  console.log('');

  // 3. 执行测试
  console.log('步骤3: 发送问题到 AI 客服...');
  const results: any[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    process.stdout.write(`[${i + 1}/${pairs.length}] "${pair.question.substring(0, 25)}..." `);

    const { answer: aiAnswer, responseTime } = await callChat(pair.question);
    const evaluation = evaluateResponse(aiAnswer, pair.humanAnswer);

    console.log(`${evaluation.isAcceptable ? '✓' : '✗'} (${evaluation.similarity}%) ${responseTime}ms`);

    results.push({
      question: pair.question,
      humanAnswer: pair.humanAnswer,
      aiAnswer,
      similarity: evaluation.similarity,
      isAcceptable: evaluation.isAcceptable,
      reason: evaluation.reason,
      matchedKeywords: evaluation.matchedKeywords,
      responseTime
    });

    await new Promise(r => setTimeout(r, 300));
  }

  // 4. 生成报告
  console.log('\n步骤4: 生成报告...');
  const csvReport = generateCSVReport(results);
  const filename = `docs/session-accuracy-report-${new Date().toISOString().slice(0, 10)}.csv`;
  fs.writeFileSync(filename, '\ufeff' + csvReport, 'utf-8');
  console.log(`报告已保存: ${filename}\n`);

  // 5. 汇总输出
  console.log('========== 测试汇总 ==========');

  const acceptable = results.filter(r => r.isAcceptable).length;
  const avgSimilarity = Math.round(results.reduce((s, r) => s + r.similarity, 0) / results.length);
  const avgResponseTime = Math.round(results.reduce((s, r) => s + r.responseTime, 0) / results.length);

  console.log(`\n测试总数: ${results.length}`);
  console.log(`可接受数: ${acceptable}`);
  console.log(`准确率: ${Math.round(acceptable / results.length * 100)}%`);
  console.log(`平均相似度: ${avgSimilarity}%`);
  console.log(`平均响应时间: ${avgResponseTime}ms`);

  // 不合格案例
  const unacceptable = results.filter(r => !r.isAcceptable);
  if (unacceptable.length > 0) {
    console.log(`\n【不合格案例】`);
    unacceptable.forEach(r => {
      console.log(`  问: "${r.question.substring(0, 30)}..."`);
      console.log(`  原因: ${r.reason}`);
    });
  }

  console.log('\n测试完成!');
}

main().catch(console.error);