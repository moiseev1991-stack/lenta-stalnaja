const pool = require('../db/mysql');
const config = require('../config');

// UI state keys → possible values stored in DB
const STATE_MAP = {
  soft:  ['М', 'M', 'soft',  'мягкая',             'Мягкая'],
  hard:  ['Н', 'H', 'hard',  'нагартованная',       'Нагартованная'],
  semi:  ['ПН', 'пн', 'semi', 'полунагартованная',  'Полунагартованная'],
  extra: ['ВН', 'вн', 'extra','высоконагартованная','Высоконагартованная'],
};

function mapStateValues(stateFilters) {
  if (!stateFilters || !stateFilters.length) return [];
  const out = [];
  stateFilters.forEach(key => {
    if (STATE_MAP[key]) out.push(...STATE_MAP[key]);
    else out.push(key);
  });
  return out;
}

function imageUrl(filename) {
  if (!filename) return null;
  const f = filename.trim();
  if (f.startsWith('/')) return f;
  return '/uploads/products/' + f;
}

// Normalise a MySQL product row to the shape expected by Nunjucks templates.
// Templates use: mark, standard, price, stock_qty, image_url, unit, seo_h1.
function mapProduct(row) {
  if (!row) return null;
  return {
    ...row,
    mark:       row.grade_name  || null,
    standard:   row.gost        || null,
    price:      row.price_per_kg != null ? parseFloat(row.price_per_kg) : null,
    stock_qty:  row.stock_kg    != null ? parseFloat(row.stock_kg)    : null,
    seo_h1:     row.h1          || null,
    image_url:  imageUrl(row.image_filename),
    unit:       'kg',
    category_slug: 'lenta',
    category_name: 'Лента',
    is_published:  1,
  };
}

// Base SELECT used in product queries — always JOINs grades and groups.
const BASE_SELECT = `
  SELECT p.*,
    gr.id   AS grade_id,
    gr.name AS grade_name,
    gr.slug AS grade_slug,
    gr.aisi_analog AS grade_aisi_analog,
    grp.id   AS group_id_val,
    grp.name AS group_name_val,
    grp.slug AS group_slug_val
  FROM products p
  JOIN grades gr ON p.grade_id = gr.id
  LEFT JOIN \`groups\` grp ON p.group_id = grp.id
`;

// Build WHERE clause and params from filters object.
function buildWhere(filters) {
  const conditions = [];
  const params = [];

  if (filters.mark && filters.mark.length) {
    conditions.push('gr.name IN (' + filters.mark.map(() => '?').join(',') + ')');
    params.push(...filters.mark);
  }
  if (filters.thickness && filters.thickness.length) {
    conditions.push('p.thickness_mm IN (' + filters.thickness.map(() => '?').join(',') + ')');
    params.push(...filters.thickness.map(Number));
  }
  if (filters.width && filters.width.length) {
    conditions.push('p.width_mm IN (' + filters.width.map(() => '?').join(',') + ')');
    params.push(...filters.width.map(Number));
  }
  if (filters.surface && filters.surface.length) {
    conditions.push('p.surface IN (' + filters.surface.map(() => '?').join(',') + ')');
    params.push(...filters.surface);
  }
  if (filters.state && filters.state.length) {
    const mapped = mapStateValues(filters.state);
    if (mapped.length) {
      conditions.push('p.state IN (' + mapped.map(() => '?').join(',') + ')');
      params.push(...mapped);
    }
  }
  if (filters.standard && filters.standard.length) {
    conditions.push('p.gost IN (' + filters.standard.map(() => '?').join(',') + ')');
    params.push(...filters.standard);
  }
  if (filters.q && filters.q.trim()) {
    const q = '%' + filters.q.trim() + '%';
    conditions.push('(p.name LIKE ? OR gr.name LIKE ? OR p.gost LIKE ? OR p.slug LIKE ?)');
    params.push(q, q, q, q);
  }

  return { conditions, params };
}

// COUNT helper — same JOIN as BASE_SELECT.
const COUNT_FROM = `
  FROM products p
  JOIN grades gr ON p.grade_id = gr.id
  LEFT JOIN \`groups\` grp ON p.group_id = grp.id
`;

// ── Groups ────────────────────────────────────────────────────────────────────

async function getAllGroups() {
  const [rows] = await pool.query(`
    SELECT g.*,
      (SELECT COUNT(*) FROM products p WHERE p.group_id = g.id) AS product_count
    FROM \`groups\` g
    ORDER BY g.name
  `);
  return rows;
}

async function getGroupBySlug(slug) {
  const [rows] = await pool.query('SELECT * FROM `groups` WHERE slug = ?', [slug]);
  return rows[0] || null;
}

// ── Grades ────────────────────────────────────────────────────────────────────

async function getAllGrades() {
  const [rows] = await pool.query(`
    SELECT gr.*,
      g.name AS group_name, g.slug AS group_slug,
      (SELECT COUNT(*) FROM products p WHERE p.grade_id = gr.id) AS product_count
    FROM grades gr
    LEFT JOIN \`groups\` g ON gr.group_id = g.id
    ORDER BY gr.name
  `);
  return rows;
}

