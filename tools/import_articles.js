/**
 * Скрипт импорта статей из папки text/ в MySQL (grades.article_text, groups.article_text)
 * и SQLite (settings.home_html для главной страницы).
 * Запуск: node tools/import_articles.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Загружаем .env если он есть (локальная разработка), в Docker переменные уже в env
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

const mysql2 = require('mysql2/promise');

let Database;
try {
  Database = require('better-sqlite3');
} catch (_) {
  Database = null;
}

const TEXT_DIR = path.join(__dirname, '..', 'text');
const DB_PATH  = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db');

// ─── Соответствие: часть имени файла → { table, slug } ─────────────────────

const FILE_MAP = [
  // Grades (марки)
  { match: 'х15н60',         table: 'grades', slug: 'h15n60' },
  { match: 'х15ю5',          table: 'grades', slug: 'h15yu5' },
  { match: 'х20н80-н',       table: 'grades', slug: 'h20n80-n' },
  { match: 'х20н80_',        table: 'grades', slug: 'h20n80' },
  { match: 'х23ю5т',         table: 'grades', slug: 'h23yu5t' },
  // лента-х23ю5 — актуальная статья для /h23yu5/ (заменяет старую х23ю5_)
  { match: 'лента-х23ю5',   table: 'grades', slug: 'h23yu5' },
  { match: 'хн78т',          table: 'grades', slug: 'hn78t' },
  // 27кх-лента — актуальная статья для /27kh/ (заменяет старую 27кх_)
  { match: '27кх-лента',    table: 'grades', slug: '27kh' },
  { match: '29нк',           table: 'grades', slug: '29nk' },
  { match: '20х13',          table: 'grades', slug: '20h13' },
  { match: '08х18н10',       table: 'grades', slug: '08h18n10' },
  { match: '10х17н13м3т',    table: 'grades', slug: '10h17n13m3t' },
  { match: '12х18н10т',      table: 'grades', slug: '12h18n10t' },
  { match: '12х18н9смр',     table: 'grades', slug: '12h18n9smr' },
  { match: '12х18н9_',       table: 'grades', slug: '12h18n9' },
  // эи814 должен идти ПЕРЕД 17хнгт, т.к. имя файла содержит оба паттерна
  { match: 'эи814',          table: 'grades', slug: 'ei814-17hngt' },
  { match: 'статья 17хнгт',  table: 'grades', slug: '17hngt' },
  { match: '36нхтю',         table: 'grades', slug: '36nhtyu' },
  { match: '40кхнм',         table: 'grades', slug: '40khnm' },
  { match: '65г',            table: 'grades', slug: '65g' },
  // Groups (группы по назначению)
  { match: 'высокое-электросопротивление', table: 'groups', slug: 'vysokoe-elektrosoprotivlenie' },
  { match: 'жаростоикие',                  table: 'groups', slug: 'zharostojkie-i-zharoprochnye' },
  { match: 'коррозионно-стоикие',          table: 'groups', slug: 'korrozionno-stojkie-stali' },
  { match: 'лента-холоднокатаная',         table: 'groups', slug: 'lenta-holodnokatanaya' },
  { match: 'прецизионные-сплавы',          table: 'groups', slug: 'pretsizionnye-splavy' },
  { match: 'углеродистые-стали',           table: 'groups', slug: 'uglerodistye-stali' },
  // Главная страница
  { match: 'металлическая-лента',          table: 'home', slug: null },
];

// ─── Простой конвертер Markdown → HTML ──────────────────────────────────────

function mdToHtml(text) {
  const lines = text.split('\n');
  const out = [];
  let inList = false;
  let inHtml = false;   // внутри HTML-блока (<table>)
  let inCode = false;
  let para = [];

  function flushPara() {
    if (para.length === 0) return;
    const content = para.join(' ').trim();
    if (content) out.push('<p>' + content + '</p>');
    para = [];
  }

  function flushList() {
    if (!inList) return;
    out.push('</ul>');
    inList = false;
  }

  function inlineFormat(s) {
    // **bold**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // *italic*
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // `code`
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Код-блок (```)
    if (line.startsWith('```')) {
      if (!inCode) {
        flushPara(); flushList();
        inCode = true;
        out.push('<pre><code>');
      } else {
        inCode = false;
        out.push('</code></pre>');
      }
      continue;
    }
    if (inCode) { out.push(line); continue; }

    // HTML-блок (начинается с <table, <div, <ul, <ol, <p, <h, <section, <article, <figure)
    const htmlStart = /^<(table|div|ul|ol|p|h[1-6]|section|article|figure|blockquote|pre)/i.test(line);
    const htmlEnd   = /^<\/(table|div|ul|ol|p|h[1-6]|section|article|figure|blockquote|pre)/i.test(line);

    if (inHtml) {
      out.push(line);
      if (htmlEnd || line.includes('</table>') || line.includes('</div>')) inHtml = false;
      continue;
    }
    if (htmlStart) {
      flushPara(); flushList();
      out.push(line);
      if (!line.includes('</table>') && !line.includes('</p>') && !line.match(/<\/h[1-6]>/)) inHtml = true;
      continue;
    }

    // Пустая строка
    if (line.trim() === '') {
      flushPara(); flushList();
      continue;
    }

    // Заголовки
    const h4 = line.match(/^#### (.+)/);
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);

    if (h4) { flushPara(); flushList(); out.push('<h4>' + inlineFormat(h4[1]) + '</h4>'); continue; }
    if (h3) { flushPara(); flushList(); out.push('<h3>' + inlineFormat(h3[1]) + '</h3>'); continue; }
    if (h2) { flushPara(); flushList(); out.push('<h2>' + inlineFormat(h2[1]) + '</h2>'); continue; }
    if (h1) { flushPara(); flushList(); out.push('<h2>' + inlineFormat(h1[1]) + '</h2>'); continue; }

    // Список
    const li = line.match(/^[-*] (.+)/);
    if (li) {
      flushPara();
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + inlineFormat(li[1]) + '</li>');
      continue;
    }

    // Нумерованный список
    const nli = line.match(/^\d+\. (.+)/);
    if (nli) {
      flushPara();
      if (!inList) { out.push('<ol>'); inList = true; }
      out.push('<li>' + inlineFormat(nli[1]) + '</li>');
      continue;
    }

    // Обычный текст — в параграф
    para.push(inlineFormat(line.trim()));
  }

  flushPara();
  flushList();
  if (inCode) out.push('</code></pre>');

  return out.join('\n');
}

// ─── Парсинг файла ───────────────────────────────────────────────────────────

function parseArticleFile(filepath) {
  const raw = fs.readFileSync(filepath, 'utf8');
  const lines = raw.split('\n');

  // Пропускаем строки **Title:** и **Description:** в начале
  let start = 0;
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const l = lines[i].trim();
    if (l.startsWith('**Title:**') || l.startsWith('**Description:**') || l === '') {
      start = i + 1;
    } else {
      break;
    }
  }

  const body = lines.slice(start).join('\n');

  // Извлекаем H1 как article_title
  const h1Match = body.match(/^# (.+)/m);
  const articleTitle = h1Match ? h1Match[1].trim() : '';

  // Убираем строку с H1 из тела — она станет article_title
  const bodyWithoutH1 = body.replace(/^# .+\n?/m, '').trim();

  const html = mdToHtml(bodyWithoutH1);
  return { articleTitle, html };
}

// ─── Основной импорт ─────────────────────────────────────────────────────────

async function run() {
  const pool = await mysql2.createPool({
    host:     process.env.MYSQL_HOST     || '127.0.0.1',
    port:     parseInt(process.env.MYSQL_PORT || '3306', 10),
    user:     process.env.MYSQL_USER     || 'root',
    password: process.env.MYSQL_PASSWORD || 'lebta2pass',
    database: process.env.MYSQL_DATABASE || 'metal_catalog',
    waitForConnections: true,
    charset:  'utf8mb4',
  });

  const sqlite = new Database(DB_PATH);

  const files = fs.readdirSync(TEXT_DIR).filter(f => f.endsWith('.txt'));
  console.log(`Найдено файлов: ${files.length}`);

  let ok = 0, skip = 0;

  for (const fname of files) {
    const lower = fname.toLowerCase();
    const mapping = FILE_MAP.find(m => lower.includes(m.match));

    if (!mapping) {
      console.warn(`  ПРОПУСК (нет маппинга): ${fname}`);
      skip++;
      continue;
    }

    const { articleTitle, html } = parseArticleFile(path.join(TEXT_DIR, fname));

    if (mapping.table === 'home') {
      // Главная страница — SQLite settings
      const existing = sqlite.prepare('SELECT key FROM settings WHERE key = ?').get('home_html');
      if (existing) {
        sqlite.prepare('UPDATE settings SET value = ? WHERE key = ?').run(html, 'home_html');
      } else {
        sqlite.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('home_html', html);
      }
      console.log(`  ✓ home_html (SQLite) — "${articleTitle}"`);
    } else if (mapping.table === 'grades') {
      const [rows] = await pool.execute(
        'SELECT id FROM grades WHERE slug = ?', [mapping.slug]
      );
      if (!rows.length) {
        console.warn(`  ПРОПУСК — марка не найдена в БД: slug=${mapping.slug}`);
        skip++;
        continue;
      }
      await pool.execute(
        'UPDATE grades SET article_title = ?, article_text = ?, article_format = ? WHERE slug = ?',
        [articleTitle, html, 'html', mapping.slug]
      );
      console.log(`  ✓ grades[${mapping.slug}] — "${articleTitle}"`);
    } else if (mapping.table === 'groups') {
      const [rows] = await pool.execute(
        'SELECT id FROM metal_catalog.groups WHERE slug = ?', [mapping.slug]
      );
      if (!rows.length) {
        console.warn(`  ПРОПУСК — группа не найдена в БД: slug=${mapping.slug}`);
        skip++;
        continue;
      }
      await pool.execute(
        'UPDATE metal_catalog.groups SET article_title = ?, article_text = ?, article_format = ? WHERE slug = ?',
        [articleTitle, html, 'html', mapping.slug]
      );
      console.log(`  ✓ groups[${mapping.slug}] — "${articleTitle}"`);
    }
    ok++;
  }

  await pool.end();
  sqlite.close();
  console.log(`\nГотово: ${ok} импортировано, ${skip} пропущено.`);
}

run().catch(err => { console.error(err); process.exit(1); });
