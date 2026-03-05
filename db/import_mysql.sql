-- Import flow (run after mysql_schema.sql)
USE metal_catalog;

DROP TABLE IF EXISTS products_stage;
CREATE TABLE products_stage (
  slug VARCHAR(255),
  name VARCHAR(512),
  h1 VARCHAR(512),
  seo_title VARCHAR(512),
  seo_description TEXT,
  full_gost_name TEXT,
  grade VARCHAR(255),
  group_name VARCHAR(255),
  thickness_mm DECIMAL(6,3),
  width_mm DECIMAL(7,2),
  state VARCHAR(64),
  surface VARCHAR(64),
  gost VARCHAR(128),
  price_per_kg DECIMAL(12,2),
  lead_time VARCHAR(128),
  image_filename VARCHAR(255)
) ENGINE=InnoDB;

-- Update the path below to the actual CSV location on your machine/server.
-- Enable LOCAL INFILE in your MySQL client if needed.
LOAD DATA LOCAL INFILE 'E:/cod/lebta2/db/products_for_mysql.csv'
INTO TABLE products_stage
CHARACTER SET utf8mb4
FIELDS TERMINATED BY ',' ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES;

-- Upsert groups
INSERT INTO groups (name, slug)
SELECT DISTINCT group_name,
       LOWER(REPLACE(REPLACE(REPLACE(group_name,' ', '-'), '—','-'), '–','-')) AS slug
FROM products_stage
WHERE group_name IS NOT NULL AND group_name <> ''
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Upsert grades
INSERT INTO grades (name, slug)
SELECT DISTINCT grade,
       LOWER(REPLACE(REPLACE(REPLACE(grade,' ', '-'), '—','-'), '–','-')) AS slug
FROM products_stage
WHERE grade IS NOT NULL AND grade <> ''
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Insert/Upsert products
INSERT INTO products (
  slug, name, h1, seo_title, seo_description, full_gost_name,
  grade_id, group_id,
  thickness_mm, width_mm, state, surface, gost,
  price_per_kg, lead_time, image_filename
)
SELECT
  ps.slug, ps.name, NULLIF(ps.h1,''), NULLIF(ps.seo_title,''), NULLIF(ps.seo_description,''), NULLIF(ps.full_gost_name,''),
  g.id AS grade_id,
  gr.id AS group_id,
  ps.thickness_mm, ps.width_mm, NULLIF(ps.state,''), NULLIF(ps.surface,''), NULLIF(ps.gost,''),
  ps.price_per_kg, NULLIF(ps.lead_time,''), NULLIF(ps.image_filename,'')
FROM products_stage ps
JOIN grades g ON g.name = ps.grade
LEFT JOIN groups gr ON gr.name = ps.group_name
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  h1=VALUES(h1),
  seo_title=VALUES(seo_title),
  seo_description=VALUES(seo_description),
  full_gost_name=VALUES(full_gost_name),
  grade_id=VALUES(grade_id),
  group_id=VALUES(group_id),
  thickness_mm=VALUES(thickness_mm),
  width_mm=VALUES(width_mm),
  state=VALUES(state),
  surface=VALUES(surface),
  gost=VALUES(gost),
  price_per_kg=VALUES(price_per_kg),
  lead_time=VALUES(lead_time),
  image_filename=VALUES(image_filename);
