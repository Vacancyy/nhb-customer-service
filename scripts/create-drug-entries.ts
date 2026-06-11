// 为每个特药创建单独的知识条目，实现精确查询
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { createKnowledge, embedKnowledgeBatch } from '../src/lib/knowledge/service';
import { CreateKnowledgeInput } from '../src/lib/knowledge/types';
import XLSX from 'xlsx';

interface DrugData {
  product_set_code: string;
  drug_name: string;
  general_name: string;
}

async function createDrugKnowledgeEntries() {
  console.log('开始为每个特药创建知识条目...\n');

  // 读取Excel文件
  const filePath = path.join(__dirname, '../docs/特药清单.xls');
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData: DrugData[] = XLSX.utils.sheet_to_json(worksheet);

  // 产品集到期数的映射
  const periodMapping: Record<string, number> = {
    'ninghuibaoV3': 3,
    'ninghuibaoV4': 4,
    'ninghuibaoV5': 5,
    'ninghuibaoV6': 6,
  };

  // 按药品通用名分组（同一个药品可能在多期都存在）
  const drugsByName = new Map<string, { periods: number[]; drugNames: string[]; generalName: string }>();

  jsonData.forEach(row => {
    const period = periodMapping[row.product_set_code];
    const key = row.general_name; // 使用通用名作为key

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
  const drugEntries: { name: string; periods: number[] }[] = [];

  drugsByName.forEach((info, generalName) => {
    // 构建检索文本（包含商品名和通用名）
    const retrievalText = `${generalName} ${info.drugNames.join(' ')} 特药 特药目录 宁惠保特药 ${generalName}是特药吗 ${info.drugNames[0]}在特药范围内吗`;

    // 标准问题
    const stdQuestion = `${generalName}在宁惠保特药范围内吗？`;

    // 构建各期答案
    const answers = info.periods.map(period => {
      const periodData = jsonData.filter(row =>
        periodMapping[row.product_set_code] === period &&
        row.general_name === generalName
      );

      const drugList = periodData.map(row => `${row.drug_name}（${row.general_name}）`).join('、');

      const answer = `${generalName}在宁惠保第${period}期特药保障范围内。

商品名：${drugList}

说明：
✓ 该药品属于特药目录，可在保障范围内报销
✓ 使用该特药需符合适应症限制
✓ 特药理赔需提供相关医疗证明和用药证明
✓ 具体理赔流程请咨询客服热线 4000040181`;

      const validYear = 2020 + period;
      return {
        period,
        answer,
        source: `${period}期特药清单`,
        std_question_period: `${generalName}在宁惠保第${period}期特药范围内吗？`,
        valid_from: `${validYear}-01-01`,
        valid_to: `${validYear}-12-31`,
      };
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

    drugEntries.push({
      name: generalName,
      periods: info.periods,
    });
  });

  // 批量创建（分批处理，避免一次性创建太多）
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
        console.log(`  ✓ 创建成功: ${input.std_question} (${entry.id})`);
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

  // 统计信息
  console.log('\n导入统计:');
  console.log(`  特药种类: ${drugsByName.size}`);
  console.log(`  创建条目: ${createdIds.length}`);

  // 打印一些样本
  console.log('\n部分特药列表:');
  drugEntries.slice(0, 10).forEach((drug, index) => {
    console.log(`  ${index + 1}. ${drug.name} (适用期数: ${drug.periods.join(', ')})`);
  });

  console.log('\n完成！');
}

createDrugKnowledgeEntries().catch(console.error);