// 将特药清单导入知识库的脚本
import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量（根据APP_ENV加载对应的.env文件）
const env = process.env.APP_ENV || 'local';
const envPath = path.join(__dirname, '../', `.env.${env}`);
dotenv.config({ path: envPath });

// 如果没有找到对应的环境文件，尝试加载.env.local
if (!process.env.PG_HOST) {
  dotenv.config({ path: path.join(__dirname, '../', '.env.local') });
}

import { createKnowledge, listKnowledge, updateAnswersBatch, embedKnowledgeById } from '../src/lib/knowledge/service';
import { CreateKnowledgeInput, CreateKnowledgeAnswerInput } from '../src/lib/knowledge/types';
import XLSX from 'xlsx';

interface DrugData {
  product_set_code: string;
  drug_name: string;
  general_name: string;
}

async function importDrugList() {
  console.log('开始导入特药清单...');

  // 读取Excel文件
  const filePath = path.join(__dirname, '../docs/特药清单.xls');
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData: DrugData[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(`读取到 ${jsonData.length} 条特药记录`);

  // 按产品集（期数）分组
  const drugsByPeriod = new Map<string, DrugData[]>();
  jsonData.forEach(row => {
    const periodCode = row.product_set_code;
    if (!drugsByPeriod.has(periodCode)) {
      drugsByPeriod.set(periodCode, []);
    }
    drugsByPeriod.get(periodCode)!.push(row);
  });

  console.log('\n各期特药数量:');
  drugsByPeriod.forEach((drugs, period) => {
    console.log(`  ${period}: ${drugs.length} 种`);
  });

  // 将产品集代码转换为期数
  const periodMapping: Record<string, number> = {
    'ninghuibaoV3': 3,
    'ninghuibaoV4': 4,
    'ninghuibaoV5': 5,
    'ninghuibaoV6': 6,
  };

  // 构建各期答案
  const answers: CreateKnowledgeAnswerInput[] = [];

  drugsByPeriod.forEach((drugs, periodCode) => {
    const period = periodMapping[periodCode];
    if (!period) {
      console.warn(`未知的期数代码: ${periodCode}`);
      return;
    }

    // 构建该期的特药列表答案
    const drugList = drugs.map(drug =>
      `${drug.drug_name}（${drug.general_name}）`
    ).join('\n');

    const answer = `宁惠保第${period}期特药目录清单（共${drugs.length}种）：

${drugList}

说明：
1. 以上特药均在保障范围内
2. 使用特药需符合适应症限制
3. 特药理赔需提供相关医疗证明
4. 具体用药咨询请联系客服热线 4000040181`;

    const validYear = 2020 + period; // V6对应2026年（六期）
    answers.push({
      period,
      answer,
      source: `${period}期特药清单`,
      std_question_period: `宁惠保第${period}期特药目录有哪些？`,
      valid_from: `${validYear}-01-01`,
      valid_to: `${validYear}-12-31`,
    });
  });

  // 创建知识条目
  const knowledgeInput: CreateKnowledgeInput = {
    std_question: '宁惠保特药目录有哪些？',
    retrieval_text: '特药目录 特药清单 特药保障 癌症用药 特药报销 特药查询 特药名单',
    category: '保障范围',
    intent: 'coverage_query',
    scene: '保障期-特药查询',
    answer_mode: 'multi_period',
    requires_verification: 'never',
    requires_business_confirm: false,
    similar_questions: [
      '宁惠保包含哪些特药？',
      '特药目录是什么？',
      '有什么特药保障？',
      '癌症用药有哪些？',
      '特药清单查询',
      '宁惠保特药名单',
    ],
    keywords: [
      '特药',
      '目录',
      '清单',
      '癌症',
      '用药',
      '保障',
      '名单',
    ],
    channels: ['all'],
    answers,
  };

  try {
    // 通过标准问题查询是否已存在类似的知识条目
    console.log('\n查询现有知识库...');
    const { data: existingEntries } = await listKnowledge({
      keyword: '特药目录',
      pageSize: 100,
    });

    const existingEntry = existingEntries.find(e =>
      e.std_question.includes('特药目录') ||
      e.std_question.includes('特药清单')
    );

    if (existingEntry) {
      console.log(`\n找到已存在的知识条目: ${existingEntry.id}`);
      console.log(`标准问题: ${existingEntry.std_question}`);
      await updateAnswersBatch(existingEntry.id, answers);
      console.log(`成功更新 ${answers.length} 个期数的答案`);
    } else {
      console.log('\n未找到相关知识条目，创建新的...');
      const entry = await createKnowledge(knowledgeInput);
      console.log('成功创建知识条目:', entry.id);

      // 生成向量
      console.log('\n开始向量化...');
      await embedKnowledgeById(entry.id);
      console.log('向量化完成');
    }

    console.log('\n导入完成！');

    // 打印摘要
    console.log('\n摘要:');
    answers.forEach(ans => {
      console.log(`  第${ans.period}期: ${ans.source}`);
    });

  } catch (error) {
    console.error('导入失败:', error);
    throw error;
  }
}

// 执行导入
importDrugList().catch(console.error);