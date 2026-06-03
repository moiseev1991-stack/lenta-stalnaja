const pool = require('../db/mysql');
const config = require('../config');

// YML (Yandex Market Language) feed generator.
// Spec: https://yandex.ru/support/marketplace/assortment/files/yml.html
// Format also accepted by Yandex.Business for "Товары" carousel in SERP and by
// Yandex.Webmaster as an additional URL discovery channel for the catalog.

const SHOP_NAME    = 'Лента стальная';
const COMPANY_NAME = 'Лента стальная — каталог металлопроката';
const DEFAULT_VENDOR = 'Лента стальная';
const DEFAULT_CURRENCY = 'RUR';
const DEFAULT_PICTURE = '/img/placeholder.svg';

function xmlEscape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function ymlDate(d) {
  const dt = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate())
    + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
}

function fmtMm(n) {
  if (n == null || n === '') return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return String(num);
}

function buildProductUrl(siteUrl, gradeSlug, productSlug) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  return base + '/' + gradeSlug + '/' + productSlug + '/';
}

function buildPictureUrl(siteUrl, imageFilename) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  const fn = (imageFilename || '').trim();
  if (!fn) return base + DEFAULT_PICTURE;
  if (/^https?:\/\//i.test(fn)) return fn;
  if (fn.startsWith('/')) return base + fn;
  return base + '/uploads/products/' + fn;
}

async function buildYmlFeed() {
  const siteUrl = String(config.siteUrl || 'https://lenta-stalnaja.ru').replace(/\/+$/, '');
  const [categories] = await pool.query(`
    SELECT id, name FROM grades WHERE name IS NOT NULL AND name != '' ORDER BY name
  `);
  const [products] = await pool.query(`
    SELECT p.id, p.name, p.slug, p.thickness_mm, p.width_mm, p.state, p.surface,
           p.gost, p.price_per_kg, p.stock_kg, p.image_filename, p.seo_description,
           p.grade_id, gr.name AS grade_name, gr.slug AS grade_slug
    FROM products p
    JOIN grades gr ON p.grade_id = gr.id
    WHERE gr.slug IS NOT NULL AND gr.slug != ''
      AND p.slug IS NOT NULL AND p.slug != ''
      AND p.price_per_kg IS NOT NULL AND p.price_per_kg > 0
    ORDER BY gr.slug, p.slug
  `);

  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push('<yml_catalog date="' + ymlDate(new Date()) + '">');
  parts.push('<shop>');
  parts.push('  <name>' + xmlEscape(SHOP_NAME) + '</name>');
  parts.push('  <company>' + xmlEscape(COMPANY_NAME) + '</company>');
  parts.push('  <url>' + xmlEscape(siteUrl + '/') + '</url>');
  parts.push('  <currencies><currency id="' + DEFAULT_CURRENCY + '" rate="1"/></currencies>');

  parts.push('  <categories>');
  categories.forEach(c => {
    parts.push('    <category id="' + c.id + '">' + xmlEscape('Лента ' + c.name) + '</category>');
  });
  parts.push('  </categories>');

  parts.push('  <offers>');
  products.forEach(p => {
    const url       = buildProductUrl(siteUrl, p.grade_slug, p.slug);
    const price     = Number(p.price_per_kg);
    if (!Number.isFinite(price) || price <= 0) return;
    const available = p.stock_kg ? 'true' : 'false';
    const picture   = buildPictureUrl(siteUrl, p.image_filename);
    const thickness = fmtMm(p.thickness_mm);
    const width     = fmtMm(p.width_mm);
    const offerName = p.name && p.name.trim()
      ? p.name.trim()
      : ('Лента ' + (p.grade_name || '') + (thickness && width ? ' ' + thickness + '×' + width + ' мм' : '')).trim();

    parts.push('    <offer id="' + p.id + '" available="' + available + '">');
    parts.push('      <url>' + xmlEscape(url) + '</url>');
    parts.push('      <price>' + price.toFixed(2) + '</price>');
    parts.push('      <currencyId>' + DEFAULT_CURRENCY + '</currencyId>');
    parts.push('      <categoryId>' + p.grade_id + '</categoryId>');
    parts.push('      <picture>' + xmlEscape(picture) + '</picture>');
    parts.push('      <name>' + xmlEscape(offerName) + '</name>');
    parts.push('      <vendor>' + xmlEscape(DEFAULT_VENDOR) + '</vendor>');
    if (p.seo_description) {
      parts.push('      <description>' + xmlEscape(p.seo_description) + '</description>');
    }
    if (p.gost)     parts.push('      <param name="ГОСТ">' + xmlEscape(p.gost) + '</param>');
    if (thickness)  parts.push('      <param name="Толщина" unit="мм">' + xmlEscape(thickness) + '</param>');
    if (width)      parts.push('      <param name="Ширина" unit="мм">' + xmlEscape(width) + '</param>');
    if (p.state)    parts.push('      <param name="Состояние">' + xmlEscape(p.state) + '</param>');
    if (p.surface)  parts.push('      <param name="Поверхность">' + xmlEscape(p.surface) + '</param>');
    if (p.grade_name) parts.push('      <param name="Марка стали">' + xmlEscape(p.grade_name) + '</param>');
    parts.push('    </offer>');
  });
  parts.push('  </offers>');
  parts.push('</shop>');
  parts.push('</yml_catalog>');
  return parts.join('\n');
}

module.exports = { buildYmlFeed };
