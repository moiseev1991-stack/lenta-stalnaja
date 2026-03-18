const pool = require('./mysql');
const bcrypt = require('bcryptjs');
const config = require('../config');

// Detect Cyrillic UTF-8 bytes misread as Windows-1251 ("mojibake").
// Two signals:
//   1. Latin-1 supplement chars U+0080-U+00FF mixed in (e.g. °, ¾, ») —
//      these are 0xBx/0xCx low-bytes of Cyrillic UTF-8 sequences.
//   2. Р or С makes up >25 % of all chars — in mojibake every Cyrillic
//      char becomes "Р[x]" or "С[x]"; real Russian text has <5 % Р/С.
function isMojibake(s) {
  if (!s || s.length < 4) return false;
  if (/[-ÿ]/.test(s)) return true;
  const pc = (s.match(/[РС]/g) || []).length;
  return pc / s.length > 0.25;
}

async function runMysqlMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`groups\` (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      slug         VARCHAR(255) NOT NULL UNIQUE,
      sort_order   INT NOT NULL DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS grades (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      slug         VARCHAR(255) NOT NULL UNIQUE,
      group_id     INT NULL REFERENCES \`groups\`(id),
      sort_order   INT NOT NULL DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      name             VARCHAR(512) NOT NULL,
      slug             VARCHAR(512) NOT NULL UNIQUE,
      grade_id         INT NOT NULL,
      group_id         INT NULL,
      h1               VARCHAR(512) NULL,
      seo_title        VARCHAR(512) NULL,
      seo_description  TEXT NULL,
      thickness_mm     DECIMAL(10,3) NULL,
      width_mm         DECIMAL(10,3) NULL,
      state            VARCHAR(128) NULL,
      surface          VARCHAR(128) NULL,
      gost             VARCHAR(128) NULL,
      price_per_kg     DECIMAL(12,2) NULL,
      stock_kg         TINYINT(1) NOT NULL DEFAULT 0,
      lead_time        VARCHAR(128) NULL,
      image_filename   VARCHAR(512) NULL,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_grade_id (grade_id),
      INDEX idx_group_id (group_id),
      INDEX idx_slug    (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\`      VARCHAR(255) NOT NULL,
      value        TEXT,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_key (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(255) NOT NULL,
      phone      VARCHAR(255) NOT NULL,
      message    TEXT,
      product_id INT NULL,
      is_done    TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      parent_id        INT NULL,
      name             VARCHAR(255) NOT NULL,
      slug             VARCHAR(255) NOT NULL UNIQUE,
      description_html TEXT,
      seo_title        VARCHAR(512),
      seo_h1           VARCHAR(512),
      seo_description  TEXT,
      is_published     TINYINT(1) DEFAULT 1,
      sort_order       INT DEFAULT 0,
      intro            TEXT,
      article_title    VARCHAR(512),
      article_text     LONGTEXT,
      article_format   VARCHAR(16) DEFAULT 'html',
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS landing_pages (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      category_id   INT NOT NULL,
      slug          VARCHAR(255) NOT NULL,
      filter_json   TEXT,
      seo_title     VARCHAR(512),
      seo_h1        VARCHAR(512),
      seo_description TEXT,
      text_html     LONGTEXT,
      robots        VARCHAR(64) DEFAULT 'index,follow',
      canonical_url VARCHAR(512),
      is_published  TINYINT(1) DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cat_slug (category_id, slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('MySQL CREATE TABLE OK');

  const alterCols = [
    `ALTER TABLE products ADD COLUMN full_gost_name TEXT NULL AFTER seo_description`,
    `ALTER TABLE products ADD COLUMN spring_props TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN short_text_html TEXT NULL`,
    `ALTER TABLE grades ADD COLUMN seo_h1 VARCHAR(512) NULL`,
    `ALTER TABLE grades ADD COLUMN seo_title VARCHAR(512) NULL`,
    `ALTER TABLE grades ADD COLUMN seo_description TEXT NULL`,
    `ALTER TABLE grades ADD COLUMN intro TEXT NULL`,
    `ALTER TABLE grades ADD COLUMN article_title VARCHAR(512) NULL`,
    `ALTER TABLE grades ADD COLUMN article_text LONGTEXT NULL`,
    `ALTER TABLE grades ADD COLUMN article_format VARCHAR(16) DEFAULT 'html'`,
    `ALTER TABLE grades ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`,
    `ALTER TABLE \`groups\` ADD COLUMN seo_h1 VARCHAR(512) NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN seo_title VARCHAR(512) NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN seo_description TEXT NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN intro TEXT NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN article_title VARCHAR(512) NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN article_text LONGTEXT NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN article_format VARCHAR(16) DEFAULT 'html'`,
    `ALTER TABLE \`groups\` ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`,
  ];

  for (const sql of alterCols) {
    try { await pool.query(sql); } catch (_) {}
  }
  console.log('MySQL migrations OK');

  // Auto-fix garbled settings (missing Cyrillic = stored with wrong charset)
  const SN =
    '\u041b\u0435\u043d\u0442\u0430 \u0441\u0442\u0430\u043b\u044c\u043d\u0430\u044f \u2014 \u043a\u0430\u0442\u0430\u043b\u043e\u0433 \u043c\u0435\u0442\u0430\u043b\u043b\u043e\u043f\u0440\u043e\u043a\u0430\u0442\u0430';
  const defaultSettings = [
    ['site_name', SN],
    ['home_title', SN],
    ['home_h1', '\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u043c\u0435\u0442\u0430\u043b\u043b\u043e\u043f\u0440\u043e\u043a\u0430\u0442\u0430'],
    [
      'home_meta_description',
      '\u041d\u0435\u0440\u0436\u0430\u0432\u0435\u044e\u0449\u0430\u044f \u0438 \u043a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u043e\u043d\u043d\u0430\u044f \u043b\u0435\u043d\u0442\u0430 \u043f\u043e \u0413\u041e\u0421\u0422. \u041d\u0430\u043b\u0438\u0447\u0438\u0435 \u043d\u0430 \u0441\u043a\u043b\u0430\u0434\u0435, \u0440\u0435\u0437\u043a\u0430 \u0432 \u0440\u0430\u0437\u043c\u0435\u0440, \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0430 \u043f\u043e \u0420\u043e\u0441\u0441\u0438\u0438.',
    ],
  ];
  try {
    const [[row]] = await pool.query("SELECT value FROM settings WHERE `key` = 'site_name'");
    const _v = row ? (row.value || '') : '';
    if (!_v || isMojibake(_v)) {
      for (const [key, val] of defaultSettings) {
        await pool.query(
          'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
          [key, val, val]
        );
      }
      console.log('Settings encoding fixed');
    }
  } catch (_) {}

  // Seed admin user if table is empty
  try {
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM admin_users');
    if (cnt === 0) {
      const username = config.adminUsername || 'admin';
      const password = config.adminPassword || 'admin123';
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)',
        [username, hash]
      );
      console.log('Admin user created:', username);
    }
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
}

module.exports = { runMysqlMigrations };
