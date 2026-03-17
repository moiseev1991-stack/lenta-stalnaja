/**
 * Generates data/fix_settings.db AND applies fixes directly to MySQL.
 * Run: node scripts/fix_settings.js
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'data', 'fix_settings.db');

const sql = `SET NAMES utf8mb4;
DELETE FROM settings WHERE \`key\` IN ('site_name','home_title','home_h1','home_meta_description','home_html');
INSERT INTO settings (\`key\`, value) VALUES
  ('site_name',             'Лента стальная — каталог металлопроката'),
  ('home_title',            'Лента стальная — каталог металлопроката'),
  ('home_h1',               'Каталог металлопроката'),
  ('home_meta_description', 'Нержавеющая и конструкционная лента по ГОСТ. Наличие на складе, резка в размер, доставка по России.');
`;

fs.writeFileSync(OUT, sql, { encoding: 'utf8' });

const bytes = fs.readFileSync(OUT);
console.log('Written to:', OUT);
console.log('Size:', bytes.length, 'bytes');
console.log('BOM check (first 3 bytes):', bytes[0], bytes[1], bytes[2], '(should be 83 69 84 = "SET")');
console.log('\nContent preview:');
console.log(sql);

// Apply directly to MySQL via utf8mb4 pool
const pool = require('../src/db/mysql');

const defaultSettings = [
  ['site_name',             'Лента стальная — каталог металлопроката'],
  ['home_title',            'Лента стальная — каталог металлопроката'],
  ['home_h1',               'Каталог металлопроката'],
  ['home_meta_description', 'Нержавеющая и конструкционная лента по ГОСТ. Наличие на складе, резка в размер, доставка по России.'],
];

(async () => {
  try {
    await pool.query(
      'DELETE FROM settings WHERE `key` IN (\'site_name\',\'home_title\',\'home_h1\',\'home_meta_description\',\'home_html\')'
    );
    for (const [key, val] of defaultSettings) {
      await pool.query(
        'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
        [key, val, val]
      );
    }
    console.log('\nMySQL: settings applied successfully via utf8mb4 connection.');
  } catch (err) {
    console.error('\nMySQL error:', err.message);
  } finally {
    await pool.end();
  }
})();
