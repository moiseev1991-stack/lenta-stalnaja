const db = require('../db/db');
const config = require('../config');

const SEP = ';';
const CSV_COLUMNS_PRODUCTS = [
  'name', 'slug', 'category_slug', 'mark', 'thickness_mm', 'width_mm', 'length_mm',
  'surface', 'state', 'standard', 'sku_code', 'unit', 'price', 'stock_qty',
  'short_text_html', 'full_text_html', 'seo_title', 'seo_h1', 'seo_description', 'is_published'
];

function parseCsvBuffer(buffer) {
  const text = (buffer.toString('utf-8') || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(SEP).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => { row[h] = values[j] !== undefined ? values[j] : ''; });
    rows.push(row);
  }
  return { headers, rows };
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      cur += ch;
    } else if (ch === SEP) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function randomPrice() {
  const min = config.priceRandomMin;
  const max = config.priceRandomMax;
  return Math.round(min + Math.random() * (max - min));
}

function importProducts(buffer) {
  const { rows } = parseCsvBuffer(buffer);
  const logs = [];
  let rowsProcessed = 0;
  let rowsFailed = 0;

  const getCategoryIdBySlug = db.prepare('SELECT id FROM categories WHERE slug = ?');
  const getBySlug = db.prepare('SELECT id FROM products WHERE slug = ?');
  const updateStmt = db.prepare(`
    UPDATE products SET name=?, category_id=?, mark=?, thickness_mm=?, width_mm=?, length_mm=?,
      surface=?, state=?, standard=?, sku_code=?, unit=?, price=?, stock_qty=?,
      short_text_html=?, full_text_html=?, seo_title=?, seo_h1=?, seo_description=?, is_published=?, updated_at=?
    WHERE slug=?
  `);
  const insertStmt = db.prepare(`
    INSERT INTO products (name, slug, category_id, mark, thickness_mm, width_mm, length_mm, surface, state, standard, sku_code, unit, price, stock_qty, short_text_html, full_text_html, seo_title, seo_h1, seo_description, is_published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2;
    const name = (row.name || '').trim();
    const slug = (row.slug || '').trim().toLowerCase().replace(/\s+/g, '-') || name.toLowerCase().replace(/\s+/g, '-');
    const categorySlug = (row.category_slug || '').trim();

    if (!name) {
      logs.push({ line: lineNum, message: 'Пустое название', row: name || slug });
      rowsFailed++;
      continue;
    }
    if (!categorySlug) {
      logs.push({ line: lineNum, message: 'Не указан category_slug', row: name });
      rowsFailed++;
      continue;
    }

    const category = getCategoryIdBySlug.get(categorySlug);
    if (!category) {
      logs.push({ line: lineNum, message: 'Категория не найдена: ' + categorySlug, row: name });
      rowsFailed++;
      continue;
    }

    const category_id = category.id;
    const mark = row.mark || null;
    const thickness_mm = row.thickness_mm !== '' && row.thickness_mm != null ? parseFloat(String(row.thickness_mm).replace(',', '.')) : null;
    const width_mm = row.width_mm !== '' && row.width_mm != null ? parseFloat(String(row.width_mm).replace(',', '.')) : null;
    const length_mm = row.length_mm !== '' && row.length_mm != null ? parseFloat(String(row.length_mm).replace(',', '.')) : null;
    const surface = row.surface || null;
    const state = row.state || null;
    const standard = row.standard || null;
    const sku_code = row.sku_code || null;
    const unit = row.unit || 'kg';
    let price = row.price !== '' && row.price != null ? parseFloat(String(row.price).replace(',', '.')) : null;
    if (price == null || isNaN(price)) price = randomPrice();
    const stock_qty = row.stock_qty !== '' && row.stock_qty != null ? parseFloat(String(row.stock_qty).replace(',', '.')) : null;
    const short_text_html = row.short_text_html || null;
    const full_text_html = row.full_text_html || null;
    const seo_title = row.seo_title || null;
    const seo_h1 = row.seo_h1 || null;
    const seo_description = row.seo_description || null;
    const is_published = row.is_published === '1' || row.is_published === 'true' || row.is_published === 'да' ? 1 : 0;

    try {
      const existing = getBySlug.get(slug);
      if (existing) {
        updateStmt.run(name, category_id, mark, thickness_mm, width_mm, length_mm, surface, state, standard, sku_code, unit, price, stock_qty, short_text_html, full_text_html, seo_title, seo_h1, seo_description, is_published, now, slug);
        logs.push({ line: lineNum, message: 'Обновлён', row: name });
      } else {
        insertStmt.run(name, slug, category_id, mark, thickness_mm, width_mm, length_mm, surface, state, standard, sku_code, unit, price, stock_qty, short_text_html, full_text_html, seo_title, seo_h1, seo_description, is_published);
        logs.push({ line: lineNum, message: 'Добавлен', row: name });
      }
      rowsProcessed++;
    } catch (err) {
      logs.push({ line: lineNum, message: err.message || 'Ошибка', row: name });
      rowsFailed++;
    }
  }

  return { logs, rowsProcessed, rowsFailed, error: rowsFailed > 0 ? `Ошибок: ${rowsFailed}` : null };
}

function importCategories(buffer) {
  const { rows } = parseCsvBuffer(buffer);
  const logs = [];
  let rowsProcessed = 0;
  let rowsFailed = 0;
  const getBySlug = db.prepare('SELECT id FROM categories WHERE slug = ?');
  const getById = db.prepare('SELECT id FROM categories WHERE id = ?');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2;
    const name = (row.name || '').trim();
    const slug = (row.slug || '').trim().toLowerCase().replace(/\s+/g, '-') || name.toLowerCase().replace(/\s+/g, '-');
    if (!name) {
      logs.push({ line: lineNum, message: 'Пустое название', row: '' });
      rowsFailed++;
      continue;
    }
    const parent_slug = (row.parent_slug || '').trim();
    let parent_id = null;
    if (parent_slug) {
      const parent = getBySlug.get(parent_slug);
      if (!parent) {
        logs.push({ line: lineNum, message: 'Родитель не найден: ' + parent_slug, row: name });
        rowsFailed++;
        continue;
      }
      parent_id = parent.id;
    }
    const sort_order = parseInt(row.sort_order, 10) || 0;
    const is_published = row.is_published === '1' || row.is_published === 'true' ? 1 : 0;
    const description_html = row.description_html || null;
    const seo_title = row.seo_title || null;
    const seo_h1 = row.seo_h1 || null;
    const seo_description = row.seo_description || null;
    const now = new Date().toISOString();

    try {
      const existing = getBySlug.get(slug);
      if (existing) {
        db.prepare(`
          UPDATE categories SET name=?, parent_id=?, sort_order=?, is_published=?, description_html=?, seo_title=?, seo_h1=?, seo_description=?, updated_at=? WHERE slug=?
        `).run(name, parent_id, sort_order, is_published, description_html, seo_title, seo_h1, seo_description, now, slug);
        logs.push({ line: lineNum, message: 'Обновлена', row: name });
      } else {
        db.prepare(`
          INSERT INTO categories (name, slug, parent_id, sort_order, is_published, description_html, seo_title, seo_h1, seo_description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(name, slug, parent_id, sort_order, is_published, description_html, seo_title, seo_h1, seo_description);
        logs.push({ line: lineNum, message: 'Добавлена', row: name });
      }
      rowsProcessed++;
    } catch (err) {
      logs.push({ line: lineNum, message: err.message || 'Ошибка', row: name });
      rowsFailed++;
    }
  }

  return { logs, rowsProcessed, rowsFailed, error: rowsFailed > 0 ? `Ошибок: ${rowsFailed}` : null };
}

