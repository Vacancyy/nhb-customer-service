/**
 * 检查失败案例在知识库中的情况
 */

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: (process.env.PG_PASSWORD || 'nhb@2026dev').trim()
});

// 完全不匹配的失败案例
const completelyNoMatch = [
  '投保这款产品是否需要健康告知/体检？',
  '其他城市什么时候上线？',
  '有理赔次数限制吗？',
  '医院等级在哪里查看？',
  '在哪里查询投保须知？',
  '快赔系统没带出来这一段时间的就诊记录',
  '钱已经被扣了，怎么退回来？',
  '为什么显示还在出单？',
  '住院花了很多钱，怎么才赔这么点？',
  '怎么查宁惠保的电子保单？',
  '打哪个电话找客服？',
  '投保人的手机号码是哪个？',
  '怎么查这家医院是什么级别的？',
  '为什么直付没看到赔款？'
];

// 回答不完整的失败案例
const incompleteAnswers = [
  '外籍人士可以投保这款产品吗？',
  '人工客服电话是多少？',
  '保险人是指什么？',
  '什么是个人自付和个人自费？',
  '什么是商业保险？',
  '种植牙是否可以报销',
  '这款产品的犹豫期有多久？'
];

async function checkKnowledge() {
  console.log('========== 检查失败案例在知识库中的情况 ==========\n');

  console.log('【完全不匹配案例检查】\n');

  for (const q of completelyNoMatch) {
    const searchTerm = q.replace('？', '').substring(0, 20);

    const sql = `
      SELECT ke.id, ke.std_question, ke.keywords, ka.answer
      FROM knowledge_entries ke
      JOIN knowledge_answers ka ON ke.id = ka.knowledge_id AND ka.period = 6
      WHERE ke.std_question ILIKE $1
         OR EXISTS(SELECT 1 FROM unnest(ke.similar_questions) sq WHERE sq ILIKE $1)
    `;

    const result = await pool.query(sql, [`%${searchTerm}%`]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`✓ 知识库有此问题: "${q}"`);
      console.log(`  ID: ${row.id}`);
      console.log(`  标准问题: ${row.std_question}`);
      console.log(`  关键词: ${row.keywords?.join(', ') || '无'}`);
      console.log(`  答案长度: ${row.answer?.length || 0} 字符`);
      console.log(`  答案摘要: ${row.answer?.substring(0, 100)}...`);
      console.log(`  → 问题原因: 向量搜索未匹配到或LLM回答生成问题\n`);
    } else {
      console.log(`✗ 知识库未找到: "${q}"`);
      console.log(`  → 问题原因: 知识库缺失此内容\n`);
    }
  }

  console.log('\n【回答不完整案例检查】\n');

  for (const q of incompleteAnswers) {
    const searchTerm = q.replace('？', '').substring(0, 20);

    const sql = `
      SELECT ke.id, ke.std_question, ke.keywords, ka.answer
      FROM knowledge_entries ke
      JOIN knowledge_answers ka ON ke.id = ka.knowledge_id AND ka.period = 6
      WHERE ke.std_question ILIKE $1
    `;

    const result = await pool.query(sql, [`%${searchTerm}%`]);

    if (result.rows.length > 0) {
      const row = result.rows[0];
      console.log(`✓ 知识库有此问题: "${q}"`);
      console.log(`  标准问题: ${row.std_question}`);
      console.log(`  答案完整内容:`);
      console.log(`  ${row.answer}`);
      console.log(`  → 问题原因: 知识库内容存在，但LLM未能完整输出\n`);
    } else {
      console.log(`✗ 知识库未找到: "${q}"\n`);
    }
  }

  // 统计汇总
  console.log('\n========== 问题原因汇总 ==========\n');

  let inKB = 0;
  let notInKB = 0;

  for (const q of completelyNoMatch) {
    const searchTerm = q.replace('？', '').substring(0, 20);
    const result = await pool.query(`
      SELECT 1 FROM knowledge_entries ke
      JOIN knowledge_answers ka ON ke.id = ka.knowledge_id AND ka.period = 6
      WHERE ke.std_question ILIKE $1
    `, [`%${searchTerm}%`]);

    if (result.rows.length > 0) inKB++;
    else notInKB++;
  }

  console.log(`完全不匹配案例 (${completelyNoMatch.length}个):`);
  console.log(`  - 知识库有内容但未匹配: ${inKB}个 → 向量搜索/LLM生成问题`);
  console.log(`  - 知识库缺失内容: ${notInKB}个 → 需补充知识库`);

  await pool.end();
}

checkKnowledge();