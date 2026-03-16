/**
 * Generates sync_to_server_full.db — clean UTF-8 SQL for server restore
 * Run: node scripts/gen_sync.js
 */
require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('../src/db/mysql');

const OUT = path.join(__dirname, '..', 'data', 'sync_to_server_full.db');

async function escape(pool, val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
  // Escape string
  const s = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  return `'${s}'`;
}

async function tableToInsert(table) {
  const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
  if (!rows.length) return `/* ${table}: no rows */\n`;

  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `\`${c}\``).join(', ');

  const chunks = [];
  // Split into batches of 500 to avoid huge single statements
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const vals = await Promise.all(batch.map(async row => {
      const escaped = await Promise.all(cols.map(c => escape(pool, row[c])));
      return `(${escaped.join(',')})`;
    }));
    chunks.push(`INSERT INTO \`${table}\` (${colList}) VALUES\n${vals.join(',\n')};\n`);
  }
  return chunks.join('\n');
}

async function main() {
  const lines = [];

  lines.push('SET FOREIGN_KEY_CHECKS=0;');
  lines.push('SET NAMES utf8mb4;');
  lines.push('');

  // Migrations (safe — server ignores if column already exists)
  const alters = [
    "ALTER TABLE products ADD COLUMN full_gost_name TEXT NULL",
    "ALTER TABLE products ADD COLUMN spring_props TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE products ADD COLUMN short_text_html TEXT NULL",
    "ALTER TABLE grades ADD COLUMN seo_h1 VARCHAR(512) NULL",
    "ALTER TABLE grades ADD COLUMN seo_title VARCHAR(512) NULL",
    "ALTER TABLE grades ADD COLUMN seo_description TEXT NULL",
    "ALTER TABLE grades ADD COLUMN intro TEXT NULL",
    "ALTER TABLE grades ADD COLUMN article_title VARCHAR(512) NULL",
    "ALTER TABLE grades ADD COLUMN article_text LONGTEXT NULL",
    "ALTER TABLE grades ADD COLUMN article_format VARCHAR(16) DEFAULT 'html'",
    "ALTER TABLE grades ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1",
    "ALTER TABLE `groups` ADD COLUMN seo_h1 VARCHAR(512) NULL",
    "ALTER TABLE `groups` ADD COLUMN seo_title VARCHAR(512) NULL",
    "ALTER TABLE `groups` ADD COLUMN seo_description TEXT NULL",
    "ALTER TABLE `groups` ADD COLUMN intro TEXT NULL",
    "ALTER TABLE `groups` ADD COLUMN article_title VARCHAR(512) NULL",
    "ALTER TABLE `groups` ADD COLUMN article_text LONGTEXT NULL",
    "ALTER TABLE `groups` ADD COLUMN article_format VARCHAR(16) DEFAULT 'html'",
    "ALTER TABLE `groups` ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1",
  ];
  for (const a of alters) lines.push(a + ';');
  lines.push('');

  lines.push('TRUNCATE TABLE `products`;');
  lines.push('TRUNCATE TABLE `grades`;');
  lines.push('TRUNCATE TABLE `groups`;');
  lines.push('');

  console.log('Exporting groups...');
  lines.push(await tableToInsert('groups'));
  console.log('Exporting grades...');
  lines.push(await tableToInsert('grades'));
  console.log('Exporting products...');
  lines.push(await tableToInsert('products'));

  lines.push('SET FOREIGN_KEY_CHECKS=1;');

  const sql = lines.join('\n');
  fs.writeFileSync(OUT, sql, { encoding: 'utf8' });

  const stats = fs.statSync(OUT);
  console.log(`Done! Written to ${OUT}`);
  console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // Preview first INSERT
  const preview = sql.indexOf('INSERT INTO');
  console.log('\nPreview:', sql.substring(preview, preview + 200));

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
