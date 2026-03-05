/**
 * SEO template generators for catalog pages.
 * Each builder returns { title, h1, metaDescription }.
 * DB-stored values (seo_title / seo_h1 / seo_description) take priority;
 * missing fields are generated from templates on the fly.
 */

const SITE_SUFFIX = '| Каталог';

// Known placeholder strings that should be treated as absent.
const PLACEHOLDERS = new Set(['сам впишу', 'placeholder', 'todo', 'tbd', '-']);

/** Return val only if it is a non-empty, non-placeholder string. */
function realVal(val) {
  if (val == null) return '';
  const s = String(val).trim();
  if (!s || PLACEHOLDERS.has(s.toLowerCase())) return '';
  return s;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Join non-empty parts with a separator, collapse multiple spaces.
 */
function join(parts, sep = ' ') {
  return parts
    .map(p => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join(sep);
}

/**
 * Format a numeric range "min–max мм", or just "val мм" when min === max.
 * Returns empty string when the array is empty.
 */
function rangeStr(arr, unit = 'мм') {
  if (!arr || arr.length === 0) return '';
  const min = arr[0];
  const max = arr[arr.length - 1];
  const range = min === max ? String(min) : `${min}–${max}`;
  return unit ? `${range} ${unit}` : range;
}

// ── Product ───────────────────────────────────────────────────────────────────

/**
 * @param {object} product  - mapProduct() result from lenta.js
 * @param {string} siteName - value from config.siteName
 */
function buildProductSEO(product, siteName) {
  const mark      = product.mark      || '';
  const thickness = product.thickness_mm != null ? String(product.thickness_mm) : '';
  const width     = product.width_mm     != null ? String(product.width_mm)     : '';
  const dims      = thickness && width ? `${thickness}×${width} мм` : (thickness || width ? `${thickness || width} мм` : '');
  const state     = product.state    || '';
  const surface   = product.surface  || '';
  const gost      = product.standard || '';

  // H1: "Лента {Марка} {Толщина}×{Ширина} мм {Состояние} {ГОСТ}"
  const h1 = realVal(product.seo_h1) || realVal(product.h1) ||
    join(['Лента', mark, dims, state, gost]);

  // Title: "Лента {Марка} {Толщина}×{Ширина} — цена за кг, доставка"
  const baseTitle = join(['Лента', mark, dims ? dims.replace(' мм', '') : '']);
  const title = realVal(product.seo_title) ||
    `${baseTitle} — цена за кг, доставка`;

  // Description: "Купить ленту {Марка} {Толщина}×{Ширина} мм ({Состояние}, {Поверхность}), {ГОСТ}. Расчёт за 15 минут, доставка по РФ."
  const qualifiers = [state, surface].filter(Boolean).join(', ');
  const descParts = [`Купить ленту ${join([mark, dims])}`.trim()];
  if (qualifiers) descParts[0] += ` (${qualifiers})`;
  if (gost)       descParts[0] += `, ${gost}`;
  descParts[0] += '.';
  descParts.push('Расчёт за 15 минут, доставка по РФ.');
  const metaDescription = realVal(product.seo_description) || descParts.join(' ');

  return { title, h1, metaDescription };
}

// ── Grade (марка) ─────────────────────────────────────────────────────────────

/**
 * @param {object} grade    - grade row from DB (name, seo_title, seo_h1, seo_description)
 * @param {string} siteName
 */
function buildGradeSEO(grade, siteName) {
  const mark = grade.name || '';

  // H1: "Лента {Марка}"
  const h1 = realVal(grade.seo_h1) ||
    join(['Лента', mark]);

  // Title: "Лента {Марка} — размеры, ГОСТ, цена за кг"
  const title = realVal(grade.seo_title) ||
    `Лента ${mark} — размеры, ГОСТ, цена за кг`;

  // Description: "Лента {Марка}: подбор толщины и ширины, ГОСТ, доставка по РФ. Быстрый расчёт за 15 минут."
  const metaDescription = realVal(grade.seo_description) ||
    `Лента ${mark}: подбор толщины и ширины, ГОСТ, доставка по РФ. Быстрый расчёт за 15 минут.`;

  return { title, h1, metaDescription };
}

// ── Group (назначение) ────────────────────────────────────────────────────────

/**
 * @param {object} group        - group row from DB (name, description, seo_title, seo_h1, seo_description)
 * @param {string} siteName
 */
function buildGroupSEO(group, siteName) {
  const groupName = group.name || '';

  // H1: "Лента по назначению: {Группа}"
  const h1 = realVal(group.seo_h1) ||
    `Лента по назначению: ${groupName}`;

  // Title: "Лента {Группа} — каталог марок и размеров, доставка | Каталог"
  const title = realVal(group.seo_title) ||
    `Лента ${groupName} — каталог марок и размеров, доставка ${SITE_SUFFIX}`;

  // Description: "Лента {Группа}: подбор марки и размеров под задачу. …"
  const metaDescription = realVal(group.seo_description) ||
    `Лента ${groupName}: подбор марки и размеров под задачу. Документы и ГОСТ, расчёт за 15 минут, доставка по РФ.`;

  return { title, h1, metaDescription };
}

// ── Category (lenta index) ────────────────────────────────────────────────────

/**
 * @param {string} siteName
 */
function buildCategorySEO(siteName) {
  const h1             = 'Каталог металлической ленты';
  const title          = 'Металлическая лента — каталог марок и назначений, доставка по РФ';
  const metaDescription = 'Каталог металлической ленты: подбор по маркам и назначению, фильтры по толщине и ширине, расчёт за 15 минут.';
  return { title, h1, metaDescription };
}

module.exports = { buildProductSEO, buildGradeSEO, buildGroupSEO, buildCategorySEO };
