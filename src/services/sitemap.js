const db = require('../db/db');
const pool = require('../db/mysql');
const config = require('../config');

async function getSitemapUrls() {
  const base = config.siteUrl;
  const urls = [
    { loc: base + '/',           changefreq: 'daily',   priority: 1.0 },
    { loc: base + '/about/',     changefreq: 'monthly', priority: 0.5 },
    { loc: base + '/contacts/',  changefreq: 'monthly', priority: 0.5 },
    { loc: base + '/delivery/',  changefreq: 'monthly', priority: 0.5 },
    { loc: base + '/payment/',   changefreq: 'monthly', priority: 0.5 },
  ];

  try {
    // Grade pages — /:slug/
    const [grades] = await pool.query('SELECT slug FROM grades ORDER BY slug');
    grades.forEach(g => {
      urls.push({ loc: base + '/' + g.slug + '/', changefreq: 'weekly', priority: 0.8 });
    });

    // Group pages — /:slug/
    const [groups] = await pool.query('SELECT slug FROM `groups` ORDER BY slug');
    groups.forEach(g => {
      urls.push({ loc: base + '/' + g.slug + '/', changefreq: 'weekly', priority: 0.7 });
    });

    // Product pages — /:gradeSlug/:productSlug/
    const [products] = await pool.query(`
      SELECT p.slug, gr.slug AS grade_slug
      FROM products p
      JOIN grades gr ON p.grade_id = gr.id
      ORDER BY gr.slug, p.slug
    `);
    products.forEach(p => {
      urls.push({
        loc: base + '/' + p.grade_slug + '/' + p.slug + '/',
        changefreq: 'weekly',
        priority: 0.6,
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
