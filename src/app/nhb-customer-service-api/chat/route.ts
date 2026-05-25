import { NextRequest, NextResponse } from 'next/server';
import { skillRegistry, loadAllSkills, SkillSelectionResult } from '@/skills';
import {
  initSession,
  buildModelMessages,
  saveUserMessage,
  saveAssistantMessage,
  DEFAULT_CHANNEL,
} from '@/lib/session';

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_CHAT_MODEL = process.env.DASHSCOPE_CHAT_MODEL;
const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

// 初始化加载所有技能
let skillsLoaded = false;
function ensureSkillsLoaded() {
  if (!skillsLoaded) {
    loadAllSkills();
    skillsLoaded = true;
  }
}

// 调用千问模型
async function callQwen(messages: Array<{ role: string; content: string }>): Promise<string> {
  const response = await fetch(DASHSCOPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: DASHSCOPE_CHAT_MODEL,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`千问 API 调用失败: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// 解析模型返回的技能选择结果
function parseSkillSelection(response: string, fallbackMessage: string): SkillSelectionResult {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as SkillSelectionResult;
    }
  } catch {
    // 解析失败
  }
  return { skill: 'general', params: { query: fallbackMessage }, reason: '无法解析技能选择' };
}

export async function POST(req: NextRequest) {
  try {
    ensureSkillsLoaded();

    if (!DASHSCOPE_API_KEY) {
      return NextResponse.json(
        { code: 500, msg: 'API Key 未配置', data: null },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { message, userId, channel } = body;

    // 1. 初始化用户会话（userId 为空则生成新的，channel 为空则使用 default）
    const session = await initSession(userId, channel);

    // 2. 保存用户消息到历史
    await saveUserMessage(session.userId, session.channel, message);

    // 3. 构建包含历史的消息列表
    const skillPrompt = skillRegistry.buildSelectionPrompt();
    const messages = await buildModelMessages(session.userId, session.channel, skillPrompt, message);

    // 4. 调用模型选择技能
    const skillResponse = await callQwen(messages);
    const skillResult = parseSkillSelection(skillResponse, message);

    // 5. 执行技能处理
    const context = {
      userId: session.userId,
      channel: session.channel,
      originalMessage: message,
    };

    const reply = await skillRegistry.execute(skillResult.skill, skillResult.params, context);

    // 6. 保存助手回复到历史
    await saveAssistantMessage(session.userId, session.channel, reply, skillResult.skill);

    // 7. 返回响应
    return NextResponse.json({
      code: 200,
      msg: '',
      data: {
        message: reply,
        skill: skillResult.skill,
        params: skillResult.params,
        reason: skillResult.reason,
        userId: session.userId,
        channel: session.channel,
        isNewUser: session.isNewUser,
      },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : '系统异常，请稍后重试';
    return NextResponse.json(
      { code: 500, msg: errMsg, data: null },
      { status: 500 }
    );
  }
}