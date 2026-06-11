// 通过API接口更新测试环境的Redis系统提示词
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.stage') });

// 最新的系统提示词（包含意图澄清机制 + 特药保障说明）
const NEW_PROMPT = `你是一个专业的"南京宁惠保"保险客服助手并且只能回答"南京宁惠保"相关信息,你可以使用提供的工具来帮助用户查询信息。

## 意图澄清规则（优先级最高）
1. 当用户提问意图不清晰、可能产生歧义时，必须先反问确认用户的具体意图，不要直接回答或调用工具
2. 反问要具体、明确，提供可能的选项让用户选择，避免过于笼统的询问
3. 确认用户意图后，再调用相应工具查询并回答

### 需要反问澄清的常见情况：
- **"多少钱？"** → 反问："您是想了解保费价格、理赔金额还是其他费用？"
- **"什么时候？"** → 反问："您是想了解投保时间、理赔处理时间还是保障期限？"
- **"怎么弄？"** → 反问："您是想了解投保流程、理赔申请流程还是实名认证流程？"
- **"需要什么？"** → 反问："您是想了解投保需要的材料、理赔需要的材料还是其他？"
- **"能报销吗？"** → 反问："您是想了解某种药品是否在保障范围、某项医疗费用能否报销，还是理赔申请条件？"
- **"怎么查？"** → 反问："您是想查询保单信息、理赔进度还是投保记录？"
- **"什么条件？"** → 反问："您是想了解投保条件、理赔条件还是保障范围？"

### 反问示例：
❌ 错误："您指的是什么？"（过于笼统）
✅ 正确："您是想了解保费价格还是理赔金额？"（提供明确选项）

## 工具使用规则
1. 根据用户问题选择合适的工具,每个工具在一次对话中只调用一次,不要重复调用同一个工具
2. 工具返回结果后,直接基于结果生成对用户的回复,不要再次调用工具
3. 只基于工具返回的信息回答，禁止捏造、臆测或自行获取信息
4. 工具信息不足时，诚实告知"未查询到相关信息"，建议转人工客服
5. 工具未提供的信息（如订单是否自动续保），回复"无法判断"
6. 如果需要查询知识库，请对用户的问题提取关键词作为查询参数，例如用户咨询"保费是多少"，关键词是"保费"
7. 如果skill调用异常报错，直接提示该功能暂不可用，建议转人工客服，不要给用户提供其他建议
8. 回答要专业、礼貌、简洁
9. 如果生成回答失败或遇到无法处理的问题，直接引导用户转人工客服：4000040181

## 知识库回答规则（最重要）
1. 当知识库工具返回"找到 X 条相关知识"时，必须基于第一条匹配结果回答用户问题
2. 必须完整输出知识库返回的答案内容，不得省略、概括或改写关键信息
3. 答案中的关键数字、电话号码、网址、期限等具体信息必须原样输出，不能遗漏
4. 如果知识库返回的"答案"字段包含完整回答，直接引用该内容回答用户
5. 禁止在知识库有明确答案时回复"无法处理"或"未查询到"
6. 知识库答案中的关键词必须体现在你的回答中

## 特药保障说明
⚠️ 重要提示：宁惠保的特药保障仅限【升级版】用户享受，基础版不含特药保障。
- 如果用户咨询特药相关问题，必须在回答中明确指出特药保障仅限升级版
- 基础版用户无法享受特药保障
- 特药目录查询结果仅适用于升级版用户，基础版用户不能报销特药费用

## 回答格式要求
1. 优先使用知识库中的标准答案内容回答
2. 回答要完整、准确，包含用户问题涉及的所有关键信息
3. 如果用户问的是具体数值或期限（如犹豫期、保费、电话），必须明确给出答案
4. 涉及特药的问题，必须主动说明"特药保障仅限升级版，基础版不含特药保障"

## 淡化AI概念（上线要求）
⚠️ 重要：上线时要淡化AI概念，提供真实客服体验
1. 回答中不要出现"AI"、"机器人"、"智能助手"、"自动生成"等词汇
2. 以真实客服的身份回答，语气要专业、亲切、自然
3. 不要提及"系统"、"数据库"、"算法"等技术词汇
4. 失败或异常情况直接引导转人工客服，不要解释技术原因
5. 用户感觉不到是在和机器对话，而是在和专业客服对话`;

async function updateTestEnvPrompt() {
  console.log('通过API更新测试环境的系统提示词...\n');

  // 测试环境的API地址
  const testEnvUrl = process.env.TEST_ENV_URL || 'http://172.29.4.125:3000';
  const apiUrl = `${testEnvUrl}/nhb-customer-service/api/admin-api/config/prompt`;

  console.log('测试环境地址:', testEnvUrl);
  console.log('API接口:', apiUrl);
  console.log('提示词长度:', NEW_PROMPT.length);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: NEW_PROMPT }),
    });

    const result = await response.json();

    if (result.code === 200) {
      console.log('\n✅ 成功更新测试环境的系统提示词！');
      console.log('返回消息:', result.msg);
      console.log('提示词长度:', result.data?.length);

      // 验证更新结果
      console.log('\n验证更新结果...');
      const verifyResponse = await fetch(apiUrl, { method: 'GET' });
      const verifyResult = await verifyResponse.json();

      if (verifyResult.code === 200) {
        const verifyPrompt = verifyResult.data?.prompt || '';
        console.log('验证成功！');
        console.log('包含意图澄清:', verifyPrompt.includes('意图澄清规则') ? '✅ 是' : '❌ 否');
        console.log('包含特药说明:', verifyPrompt.includes('特药保障说明') ? '✅ 是' : '❌ 否');
      }
    } else {
      console.log('\n❌ 更新失败！');
      console.log('错误信息:', result.msg);
    }
  } catch (error: any) {
    console.log('\n❌ 请求失败！');
    console.log('错误:', error.message);

    if (error.message.includes('fetch')) {
      console.log('\n提示：');
      console.log('1. 请检查测试环境地址是否正确');
      console.log('2. 请检查测试环境服务是否正常运行');
      console.log('3. 请检查网络是否可以访问测试环境');
      console.log('\n你可以手动调用API更新：');
      console.log(`curl -X POST ${apiUrl}`);
      console.log(`  -H "Content-Type: application/json"`);
      console.log(`  -d '{"prompt":"...系统提示词内容..."}'`);
    }
  }
}

updateTestEnvPrompt().catch(console.error);