async function getGradeBySlug(slug) {
  const [rows] = await pool.query(`
    SELECT gr.*, g.name AS group_name, g.slug AS group_slug
    FROM grades gr
    LEFT JOIN \`groups\` g ON gr.group_id = g.id
    WHERE gr.slug = ?
  `, [slug]);
  return rows[0] || null;
}

async function getGradesByGroup(groupId) {
  const [rows] = await pool.query(`
    SELECT gr.*,
      (SELECT COUNT(*) FROM products p WHERE p.grade_id = gr.id) AS product_count
    FROM grades gr
    WHERE gr.group_id = ?
    ORDER BY gr.name
  `, [groupId]);
  return rows;
}

async function getTopGrades(limit = 8) {
  const [rows] = await pool.query(`
    SELECT gr.*,
      g.name AS group_name, g.slug AS group_slug,
      (SELECT COUNT(*) FROM products p WHERE p.grade_id = gr.id) AS product_count
    FROM grades gr
    LEFT JOIN \`groups\` g ON gr.group_id = g.id
    ORDER BY product_count DESC
    LIMIT ?
  `, [limit]);
  return rows;
}

async function searchGrades(query) {
  if (!query || !query.trim()) return getAllGrades();
  const q = '%' + query.trim() + '%';
  const [rows] = await pool.query(`
    SELECT gr.*,
      g.name AS group_name, g.slug AS group_slug,
      (SELECT COUNT(*) FROM products p WHERE p.grade_id = gr.id) AS product_count
    FROM grades gr
    LEFT JOIN \`groups\` g ON gr.group_id = g.id
    WHERE gr.name LIKE ?
    ORDER BY gr.name
  `, [q]);
  return rows;
}

// ── Products by grade ─────────────────────────────────────────────────────────

async function getProductsByGrade(gradeName, filters = {}, page = 1) {
  const perPage = config.catalogPerPage;
  const offset  = (page - 1) * perPage;
  const merged  = { ...filters, mark: [gradeName] };
  const { conditions, params } = buildWhere(merged);
  const where = 'WHERE ' + conditions.join(' AND ');

  const [[{ c: total }]] = await pool.query(
    `SELECT COUNT(*) AS c ${COUNT_FROM} ${where}`, params);

  const [rows] = await pool.query(
    BASE_SELECT + ` ${where} ORDER BY p.name LIMIT ? OFFSET ?`,
    [...params, perPage, offset]);

  return { products: rows.map(mapProduct), total, page, perPage,
    totalPages: Math.ceil(total / perPage) || 1 };
}

// ── Products by group ─────────────────────────────────────────────────────────

async function getProductsByGroup(groupId, filters = {}, page = 1) {
  const perPage = config.catalogPerPage;
  const offset  = (page - 1) * perPage;
  const { conditions, params } = buildWhere(filters);
  conditions.push('gr.group_id = ?');
  params.push(groupId);
  const where = 'WHERE ' + conditions.join(' AND ');

  const [[{ c: total }]] = await pool.query(
    `SELECT COUNT(*) AS c ${COUNT_FROM} ${where}`, params);

  const [rows] = await pool.query(
    BASE_SELECT + ` ${where} ORDER BY p.name LIMIT ? OFFSET ?`,
    [...params, perPage, offset]);

  return { products: rows.map(mapProduct), total, page, perPage,
    totalPages: Math.ceil(total / perPage) || 1 };
}

// ── All lenta products (with optional filters) ────────────────────────────────

async function getLentaProducts(filters = {}, page = 1) {
  const perPage = config.catalogPerPage;
  const offset  = (page - 1) * perPage;
  const { conditions, params } = buildWhere(filters);
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const [[{ c: total }]] = await pool.query(
    `SELECT COUNT(*) AS c ${COUNT_FROM} ${where}`, params);

  const [rows] = await pool.query(
    BASE_SELECT + ` ${where} ORDER BY p.name LIMIT ? OFFSET ?`,
    [...params, perPage, offset]);

  return { products: rows.map(mapProduct), total, page, perPage,
    totalPages: Math.ceil(total / perPage) || 1 };
}

// ── Filter value helpers ──────────────────────────────────────────────────────

function buildFilterValues(products) {
  const mandatoryThickness = [
    0.01, 0.02, 0.03, 0.05, 0.08, 0.10, 0.12, 0.15, 0.18, 0.20,
    0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70, 0.80,
    0.90, 1.00, 1.20, 1.50, 2.00, 2.50,
  ];
  const dbThickness = products.map(p => p.thickness_mm).filter(v => v != null);
  const allThickness = [...mandatoryThickness, ...dbThickness]
    .map(v => Math.round(v * 100) / 100)
    .filter(v => v >= 0.01 && v <= 2.5);
  const thickness = [...new Set(allThickness)].sort((a, b) => a - b);

  const width    = [...new Set(products.map(p => p.width_mm).filter(v => v != null))].sort((a, b) => a - b);
  const surface  = [...new Set(products.map(p => p.surface).filter(Boolean))].sort();
  const state    = [...new Set(products.map(p => p.state).filter(Boolean))].sort();
  const standard = [...new Set(products.map(p => p.standard).filter(Boolean))].sort();
  const marks    = [...new Set(products.map(p => p.mark).filter(Boolean))].sort();
  return { marks, thickness, width, surface, state, standard };
}

