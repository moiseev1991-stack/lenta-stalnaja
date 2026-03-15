// MySQL service — categories and landing pages.
// Products / grades / groups are served from MySQL via services/lenta.js.
const pool = require('../db/mysql');

async function getRootCategories() {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM categories
      WHERE parent_id IS NULL AND is_published = 1 AND slug != 'list'
      ORDER BY sort_order, name
    `);
    return rows;
  } catch (_) { return []; }
}

async function getCategoryBySlug(slug) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM categories WHERE slug = ? AND is_published = 1',
      [slug]
    );
    return rows[0] || null;
  } catch (_) { return null; }
}

async function getCategoryById(id) {
  try {
    const [rows] = await pool.query('SELECT * FROM categories WHERE id = ?', [id]);
    return rows[0] || null;
  } catch (_) { return null; }
}

async function getSubcategories(parentId) {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM categories
      WHERE parent_id = ? AND is_published = 1
      ORDER BY sort_order, name
    `, [parentId]);
    return rows;
  } catch (_) { return []; }
}

async function getLandingByCategoryAndSlug(categoryId, landingSlug) {
  try {
    const [rows] = await pool.query(`
      SELECT * FROM landing_pages
      WHERE category_id = ? AND slug = ? AND is_published = 1
    `, [categoryId, landingSlug]);
    return rows[0] || null;
  } catch (_) { return null; }
}

async function getCategoryBreadcrumbs(category) {
  const breadcrumbs = [];
  if (!category) return breadcrumbs;
  try {
    const [all] = await pool.query('SELECT id, parent_id, name, slug FROM categories');
    const byId = {};
    all.forEach(c => { byId[c.id] = c; });
    const chain = [];
    let cur = category;
    while (cur) { chain.unshift(cur); cur = cur.parent_id ? byId[cur.parent_id] : null; }
    chain.forEach((c, i) => {
      breadcrumbs.push({
        name: c.name,
        url:  '/' + chain.slice(0, i + 1).map(x => x.slug).join('/') + '/',
      });
    });
  } catch (_) {}
  return breadcrumbs;
}

module.exports = {
  getRootCategories,
  getCategoryBySlug,
  getCategoryById,
  getSubcategories,
  getLandingByCategoryAndSlug,
  getCategoryBreadcrumbs,
};
