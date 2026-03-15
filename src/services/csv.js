const pool = require('../db/mysql');
const config = require('../config');

const SEP = ';';

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

function escapeCsv(val) {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(SEP) || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// Import MySQL products (uses grade_slug column to look up grade)
async function importProducts(buffer) {
  const { rows } = parseCsvBuffer(buffer);
  const logs = [];
  let rowsProcessed = 0;
  let rowsFailed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lineNum = i + 2;
    const name = (row.name || '').trim();
    const slug = (row.slug || '').trim().toLowerCase().replace(/\s+/g, '-') || name.toLowerCase().replace(/\s+/g, '-');
    const gradeSlug = (row.grade_slug || '').trim();

    if (!name) {
      logs.push({ line: lineNum, message: 'Пустое название', row: name || slug });
      rowsFailed++;
      continue;
    }
    if (!gradeSlug) {
      logs.push({ line: lineNum, message: 'Не указан grade_slug', row: name });
      rowsFailed++;
      continue;
    }

    try {
      const [[grade]] = await pool.query('SELECT id FROM grades WHERE slug = ?', [gradeSlug]);
      if (!grade) {
        logs.push({ line: lineNum, message: 'Марка не найдена: ' + gradeSlug, row: name });
        rowsFailed++;
        continue;
      }

      const grade_id = grade.id;
      const h1 = row.h1 || null;
      const seo_title = row.seo_title || null;
      const seo_description = row.seo_description || null;
      const short_text_html = row.short_text_html || null;
      const thickness_mm = row.thickness_mm ? parseFloat(String(row.thickness_mm).replace(',', '.')) || null : null;
      const width_mm = row.width_mm ? parseFloat(String(row.width_mm).replace(',', '.')) || null : null;
      const state = row.state || null;
      const spring_props = row.spring_props === '1' ? 1 : 0;
      const surface = row.surface || null;
      const gost = row.gost || null;
      let price_per_kg = row.price_per_kg ? parseFloat(String(row.price_per_kg).replace(',', '.')) || null : null;
      if (price_per_kg == null) price_per_kg = randomPrice();
      const stock_kg = row.stock_kg === '1' ? 1 : 0;
      const lead_time = row.lead_time || null;

      const [[existing]] = await pool.query('SELECT id FROM products WHERE slug = ?', [slug]);
      if (existing) {
        await pool.query(`
          UPDATE products SET name=?, grade_id=?, h1=?, seo_title=?, seo_description=?,
            short_text_html=?, thickness_mm=?, width_mm=?, state=?, spring_props=?, surface=?,
            gost=?, price_per_kg=?, stock_kg=?, lead_time=?
          WHERE slug=?
        `, [name, grade_id, h1, seo_title, seo_description, short_text_html,
            thickness_mm, width_mm, state, spring_props, surface, gost,
            price_per_kg, stock_kg, lead_time, slug]);
        logs.push({ line: lineNum, message: 'Обновлён', row: name });
      } else {
        await pool.query(`
          INSERT INTO products (name, slug, grade_id, h1, seo_title, seo_description,
            short_text_html, thickness_mm, width_mm, state, spring_props, surface,
            gost, price_per_kg, stock_kg, lead_time)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [name, slug, grade_id, h1, seo_title, seo_description, short_text_html,
            thickness_mm, width_mm, state, spring_props, surface, gost,
            price_per_kg, stock_kg, lead_time]);
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

// Import MySQL categories (the optional hierarchical category tree)
async function importCategories(buffer) {
  const { rows } = parseCsvBuffer(buffer);
  const logs = [];
  let rowsProcessed = 0;
  let rowsFailed = 0;

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
    try {
      if (parent_slug) {
        const [[parent]] = await pool.query('SELECT id FROM categories WHERE slug = ?', [parent_slug]);
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

      const [[existing]] = await pool.query('SELECT id FROM categories WHERE slug = ?', [slug]);
      if (existing) {
        await pool.query(`
          UPDATE categories SET name=?, parent_id=?, sort_order=?, is_published=?,
            description_html=?, seo_title=?, seo_h1=?, seo_description=?
          WHERE slug=?
        `, [name, parent_id, sort_order, is_published, description_html, seo_title, seo_h1, seo_description, slug]);
        logs.push({ line: lineNum, message: 'Обновлена', row: name });
      } else {
        await pool.query(`
          INSERT INTO categories (name, slug, parent_id, sort_order, is_published,
            description_html, seo_title, seo_h1, seo_description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [name, slug, parent_id, sort_order, is_published, description_html, seo_title, seo_h1, seo_description]);
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

async function exportProducts() {
  const [products] = await pool.query(`
    SELECT p.*, g.slug AS grade_slug
    FROM products p
    LEFT JOIN grades g ON p.grade_id = g.id
    ORDER BY g.slug, p.slug
  `);
  const headers = ['name', 'slug', 'grade_slug', 'h1', 'seo_title', 'seo_description',
    'short_text_html', 'thickness_mm', 'width_mm', 'state', 'spring_props',
    'surface', 'gost', 'price_per_kg', 'stock_kg', 'lead_time'];
  const lines = [headers.join(SEP)];
  products.forEach(p => {
    const row = [
      p.name, p.slug, p.grade_slug || '', p.h1 || '', p.seo_title || '', p.seo_description || '',
      p.short_text_html || '', p.thickness_mm ?? '', p.width_mm ?? '', p.state || '',
      p.spring_props ?? 0, p.surface || '', p.gost || '', p.price_per_kg ?? '',
      p.stock_kg ?? 0, p.lead_time || '',
    ];
    lines.push(row.map(escapeCsv).join(SEP));
  });
  return lines.join('\n');
}

async function exportCategories() {
  const [all] = await pool.query('SELECT * FROM categories ORDER BY sort_order, name');
  const byId = {};
  all.forEach(c => { byId[c.id] = c; });
  const parentSlug = (id) => (id && byId[id]) ? byId[id].slug : '';

  const headers = ['name', 'slug', 'parent_slug', 'sort_order', 'is_published',
    'description_html', 'seo_title', 'seo_h1', 'seo_description'];
  const lines = [headers.join(SEP)];
  all.forEach(c => {
    const row = [c.name, c.slug, parentSlug(c.parent_id), c.sort_order ?? 0,
      c.is_published ?? 1, c.description_html || '', c.seo_title || '', c.seo_h1 || '', c.seo_description || ''];
    lines.push(row.map(escapeCsv).join(SEP));
  });
  return lines.join('\n');
}

async function exportLandings() {
  const [landings] = await pool.query('SELECT * FROM landing_pages ORDER BY category_id, slug');
  const headers = ['category_id', 'slug', 'filter_json', 'seo_title', 'seo_h1',
    'seo_description', 'text_html', 'robots', 'canonical_url', 'is_published'];
  const lines = [headers.join(SEP)];
  landings.forEach(lp => {
    const row = [lp.category_id, lp.slug, lp.filter_json || '', lp.seo_title || '',
      lp.seo_h1 || '', lp.seo_description || '', lp.text_html || '',
      lp.robots || 'index,follow', lp.canonical_url || '', lp.is_published ?? 1];
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
