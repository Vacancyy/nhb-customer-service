import { config } from 'dotenv';
import { resolve } from 'path';
import { Pool } from 'pg';

config({ path: resolve(process.cwd(), '.env.local') });

const pool = new Pool({
  host: process.env.PG_HOST || '192.168.10.187',
  port: parseInt(process.env.PG_PORT || '25432', 10),
  database: process.env.PG_DATABASE || 'nhb_customer_service',
  user: process.env.PG_USER || 'nhb_admin',
  password: process.env.PG_PASSWORD || '',
});

async function check() {
  const client = await pool.connect();
  try {
    const available = await client.query(`
      SELECT name, default_version, installed_version, comment
      FROM pg_available_extensions
      ORDER BY name
    `);
    console.log('Available extensions:');
    for (const ext of available.rows) {
      console.log(`  - ${ext.name}: ${ext.default_version || 'N/A'} (${ext.comment || ''})`);
    }

    const vector = await client.query(`
      SELECT name, default_version, installed_version
      FROM pg_available_extensions
      WHERE name = 'vector'
    `);
    console.log('\nvector extension:', vector.rows.length > 0 ? vector.rows[0] : 'not found');

    const pgConfig = await client.query(`
      SELECT setting FROM pg_config WHERE name = 'PKGLIBDIR'
    `);
    console.log('\nExtension directory:', pgConfig.rows[0]?.setting || 'unavailable');
  } finally {
    client.release();
    await pool.end();
  }
}

check();
