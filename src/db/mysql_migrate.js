const pool = require('./mysql');

async function runMysqlMigrations() {
  // Create tables if they don't exist (safe on repeated runs)
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

  console.log('MySQL CREATE TABLE OK');

  const alterCols = [
    // products
    `ALTER TABLE products ADD COLUMN full_gost_name TEXT NULL AFTER seo_description`,
    `ALTER TABLE products ADD COLUMN spring_props TINYINT(1) NOT NULL DEFAULT 0`,
    // grades — SEO + content fields
    `ALTER TABLE grades ADD COLUMN seo_h1 VARCHAR(512) NULL`,
    `ALTER TABLE grades ADD COLUMN seo_title VARCHAR(512) NULL`,
    `ALTER TABLE grades ADD COLUMN seo_description TEXT NULL`,
    `ALTER TABLE grades ADD COLUMN intro TEXT NULL`,
    `ALTER TABLE grades ADD COLUMN article_title VARCHAR(512) NULL`,
    `ALTER TABLE grades ADD COLUMN article_text LONGTEXT NULL`,
    `ALTER TABLE grades ADD COLUMN article_format VARCHAR(16) DEFAULT 'html'`,
    `ALTER TABLE grades ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`,
    // groups — SEO + content fields
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
    try {
      await pool.query(sql);
    } catch (_) {
      // Column already exists — ignore
    }
  }
  console.log('MySQL migrations OK');
}

module.exports = { runMysqlMigrations };
