-- Import (Docker version — CSV at /var/lib/mysql-files/)
USE metal_catalog;

DROP TABLE IF EXISTS products_stage;
CREATE TABLE products_stage (
  slug            VARCHAR(255),
  name            VARCHAR(512),
  h1              VARCHAR(512),
  seo_title       VARCHAR(512),
  seo_description TEXT,
  full_gost_name  TEXT,
  grade           VARCHAR(255),
  group_name      VARCHAR(255),
  thickness_mm    VARCHAR(32),
  width_mm        VARCHAR(32),
  state           VARCHAR(64),
  surface         VARCHAR(64),
  gost            VARCHAR(128),
  price_per_kg    VARCHAR(128),
  lead_time       VARCHAR(128),
  image_filename  VARCHAR(255)
) ENGINE=InnoDB;

LOAD DATA INFILE '/var/lib/mysql-files/products_for_mysql.csv'
INTO TABLE products_stage
CHARACTER SET utf8mb4
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES;

SELECT CONCAT('Loaded rows: ', COUNT(*)) AS status FROM products_stage;

-- Upsert groups
INSERT INTO `groups` (name, slug)
SELECT DISTINCT group_name,
       LOWER(REPLACE(REPLACE(REPLACE(group_name,' ', '-'), '—','-'), '–','-')) AS slug
FROM products_stage
WHERE group_name IS NOT NULL AND group_name <> ''
ON DUPLICATE KEY UPDATE name = VALUES(name);

SELECT CONCAT('Groups: ', COUNT(*)) AS status FROM `groups`;

-- Upsert grades (link to group by name)
INSERT INTO grades (name, slug, group_id)
SELECT DISTINCT
  ps.grade,
  LOWER(REPLACE(REPLACE(REPLACE(ps.grade,' ', '-'), '—','-'), '–','-')) AS slug,
  g.id AS group_id
FROM products_stage ps
LEFT JOIN `groups` g ON g.name = ps.group_name
WHERE ps.grade IS NOT NULL AND ps.grade <> ''
ON DUPLICATE KEY UPDATE name = VALUES(name);

SELECT CONCAT('Grades: ', COUNT(*)) AS status FROM grades;

-- Insert/Upsert products
-- price_per_kg: extract first numeric part (e.g. "от 13000" -> 13000)
INSERT INTO products (
  slug, name, h1, seo_title, seo_description, full_gost_name,
  grade_id, group_id,
  thickness_mm, width_mm, state, surface, gost,
  price_per_kg, lead_time, image_filename
)
SELECT
  ps.slug,
  ps.name,
  NULLIF(ps.h1, ''),
  NULLIF(ps.seo_title, ''),
  NULLIF(ps.seo_description, ''),
  NULLIF(ps.full_gost_name, ''),
  g.id  AS grade_id,
  gr.id AS group_id,
  CASE WHEN ps.thickness_mm REGEXP '^[0-9]+\\.?[0-9]*$' THEN CAST(ps.thickness_mm AS DECIMAL(6,3)) ELSE NULL END,
  CASE WHEN ps.width_mm     REGEXP '^[0-9]+\\.?[0-9]*$' THEN CAST(ps.width_mm     AS DECIMAL(7,2)) ELSE NULL END,
  NULLIF(ps.state, ''),
  NULLIF(ps.surface, ''),
  NULLIF(ps.gost, ''),
  CASE
    WHEN ps.price_per_kg REGEXP '^[0-9]+\\.?[0-9]*$'
      THEN CAST(ps.price_per_kg AS DECIMAL(12,2))
    WHEN ps.price_per_kg REGEXP '[0-9]'
      THEN CAST(REGEXP_REPLACE(ps.price_per_kg, '[^0-9]', '') AS DECIMAL(12,2))
    ELSE NULL
  END,
  NULLIF(ps.lead_time, ''),
  NULLIF(ps.image_filename, '')
FROM products_stage ps
JOIN grades g ON g.name = ps.grade
LEFT JOIN `groups` gr ON gr.name = ps.group_name
ON DUPLICATE KEY UPDATE
  name            = VALUES(name),
  h1              = VALUES(h1),
  seo_title       = VALUES(seo_title),
  seo_description = VALUES(seo_description),
  full_gost_name  = VALUES(full_gost_name),
  grade_id        = VALUES(grade_id),
  group_id        = VALUES(group_id),
  thickness_mm    = VALUES(thickness_mm),
  width_mm        = VALUES(width_mm),
  state           = VALUES(state),
  surface         = VALUES(surface),
  gost            = VALUES(gost),
  price_per_kg    = VALUES(price_per_kg),
  lead_time       = VALUES(lead_time),
  image_filename  = VALUES(image_filename);

SELECT CONCAT('Products: ', COUNT(*)) AS status FROM products;

DROP TABLE IF EXISTS products_stage;
