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

  try {
    // Grade pages — /:slug/
    const [grades] = await pool.query('SELECT slug, updated_at FROM grades ORDER BY slug');
    grades.forEach(g => {
      urls.push({
        loc: base + '/' + g.slug + '/',
        changefreq: 'weekly',
        priority: 0.8,
        lastmod: g.updated_at ? toLastmod(new Date(g.updated_at)) : today,
      });
    });

    // Group pages — /:slug/
    const [groups] = await pool.query('SELECT slug, updated_at FROM `groups` ORDER BY slug');
    groups.forEach(g => {
      urls.push({
        loc: base + '/' + g.slug + '/',
        changefreq: 'weekly',
        priority: 0.7,
        lastmod: g.updated_at ? toLastmod(new Date(g.updated_at)) : today,
      });
    });

    // Product pages — /:gradeSlug/:productSlug/
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
