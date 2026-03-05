// SQLite service — categories, landing pages only.
// Products / grades / groups are now served from MySQL via services/lenta.js.
const db = require('../db/db');

function getRootCategories() {
  return db.prepare(`
    SELECT * FROM categories WHERE parent_id IS NULL AND is_published = 1 AND slug != 'list'
    ORDER BY sort_order, name
  `).all();
}

function getCategoryBySlug(slug) {
  return db.prepare('SELECT * FROM categories WHERE slug = ? AND is_published = 1').get(slug);
}

function getCategoryById(id) {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

function getSubcategories(parentId) {
  return db.prepare(`
    SELECT * FROM categories WHERE parent_id = ? AND is_published = 1 ORDER BY sort_order, name
  `).all(parentId);
}

function getLandingByCategoryAndSlug(categoryId, landingSlug) {
  return db.prepare(`
    SELECT * FROM landing_pages WHERE category_id = ? AND slug = ? AND is_published = 1
  `).get(categoryId, landingSlug);
}

function getCategoryBreadcrumbs(category) {
  const breadcrumbs = [];
  if (!category) return breadcrumbs;
  const all = db.prepare('SELECT id, parent_id, name, slug FROM categories').all();
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
