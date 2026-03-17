const path = require('path');
const fs = require('fs');
const pool = require('../db/mysql');
const bcrypt = require('bcryptjs');
const config = require('../config');
const { buildGradeSEO, buildGroupSEO, buildProductSEO } = require('../helpers/seoTemplates');
const csv = require('../services/csv');

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSlug(name) {
  return name.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9а-яёa-z-]/gi, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function getSetting(key) {
  try {
    const [[row]] = await pool.query('SELECT value FROM settings WHERE `key` = ?', [key]);
    return (row && row.value) ? row.value : '';
  } catch (_) { return ''; }
}

async function setSetting(key, value) {
  try {
    await pool.query(
      'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [key, value || '']
    );
  } catch (_) {}
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function loginForm(req, res) {
  if (req.session && req.session.adminUserId) return res.redirect('/admin');
  res.render('admin/login.html', { error: null });
}

async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    const [[user]] = await pool.query('SELECT * FROM admin_users WHERE username = ?', [username || '']);
    if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
      return res.render('admin/login.html', { error: 'Неверный логин или пароль' });
    }
    req.session.adminUserId = user.id;
    req.session.save(() => res.redirect('/admin'));
  } catch (err) {
    console.error('login error:', err.message);
    res.render('admin/login.html', { error: 'Ошибка сервера' });
  }
}

