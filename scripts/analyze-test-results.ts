import 'dotenv/config';
import { Pool } from 'pg';
import fs from 'fs';

const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: (process.env.PG_PASSWORD || 'nhb@2026dev').trim()
});

async function analyze() {
  // 读取测试报告
  const report = fs.readFileSync('docs/accuracy-report-2026-06-02.csv', 'utf-8');
  const lines = report.split('\n').slice(1); // 跳过标题

  // 找出所有失败案例
  const failed = lines.filter(line => line.includes(',否,')).length;
  const authBlocked = lines.filter(line => line.includes('未返回知识内容（认证提示）')).length;

  console.log('========== 测试结果分析 ==========');
  console.log('总失败数:', failed);
  console.log('认证阻塞数:', authBlocked);
  console.log('排除认证阻塞后失败数:', failed - authBlocked);

  // 分析知识库答案长度分布
  const result = await pool.query(`
    SELECT ke.std_question, ke.keywords, ka.answer,
           LENGTH(ka.answer) as answer_length
    FROM knowledge_entries ke
    JOIN knowledge_answers ka ON ke.id = ka.knowledge_id
    WHERE ka.period = 6
    AND ke.keywords IS NOT NULL
    ORDER BY LENGTH(ka.answer) ASC
    LIMIT 20
  `);

  console.log('\n========== 最短答案 TOP 20 ==========');
  result.rows.forEach(r => {
    console.log(`长度=${r.answer_length}: "${r.std_question.substring(0,30)}..." -> "${r.answer?.substring(0,50)}..."`);
    console.log(`  关键词: ${r.keywords?.join(', ')}`);
  });

  // 统计答案长度分布
  const stats = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE LENGTH(ka.answer) < 20) as very_short,
      COUNT(*) FILTER (WHERE LENGTH(ka.answer) BETWEEN 20 AND 50) as short,
      COUNT(*) FILTER (WHERE LENGTH(ka.answer) BETWEEN 50 AND 80) as medium,
      COUNT(*) FILTER (WHERE LENGTH(ka.answer) > 80) as long
    FROM knowledge_entries ke
    JOIN knowledge_answers ka ON ke.id = ka.knowledge_id
    WHERE ka.period = 6
  `);

  console.log('\n========== 答案长度分布 ==========');
  console.log('极短(<20字符):', stats.rows[0].very_short);
  console.log('短(20-50字符):', stats.rows[0].short);
  console.log('中(50-80字符):', stats.rows[0].medium);
  console.log('长(>80字符):', stats.rows[0].long);

  await pool.end();
}

analyze();