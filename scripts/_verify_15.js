'use strict';
require('dotenv').config();
const pool = require('../src/db/mysql');

async function main() {
  const slugs = ['08kh18n10','10kh17n13m3t','12kh18n9','12kh18n9smr','17khngt',
                 '27kkh','29nk','40kkhnm','kh15n60','kh15yu5','kh20n80-n',
                 'kh23yu5','kh23yu5t','khn78t','ei814-17khngt'];
  const placeholders = slugs.map(() => '?').join(',');
  const [rows] = await pool.query(
    `SELECT slug, name,
       LENGTH(seo_title) as st, LENGTH(article_text) as at,
       LENGTH(key_specs_html) as ks, JSON_LENGTH(faq_json) as fq
     FROM grades WHERE slug IN (${placeholders}) ORDER BY slug`,
    slugs
  );
  console.log('slug                  | name            | seo_title | article | key_specs | faq_items');
  console.log('-'.repeat(95));
  rows.forEach(r => {
    const ok = r.st && r.at && r.ks && r.fq ? '✓' : '✗';
    console.log(`${ok} ${r.slug.padEnd(22)}| ${(r.name||'').padEnd(16)}| ${String(r.st||0).padEnd(10)}| ${String(r.at||0).padEnd(8)}| ${String(r.ks||0).padEnd(10)}| ${r.fq||0}`);
  });
  console.log(`\nTotal: ${rows.length} rows`);
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
