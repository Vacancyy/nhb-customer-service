// 将特药清单导入到测试环境数据库（直接设置环境变量）
import dotenv from 'dotenv';
import path from 'path';

// 先清除可能存在的本地环境变量
delete process.env.PG_HOST;
delete process.env.PG_PORT;
delete process.env.PG_DATABASE;
delete process.env.PG_USER;
delete process.env.PG_PASSWORD;
delete process.env.DASHSCOPE_API_KEY;

// 强制加载测试环境配置（不使用默认的.env.local）
const stageEnvPath = path.join(__dirname, '../', '.env.stage');
const stageEnv = dotenv.config({ path: stageEnvPath });

if (stageEnv.error) {
  console.error('无法加载 .env.stage 文件:', stageEnv.error);
  process.exit(1);
}

// 确认连接的是测试环境数据库
console.log('测试环境数据库配置:');
console.log(`  PG_HOST: ${process.env.PG_HOST}`);
console.log(`  PG_PORT: ${process.env.PG_PORT}`);
console.log(`  PG_DATABASE: ${process.env.PG_DATABASE}`);
console.log(`  PG_USER: ${process.env.PG_USER}`);

if (process.env.PG_HOST !== '172.29.4.125') {
  console.error('\n❌ 错误：当前连接的不是测试环境数据库！');
  process.exit(1);
}

console.log('\n✅ 确认连接测试环境数据库');

// 现在导入依赖（它们会使用测试环境的配置）
import { createKnowledge, embedKnowledgeBatch } from '../src/lib/knowledge/service';
import { CreateKnowledgeInput, CreateKnowledgeAnswerInput } from '../src/lib/knowledge/types';
import XLSX from 'xlsx';

interface DrugData {
  product_set_code: string;
  drug_name: string;
  general_name: string;
}

async function importDrugsToStage() {
  console.log('\n开始导入特药数据到测试环境...\n');

  // 读取Excel文件
  const filePath = path.join(__dirname, '../docs/特药清单.xls');
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData: DrugData[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(`读取到 ${jsonData.length} 条特药记录`);

  // 产品集到期数的映射
  const periodMapping: Record<string, number> = {
    'ninghuibaoV3': 3,
    'ninghuibaoV4': 4,
    'ninghuibaoV5': 5,
    'ninghuibaoV6': 6,
  };

  // 按药品通用名分组
  const drugsByName = new Map<string, { periods: number[]; drugNames: string[]; generalName: string }>();

  jsonData.forEach(row => {
    const period = periodMapping[row.product_set_code];
    const key = row.general_name;

    if (!drugsByName.has(key)) {
      drugsByName.set(key, {
        periods: [],
        drugNames: [],
        generalName: row.general_name,
      });
    }

    const drugInfo = drugsByName.get(key)!;
    if (!drugInfo.periods.includes(period)) {
      drugInfo.periods.push(period);
    }
    if (!drugInfo.drugNames.includes(row.drug_name)) {
      drugInfo.drugNames.push(row.drug_name);
    }
  });

  console.log(`共有 ${drugsByName.size} 种不同的特药`);

  // 批量创建知识条目
  const knowledgeInputs: CreateKnowledgeInput[] = [];

  drugsByName.forEach((info, generalName) => {
    const retrievalText = `${generalName} ${info.drugNames.join(' ')} 特药 特药目录 宁惠保特药 ${generalName}是特药吗 ${info.drugNames[0]}在特药范围内吗`;
    const stdQuestion = `${generalName}在宁惠保特药范围内吗？`;

    // 构建所有期数的答案（包含"在"和"不在"的答案）
    const allPeriods = [3, 4, 5, 6];
    const answers: CreateKnowledgeAnswerInput[] = [];

    allPeriods.forEach(period => {
      const isIncluded = info.periods.includes(period);
      const validYear = 2020 + period;

      if (isIncluded) {
        // 在保障范围内
        const periodData = jsonData.filter(row =>
          periodMapping[row.product_set_code] === period &&
          row.general_name === generalName
        );
        const drugList = periodData.map(row => `${row.drug_name}（${row.general_name}）`).join('、');

        answers.push({
          period,
          answer: `${generalName}在宁惠保第${period}期特药保障范围内。

商品名：${drugList}

说明：
✓ 该药品属于特药目录，可在保障范围内报销
✓ 使用该特药需符合适应症限制
✓ 特药理赔需提供相关医疗证明和用药证明
✓ 具体理赔流程请咨询客服热线 4000040181`,
          source: `${period}期特药清单`,
          std_question_period: `${generalName}在宁惠保第${period}期特药范围内吗？`,
          valid_from: `${validYear}-01-01`,
          valid_to: `${validYear}-12-31`,
        });
      } else {
        // 不在保障范围内
        answers.push({
          period,
          answer: `${generalName}在宁惠保第${period}期特药保障范围内吗？

❌ 不在保障范围内

${generalName}在宁惠保第${period}期特药目录中未包含。

该药品曾在第${info.periods.length > 0 ? `第${info.periods.join('、')}期` : '早期'}特药目录中${info.periods.length > 0 ? '有包含' : '可能有包含'}，但在第${period}期已${info.periods.length > 0 ? '移除' : '未纳入'}。

如需查询其他期数的特药信息，请明确指明期数或咨询客服热线 4000040181。`,
          source: `${period}期特药清单（未包含）`,
          std_question_period: `${generalName}在宁惠保第${period}期特药范围内吗？`,
          valid_from: `${validYear}-01-01`,
          valid_to: `${validYear}-12-31`,
        });
      }
    });

    knowledgeInputs.push({
      std_question: stdQuestion,
      retrieval_text: retrievalText,
      category: '保障范围',
      intent: 'coverage_query',
      scene: '保障期-特药查询',
      answer_mode: 'multi_period',
      requires_verification: 'never',
      requires_business_confirm: false,
      similar_questions: [
        `${generalName}是特药吗？`,
        `${info.drugNames[0]}在特药目录里吗？`,
        `宁惠保包含${generalName}吗？`,
        `${generalName}能报销吗？`,
        `${info.drugNames[0]}属于特药保障吗？`,
      ],
      keywords: [
        generalName,
        ...info.drugNames,
        '特药',
        '保障',
        '报销',
      ],
      channels: ['all'],
      answers,
    });
  });

  // 批量创建知识条目
  console.log('\n开始创建知识条目...');
  const batchSize = 10;
  const createdIds: string[] = [];

  for (let i = 0; i < knowledgeInputs.length; i += batchSize) {
    const batch = knowledgeInputs.slice(i, i + batchSize);
    console.log(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(knowledgeInputs.length / batchSize)}...`);

    for (const input of batch) {
      try {
        const entry = await createKnowledge(input);
        createdIds.push(entry.id);
        console.log(`  ✓ 创建成功: ${input.std_question}`);
      } catch (error: any) {
        console.error(`  ✗ 创建失败: ${input.std_question} - ${error.message}`);
      }
    }
  }

  console.log(`\n成功创建 ${createdIds.length} 个知识条目`);

  // 批量向量化
  console.log('\n开始批量向量化...');
  const result = await embedKnowledgeBatch(createdIds);
  console.log(`向量化完成: 成功 ${result.success}, 失败 ${result.failed}`);

  if (result.errors.length > 0) {
    console.log('向量化错误:');
    result.errors.forEach(err => console.log(`  - ${err}`));
  }

  console.log('\n导入到测试环境完成！');
}

importDrugsToStage().catch(console.error);