function logout(req, res) {
  req.session.destroy(() => res.redirect('/admin/login'));
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

async function dashboard(req, res) {
  let productsCount = 0;
  let gradesCount = 0;
  try {
    const [[pr]] = await pool.query('SELECT COUNT(*) AS c FROM products');
    productsCount = pr.c;
    const [[gr]] = await pool.query('SELECT COUNT(*) AS c FROM grades');
    gradesCount = gr.c;
  } catch (_) {}
  res.render('admin/dashboard.html', { productsCount, gradesCount });
}

// ─── Grades / Категории (MySQL) ───────────────────────────────────────────────

async function listCategories(req, res) {
  let grades = [];
  try {
    const [rows] = await pool.query(`
      SELECT g.*, grp.name AS group_name
      FROM grades g
      LEFT JOIN \`groups\` grp ON g.group_id = grp.id
      ORDER BY grp.name, g.name
    `);
    grades = rows;
  } catch (err) {
    console.error('listCategories error:', err.message);
  }
  res.render('admin/categories/list.html', { grades, error: req.query.error });
}

async function categoryForm(req, res, edit = false) {
  let groups = [];
  try {
    const [rows] = await pool.query('SELECT id, name FROM `groups` ORDER BY name');
    groups = rows;
  } catch (_) {}

  if (!edit) return res.render('admin/categories/form.html', { grade: null, groups, seoDefaults: null, error: req.query.error });

  try {
    const [[grade]] = await pool.query('SELECT * FROM grades WHERE id = ?', [req.params.id]);
    if (!grade) return res.status(404).send('Not found');
    const seoDefaults = buildGradeSEO(grade, config.siteName);
    res.render('admin/categories/form.html', { grade, groups, seoDefaults, error: req.query.error });
  } catch (err) {
    res.status(500).send('DB error: ' + err.message);
  }
}

async function saveCategory(req, res) {
  const id = req.params.id ? parseInt(req.params.id, 10) : null;
  const body = req.body || {};
  const name = (body.name || '').trim();
  if (!name) return res.redirect('/admin/categories' + (id ? '/' + id + '/edit' : '/new') + '?error=name');

  const slug = (body.slug || '').trim() || makeSlug(name);
  const group_id = body.group_id ? parseInt(body.group_id, 10) : null;
  const is_active = body.is_active === '1' ? 1 : 0;
  const seo_h1 = body.seo_h1 || null;
  const seo_title = body.seo_title || null;
  const seo_description = body.seo_description || null;
  const intro = body.intro || null;
  const article_title = body.article_title || null;
  const article_text = body.article_text || null;
  const article_format = body.article_format || 'html';

  try {
    if (id) {
      await pool.query(`
        UPDATE grades SET name=?, slug=?, group_id=?, is_active=?,
          seo_h1=?, seo_title=?, seo_description=?,
          intro=?, article_title=?, article_text=?, article_format=?
        WHERE id=?
      `, [name, slug, group_id, is_active, seo_h1, seo_title, seo_description,
          intro, article_title, article_text, article_format, id]);
    } else {
      await pool.query(`
        INSERT INTO grades (name, slug, group_id, is_active, seo_h1, seo_title, seo_description,
          intro, article_title, article_text, article_format)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [name, slug, group_id, is_active, seo_h1, seo_title, seo_description,
          intro, article_title, article_text, article_format]);
    }
    res.redirect('/admin/categories');
  } catch (err) {
    console.error('saveCategory error:', err.message);
    res.redirect('/admin/categories' + (id ? '/' + id + '/edit' : '/new') + '?error=db');
  }
}

async function deleteCategory(req, res) {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM grades WHERE id = ?', [id]);
  } catch (err) {
    console.error('deleteCategory error:', err.message);
  }
  res.redirect('/admin/categories');
}

// ─── Groups / Группы (MySQL) ──────────────────────────────────────────────────

async function listGroups(req, res) {
  let groups = [];
  try {
    const [rows] = await pool.query('SELECT * FROM `groups` ORDER BY name');
    groups = rows;
  } catch (err) {
    console.error('listGroups error:', err.message);
  }
  res.render('admin/groups/list.html', { groups, error: req.query.error });
}

async function groupForm(req, res, edit = false) {
  if (!edit) return res.render('admin/groups/form.html', { group: null, seoDefaults: null, error: req.query.error });
  try {
    const [[group]] = await pool.query('SELECT * FROM `groups` WHERE id = ?', [req.params.id]);
    if (!group) return res.status(404).send('Not found');
    const seoDefaults = buildGroupSEO(group, config.siteName);
    res.render('admin/groups/form.html', { group, seoDefaults, error: req.query.error });
  } catch (err) {
    res.status(500).send('DB error: ' + err.message);
  }
}

async function saveGroup(req, res) {
  const id = req.params.id ? parseInt(req.params.id, 10) : null;
  const body = req.body || {};
  const name = (body.name || '').trim();
  if (!name) return res.redirect('/admin/groups' + (id ? '/' + id + '/edit' : '/new') + '?error=name');

  const slug = (body.slug || '').trim() || makeSlug(name);
  const is_active = body.is_active === '1' ? 1 : 0;
  const seo_h1 = body.seo_h1 || null;
  const seo_title = body.seo_title || null;
  const seo_description = body.seo_description || null;
  const intro = body.intro || null;
  const article_title = body.article_title || null;
  const article_text = body.article_text || null;
  const article_format = body.article_format || 'html';

  try {
    if (id) {
      await pool.query(`
        UPDATE \`groups\` SET name=?, slug=?, is_active=?,
          seo_h1=?, seo_title=?, seo_description=?,
          intro=?, article_title=?, article_text=?, article_format=?
        WHERE id=?
      `, [name, slug, is_active, seo_h1, seo_title, seo_description,
          intro, article_title, article_text, article_format, id]);
    } else {
      await pool.query(`
        INSERT INTO \`groups\` (name, slug, is_active, seo_h1, seo_title, seo_description,
          intro, article_title, article_text, article_format)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [name, slug, is_active, seo_h1, seo_title, seo_description,
          intro, article_title, article_text, article_format]);
    }
    res.redirect('/admin/groups');
  } catch (err) {
    console.error('saveGroup error:', err.message);
    res.redirect('/admin/groups' + (id ? '/' + id + '/edit' : '/new') + '?error=db');
  }
}

async function deleteGroup(req, res) {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM `groups` WHERE id = ?', [id]);
  } catch (err) {
    console.error('deleteGroup error:', err.message);
  }
  res.redirect('/admin/groups');
}

// ─── Products (MySQL) ────────────────────────────────────────────────────────

async function listProducts(req, res) {
  const q = (req.query.q || '').trim();
  const gradeId = req.query.grade_id ? parseInt(req.query.grade_id, 10) : null;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const perPage = 50;
  const offset = (page - 1) * perPage;

  let grades = [];
  let products = [];
  let total = 0;

  try {
    const [gradeRows] = await pool.query('SELECT id, name FROM grades ORDER BY name');
    grades = gradeRows;

    let where = 'WHERE 1=1';
    const params = [];
    if (q) {
      where += ' AND (p.name LIKE ? OR p.slug LIKE ?)';
      params.push('%' + q + '%', '%' + q + '%');
    }
    if (gradeId) {
      where += ' AND p.grade_id = ?';
      params.push(gradeId);
    }

    const [[countRow]] = await pool.query(`SELECT COUNT(*) AS c FROM products p ${where}`, params);
    total = countRow.c;

    const [rows] = await pool.query(
      `SELECT p.id, p.name, p.slug, p.price_per_kg, p.stock_kg, p.grade_id,
              g.name AS grade_name, g.slug AS grade_slug
       FROM products p
       JOIN grades g ON p.grade_id = g.id
       ${where}
       ORDER BY p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );
    products = rows;
  } catch (err) {
    console.error('MySQL listProducts error:', err.message);
  }

  const totalPages = Math.ceil(total / perPage);
  res.render('admin/products/list.html', {
    products, grades, query: q, gradeId, page, totalPages, total,
  });
}

async function productForm(req, res, edit = false) {
  let grades = [];
  try {
    const [rows] = await pool.query('SELECT id, name FROM grades ORDER BY name');
    grades = rows;
  } catch (_) {}

  if (!edit) return res.render('admin/products/form.html', { product: null, grades, seoDefaults: null, error: req.query.error });

  try {
    const [[product]] = await pool.query(`
      SELECT p.*, gr.name AS grade_name
      FROM products p
      LEFT JOIN grades gr ON p.grade_id = gr.id
      WHERE p.id = ?
    `, [req.params.id]);
    if (!product) return res.status(404).send('Not found');
    const productForSeo = { ...product, mark: product.grade_name, standard: product.gost, seo_h1: product.h1 };
    const seoDefaults = buildProductSEO(productForSeo, config.siteName);
    res.render('admin/products/form.html', { product, grades, seoDefaults, error: req.query.error });
  } catch (err) {
    res.status(500).send('DB error: ' + err.message);
  }
}

async function saveProduct(req, res) {
  const id = req.params.id ? parseInt(req.params.id, 10) : null;
  const body = req.body || {};
  const name = (body.name || '').trim();
  const grade_id = parseInt(body.grade_id, 10);
  if (!name || !grade_id) {
    return res.redirect('/admin/products' + (id ? '/' + id + '/edit' : '/new') + '?error=required');
  }

  const slug = (body.slug || '').trim() || makeSlug(name);
  const h1 = body.h1 || null;
  const seo_title = body.seo_title || null;
  const seo_description = body.seo_description || null;
  const short_text_html = body.short_text_html || null;
  const thickness_mm = body.thickness_mm !== '' ? parseFloat(body.thickness_mm) || null : null;
  const width_mm = body.width_mm !== '' ? parseFloat(body.width_mm) || null : null;
  const state = body.state || null;
  const spring_props = body.spring_props === '1' ? 1 : 0;
  const surface = body.surface || null;
  const price_per_kg = body.price_per_kg !== '' ? parseFloat(body.price_per_kg) || null : null;
  const in_stock = body.in_stock === '1' ? 1 : 0;
  const lead_time = body.lead_time || null;

  let image_filename = body.current_image_filename || null;
  if (req.file) image_filename = req.file.filename;

  try {
    if (id) {
      await pool.query(`
        UPDATE products SET name=?, slug=?, grade_id=?, h1=?, seo_title=?, seo_description=?,
          short_text_html=?, thickness_mm=?, width_mm=?, state=?, spring_props=?, surface=?,
          price_per_kg=?, stock_kg=?, lead_time=?, image_filename=?
        WHERE id=?
      `, [name, slug, grade_id, h1, seo_title, seo_description, short_text_html,
          thickness_mm, width_mm, state, spring_props, surface,
          price_per_kg, in_stock, lead_time, image_filename, id]);
    } else {
      await pool.query(`
        INSERT INTO products (name, slug, grade_id, h1, seo_title, seo_description,
          short_text_html, thickness_mm, width_mm, state, spring_props, surface,
          price_per_kg, stock_kg, lead_time, image_filename)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [name, slug, grade_id, h1, seo_title, seo_description, short_text_html,
          thickness_mm, width_mm, state, spring_props, surface,
          price_per_kg, in_stock, lead_time, image_filename]);
    }
    res.redirect('/admin/products');
  } catch (err) {
    console.error('saveProduct error:', err.message);
    res.redirect('/admin/products' + (id ? '/' + id + '/edit' : '/new') + '?error=db');
  }
}

async function deleteProduct(req, res) {
  const id = parseInt(req.params.id, 10);
  try {
    await pool.query('DELETE FROM products WHERE id = ?', [id]);
  } catch (err) {
    console.error('deleteProduct error:', err.message);
  }
  res.redirect('/admin/products');
}

// ─── Leads (MySQL) ───────────────────────────────────────────────────────────

async function listLeads(req, res) {
  try {
    const page    = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = 50;
    const offset  = (page - 1) * perPage;

    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM leads');
    const [leads] = await pool.query(`
      SELECT l.*, p.name AS product_name, p.slug AS product_slug
      FROM leads l
      LEFT JOIN products p ON l.product_id = p.id
      ORDER BY l.created_at DESC
      LIMIT ? OFFSET ?
    `, [perPage, offset]);

    const totalPages = Math.ceil(total / perPage) || 1;
    res.render('admin/leads.html', { leads, total, page, totalPages });
  } catch (err) {
    console.error('listLeads error:', err.message);
    res.render('admin/leads.html', { leads: [], total: 0, page: 1, totalPages: 1 });
  }
}

async function markLeadDone(req, res) {
  try {
    const id   = parseInt(req.params.id, 10);
    const done = req.body.done === '1' ? 1 : 0;
    await pool.query('UPDATE leads SET is_done = ? WHERE id = ?', [done, id]);
  } catch (_) {}
  const back = req.headers.referer || '/admin/leads';
  res.redirect(back);
}

// ─── CSV Import / Export ──────────────────────────────────────────────────────

function importForm(req, res) {
  res.render('admin/import.html', { error: null, rowsProcessed: null, rowsFailed: null, logs: [] });
}

async function handleImport(req, res) {
  if (!req.file || !req.file.buffer) {
    return res.render('admin/import.html', { error: 'Выберите файл CSV', rowsProcessed: null, rowsFailed: null, logs: [] });
  }
  const type = req.body.type || 'products';
  try {
    let result;
    if (type === 'categories') {
      result = await csv.importCategories(req.file.buffer);
    } else {
      result = await csv.importProducts(req.file.buffer);
    }
    res.render('admin/import.html', {
      error: result.error || null,
      rowsProcessed: result.rowsProcessed,
      rowsFailed: result.rowsFailed,
      logs: result.logs,
    });
  } catch (err) {
    res.render('admin/import.html', {
      error: 'Ошибка обработки файла: ' + err.message,
      rowsProcessed: null, rowsFailed: null, logs: [],
    });
  }
}

async function exportData(req, res) {
  const type = req.query.type || '';
  if (!type) return res.render('admin/export.html');

  try {
    let csvText, filename;
    if (type === 'products') {
      csvText  = await csv.exportProducts();
      filename = 'products.csv';
    } else if (type === 'categories') {
      csvText  = await csv.exportCategories();
      filename = 'categories.csv';
    } else if (type === 'landings') {
      csvText  = await csv.exportLandings();
      filename = 'landings.csv';
    } else {
      return res.render('admin/export.html');
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csvText);
  } catch (err) {
    res.status(500).send('Ошибка экспорта: ' + err.message);
  }
}

// ─── Main page settings ───────────────────────────────────────────────────────

async function mainPageForm(req, res) {
  try {
    res.render('admin/main-page.html', {
      home_title:            await getSetting('home_title'),
      home_h1:               await getSetting('home_h1'),
      home_meta_description: await getSetting('home_meta_description'),
      home_html:             await getSetting('home_html'),
      saved: req.query.saved === '1',
    });
  } catch (err) {
    res.status(500).send('DB error: ' + err.message);
  }
}

async function saveMainPage(req, res) {
  try {
    const body = req.body || {};
    await setSetting('home_title',            body.home_title);
    await setSetting('home_h1',               body.home_h1);
    await setSetting('home_meta_description', body.home_meta_description);
    await setSetting('home_html',             body.home_html);
    res.redirect('/admin/main-page?saved=1');
  } catch (err) {
    res.status(500).send('DB error: ' + err.message);
  }
}

// ─── Bonus page settings ──────────────────────────────────────────────────────

async function bonusPageForm(req, res) {
  try {
    res.render('admin/bonus-page.html', {
      bonus_h1:   await getSetting('bonus_h1'),
      bonus_html: await getSetting('bonus_html'),
      saved: req.query.saved === '1',
    });
  } catch (err) {
    res.status(500).send('DB error: ' + err.message);
  }
}

async function saveBonusPage(req, res) {
  try {
    const body = req.body || {};
    await setSetting('bonus_h1',   body.bonus_h1);
    await setSetting('bonus_html', body.bonus_html);
    res.redirect('/admin/bonus-page?saved=1');
  } catch (err) {
    res.status(500).send('DB error: ' + err.message);
  }
}

// ─── Database restore (SQL file upload) ──────────────────────────────────────

function dbRestoreForm(req, res) {
  res.render('admin/db-restore.html', { message: null, error: null });
}

// Исправление кодировки настроек (без загрузки файла) — только 4 запроса к settings
const FIX_SETTINGS_VALUES = [
  ['site_name', 'Лента стальная — каталог металлопроката'],
  ['home_title', 'Лента стальная — каталог металлопроката'],
  ['home_h1', 'Каталог металлопроката'],
  ['home_meta_description', 'Нержавеющая и конструкционная лента по ГОСТ. Наличие на складе, резка в размер, доставка по России.'],
];

async function fixSettingsEncoding(req, res) {
  let done = 0;
  try {
    for (const [key, val] of FIX_SETTINGS_VALUES) {
      await pool.query(
        'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
        [key, val, val]
      );
      done++;
    }
    res.render('admin/db-restore.html', {
      message: `Кодировка настроек исправлена: обновлено ${done} записей в таблице settings.`,
      error: null,
    });
  } catch (e) {
    res.render('admin/db-restore.html', {
      message: null,
      error: 'Ошибка: ' + (e.message || String(e)).substring(0, 200),
    });
  }
}

async function dbRestore(req, res) {
  if (!req.file) {
    return res.render('admin/db-restore.html', { message: null, error: 'Файл не выбран.' });
  }
  const sql = req.file.buffer.toString('utf8');
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  const errors = [];
  let ok = 0;
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
      ok++;
    } catch (e) {
      errors.push(e.message.substring(0, 120));
    }
  }

  if (errors.length === 0) {
    res.render('admin/db-restore.html', {
      message: `Успешно выполнено ${ok} запросов.`,
      error: null,
    });
  } else {
    res.render('admin/db-restore.html', {
      message: `Выполнено ${ok} из ${ok + errors.length} запросов.`,
      error: 'Ошибки:\n' + errors.slice(0, 5).join('\n'),
    });
  }
}

module.exports = {
  dashboard,
  loginForm, login, logout,
  listCategories, categoryForm, saveCategory, deleteCategory,
  listGroups, groupForm, saveGroup, deleteGroup,
  listProducts, productForm, saveProduct, deleteProduct,
  listLeads, markLeadDone,
  importForm, handleImport,
  exportData,
  mainPageForm, saveMainPage,
  bonusPageForm, saveBonusPage,
  dbRestoreForm, dbRestore,
  fixSettingsEncoding,
};
