'use strict';
require('dotenv').config();
const pool = require('../src/db/mysql');

async function main() {
  const slugs = ['08kh18n10', 'kh20n80-n', '29nk', 'ei814-17khngt'];
  for (const slug of slugs) {
    const [rows] = await pool.query(
      'SELECT id, name, slug, group_id FROM grades WHERE slug = ? LIMIT 1', [slug]
    );
    const r = rows[0];
    if (r) {
      console.log(`✓ "${slug}" → id=${r.id}, name="${r.name}", group_id=${r.group_id}`);
    } else {
      console.log(`✗ "${slug}" → NOT FOUND in grades`);
    }
  }
  // Also check groups
  for (const slug of slugs) {
    const [rows] = await pool.query(
      'SELECT id, name, slug FROM `groups` WHERE slug = ? LIMIT 1', [slug]
    );
    if (rows[0]) console.log(`  (also found in groups: "${slug}")`);
  }
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
