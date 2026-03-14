const db = require('../db/db');
const pool = require('../db/mysql');
const config = require('../config');

function toLastmod(date) {
  return date.toISOString().slice(0, 10);
}

async function getSitemapUrls() {
  const base  = config.siteUrl;
  const today = toLastmod(new Date());
  const urls = [
    { loc: base + '/',              changefreq: 'daily',   priority: 1.0, lastmod: today },
    { loc: base + '/about/',        changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: base + '/contacts/',     changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: base + '/delivery/',     changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: base + '/payment/',      changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: base + '/faq/',          changefreq: 'monthly', priority: 0.5, lastmod: today },
    { loc: base + '/certificates/', changefreq: 'monthly', priority: 0.5, lastmod: today },
  ];

  // SQLite: published categories — /:slug/
  try {
    const categories = db.prepare(
      'SELECT slug, updated_at FROM categories WHERE is_published = 1 ORDER BY slug'
    ).all();
    categories.forEach(c => {
      urls.push({
        loc: base + '/' + c.slug + '/',
        changefreq: 'weekly',
        priority: 0.8,
        lastmod: c.updated_at ? toLastmod(new Date(c.updated_at)) : today,
      });
    });
  } catch (_) {}

  // SQLite: published landing pages with robots=index — /:categorySlug/:landingSlug/
  try {
    const landings = db.prepare(`
      SELECT lp.slug, lp.updated_at, lp.robots, c.slug AS cat_slug
      FROM landing_pages lp
      JOIN categories c ON lp.category_id = c.id
      WHERE lp.is_published = 1
        AND c.is_published = 1
        AND (lp.robots IS NULL OR lp.robots LIKE '%index%')
      ORDER BY c.slug, lp.slug
    `).all();
    landings.forEach(l => {
      urls.push({
        loc: base + '/' + l.cat_slug + '/' + l.slug + '/',
        changefreq: 'weekly',
        priority: 0.7,
        lastmod: l.updated_at ? toLastmod(new Date(l.updated_at)) : today,
      });
    });
  } catch (_) {}

  // Grade pages — /:slug/  (grades table has no updated_at, use created_at)
  try {
    const [grades] = await pool.query('SELECT slug, created_at FROM grades ORDER BY slug');
    grades.forEach(g => {
      urls.push({
        loc: base + '/' + g.slug + '/',
        changefreq: 'weekly',
        priority: 0.8,
        lastmod: g.created_at ? toLastmod(new Date(g.created_at)) : today,
      });
    });
  } catch (_) {}

  // Group pages — /:slug/  (groups table has no updated_at, use created_at)
  try {
    const [groups] = await pool.query('SELECT slug, created_at FROM `groups` ORDER BY slug');
    groups.forEach(g => {
      urls.push({
        loc: base + '/' + g.slug + '/',
        changefreq: 'weekly',
        priority: 0.7,
        lastmod: g.created_at ? toLastmod(new Date(g.created_at)) : today,
      });
    });
  } catch (_) {}

  // Product pages — /:gradeSlug/:productSlug/
  try {
    const [products] = await pool.query(`
      SELECT p.slug, p.updated_at, gr.slug AS grade_slug
      FROM products p
      JOIN grades gr ON p.grade_id = gr.id
      ORDER BY gr.slug, p.slug
    `);
    products.forEach(p => {
      urls.push({
        loc: base + '/' + p.grade_slug + '/' + p.slug + '/',
        changefreq: 'weekly',
        priority: 0.6,
        lastmod: p.updated_at ? toLastmod(new Date(p.updated_at)) : today,
      });
    });
  } catch (_) {}

  return urls;
}

async function getSitemapHtmlLinks() {
  const urls = await getSitemapUrls();
  return urls.map(u => ({ url: u.loc, label: u.loc.replace(config.siteUrl, '') || '/' }));
}

module.exports = { getSitemapUrls, getSitemapHtmlLinks };
