'use strict';

/**
 * Import SEO texts from text/*.md files into MySQL (grades / groups / settings).
 *
 * Mapping (MD section → DB field):
 *   ## SEO_TITLE        → seo_title
 *   ## SEO_DESCRIPTION  → seo_description
 *   ## H1               → seo_h1
 *   ## INTRO_TEXT       → intro
 *   ## KEY_SPECS        → combined with MAIN_TEXT → article_text (html format)
 *   ## MAIN_TEXT        → combined with KEY_SPECS → article_text (html format)
 *   ## FAQ              → faq_json (JSON array of {question, answer})
 *
 * Run: node scripts/import_seo_texts.js
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const pool = require('../src/db/mysql');
const MarkdownIt = require('markdown-it');

const md = new MarkdownIt({ html: true, typographer: false, breaks: false });

// Patch: add CSS class to generated tables
const originalTable = md.renderer.rules.table_open || function(tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.table_open = function(tokens, idx, options, env, self) {
  tokens[idx].attrSet('class', 'specs-table');
  return originalTable(tokens, idx, options, env, self);
};

const TEXT_DIR = path.join(__dirname, '../text');

function readTextFiles() {
  return fs.readdirSync(TEXT_DIR)
    .filter(f => f.endsWith('.md'))
    .filter(f => !f.startsWith('00_README') && !f.startsWith('13_CURSOR_PROMPT'))
    .sort()
    .map(f => path.join(TEXT_DIR, f));
}

/** Parse "URL: /slug/" → strip leading/trailing slashes → slug string (empty for homepage) */
function parseUrl(content) {
  const match = content.match(/^URL:\s*\/([^/\n]*)\//m);
  if (!match) {
    const rootMatch = content.match(/^URL:\s*\/\s*$/m);
    if (rootMatch) return '';
    return null;
  }
  return match[1].trim();
}

/**
 * Split content into named sections.
 * Section header: ## SECTION_NAME (may be followed by parenthetical comment)
 * Returns Map<sectionKey, rawText>
 */
function parseSections(content) {
  const sections = new Map();
  // Match "## WORD_WITH_UNDERSCORES" headers (uppercase, may have trailing comment)
  const headerRe = /^## ([A-Z0-9_]+)(?:[^#\n]*)$/gm;
  const matches = [];
  let m;
  while ((m = headerRe.exec(content)) !== null) {
    matches.push({ key: m[1], index: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < matches.length; i++) {
    const { key, end } = matches[i];
    const nextIndex = i + 1 < matches.length ? matches[i + 1].index : content.length;
    sections.set(key, content.slice(end, nextIndex).trim());
  }
  return sections;
}

/**
 * Parse FAQ section into [{question, answer}] array.
 * Each question starts with "### ".
 */
function parseFaq(faqText) {
  if (!faqText) return [];
  const items = [];
  const questionRe = /^### (.+)$/gm;
  const qMatches = [];
  let qm;
  while ((qm = questionRe.exec(faqText)) !== null) {
    qMatches.push({ question: qm[1].trim(), index: qm.index, end: qm.index + qm[0].length });
  }
  for (let i = 0; i < qMatches.length; i++) {
    const { question, end } = qMatches[i];
    const nextIndex = i + 1 < qMatches.length ? qMatches[i + 1].index : faqText.length;
    const answer = faqText.slice(end, nextIndex).trim();
    if (question && answer) {
      items.push({ question, answer });
    }
  }
  return items;
}

/** Convert Markdown text to HTML, strip wrapping blank lines. */
function toHtml(text) {
  if (!text) return '';
  return md.render(text).trim();
}

async function getGradeBySlug(slug) {
  const [rows] = await pool.query('SELECT id FROM grades WHERE slug = ? LIMIT 1', [slug]);
  return rows[0] || null;
}

async function getGroupBySlug(slug) {
  const [rows] = await pool.query('SELECT id FROM `groups` WHERE slug = ? LIMIT 1', [slug]);
  return rows[0] || null;
}

async function updateGrade(id, fields) {
  const sets = Object.keys(fields).map(k => `\`${k}\` = ?`).join(', ');
  const vals = [...Object.values(fields), id];
  await pool.query(`UPDATE grades SET ${sets} WHERE id = ?`, vals);
}

async function updateGroup(id, fields) {
  const sets = Object.keys(fields).map(k => `\`${k}\` = ?`).join(', ');
  const vals = [...Object.values(fields), id];
  await pool.query(`UPDATE \`groups\` SET ${sets} WHERE id = ?`, vals);
}

async function updateHomepageSettings(fields) {
  const mapping = {
    seo_title:       'home_title',
    seo_description: 'home_meta_description',
    seo_h1:          'home_h1',
    intro:           'home_intro',
    article_text:    'home_main_text',
    faq_json:        'home_faq_json',
  };
  for (const [field, key] of Object.entries(mapping)) {
    if (fields[field] == null) continue;
    await pool.query(
      'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
      [key, fields[field], fields[field]]
    );
  }
}

async function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const slug = parseUrl(content);
  if (slug === null) {
    console.warn(`  [SKIP] Cannot parse URL in ${path.basename(filePath)}`);
    return false;
  }

  const sections = parseSections(content);

  // Build fields
  const seoTitle       = sections.get('SEO_TITLE')       || '';
  const seoDescription = sections.get('SEO_DESCRIPTION') || '';
  const h1             = sections.get('H1')               || '';
  const introText      = sections.get('INTRO_TEXT')       || '';
  const keySpecs       = sections.get('KEY_SPECS')        || '';
  const mainText       = sections.get('MAIN_TEXT')        || '';
  const faqRaw         = sections.get('FAQ')              || '';

  // KEY_SPECS → stored separately; MAIN_TEXT → article_text only
  const keySpecsHtml = toHtml(keySpecs);
  const mainTextHtml = toHtml(mainText);

  const faqItems = parseFaq(faqRaw);
  const faqJson  = faqItems.length ? JSON.stringify(faqItems) : null;

  const fields = {};
  if (seoTitle)        fields.seo_title       = seoTitle;
  if (seoDescription)  fields.seo_description = seoDescription;
  if (h1)              fields.seo_h1          = h1;
  if (introText)       fields.intro           = introText;
  if (keySpecsHtml)  { fields.key_specs_html  = keySpecsHtml; }
  if (mainTextHtml)  { fields.article_text    = mainTextHtml; fields.article_format = 'html'; }
  if (faqJson)         fields.faq_json        = faqJson;

  if (Object.keys(fields).length === 0) {
    console.warn(`  [SKIP] No data parsed from ${path.basename(filePath)}`);
    return false;
  }

  // Homepage
  if (slug === '') {
    await updateHomepageSettings(fields);
    console.log(`  [OK] homepage (settings) ← ${path.basename(filePath)}`);
    return true;
  }

  // Try grades first, then groups
  const grade = await getGradeBySlug(slug);
  if (grade) {
    await updateGrade(grade.id, fields);
    console.log(`  [OK] grades[${slug}] ← ${path.basename(filePath)} (${faqItems.length} FAQ)`);
    return true;
  }

  const group = await getGroupBySlug(slug);
  if (group) {
    await updateGroup(group.id, fields);
    console.log(`  [OK] groups[${slug}] ← ${path.basename(filePath)} (${faqItems.length} FAQ)`);
    return true;
  }

  console.warn(`  [MISS] No grade or group found for slug "${slug}" in ${path.basename(filePath)}`);
  return false;
}

async function main() {
  const files = readTextFiles();
  console.log(`Found ${files.length} MD files to process in text/\n`);

  let ok = 0, skip = 0;
  for (const f of files) {
    console.log(`Processing: ${path.basename(f)}`);
    try {
      const result = await processFile(f);
      if (result) ok++; else skip++;
    } catch (err) {
      console.error(`  [ERROR] ${path.basename(f)}: ${err.message}`);
      skip++;
    }
  }

  console.log(`\nDone: ${ok} updated, ${skip} skipped/errors`);
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
