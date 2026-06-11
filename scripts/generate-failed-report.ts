/**
 * 生成失败案例报告
 * 从准确率测试结果中提取失败案例并生成单独的报告
 */

import 'dotenv/config';
import fs from 'fs';

// 读取完整测试报告
const reportFile = `docs/accuracy-report-2026-06-02.csv`;
const content = fs.readFileSync(reportFile, 'utf-8');

// 解析CSV（跳过标题行和汇总部分）
const lines = content.split('\n').slice(1); // 跳过标题
const detailLines = lines.filter(line => line.trim() && !line.includes('问题类型,测试数量')); // 跳过汇总标题

// 提取失败案例
const failedCases: any[] = [];

for (const line of detailLines) {
  if (!line.trim()) continue;

  // CSV解析（处理引号内的逗号）
  const parts = parseCSVLine(line);

  if (parts.length >= 8) {
    const [testType, stdQuestion, testQuestion, keywords, keywordHitRate, numberMatchRate, isAccurate, responseTime] = parts;

    if (isAccurate === '否') {
      failedCases.push({
        testType,
        stdQuestion: stdQuestion.substring(0, 50),
        testQuestion: testQuestion.substring(0, 60),
        keywords,
        keywordHitRate,
        numberMatchRate,
        responseTime
      });
    }
  }
}

// 分类失败原因
function categorizeFailure(keywordHitRate: string, testQuestion: string): string {
  const rate = parseInt(keywordHitRate.replace('%', ''));

  // 检查是否涉及个人数据查询（需要认证）
  const personalQueryKeywords = [
    '我的保单', '我的订单', '我的理赔', '查到我的', '查询我的',
    '下载我的', '我的保险', '自动续保', '取消订单', '理赔进度',
    '理赔申请处理', '理赔资料', '理赔未通过', '直赔怎么没有',
    '家人的保单', '陈玉琴', '退掉这个保险', '关掉自动',
    '取消自动投保', '投保人的电话', '2026年的理赔'
  ];

  const isPersonalQuery = personalQueryKeywords.some(k => testQuestion.includes(k));

  if (isPersonalQuery && rate <= 25) {
    return '需要实名认证才能查询个人数据（系统返回认证提示）';
  }

  if (rate === 0) {
    return '回答内容与问题完全不匹配（关键词命中率0%）';
  }

  if (rate < 20) {
    return '回答不完整或未覆盖核心关键词';
  }

  if (testQuestion.includes('外籍人士') || testQuestion.includes('犹豫期') ||
      testQuestion.includes('商业保险') || testQuestion.includes('保险人') ||
      testQuestion.includes('个人自付') || testQuestion.includes('客服电话')) {
    return '回答信息不完整，缺少关键细节';
  }

  return '回答质量不足（关键词命中率过低）';
}

