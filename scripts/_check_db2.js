'use strict';
require('dotenv').config();
const pool = require('../src/db/mysql');

async function main() {
  try {
    // Show actual values of home settings
    const [srows] = await pool.query(
      "SELECT `key`, LEFT(value, 200) as preview FROM settings WHERE `key` LIKE 'home_%' ORDER BY `key`"
    );
    console.log('=== HOME SETTINGS (first 200 chars) ===');
    srows.forEach(r => console.log(`\n[${r.key}]:\n${r.preview}`));

    // Show grades that have faq_json
    const [frows] = await pool.query(
      "SELECT slug, LENGTH(faq_json) as fj, LENGTH(key_specs_html) as ks FROM grades WHERE faq_json IS NOT NULL ORDER BY slug"
    );
    console.log('\n=== GRADES WITH FAQ ===');
    frows.forEach(r => console.log(JSON.stringify(r)));

    // Show groups that have faq_json
    const [grows] = await pool.query(
      "SELECT slug, LENGTH(faq_json) as fj, LENGTH(key_specs_html) as ks FROM `groups` WHERE faq_json IS NOT NULL ORDER BY slug"
    );
    console.log('\n=== GROUPS WITH FAQ ===');
    grows.forEach(r => console.log(JSON.stringify(r)));

  } catch(e) {
    console.error('ERROR:', e.message);
  }
  await pool.end();
}
main();
