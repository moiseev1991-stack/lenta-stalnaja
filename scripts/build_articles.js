/**
 * Сборка информационных статей: content/stati/*.md → src/data/articles.js
 *
 * Запуск: node scripts/build_articles.js  (или npm run build:articles)
 *
 * Результат коммитится в git — на проде ничего не собирается, нода просто
 * делает require('../data/articles'), как с ГОСТами (src/data/gosts.js).
 *
 * Формат исходника — см. content/stati/README.md.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

const SRC_DIR = path.join(__dirname, '..', 'content', 'stati');
const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'articles.js');

// Ключи секций — строго заглавными, чтобы обычные "## Заголовок" внутри
// MAIN_TEXT не ломали разбор.
const SECTION_KEYS = [
  'META', 'SEO_TITLE', 'SEO_DESCRIPTION', 'H1',
  'ANSWER', 'KEY_FACTS', 'INFOGRAPHIC', 'MAIN_TEXT', 'FAQ',
];

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

// ── Транслитерация для id заголовков ─────────────────────────────────────────

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, ' ')
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';
}

// ── Разбор файла ─────────────────────────────────────────────────────────────

function splitSections(raw) {
  const lines = raw.split(/\r?\n/);
  const sections = {};
  const head = [];
  let current = null;
  let buffer = [];

  const flush = () => {
    if (current) sections[current] = buffer.join('\n').trim();
    buffer = [];
  };

  for (const line of lines) {
    const m = line.match(/^##\s+([A-Z0-9_]+)\s*$/);
    if (m && SECTION_KEYS.includes(m[1])) {
      flush();
      current = m[1];
      continue;
    }
    if (current) buffer.push(line);
    else head.push(line);
  }
  flush();
  return { sections, head: head.join('\n') };
}

function parseMeta(block) {
  const meta = {};
  String(block || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const m = line.match(/^\s*-\s*([a-zA-Z_]+)\s*:\s*(.*)$/);
      if (!m) return;
      meta[m[1].toLowerCase()] = m[2].trim();
    });
  return meta;
}

function csv(value) {
  return String(value || '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFaq(block) {
  if (!block) return [];
  const items = [];
  let question = null;
  let answer = [];

  const push = () => {
    if (question && answer.length) {
      items.push({ q: question, a: answer.join('\n').trim() });
    }
    answer = [];
  };

  block.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^###\s+(.*)$/);
    if (m) {
      push();
      question = m[1].trim();
      return;
    }
    if (question) answer.push(line);
  });
  push();

  return items.map((it) => ({
    q: it.q,
    // Ответ в FAQPage JSON-LD и в аккордеоне — короткий текст без разметки.
    a: it.a.replace(/\s*\n\s*/g, ' ').replace(/\*\*(.+?)\*\*/g, '$1').trim(),
  }));
}

/**
 * Секция INFOGRAPHIC описывает картинку, которую рисует
 * tools/build_infographics.py в public/img/stati/<slug>.png.
 * Здесь берём только заголовок и подпись — они идут в alt, подпись и JSON-LD.
 */
function parseInfographic(block, slug, h1) {
  if (!block) return null;
  const meta = parseMeta(block);
  if (!meta.title && !meta.type) return null;
  return {
    src: `/img/stati/${slug}.png`,
    alt: meta.title || h1,
    caption: meta.note || '',
    width: 1200,
    height: 675,
  };
}

function renderHtml(markdown) {
  if (!markdown) return '';
  return md.render(markdown).trim();
}

/** Проставляет id заголовкам h2/h3 и собирает оглавление по h2. */
function addHeadingIds(html) {
  const toc = [];
  const withIds = html.replace(
    /<h([23])>([\s\S]*?)<\/h\1>/g,
    (full, level, inner) => {
      const text = inner.replace(/<[^>]+>/g, '').trim();
      const id = slugify(text);
      if (level === '2') toc.push({ id, title: text });
      return `<h${level} id="${id}">${inner}</h${level}>`;
    }
  );
  return { html: withIds, toc };
}