// 生成失败案例CSV
function generateFailedCasesCSV(): string {
  const headers = ['序号', '测试类型', '标准问题', '测试问题', '关键词', '关键词命中率', '数字匹配率', '响应时间', '失败原因分析'];

  const rows = failedCases.map((c, i) => {
    const failureReason = categorizeFailure(c.keywordHitRate, c.testQuestion);
    return [
      i + 1,
      c.testType,
      c.stdQuestion,
      c.testQuestion,
      c.keywords,
      c.keywordHitRate,
      c.numberMatchRate,
      c.responseTime,
      failureReason
    ];
  });

  const escape = (v: any) => {
    const s = String(v || '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csvContent = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');

  // 添加汇总统计
  const summary = `
失败案例汇总统计

失败总数: ${failedCases.length}

按测试类型统计:
标准问题失败: ${failedCases.filter(c => c.testType === '标准问题').length}个
相似问题失败: ${failedCases.filter(c => c.testType === '相似问题').length}个
合成问题失败: ${failedCases.filter(c => c.testType === '合成问题').length}个

按失败原因统计:
需要实名认证: ${failedCases.filter(c => categorizeFailure(c.keywordHitRate, c.testQuestion).includes('实名认证')).length}个
回答不完整: ${failedCases.filter(c => categorizeFailure(c.keywordHitRate, c.testQuestion).includes('不完整')).length}个
完全不匹配: ${failedCases.filter(c => categorizeFailure(c.keywordHitRate, c.testQuestion).includes('完全不匹配')).length}个
回答质量不足: ${failedCases.filter(c => categorizeFailure(c.keywordHitRate, c.testQuestion).includes('质量不足')).length}个
`;

  return csvContent + summary;
}

// CSV行解析函数
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
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

// 主函数
function main() {
  console.log('========== 生成失败案例报告 ==========\n');

  console.log(`读取测试报告: ${reportFile}`);
  console.log(`解析失败案例...\n`);

  // 输出失败案例统计
  console.log(`失败案例总数: ${failedCases.length}`);

  const standardFailed = failedCases.filter(c => c.testType === '标准问题');
  const similarFailed = failedCases.filter(c => c.testType === '相似问题');
  const combinedFailed = failedCases.filter(c => c.testType === '合成问题');

  console.log(`  - 标准问题失败: ${standardFailed.length}个`);
  console.log(`  - 相似问题失败: ${similarFailed.length}个`);
  console.log(`  - 合成问题失败: ${combinedFailed.length}个\n`);

  // 生成并保存CSV
  const csv = generateFailedCasesCSV();
  const filename = `docs/failed-cases-report-2026-06-02.csv`;
  fs.writeFileSync(filename, '\ufeff' + csv, 'utf-8');

  console.log(`报告已生成: ${filename}\n`);

  // 输出失败原因分类
  console.log('========== 失败原因分类 ==========\n');

  const authRequired = failedCases.filter(c => categorizeFailure(c.keywordHitRate, c.testQuestion).includes('实名认证'));
  const incomplete = failedCases.filter(c => categorizeFailure(c.keywordHitRate, c.testQuestion).includes('不完整'));
  const noMatch = failedCases.filter(c => categorizeFailure(c.keywordHitRate, c.testQuestion).includes('完全不匹配'));
  const lowQuality = failedCases.filter(c => categorizeFailure(c.keywordHitRate, c.testQuestion).includes('质量不足'));

  console.log(`【需要实名认证】 ${authRequired.length}个`);
  console.log('  这些问题涉及查询用户个人数据（保单、理赔、订单等），系统要求实名认证后才能查询');
  console.log('  建议：提示用户需要先完成实名认证\n');

  console.log(`【回答不完整】 ${incomplete.length}个`);
  console.log('  系统返回了部分内容，但缺少关键信息或核心关键词');
  console.log('  建议：优化知识库内容或调整LLM回答策略\n');

  console.log(`【完全不匹配】 ${noMatch.length}个`);
  console.log('  关键词命中率为0%，回答与问题完全不相关');
  console.log('  建议：检查知识库向量搜索效果或提示词设置\n');

  console.log(`【回答质量不足】 ${lowQuality.length}个`);
  console.log('  关键词命中率低于20%，回答质量不达标');
  console.log('  建议：增加知识库覆盖范围或优化匹配阈值\n');

  // 输出典型失败案例示例
  console.log('========== 典型失败案例示例 ==========\n');

  console.log('【需要实名认证案例】');
  authRequired.slice(0, 3).forEach(c => {
    console.log(`  - "${c.testQuestion}"`);
    console.log(`    关键词命中率: ${c.keywordHitRate}`);
  });

  console.log('\n【回答不完整案例】');
  incomplete.slice(0, 3).forEach(c => {
    console.log(`  - "${c.testQuestion}"`);
    console.log(`    关键词命中率: ${c.keywordHitRate}`);
  });

  console.log('\n【完全不匹配案例】');
  noMatch.slice(0, 3).forEach(c => {
    console.log(`  - "${c.testQuestion}"`);
    console.log(`    关键词命中率: ${c.keywordHitRate}`);
  });
}

main();