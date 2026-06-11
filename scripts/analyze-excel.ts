// 详细分析特药清单Excel文件
const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../docs/特药清单.xls');

try {
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(worksheet);

  console.log('总行数:', jsonData.length);

  // 统计不同的product_set_code
  const productSets = new Map<string, number>();
  jsonData.forEach((row: any) => {
    const code = row.product_set_code;
    productSets.set(code, (productSets.get(code) || 0) + 1);
  });

  console.log('\n产品集统计:');
  productSets.forEach((count, code) => {
    console.log(`  ${code}: ${count}条记录`);
  });

  // 查看每种产品集的样本数据
  console.log('\n各产品集样本数据:');
  const samplesByProductSet = new Map<string, any[]>();
  jsonData.forEach((row: any) => {
    const code = row.product_set_code;
    if (!samplesByProductSet.has(code)) {
      samplesByProductSet.set(code, []);
    }
    if (samplesByProductSet.get(code)!.length < 3) {
      samplesByProductSet.get(code)!.push(row);
    }
  });

  samplesByProductSet.forEach((samples, code) => {
    console.log(`\n${code} 样本:`);
    samples.forEach((sample, index) => {
      console.log(`  ${index + 1}. ${sample.drug_name} - ${sample.general_name}`);
    });
  });

  // 检查所有字段
  console.log('\n所有字段:', Object.keys(jsonData[0]));

} catch (error) {
  console.error('读取Excel文件失败:', error);
}