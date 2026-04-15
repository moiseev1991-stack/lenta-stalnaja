/**
 * Выгружает все URL из sitemap-логики в текстовые файлы по 1000 строк (полные URL).
 * Запуск: node scripts/export-url-chunks.js [SITE_URL]
 * Пример: node scripts/export-url-chunks.js https://lenta-stalnaja.ru
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const siteUrlArg = process.argv[2];
process.env.SITE_URL = siteUrlArg || process.env.SITE_URL || 'https://lenta-stalnaja.ru';

const outDir = path.join(__dirname, '..', 'export', 'lenta-stalnaja-urls');
const CHUNK = 1000;

async function main() {
  const sitemap = require('../src/services/sitemap');
  const pool = require('../src/db/mysql');

  const urls = (await sitemap.getSitemapUrls()).map((u) => u.loc).filter(Boolean);
  fs.mkdirSync(outDir, { recursive: true });

  let part = 1;
  for (let i = 0; i < urls.length; i += CHUNK) {
    const slice = urls.slice(i, i + CHUNK);
    const name = `urls_part_${String(part).padStart(2, '0')}.txt`;
    fs.writeFileSync(path.join(outDir, name), slice.join('\n') + '\n', 'utf8');
    part += 1;
  }

  const indexLines = [
    `Базовый URL сайта: ${process.env.SITE_URL}`,
    `Всего URL: ${urls.length}`,
    `Файлов по ${CHUNK} URL (последний может быть короче): ${part - 1}`,
    '',
    'Папка (абсолютный путь):',
    path.resolve(outDir),
    '',
    'Файлы:',
  ];
  for (let p = 1; p < part; p++) {
    const name = `urls_part_${String(p).padStart(2, '0')}.txt`;
    const from = (p - 1) * CHUNK;
    const to = Math.min(p * CHUNK, urls.length);
    indexLines.push(`  ${name} — строк ${from + 1}–${to} (${to - from} URL)`);
  }
  indexLines.push('');
  indexLines.push('Источник: те же запросы, что в src/services/sitemap.js (категории, лендинги, марки, группы, товары + статические страницы).');

  fs.writeFileSync(path.join(outDir, 'URL_LIST_INDEX.txt'), indexLines.join('\n'), 'utf8');
  console.log('OK', urls.length, 'URL →', path.resolve(outDir));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
