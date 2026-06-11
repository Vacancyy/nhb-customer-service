// 特药导入API - 用于Docker环境远程导入
import { NextRequest, NextResponse } from 'next/server';
import { AjaxResult } from '@/lib/AjaxResult';
import { logInfo, logError } from '@/lib/logger';
import path from 'path';
import XLSX from 'xlsx';
import { createKnowledge, embedKnowledgeBatch } from '@/lib/knowledge/service';
import { CreateKnowledgeInput, CreateKnowledgeAnswerInput } from '@/lib/knowledge/types';

interface DrugData {
  product_set_code: string;
  drug_name: string;
  general_name: string;
}

// POST: 导入特药清单到知识库
export async function POST(req: NextRequest) {
  try {
    logInfo('开始通过API导入特药清单');

    // 读取Excel文件
    const filePath = path.join(process.cwd(), 'docs', '特药清单.xls');
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData: DrugData[] = XLSX.utils.sheet_to_json(worksheet);

    logInfo(`读取到 ${jsonData.length} 条特药记录`);

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

    logInfo(`共有 ${drugsByName.size} 种不同的特药`);

    // 批量创建知识条目
    const knowledgeInputs: CreateKnowledgeInput[] = [];

    drugsByName.forEach((info, generalName) => {
      const retrievalText = `${generalName} ${info.drugNames.join(' ')} 特药 特药目录 宁惠保特药 ${generalName}是特药吗 ${info.drugNames[0]}在特药范围内吗`;
      const stdQuestion = `${generalName}在宁惠保特药范围内吗？`;

      // 构建所有期数的答案
      const allPeriods = [3, 4, 5, 6];
      const answers: CreateKnowledgeAnswerInput[] = [];

      allPeriods.forEach(period => {
        const isIncluded = info.periods.includes(period);
        const validYear = 2020 + period;

        if (isIncluded) {
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
        keywords: [generalName, ...info.drugNames, '特药', '保障', '报销'],
        channels: ['all'],
        answers,
      });
    });

    // 批量创建
    logInfo('开始创建知识条目...');
    const createdIds: string[] = [];
    let failedCount = 0;

    for (const input of knowledgeInputs) {
      try {
        const entry = await createKnowledge(input);
        createdIds.push(entry.id);
      } catch (error: any) {
        failedCount++;
        logError(`创建失败: ${input.std_question}`, error);
      }
    }

    logInfo(`创建完成: 成功 ${createdIds.length}, 失败 ${failedCount}`);

    // 批量向量化
    logInfo('开始批量向量化...');
    const result = await embedKnowledgeBatch(createdIds);
    logInfo(`向量化完成: 成功 ${result.success}, 失败 ${result.failed}`);

    return NextResponse.json(
      AjaxResult.success({
        total: drugsByName.size,
        created: createdIds.length,
        vectorized: result.success,
        failed: failedCount + result.failed,
      }, `导入完成: 共${drugsByName.size}种特药，成功创建${createdIds.length}条，向量化${result.success}条`)
    );
  } catch (error: unknown) {
    logError('特药导入API错误', error);
    const errMsg = error instanceof Error ? error.message : '系统错误';
    return NextResponse.json(AjaxResult.error(errMsg));
  }
}