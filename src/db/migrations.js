const path = require('path');
const fs = require('fs');
const config = require('../config');

const dbPath = path.isAbsolute(config.dbPath) ? config.dbPath : path.join(process.cwd(), config.dbPath);
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const Database = require('better-sqlite3');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description_html TEXT,
    seo_title TEXT,
    seo_h1 TEXT,
    seo_description TEXT,
    is_published INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS steel_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS steel_grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    group_id INTEGER REFERENCES steel_groups(id),
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    mark TEXT,
    thickness_mm REAL,
    width_mm REAL,
    length_mm REAL,
    surface TEXT,
    state TEXT,
    standard TEXT,
    sku_code TEXT,
    unit TEXT DEFAULT 'kg',
    price REAL,
    stock_qty REAL,
    short_text_html TEXT,
    full_text_html TEXT,
    seo_title TEXT,
    seo_h1 TEXT,
    seo_description TEXT,
    image_url TEXT,
    is_published INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS landing_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    slug TEXT NOT NULL,
    filter_json TEXT,
    seo_title TEXT,
    seo_h1 TEXT,
    seo_description TEXT,
    text_html TEXT,
    robots TEXT DEFAULT 'index,follow',
    canonical_url TEXT,
    is_published INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(category_id, slug)
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    message TEXT,
    product_id INTEGER NULL REFERENCES products(id),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_leads_product ON leads(product_id);
  CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
  CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
  CREATE INDEX IF NOT EXISTS idx_landing_category ON landing_pages(category_id);
  CREATE INDEX IF NOT EXISTS idx_grades_group ON steel_grades(group_id);
  CREATE INDEX IF NOT EXISTS idx_products_mark ON products(mark);
`);
try { db.exec('ALTER TABLE leads ADD COLUMN is_done INTEGER NOT NULL DEFAULT 0'); } catch (_) {}
try { db.exec('ALTER TABLE products ADD COLUMN image_url TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE products ADD COLUMN grade_id INTEGER REFERENCES steel_grades(id)'); } catch (_) {}
try { db.exec('ALTER TABLE products ADD COLUMN group_id INTEGER REFERENCES steel_groups(id)'); } catch (_) {}

// Categories: extended fields for content and SEO
try { db.exec('ALTER TABLE categories ADD COLUMN intro TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE categories ADD COLUMN article_title TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE categories ADD COLUMN article_text TEXT'); } catch (_) {}
try { db.exec('ALTER TABLE categories ADD COLUMN article_format TEXT DEFAULT "html"'); } catch (_) {}

// Site-wide key-value settings (main page SEO, bonus page content, etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

console.log('Migrations OK. Database at', dbPath);
db.close();
