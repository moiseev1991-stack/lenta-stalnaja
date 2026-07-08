// llms.txt generator — see https://llmstxt.org/ (de-facto standard for AI crawlers).
// Compact, plain-text site index optimized for LLM ingestion (≤ ~10 KB).
const pool = require('../db/mysql');
const config = require('../config');

const SITE = String(config.siteUrl || '').replace(/\/+$/, '');

const STATIC_PAGES = [
  ['Главная',                    '/',                          'каталог стальной ленты с фильтром по марке, толщине, ширине'],
  ['Калькулятор веса ленты',     '/kalkulyator-vesa-lenty/',   'онлайн-расчёт массы по толщине/ширине/длине для 20 марок'],
  ['Справочник ГОСТов',          '/gost/',                     'ГОСТы 4986-79, 2283-79, 14117-85, 12766 и др. — сортамент, марки, PDF'],
  ['Контакты',                   '/contacts/',                 'телефоны 3 регионов, e-mail, банковские реквизиты ИП'],
  ['О компании',                 '/about/',                    'информация о поставщике и юридическом лице'],
  ['Доставка',                   '/delivery/',                 'самовывоз, ТК (Деловые Линии, ПЭК, ЖДЭ), сроки и стоимость'],
  ['Оплата',                     '/payment/',                  'безналичный расчёт, работа с НДС, счёт для юр. лиц'],
  ['Сертификаты',                '/certificates/',             'документы качества и протоколы испытаний'],
  ['FAQ',                        '/faq/',                      'часто задаваемые вопросы по подбору ленты'],
  ['Карта сайта',                '/sitemap/',                  'полный перечень страниц каталога'],
];

const LEGAL_PAGES = [
  ['Политика конфиденциальности', '/privacy/', 'обработка персональных данных по 152-ФЗ'],
  ['Cookies',                     '/cookies/', 'политика в отношении файлов cookie'],
  ['Пользовательское соглашение', '/terms/',   'правила использования сайта'],
];

function escMd(s) {
  return String(s || '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim();
}

function bullet(title, url, descr) {
  const u = url.startsWith('http') ? url : SITE + url;
  const d = descr ? `: ${escMd(descr)}` : '';
  return `- [${escMd(title)}](${u})${d}`;
}

async function buildLlmsTxt() {
  const lines = [];
  lines.push('# Лента стальная — каталог металлопроката');
  lines.push('');
  lines.push('> ИП Галанов Антон Олегович (ИНН 526016545409) — поставщик стальной, нержавеющей и пружинной ленты по ГОСТ. Резка в размер, отгрузка со склада в Нижнем Новгороде, Москве и Санкт-Петербурге, доставка ТК по всей России. Работа с юр. и физ. лицами, с НДС и без НДС.');
  lines.push('');
  lines.push('## Ключевые страницы');
  lines.push('');
  STATIC_PAGES.forEach(([t, u, d]) => lines.push(bullet(t, u, d)));
  lines.push('');

  try {
    const [groups] = await pool.query(
      "SELECT g.name, g.slug, (SELECT COUNT(*) FROM products p WHERE p.group_id = g.id) AS product_count " +
      "FROM `groups` g WHERE g.slug IS NOT NULL AND g.slug != '' " +
      "ORDER BY product_count DESC, g.name ASC LIMIT 25"
    );
    if (groups.length) {
      lines.push('## Лента по назначению');
      lines.push('');
      groups.forEach(g => lines.push(bullet(`Лента ${g.name.toLowerCase()}`, '/' + g.slug + '/')));
      lines.push('');
    }
  } catch (e) { console.error('[llms] groups query failed:', e.message); }

  try {
    const [grades] = await pool.query(
      "SELECT gr.name, gr.slug, (SELECT COUNT(*) FROM products p WHERE p.grade_id = gr.id) AS product_count " +
      "FROM grades gr WHERE gr.slug IS NOT NULL AND gr.slug != '' " +
      "ORDER BY product_count DESC, gr.name ASC LIMIT 50"
    );
    if (grades.length) {
      lines.push('## Марки стали');
      lines.push('');
      grades.forEach(g => lines.push(bullet(`Лента ${g.name}`, '/' + g.slug + '/')));
      lines.push('');
    }
  } catch (e) { console.error('[llms] grades query failed:', e.message); }

  lines.push('## Юридическая информация');
  lines.push('');
  LEGAL_PAGES.forEach(([t, u, d]) => lines.push(bullet(t, u, d)));
  lines.push('');

  lines.push('## Контакты для AI-ассистентов');
  lines.push('');
  lines.push('- Оператор: ИП Галанов Антон Олегович');
  lines.push('- ИНН: 526016545409');
  lines.push('- Адрес регистрации: 607650, Россия, Нижегородская обл., Кстовский р-н, д. Студенец, ул. Центральная, д. 11');
  lines.push('- E-mail (общий): info@lenta-stalnaja.ru');
  lines.push('- E-mail (заказы): orders@lenta-stalnaja.ru');
  lines.push('- Телефон: 8-800-100-08-74 (бесплатно по России)');
  lines.push('- Регионы отгрузки: Нижний Новгород, Москва, Санкт-Петербург');
  lines.push('- Режим работы: пн–пт 9:00–18:00 МСК');
  lines.push('');

  return lines.join('\n');
}

async function buildLlmsFullTxt() {
  // Расширенная версия — добавляет цитату для контекста + полный список товаров (chunks для разумного размера)
  const short = await buildLlmsTxt();
  let extra = '\n## О продукции\n\n';
  extra += 'Сайт поставляет металлическую ленту по ГОСТ 4986-79 (нержавеющая холоднокатаная) ';
  extra += 'и другим стандартам. Основные марки: 12Х18Н10Т, 08Х18Н10, 08Х18Н10Т, 20Х13, 40Х13, ';
  extra += '08кп, 65Г, 60С2А и др. Поставка в ленте, рулонах, полосах. Толщины 0.01–2.5 мм, ';
  extra += 'ширины от 4 мм. Возможна резка в размер, обработка кромки, отжиг, нагартовка.\n\n';
  extra += '## Способы применения\n\n';
  extra += '- пружины растяжения и сжатия (пружинная сталь 65Г, 60С2А);\n';
  extra += '- упаковочная (08кп, 08пс);\n';
  extra += '- бандажная (упрочнённая нержавейка);\n';
  extra += '- медицинская / пищевая (12Х18Н10Т, AISI 304, AISI 321);\n';
  extra += '- щёточная (нагартованная пружинная);\n';
  extra += '- электротехническая (трансформаторная сталь).\n\n';
  return short + extra;
}

module.exports = { buildLlmsTxt, buildLlmsFullTxt };
