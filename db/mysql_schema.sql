-- MySQL 8+ schema for metal strip catalog
CREATE DATABASE IF NOT EXISTS metal_catalog CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE metal_catalog;

CREATE TABLE IF NOT EXISTS `groups` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  group_id INT NULL,
  FOREIGN KEY (group_id) REFERENCES `groups`(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(512) NOT NULL,
  h1 VARCHAR(512) NULL,
  seo_title VARCHAR(512) NULL,
  seo_description TEXT NULL,
  full_gost_name TEXT NULL,
  grade_id INT NOT NULL,
  group_id INT NULL,
  thickness_mm DECIMAL(6,3) NULL,
  width_mm DECIMAL(7,2) NULL,
  state VARCHAR(64) NULL,
  surface VARCHAR(64) NULL,
  gost VARCHAR(128) NULL,
  price_per_kg DECIMAL(12,2) NULL,
  lead_time VARCHAR(128) NULL,
  stock_kg DECIMAL(14,3) NULL,
  image_filename VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (grade_id) REFERENCES grades(id),
  FOREIGN KEY (group_id) REFERENCES `groups`(id),
  INDEX idx_grade (grade_id),
  INDEX idx_group (group_id),
  INDEX idx_thickness (thickness_mm),
  INDEX idx_width (width_mm),
  INDEX idx_state (state),
  INDEX idx_surface (surface)
) ENGINE=InnoDB;
