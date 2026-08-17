/**
 * SEO template generators for catalog pages.
 * Each builder returns { title, h1, metaDescription }.
 * DB-stored values (seo_title / seo_h1 / seo_description) take priority;
 * missing fields are generated from templates on the fly.
 */

const SITE_SUFFIX = '| lenta-stalnaja.ru';

const GRADE_SHORT_DESCS = {
  '12Х18Н10Т':      'коррозионностойкая аустенитная сталь с титановой стабилизацией, аналог AISI 321',
  '65Г':            'рессорно-пружинная углеродистая сталь высокой упругости',
  '20Х13':          'мартенситная нержавеющая сталь, стойкая к атмосферной коррозии',
  '08Х18Н10':       'аустенитная нержавеющая сталь с низким углеродом, аналог AISI 304L',
  'Х20Н80':         'нихромовый сплав с высоким электросопротивлением, рабочая температура до 1100°C',
  'Х15Н60':         'нихромовый сплав для нагревательных элементов, до 1000°C',
  '12Х18Н9':        'аустенитная коррозионностойкая сталь, аналог AISI 302',
  '10Х17Н13М3Т':    'нержавеющая сталь с молибденом и титаном, аналог AISI 316Ti',
  '10Х17Н13М2Т':    'нержавеющая сталь с молибденом и титаном, аналог AISI 316Ti',
  '17ХНГТ':         'цементуемая легированная сталь для деталей, работающих на износ',
  'ЭИ814 (17ХНГТ)': 'цементуемая легированная сталь для деталей, работающих на износ',
  'Х23Ю5':          'фехралевый сплав для нагревательных элементов, до 1300°C',
  'Х23Ю5Т':         'фехралевый сплав с титаном для высокотемпературных нагревателей',
  'ХН78Т':          'жаропрочный никелевый сплав для авиационной и ракетной техники',
  '36НХТЮ':         'прецизионный сплав с заданными упругими характеристиками',
  '40КХНМ':         'прецизионный магнитомягкий сплав для приборостроения',
  '12Х18Н9СМР':     'аустенитная сталь с улучшенной обрабатываемостью резанием',
  'Х15Ю5':          'фехралевый сплав для нагревательных элементов средней температуры',
  'Х20Н80-Н':       'нихромовый сплав нагартованный с повышенной прочностью',
  '27КХ':           'прецизионный сплав для постоянных магнитов',
  '29НК':           'прецизионный сплав с заданным коэффициентом теплового расширения',
};

function getGradeShortDesc(mark) {
  if (!mark) return '';
  return GRADE_SHORT_DESCS[mark] || 'специальный сплав для промышленного применения';
}

// mysql2 returns DECIMAL columns as strings ("10.000" / "0.0150"), which leak
// into <title> and meta description as "0.015×10.000 мм". Coerce through Number
// so JS strips trailing zeros to the shortest unambiguous form.
function fmtMm(n) {
  if (n == null || n === '') return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  return String(num);
}

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
  const thickness = fmtMm(product.thickness_mm);
  const width     = fmtMm(product.width_mm);
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
  const thickness = fmtMm(product.thickness_mm);
  const width     = fmtMm(product.width_mm);
  const dims      = thickness && width ? `${thickness}×${width} мм` : (thickness || width ? `${thickness || width} мм` : '');
  const state     = product.state    || '';
  const surface   = product.surface  || '';
  const gost      = product.standard || '';

  // H1: "Лента {Марка} {Толщина}×{Ширина} мм {Состояние} {ГОСТ}"
  const h1 = realVal(product.seo_h1) || realVal(product.h1) ||
    join(['Лента', mark, dims, state, gost]);

  // Title: "Лента {Марка} {Толщина}×{Ширина} мм — цена, купить | lenta-stalnaja.ru"
  const baseTitle = join(['Лента', mark, dims || '']);
  const title = realVal(product.seo_title) ||
    `${baseTitle} — цена, купить | lenta-stalnaja.ru`;

  // Description: "Лента стальная {Марка}, толщина {Толщина} мм, ширина {Ширина} мм. ..."
  const descParts = [];
  if (mark && thickness && width) {
    descParts.push(`Лента стальная ${mark}, толщина ${thickness} мм, ширина ${width} мм. Наличие на складе, доставка по России. Цена по запросу. Тел: +7 (495) 023-88-60.`);
  } else {
    const qualifiers = [state, surface].filter(Boolean).join(', ');
    const dp = [`Купить ленту ${join([mark, dims])}`.trim()];
    if (qualifiers) dp[0] += ` (${qualifiers})`;
    if (gost)       dp[0] += `, ${gost}`;
    dp[0] += '.';
    dp.push('Доставка по РФ.');
    descParts.push(dp.join(' '));
  }
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

  // Title: "Лента {Марка} купить — размеры, ГОСТ, цена за кг | lenta-stalnaja.ru"
  const title = realVal(grade.seo_title) ||
    `Лента ${mark} купить — размеры, ГОСТ, цена за кг | lenta-stalnaja.ru`;

  // Description: "Стальная лента марки {Марка} — полный каталог размеров. ..."
  const metaDescription = realVal(grade.seo_description) ||
    `Стальная лента марки ${mark} — полный каталог размеров. Нарезка под заказ, доставка по РФ. Цена по запросу. Тел: +7 (495) 023-88-60.`;

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

  // Title: "Лента {Группа} — каталог марок и размеров, доставка | lenta-stalnaja.ru"
  const title = realVal(group.seo_title) ||
    `Лента ${groupName} — каталог марок и размеров, доставка ${SITE_SUFFIX}`;

  // Description: "Стальная лента: {Группа}. Все марки и типоразмеры в наличии. ..."
  const metaDescription = realVal(group.seo_description) ||
    `Стальная лента: ${groupName}. Все марки и типоразмеры в наличии. Нарезка под заказ, доставка по России. Тел: +7 (495) 023-88-60.`;

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

module.exports = { buildProductSEO, buildProductShortText, buildGradeSEO, buildGroupSEO, buildCategorySEO, getGradeShortDesc, fmtMm };
