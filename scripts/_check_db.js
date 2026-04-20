'use strict';
require('dotenv').config();
const pool = require('../src/db/mysql');

async function main() {
  try {
    const [gradeCols] = await pool.query('SHOW COLUMNS FROM grades');
    console.log('=== GRADES COLUMNS ===');
    gradeCols.forEach(c => console.log(`  ${c.Field} ${c.Type} ${c.Null} ${c.Default}`));

    const [groupCols] = await pool.query('SHOW COLUMNS FROM `groups`');
    console.log('\n=== GROUPS COLUMNS ===');
    groupCols.forEach(c => console.log(`  ${c.Field} ${c.Type} ${c.Null} ${c.Default}`));

    const [settingCols] = await pool.query('SHOW COLUMNS FROM settings');
    console.log('\n=== SETTINGS COLUMNS ===');
    settingCols.forEach(c => console.log(`  ${c.Field} ${c.Type}`));

    const [srows] = await pool.query("SELECT `key`, LENGTH(value) as vl FROM settings WHERE `key` LIKE 'home_%'");
    console.log('\n=== HOME SETTINGS ===');
    srows.forEach(r => console.log(JSON.stringify(r)));

    const [grades] = await pool.query('SELECT slug, LENGTH(seo_title) as st, LENGTH(article_text) as at, LENGTH(intro) as it FROM grades ORDER BY slug');
    console.log('\n=== GRADES DATA ===');
    grades.forEach(r => console.log(JSON.stringify(r)));

    const [groups] = await pool.query('SELECT slug, LENGTH(seo_title) as st, LENGTH(article_text) as at FROM `groups` ORDER BY slug');
    console.log('\n=== GROUPS DATA ===');
    groups.forEach(r => console.log(JSON.stringify(r)));

  } catch(e) {
    console.error('ERROR:', e.message);
  }
  await pool.end();
}

main();
