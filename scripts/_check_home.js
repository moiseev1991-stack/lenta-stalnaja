'use strict';
require('dotenv').config();
const pool = require('../src/db/mysql');

async function main() {
  const [rows] = await pool.query(
    "SELECT `key`, LEFT(value, 120) as v FROM settings WHERE `key` IN ('home_h1','home_title','home_meta_description','home_intro') ORDER BY `key`"
  );
  rows.forEach(r => console.log(`[${r.key}]: ${r.v}`));
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
