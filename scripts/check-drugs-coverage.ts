// 检查所有特药的答案覆盖情况，找出缺失的期数
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../', '.env.local') });

import { listKnowledge } from '../src/lib/knowledge/service';

async function checkAllDrugsCoverage() {
  console.log('检查所有特药的答案覆盖情况...\n');

  // 查询所有特药相关的知识条目
  const { data: entries } = await listKnowledge({
    keyword: '在宁惠保特药范围内吗',
    pageSize: 100,
  });

  console.log(`找到 ${entries.length} 个特药条目\n`);

  // 统计各期答案覆盖情况
  const coverageMap = new Map<number, { has: number; missing: number; drugs: string[] }>();

  // 初始化期数统计（第3-6期）
  for (let period = 3; period <= 6; period++) {
    coverageMap.set(period, { has: 0, missing: 0, drugs: [] });
  }

  // 检查每个药品的答案覆盖
  const missingDrugs: { name: string; missingPeriods: number[]; hasPeriods: number[] }[] = [];

  entries.forEach(entry => {
    const drugName = entry.std_question.replace('在宁惠保特药范围内吗？', '');
    const hasPeriods = entry.answers?.map(a => a.period) || [];
    const missingPeriods: number[] = [];

    for (let period = 3; period <= 6; period++) {
      if (hasPeriods.includes(period)) {
        coverageMap.get(period)!.has++;
      } else {
        coverageMap.get(period)!.missing++;
        coverageMap.get(period)!.drugs.push(drugName);
        missingPeriods.push(period);
      }
    }

    if (missingPeriods.length > 0 && hasPeriods.length > 0) {
      missingDrugs.push({
        name: drugName,
        missingPeriods,
        hasPeriods,
      });
    }
  });

  // 打印统计结果
  console.log('各期答案覆盖统计:');
  coverageMap.forEach((stats, period) => {
    console.log(`  第${period}期: 有答案 ${stats.has}, 缺失 ${stats.missing}`);
  });

  // 打印缺失期数的药品列表（前20个）
  console.log('\n缺失期数答案的药品（前20个）:');
  missingDrugs.slice(0, 20).forEach(drug => {
    console.log(`  ${drug.name}: 在第${drug.hasPeriods.join(',')}期有，缺第${drug.missingPeriods.join(',')}期答案`);
  });

  console.log(`\n总计: ${missingDrugs.length} 个药品需要补充缺失期数的答案`);

  // 返回缺失列表供后续处理
  return missingDrugs;
}

checkAllDrugsCoverage().catch(console.error);