function parseArticle(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const { sections, head } = splitSections(raw);

  const urlMatch = head.match(/^URL:\s*(\S+)\s*$/m);
  const urlPath = urlMatch ? urlMatch[1].trim() : '';
  const slugMatch = urlPath.match(/^\/stati\/([a-z0-9-]+)\/$/);
  const basename = path.basename(file, '.md');

  if (!slugMatch) {
    throw new Error(
      `${basename}.md: в шапке нужна строка вида "URL: /stati/<slug>/" (сейчас: ${urlPath || '—'})`
    );
  }
  const slug = slugMatch[1];

  const meta = parseMeta(sections.META);
  const required = ['SEO_TITLE', 'SEO_DESCRIPTION', 'H1', 'ANSWER', 'MAIN_TEXT'];
  required.forEach((key) => {
    if (!sections[key]) throw new Error(`${basename}.md: пустая или отсутствует секция ## ${key}`);
  });

  const body = addHeadingIds(renderHtml(sections.MAIN_TEXT));

  return {
    slug,
    title: (meta.title || sections.H1).trim(),
    h1: sections.H1.trim(),
    seoTitle: sections.SEO_TITLE.trim(),
    seoDescription: sections.SEO_DESCRIPTION.trim(),
    // Прямой ответ в начале страницы — то, что цитируют AI-ответы.
    answer: sections.ANSWER.replace(/\s*\n\s*/g, ' ').trim(),
    keyFactsHtml: renderHtml(sections.KEY_FACTS),
    image: parseInfographic(sections.INFOGRAPHIC, slug, sections.H1.trim()),
    contentHtml: body.html,
    toc: body.toc,
    faq: parseFaq(sections.FAQ),
    cluster: meta.cluster || 'Справочник',
    updated: meta.updated || new Date().toISOString().slice(0, 10),
    sources: csv(meta.sources),
    related: {
      grades: csv(meta.grades),
      groups: csv(meta.groups),
      gosts: csv(meta.gosts),
    },
  };
}

// ── Генерация модуля ─────────────────────────────────────────────────────────

const CLUSTER_ORDER = [
  'Выбор и применение',
  'Марки и сравнения',
  'Технология и свойства',
  'Расчёты и нормативы',
];

function build() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`[articles] нет директории ${SRC_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(SRC_DIR)
    // Файлы с префиксом 00_ и README — служебные (ТЗ, контент-план), не статьи.
    .filter((f) => f.endsWith('.md') && !/^(00_|readme\.md$)/i.test(f))
    .sort()
    .map((f) => path.join(SRC_DIR, f));

  const articles = [];
  const seen = new Set();
  const errors = [];

  files.forEach((file) => {
    try {
      const article = parseArticle(file);
      if (seen.has(article.slug)) {
        errors.push(`дубль slug "${article.slug}" (${path.basename(file)})`);
        return;
      }
      seen.add(article.slug);
      articles.push(article);
    } catch (err) {
      errors.push(err.message);
    }
  });

  if (errors.length) {
    console.error('[articles] ошибки разбора:');
    errors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }

  articles.sort((a, b) => {
    const ci = CLUSTER_ORDER.indexOf(a.cluster);
    const cj = CLUSTER_ORDER.indexOf(b.cluster);
    if (ci !== cj) return (ci === -1 ? 99 : ci) - (cj === -1 ? 99 : cj);
    return a.slug.localeCompare(b.slug, 'ru');
  });

  const header = `// СГЕНЕРИРОВАННЫЙ ФАЙЛ — не редактировать руками.
// Источник: content/stati/*.md, сборка: node scripts/build_articles.js
// Статей: ${articles.length}. Пересобрано: ${new Date().toISOString().slice(0, 10)}.

'use strict';

const ARTICLES = `;

  const footer = `;

const ARTICLES_BY_SLUG = Object.fromEntries(ARTICLES.map((a) => [a.slug, a]));

const CLUSTERS = ${JSON.stringify(CLUSTER_ORDER, null, 2)};

/** Статьи, связанные с маркой / группой / ГОСТом — для блоков «Статьи по теме». */
function articlesFor(kind, slug) {
  if (!slug) return [];
  const key = String(slug).toLowerCase();
  return ARTICLES.filter((a) => (a.related[kind] || []).some((s) => s.toLowerCase() === key));
}

module.exports = { ARTICLES, ARTICLES_BY_SLUG, CLUSTERS, articlesFor };
`;

  fs.writeFileSync(OUT_FILE, header + JSON.stringify(articles, null, 2) + footer, 'utf8');
  console.log(`[articles] собрано статей: ${articles.length} → ${path.relative(process.cwd(), OUT_FILE)}`);
  articles.forEach((a) => console.log(`  /stati/${a.slug}/ — ${a.h1}`));
}

build();