function escapeCsv(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(SEP) || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportProducts(products) {
  const headers = ['name', 'slug', 'category_slug', 'mark', 'thickness_mm', 'width_mm', 'length_mm', 'surface', 'state', 'standard', 'sku_code', 'unit', 'price', 'stock_qty', 'short_text_html', 'full_text_html', 'seo_title', 'seo_h1', 'seo_description', 'is_published'];
  const lines = [headers.join(SEP)];
  products.forEach(p => {
    const row = [
      p.name, p.slug, p.category_slug || '', p.mark || '', p.thickness_mm ?? '', p.width_mm ?? '', p.length_mm ?? '',
      p.surface || '', p.state || '', p.standard || '', p.sku_code || '', p.unit || 'kg', p.price ?? '', p.stock_qty ?? '',
      p.short_text_html || '', p.full_text_html || '', p.seo_title || '', p.seo_h1 || '', p.seo_description || '', p.is_published ?? 1
    ];
    lines.push(row.map(escapeCsv).join(SEP));
  });
  return lines.join('\n');
}

function exportCategories(categories) {
  const parentSlug = (id) => {
    if (!id) return '';
    const c = db.prepare('SELECT slug FROM categories WHERE id = ?').get(id);
    return c ? c.slug : '';
  };
  const headers = ['name', 'slug', 'parent_slug', 'sort_order', 'is_published', 'description_html', 'seo_title', 'seo_h1', 'seo_description'];
  const lines = [headers.join(SEP)];
  categories.forEach(c => {
    const row = [c.name, c.slug, parentSlug(c.parent_id), c.sort_order ?? 0, c.is_published ?? 1, c.description_html || '', c.seo_title || '', c.seo_h1 || '', c.seo_description || ''];
    lines.push(row.map(escapeCsv).join(SEP));
  });
  return lines.join('\n');
}

function exportLandings(landings) {
  const headers = ['category_id', 'slug', 'filter_json', 'seo_title', 'seo_h1', 'seo_description', 'text_html', 'robots', 'canonical_url', 'is_published'];
  const lines = [headers.join(SEP)];
  landings.forEach(lp => {
    const row = [lp.category_id, lp.slug, lp.filter_json || '', lp.seo_title || '', lp.seo_h1 || '', lp.seo_description || '', lp.text_html || '', lp.robots || 'index,follow', lp.canonical_url || '', lp.is_published ?? 1];
    lines.push(row.map(escapeCsv).join(SEP));
  });
  return lines.join('\n');
}

module.exports = {
  importProducts,
  importCategories,
  exportProducts,
  exportCategories,
  exportLandings,
  parseCsvBuffer,
  SEP,
};
