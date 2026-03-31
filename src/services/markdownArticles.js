const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');

const ARCHIVE_DIR = path.join(__dirname, '../../lenta_articles_markdown_archive');
const INDEX_FILE = path.join(ARCHIVE_DIR, '00-INDEX.md');

let cache = null;
const md = new MarkdownIt({ html: false, linkify: true, typographer: false });

function normalizeKey(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/[—–]/g, '-')
    .replace(/[^\p{L}\p{N}\- ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePathname(urlLike) {
  if (!urlLike) return null;
  try {
    const u = new URL(urlLike);
    return ensureTrailingSlash(u.pathname);
  } catch (_) {
    return ensureTrailingSlash(urlLike);
  }
}

function ensureTrailingSlash(pathname) {
  if (!pathname) return '/';
  let p = pathname.trim();
  if (!p.startsWith('/')) p = '/' + p;
  if (!p.endsWith('/')) p += '/';
  return p;
}

function parseIndexMappings() {
  const byFile = new Map();
  if (!fs.existsSync(INDEX_FILE)) return byFile;
  const raw = fs.readFileSync(INDEX_FILE, 'utf8');
  const lines = raw.split(/\r?\n/);
  const re = /^-\s+`(.+?)`\s+→\s+(https?:\/\/\S+)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    byFile.set(m[1].trim(), m[2].trim());
  }
  return byFile;
}

function parseArticle(filePath, urlFromIndex) {
  const filename = path.basename(filePath);
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  let inlineUrl = null;
  for (const line of lines) {
    const m = line.match(/^URL:\s*(https?:\/\/\S+)\s*$/i);
    if (m) {
      inlineUrl = m[1].trim();
      break;
    }
  }

  let firstContentIdx = 0;
  while (firstContentIdx < lines.length && !lines[firstContentIdx].trim()) firstContentIdx += 1;

  let sourceH1 = null;
  let removedTopH1 = false;
  if (firstContentIdx < lines.length) {
    const h1 = lines[firstContentIdx].match(/^#\s+(.+?)\s*$/);
    if (h1) {
      sourceH1 = h1[1].trim();
      lines.splice(firstContentIdx, 1);
      removedTopH1 = true;
    }
  }

  const contentWithoutUrl = lines.filter((line) => !/^URL:\s*(https?:\/\/\S+)\s*$/i.test(line));
  const markdown = contentWithoutUrl.join('\n').trim();
  const html = markdown ? md.render(markdown) : '';

  return {
    filename,
    fileKey: normalizeKey(path.basename(filename, '.md')),
    h1Key: normalizeKey(sourceH1),
    urlPath: normalizePathname(inlineUrl || urlFromIndex),
    sourceH1,
    removedTopH1,
    markdown,
    html,
  };
}

function loadArticles() {
  if (cache) return cache;
  const indexUrlByFile = parseIndexMappings();
  const files = fs.existsSync(ARCHIVE_DIR)
    ? fs.readdirSync(ARCHIVE_DIR).filter((name) => name.toLowerCase().endsWith('.md') && name !== '00-INDEX.md')
    : [];

  const articles = files.map((name) => {
    const fp = path.join(ARCHIVE_DIR, name);
    return parseArticle(fp, indexUrlByFile.get(name));
  });

  const byUrl = new Map();
  const byFile = new Map();
  const byH1 = new Map();

  for (const article of articles) {
    if (article.urlPath) byUrl.set(article.urlPath, article);
    if (article.fileKey) byFile.set(article.fileKey, article);
    if (article.h1Key) byH1.set(article.h1Key, article);
  }

  cache = { articles, byUrl, byFile, byH1 };
  return cache;
}

function findArticle({ urlPath, filenameCandidates = [], h1Candidates = [] }) {
  const store = loadArticles();

  const normalizedUrl = normalizePathname(urlPath);
  if (normalizedUrl && store.byUrl.has(normalizedUrl)) {
    return { article: store.byUrl.get(normalizedUrl), matchType: 'url' };
  }

  for (const candidate of filenameCandidates) {
    const key = normalizeKey(candidate);
    if (key && store.byFile.has(key)) {
      return { article: store.byFile.get(key), matchType: 'filename' };
    }
  }

  for (const candidate of h1Candidates) {
    const key = normalizeKey(candidate);
    if (key && store.byH1.has(key)) {
      return { article: store.byH1.get(key), matchType: 'h1' };
    }
  }

  return { article: null, matchType: null };
}

function getAllArticles() {
  return loadArticles().articles;
}

module.exports = {
  findArticle,
  getAllArticles,
  normalizePathname,
};
