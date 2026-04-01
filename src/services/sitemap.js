const pool = require('../db/mysql');
const config = require('../config');

function toLastmod(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildLoc(baseUrl, ...segments) {
  const rawBase = String(baseUrl || '').trim().replace(/\/+$/, '');
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

function finalizeUrls(urls, fallbackLastmod) {
  const seen = new Set();
  return urls.filter((u) => {
    if (!u || typeof u.loc !== 'string') return false;
    if (seen.has(u.loc)) return false;
    if (u.loc.length > 2048) return false;
    if (!/^https?:\/\//.test(u.loc)) return false;
    seen.add(u.loc);
    if (!u.lastmod) u.lastmod = fallbackLastmod;
    return true;
  });
}

async function getSitemapUrls() {
  const base  = config.siteUrl;
  const today = toLastmod(new Date()) || '2026-01-01';
  const urls = [
    { loc: buildLoc(base),               changefreq: 'daily',   priority: 1.0, lastmod: today },
    { loc: buildLoc(base, 'about'),      changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: buildLoc(base, 'contacts'),   changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: buildLoc(base, 'delivery'),   changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: buildLoc(base, 'payment'),    changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: buildLoc(base, 'faq'),        changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: buildLoc(base, 'certificates'), changefreq: 'monthly', priority: 0.5, lastmod: today },
  ];

  // MySQL: published categories
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

  // MySQL: published landing pages with robots=index
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

  // Grade pages
  try {
    const [grades] = await pool.query('SELECT slug, created_at FROM grades ORDER BY slug');
    grades.forEach(g => {
      urls.push({
        loc: buildLoc(base, g.slug),
        changefreq: 'weekly',
        priority: 0.8,
        lastmod: toLastmod(g.created_at) || today,
      });
    });
  } catch (_) {}

  // Group pages
  try {
    const [groups] = await pool.query('SELECT slug, created_at FROM `groups` ORDER BY slug');
    groups.forEach(g => {
      urls.push({
        loc: buildLoc(base, g.slug),
        changefreq: 'weekly',
        priority: 0.7,
        lastmod: toLastmod(g.created_at) || today,
      });
    });
  } catch (_) {}

  // Product pages
  try {
    const [products] = await pool.query(`
      SELECT p.slug, p.updated_at, gr.slug AS grade_slug
      FROM products p
      JOIN grades gr ON p.grade_id = gr.id
      ORDER BY gr.slug, p.slug
    `);
    products.forEach(p => {
      urls.push({
        loc: buildLoc(base, p.grade_slug, p.slug),
        changefreq: 'weekly',
        priority: 0.6,
        lastmod: toLastmod(p.updated_at) || today,
      });
    });
  } catch (_) {}

  return finalizeUrls(urls, today);
}

async function getSitemapHtmlLinks() {
  const urls = await getSitemapUrls();
  return urls.map(u => ({ url: u.loc, label: u.loc.replace(config.siteUrl, '') || '/' }));
}

module.exports = { getSitemapUrls, getSitemapHtmlLinks };
