// 查看特药清单Excel文件的结构
const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../docs/特药清单.xls');

try {
  const workbook = XLSX.readFile(filePath);
  console.log('工作表列表:', workbook.SheetNames);

  // 读取第一个工作表
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];

  // 转换为JSON
  const jsonData = XLSX.utils.sheet_to_json(worksheet);

  console.log('\n总行数:', jsonData.length);
  console.log('\n前5行数据:');
  console.log(JSON.stringify(jsonData.slice(0, 5), null, 2));

  // 查看字段名
  if (jsonData.length > 0) {
    console.log('\n字段列表:');
    console.log(Object.keys(jsonData[0]));
  }

  // 统计期数
  const periods = new Set(jsonData.map((row: any) => row['期数'] || row['period']));
  console.log('\n包含的期数:', Array.from(periods).sort());

} catch (error) {
  console.error('读取Excel文件失败:', error);
}