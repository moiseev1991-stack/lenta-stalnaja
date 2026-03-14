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
 * Detect material category and application from the grade name.
 * Returns { materialDesc, application } strings for use in short text.
 */
function detectMaterial(mark) {
  if (!mark) return { materialDesc: 'металлическая лента', application: 'в промышленном производстве' };

  if (mark.startsWith('Бр') || mark.startsWith('бр')) {
    return { materialDesc: 'бронзовая лента', application: 'для пружин, подшипников и электрических контактов' };
  }
  if (mark.startsWith('МН') || mark.startsWith('МНЦ')) {
    return { materialDesc: 'лента из мельхиора', application: 'в декоративных изделиях, медицинских инструментах и ювелирном производстве' };
  }
  if (/^М[123][рРpP]?$|^М[123][А-ЯёЁ]/.test(mark)) {
    return { materialDesc: 'медная лента', application: 'в электротехнике, теплообменном оборудовании и приборостроении' };
  }
  if (/^Л[0-9А-ЯёЁA-Z]/.test(mark)) {
    return { materialDesc: 'латунная лента', application: 'в машиностроении, электронике и производстве декоративных изделий' };
  }
  if (mark.startsWith('ХН') || mark.startsWith('хн')) {
    return { materialDesc: 'жаропрочная лента', application: 'в авиационных двигателях, высокотемпературных установках и химреакторах' };
  }
  if (/^[01][0-9]?Х|^[123][04]Х/.test(mark)) {
    return { materialDesc: 'нержавеющая лента', application: 'в пищевой, медицинской, химической промышленности и машиностроении' };
  }
  if (/^Н[0-9]|^НП[0-9]/.test(mark)) {
    return { materialDesc: 'никелевая лента', application: 'в химической промышленности, авиакосмической и электровакуумной технике' };
  }
  if (/^[0-9]/.test(mark)) {
    return { materialDesc: 'лента из конструкционной стали', application: 'в общем машиностроении, пружинах и режущем инструменте' };
  }
  return { materialDesc: 'металлическая лента', application: 'в промышленном производстве' };
}

/**
 * Build a state description clause, e.g. "в мягком (отожжённом) состоянии".
 */
function buildStateClause(state) {
  if (!state) return '';
  const s = state.toUpperCase().replace(/\s/g, '');
  if (/^М$|^М[ЯА]|МЯГК|SOFT/.test(s))  return 'в мягком (отожжённом) состоянии, обеспечивающем высокую пластичность при последующей обработке';
  if (/^ВН|ВЫСОКО/.test(s))             return 'в высоконагартованном состоянии с максимальной твёрдостью и упругостью';
  if (/^ПН|ПОЛУ/.test(s))               return 'в полунагартованном состоянии, сочетающем пластичность и повышенную упругость';
  if (/^Н$|^НАГ|HARD/.test(s))          return 'в нагартованном состоянии с повышенными показателями прочности и твёрдости';
  return '';
}

/**
 * Generate a unique 2-3 sentence SEO short text for a product page.
 * Uses H1 keyword in sentence 1, state+GOST in sentence 2, CTA in sentence 3.
 * @param {object} product - mapProduct() result from lenta.js
 * @returns {string} HTML string (one <p> tag)
 */
function buildProductShortText(product) {
  const mark      = product.mark || '';
  const thickness = product.thickness_mm != null ? String(product.thickness_mm) : '';
  const width     = product.width_mm     != null ? String(product.width_mm)     : '';
  const surface   = product.surface || '';
  const dims      = thickness && width ? `${thickness}×${width} мм` : (thickness || width ? `${thickness || width} мм` : '');
  const state = product.state    || '';
  const gost  = product.standard || '';
  const id    = product.id       || 0;

  const h1Key = join(['Лента', mark, dims, state, gost]);
  const { materialDesc, application } = detectMaterial(mark);
  const stateClause = buildStateClause(state);

  const s1 = `${h1Key} — ${materialDesc}, применяется ${application}.`;

  // Build a dimension+surface clause that is unique to every product
  const dimParts = [];
  if (thickness) dimParts.push(`толщина ${thickness} мм`);
  if (width)     dimParts.push(`ширина ${width} мм`);
  if (surface)   dimParts.push(`поверхность ${surface}`);
  const dimClause = dimParts.join(', ');

  let s2 = '';
  if (dimClause && stateClause && gost) {
    s2 = `Параметры: ${dimClause}; поставляется ${stateClause}, соответствует ${gost}.`;
  } else if (dimClause && stateClause) {
    s2 = `Параметры: ${dimClause}; поставляется ${stateClause}.`;
  } else if (dimClause && gost) {
    s2 = `Параметры: ${dimClause}; изготавливается по ${gost}.`;
  } else if (dimClause) {
    s2 = `Параметры данной позиции: ${dimClause}.`;
  } else if (stateClause && gost) {
    s2 = `Поставляется ${stateClause}, соответствует требованиям ${gost}.`;
  } else if (stateClause) {
    s2 = `Поставляется ${stateClause}.`;
  } else if (gost) {
    s2 = `Изготавливается в соответствии с требованиями ${gost}.`;
  }

  const ctas = [
    'Уточните наличие на складе и стоимость у наших менеджеров — расчёт за 15 минут, доставка по всей России.',
    'Принимаем заказы от одного рулона: расчёт стоимости в течение 15 минут, доставка по России.',
    'Оформите заявку на сайте или по телефону — ответим в течение 15 минут и организуем доставку по РФ.',
  ];
  const s3 = ctas[id % 3];

  return `<p>${[s1, s2, s3].filter(Boolean).join(' ')}</p>`;
}

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

module.exports = { buildProductSEO, buildProductShortText, buildGradeSEO, buildGroupSEO, buildCategorySEO };