async function getFilterValuesByGrade(gradeName) {
  const [rows] = await pool.query(`
    SELECT p.thickness_mm, p.width_mm, p.surface, p.state, p.gost AS standard, gr.name AS mark
    FROM products p JOIN grades gr ON p.grade_id = gr.id
    WHERE gr.name = ?
  `, [gradeName]);
  return buildFilterValues(rows);
}

async function getFilterValuesByGroup(groupId) {
  const [rows] = await pool.query(`
    SELECT p.thickness_mm, p.width_mm, p.surface, p.state, p.gost AS standard, gr.name AS mark
    FROM products p JOIN grades gr ON p.grade_id = gr.id
    WHERE gr.group_id = ?
  `, [groupId]);
  return buildFilterValues(rows);
}

async function getLentaFilterValues() {
  const [rows] = await pool.query(`
    SELECT p.thickness_mm, p.width_mm, p.surface, p.state, p.gost AS standard, gr.name AS mark
    FROM products p JOIN grades gr ON p.grade_id = gr.id
  `);
  return buildFilterValues(rows);
}

// ── Single product ────────────────────────────────────────────────────────────

async function getProductBySlug(slug) {
  const [rows] = await pool.query(BASE_SELECT + ' WHERE p.slug = ?', [slug]);
  return mapProduct(rows[0] || null);
}

async function getSimilarProducts(gradeId, excludeId, limit = 4) {
  if (!gradeId) return [];
  const [rows] = await pool.query(
    BASE_SELECT + ' WHERE p.grade_id = ? AND p.id != ? ORDER BY RAND() LIMIT ?',
    [gradeId, excludeId || 0, limit]);
  return rows.map(mapProduct);
}

async function getProductsByGradeId(gradeId, excludeId, limit = 12) {
  if (!gradeId) return [];
  const [rows] = await pool.query(
    BASE_SELECT + ' WHERE p.grade_id = ? AND p.id != ? ORDER BY p.thickness_mm, p.width_mm LIMIT ?',
    [gradeId, excludeId || 0, limit]
  );
  return rows.map(mapProduct);
}

async function getProductsByThickness(thicknessMm, excludeId, limit = 12) {
  if (thicknessMm == null) return [];
  const [rows] = await pool.query(
    BASE_SELECT + ' WHERE p.thickness_mm = ? AND p.id != ? ORDER BY gr.name, p.width_mm LIMIT ?',
    [thicknessMm, excludeId || 0, limit]
  );
  return rows.map(mapProduct);
}

// ── Search ────────────────────────────────────────────────────────────────────

async function searchProducts(q, page = 1) {
  const perPage = config.catalogPerPage;
  const offset  = (page - 1) * perPage;
  const term    = '%' + (q || '').trim() + '%';

  const [[{ c: total }]] = await pool.query(`
    SELECT COUNT(*) AS c
    FROM products p JOIN grades gr ON p.grade_id = gr.id
    WHERE p.name LIKE ? OR gr.name LIKE ? OR p.gost LIKE ? OR p.slug LIKE ?
  `, [term, term, term, term]);

  const [rows] = await pool.query(
    BASE_SELECT + `
    WHERE p.name LIKE ? OR gr.name LIKE ? OR p.gost LIKE ? OR p.slug LIKE ?
    ORDER BY p.name LIMIT ? OFFSET ?
  `, [term, term, term, term, perPage, offset]);

  return { products: rows.map(mapProduct), total, page, perPage,
    totalPages: Math.ceil(total / perPage) || 1 };
}

// ── Slug helper (kept for compatibility) ──────────────────────────────────────

function slugify(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[хХ]/g, 'h').replace(/[сС]/g, 's').replace(/[нН]/g, 'n').replace(/[юЮ]/g, 'yu')
    .replace(/[а-яё]/gi, c => {
      const m = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'j',к:'k',
        л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',
        ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
      return m[c.toLowerCase()] || c;
    })
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

module.exports = {
  slugify,
  getAllGroups,
  getGroupBySlug,
  getAllGrades,
  getGradeBySlug,
  getGradesByGroup,
  getTopGrades,
  searchGrades,
  getProductsByGrade,
  getProductsByGroup,
  getLentaProducts,
  getFilterValuesByGrade,
  getFilterValuesByGroup,
  getLentaFilterValues,
  getProductBySlug,
  getSimilarProducts,
  getProductsByGradeId,
  getProductsByThickness,
  searchProducts,
};
