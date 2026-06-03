const pool = require('../db/mysql');
const config = require('../config');

const PRODUCTS_PER_CHUNK = 5000;

function toLastmod(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function todayLastmod() {
  return toLastmod(new Date()) || '2026-01-01';
}

function baseUrl() {
  return String(config.siteUrl || '').replace(/\/+$/, '');
}

function buildLoc(base, ...segments) {
  const rawBase = String(base || '').trim().replace(/\/+$/, '');
  const normalizedBase = /^https?:\/\//i.test(rawBase) ? rawBase : ('https://' + rawBase);
  const cleanSegments = segments
    .filter(Boolean)
    .map(s => String(s).trim())
    .filter(Boolean)
    .map(s => encodeURIComponent(s));
  const path = cleanSegments.length ? '/' + cleanSegments.join('/') + '/' : '/';
  try {
    return new URL(path, normalizedBase + '/').toString();
  } catch (_) {
    return null;
  }
}

// Slug'и, которые соответствуют редиректам / служебным / 404 роутам.
const RESERVED_TOP_LEVEL_SLUGS = new Set([
  'lenta', 'catalog', 'group', 'product', 'list',
  'admin', 'search', 'sitemap', 'sitemap.xml', 'robots.txt',
  'download', 'lead', 'yml.xml',
]);

function isReservedTopLevelLoc(loc) {
  if (!loc) return false;
  try {
    const segs = new URL(loc).pathname.split('/').filter(Boolean);
    if (segs.length !== 1) return false;
    return RESERVED_TOP_LEVEL_SLUGS.has(segs[0].toLowerCase());
  } catch (_) { return false; }
}

function finalizeUrls(urls, fallbackLastmod) {
  const seen = new Set();
  return urls.filter((u) => {
    if (!u || typeof u.loc !== 'string') return false;
    if (seen.has(u.loc)) return false;
    if (u.loc.length > 2048) return false;
    if (!/^https?:\/\//.test(u.loc)) return false;
    if (isReservedTopLevelLoc(u.loc)) return false;
    seen.add(u.loc);
    if (!u.lastmod) u.lastmod = fallbackLastmod;
    return true;
  });
}

// ── URL slices ────────────────────────────────────────────────────────────────

async function getStaticUrls() {
  const base  = baseUrl();
  const today = todayLastmod();
  const urls = [
    { loc: buildLoc(base),                 changefreq: 'weekly',  priority: 1.0, lastmod: today },
    { loc: buildLoc(base, 'about'),        changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: buildLoc(base, 'contacts'),     changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: buildLoc(base, 'delivery'),     changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: buildLoc(base, 'payment'),      changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: buildLoc(base, 'faq'),          changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: buildLoc(base, 'certificates'), changefreq: 'monthly', priority: 0.5, lastmod: today },
  ];

  try {
    const [categories] = await pool.query(
      'SELECT slug, updated_at FROM categories WHERE is_published = 1 ORDER BY slug'
    );
    categories.forEach(c => {
      urls.push({
        loc: buildLoc(base, c.slug),
        changefreq: 'weekly',
        priority: 0.8,
        lastmod: toLastmod(c.updated_at) || today,
      });
    });
  } catch (_) {}

  try {
    const [landings] = await pool.query(`
      SELECT lp.slug, lp.updated_at, lp.robots, c.slug AS cat_slug
      FROM landing_pages lp
      JOIN categories c ON lp.category_id = c.id
      WHERE lp.is_published = 1
        AND c.is_published = 1
        AND (lp.robots IS NULL OR lp.robots LIKE '%index%')
      ORDER BY c.slug, lp.slug
    `);
    landings.forEach(l => {
      urls.push({
        loc: buildLoc(base, l.cat_slug, l.slug),
        changefreq: 'weekly',
        priority: 0.7,
        lastmod: toLastmod(l.updated_at) || today,
      });
    });
  } catch (_) {}

  return finalizeUrls(urls, today);
}

async function getGradeUrls() {
  const base  = baseUrl();
  const today = todayLastmod();
  const urls = [];
  try {
    const [grades] = await pool.query(
      'SELECT slug, COALESCE(updated_at, created_at) AS lastmod_at FROM grades ORDER BY slug'
    );
    grades.forEach(g => {
      urls.push({
        loc: buildLoc(base, g.slug),
        changefreq: 'weekly',
        priority: 0.9,
        lastmod: toLastmod(g.lastmod_at) || today,
      });
    });
  } catch (_) {}
  return finalizeUrls(urls, today);
}

async function getGroupUrls() {
  const base  = baseUrl();
  const today = todayLastmod();
  const urls = [];
  try {
    const [groups] = await pool.query(
      'SELECT slug, COALESCE(updated_at, created_at) AS lastmod_at FROM `groups` ORDER BY slug'
    );
    groups.forEach(g => {
      urls.push({
        loc: buildLoc(base, g.slug),
        changefreq: 'weekly',
        priority: 0.8,
        lastmod: toLastmod(g.lastmod_at) || today,
      });
    });
  } catch (_) {}
  return finalizeUrls(urls, today);
}

async function getProductCount() {
  try {
    const [[row]] = await pool.query(`
      SELECT COUNT(*) AS c
      FROM products p
      JOIN grades gr ON p.grade_id = gr.id
      WHERE gr.slug IS NOT NULL AND gr.slug != ''
    `);
    return Number(row.c) || 0;
  } catch (_) { return 0; }
}

async function getProductUrls(offset = 0, limit = PRODUCTS_PER_CHUNK) {
  const base  = baseUrl();
  const today = todayLastmod();
  const urls = [];
  try {
    const [products] = await pool.query(`
      SELECT p.slug, p.updated_at, gr.slug AS grade_slug
      FROM products p
      JOIN grades gr ON p.grade_id = gr.id
      WHERE gr.slug IS NOT NULL AND gr.slug != ''
      ORDER BY gr.slug, p.slug
      LIMIT ? OFFSET ?
    `, [Number(limit), Number(offset)]);
    products.forEach(p => {
      urls.push({
        loc: buildLoc(base, p.grade_slug, p.slug),
        changefreq: 'monthly',
        priority: 0.7,
        lastmod: toLastmod(p.updated_at) || today,
      });
    });
  } catch (_) {}
  return finalizeUrls(urls, today);
}

// ── Sitemap index ─────────────────────────────────────────────────────────────

async function getSitemapIndex() {
  const base  = baseUrl();
  const today = todayLastmod();
  const productCount  = await getProductCount();
  const productChunks = Math.max(1, Math.ceil(productCount / PRODUCTS_PER_CHUNK));
  const items = [
    { loc: base + '/sitemap-static.xml', lastmod: today },
    { loc: base + '/sitemap-grades.xml', lastmod: today },
    { loc: base + '/sitemap-groups.xml', lastmod: today },
  ];
  for (let i = 1; i <= productChunks; i++) {
    items.push({ loc: base + '/sitemap-products-' + i + '.xml', lastmod: today });
  }
  return items;
}

// ── Legacy aggregator (still used for /sitemap/ HTML page) ────────────────────

async function getSitemapUrls() {
  const [staticU, gradeU, groupU, prodCount] = await Promise.all([
    getStaticUrls(), getGradeUrls(), getGroupUrls(), getProductCount(),
  ]);
  const chunks = Math.max(1, Math.ceil(prodCount / PRODUCTS_PER_CHUNK));
  const productSlices = await Promise.all(
    Array.from({ length: chunks }, (_, i) => getProductUrls(i * PRODUCTS_PER_CHUNK, PRODUCTS_PER_CHUNK))
  );
  const all = [...staticU, ...gradeU, ...groupU, ...productSlices.flat()];
  return finalizeUrls(all, todayLastmod());
}

async function getSitemapHtmlLinks() {
  const urls = await getSitemapUrls();
  return urls.map(u => ({ url: u.loc, label: u.loc.replace(config.siteUrl, '') || '/' }));
}

module.exports = {
  PRODUCTS_PER_CHUNK,
  getSitemapUrls,
  getSitemapHtmlLinks,
  getSitemapIndex,
  getStaticUrls,
  getGradeUrls,
  getGroupUrls,
  getProductCount,
  getProductUrls,
};
