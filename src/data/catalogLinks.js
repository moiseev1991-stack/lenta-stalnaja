/**
 * Соответствие «марка / группа → страница каталога».
 *
 * Нужно там, где мы ссылаемся на каталог из статических данных (справочник
 * ГОСТов, статьи /stati/) и не хотим ради одной ссылки ходить в MySQL.
 * Источник истины по слагам — сам каталог: /sitemap-grades.xml и
 * /sitemap-groups.xml. При добавлении марки в каталог дописать сюда.
 */

'use strict';

// slug страницы марки → как марка называется в каталоге.
const GRADES = {
  '08kh18n10':     '08Х18Н10',
  '10kh17n13m3t':  '10Х17Н13М3Т',
  '12kh18n10t':    '12Х18Н10Т',
  '12kh18n9':      '12Х18Н9',
  '12kh18n9smr':   '12Х18Н9СМР',
  '17khngt':       '17ХНГТ',
  '20kh13':        '20Х13',
  '27kkh':         '27КХ',
  '29nk':          '29НК',
  '36nkhtyu':      '36НХТЮ',
  '40kkhnm':       '40КХНМ',
  '65g':           '65Г',
  'ei814-17khngt': 'ЭИ814 (17ХНГТ)',
  'kh15n60':       'Х15Н60',
  'kh15yu5':       'Х15Ю5',
  'kh20n80':       'Х20Н80',
  'kh20n80-n':     'Х20Н80-Н',
  'kh23yu5':       'Х23Ю5',
  'kh23yu5t':      'Х23Ю5Т',
  'khn78t':        'ХН78Т',
};

// slug группы по назначению → человекочитаемое название.
const GROUPS = {
  'korrozionno-stojkie-stali':    'Коррозионно-стойкие стали',
  'lenta-holodnokatanaya':        'Лента холоднокатаная',
  'precizionnye-splavy':          'Прецизионные сплавы',
  'uglerodistye-stali':           'Углеродистые стали',
  'vysokoe-elektrosoprotivlenie': 'Высокое электросопротивление',
  'zharostojkie-i-zharoprochnye': 'Жаростойкие и жаропрочные',
};

// Обратный индекс «название марки → slug». Дополнительно учитываем краткие
// обозначения, которыми марка записана в GOSTS[].marks.
const SLUG_BY_MARK = Object.fromEntries(
  Object.entries(GRADES).map(([slug, name]) => [name.toUpperCase(), slug])
);
SLUG_BY_MARK['ЭИ814'] = 'ei814-17khngt';

/** slug страницы марки по её названию, либо null если такой марки нет в каталоге. */
function markSlug(mark) {
  const key = String(mark || '').trim().toUpperCase();
  return SLUG_BY_MARK[key] || null;
}

/** { slug, name, url } для марки — или null, если слаг незнакомый. */
function gradeLink(slug) {
  const key = String(slug || '').trim().toLowerCase();
  if (!GRADES[key]) return null;
  return { slug: key, name: GRADES[key], url: `/${key}/` };
}

/** { slug, name, url } для группы по назначению — или null. */
function groupLink(slug) {
  const key = String(slug || '').trim().toLowerCase();
  if (!GROUPS[key]) return null;
  return { slug: key, name: GROUPS[key], url: `/${key}/` };
}

module.exports = { GRADES, GROUPS, markSlug, gradeLink, groupLink };
