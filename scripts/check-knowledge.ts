import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432'),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: (process.env.PG_PASSWORD || 'nhb@2026dev').trim()
});

async function check() {
  // 查询外籍人士问题的知识库内容
  const result = await pool.query(`
    SELECT ke.std_question, ke.keywords, ka.answer
    FROM knowledge_entries ke
    JOIN knowledge_answers ka ON ke.id = ka.knowledge_id
    WHERE ke.std_question ILIKE '%外籍%'
    AND ka.period = 6
  `);

  console.log('外籍人士问题知识库内容:');
  result.rows.forEach(r => {
    console.log('问题:', r.std_question);
    console.log('关键词:', r.keywords);
    console.log('答案:', r.answer);
    console.log('答案长度:', r.answer?.length || 0);
  });

  await pool.end();
}

check();