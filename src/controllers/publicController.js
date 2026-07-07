const config          = require('../config');
const catalog         = require('../services/catalog');
const lenta           = require('../services/lenta');
const sitemapService  = require('../services/sitemap');
const ymlService      = require('../services/yml');
const llmsService     = require('../services/llms');
const pool            = require('../db/mysql');
const { normalizeProductName } = require('../helpers/normalize');
const { buildProductSEO, buildProductShortText, getGradeShortDesc, fmtMm } = require('../helpers/seoTemplates');

// Detect Cyrillic UTF-8 bytes misread as Latin-1 / Windows-1251 ("mojibake").
// Real mojibake has a specific signature: cyrillic UTF-8 starts with bytes
// 0xD0/0xD1, which read as Latin-1 become "Ð"/"Ñ" followed by
// another Latin-1 byte. So we look for the PAIR, not any single Latin-1 char
// (× ° ² ³ are legitimate in titles like "0.5×100 мм").
function isMojibake(s) {
  if (!s || s.length < 4) return false;
  if (/[ÐÑ][-ÿ]/.test(s)) return true;
  const pc = (s.match(/[РС]/g) || []).length;
  return pc / s.length > 0.25;
}

async function getSetting(key, fallback = '') {
  try {
    const [[row]] = await pool.query('SELECT value FROM settings WHERE `key` = ?', [key]);
    if (!row || !row.value || isMojibake(row.value)) return fallback;
    return row.value;
  } catch (_) { return fallback; }
}

function parseFilters(query) {
  const arr = v => (Array.isArray(v) ? v : v ? [v] : []);
  return {
    mark:      arr(query.mark),
    thickness: arr(query.thickness),
    width:     arr(query.width),
    surface:   arr(query.surface),
    state:     arr(query.state),
    standard:  arr(query.standard),
    q: typeof query.q === 'string' ? query.q : '',
  };
}

function hasFilters(f) {
  return f.mark.length || f.thickness.length || f.width.length ||
    f.surface.length || f.state.length || f.standard.length || (f.q && f.q.trim());
}

function renderPage(res, template, data = {}) {
  res.render(template, {
    siteUrl: config.siteUrl,
    ...data,
    isHome: data.isHome === true,
  });
}

// ── Home ──────────────────────────────────────────────────────────────────────

async function home(req, res, next) {
  try {
    const filters = parseFilters(req.query);
    const page    = Math.max(1, parseInt(req.query.page, 10) || 1);

    let filterValues, pageResult;
    try {
      [filterValues, pageResult] = await Promise.all([
        lenta.getLentaFilterValues(),
        hasFilters(filters)
          ? lenta.getLentaProducts(filters, page)
          : lenta.getLentaProducts({}, 1),
      ]);
    } catch (dbErr) {
      console.error('[DB] home query error:', dbErr.message);
      filterValues = { marks: [], thicknesses: [], widths: [], surfaces: [], states: [], standards: [] };
      pageResult   = { products: [], total: 0, totalPages: 0 };
    }

    const products   = hasFilters(filters) ? pageResult.products : pageResult.products.slice(0, 12);
    const total      = hasFilters(filters) ? pageResult.total      : products.length;
    const totalPages = hasFilters(filters) ? pageResult.totalPages : 1;

    const qs = Object.entries(req.query)
      .filter(([k, v]) => k !== 'page' && v)
      .map(([k, v]) => Array.isArray(v)
        ? v.map(x => `${k}=${encodeURIComponent(x)}`).join('&')
        : `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const [homeTitle, homeH1, homeMetaDesc, homeIntro, homeHtml, homeFaqRaw, categories] = await Promise.all([
      getSetting('home_title', 'Лента стальная купить оптом — все марки, доставка по России'),
      getSetting('home_h1', 'Каталог стальной ленты — более 7000 типоразмеров в наличии'),
      getSetting('home_meta_description', 'Стальная лента всех марок: 12Х18Н10Т, 65Г, 20Х13, Х20Н80 и другие. Коррозионностойкие, жаростойкие, прецизионные сплавы. Доставка по России. Тел: 8-800-100-08-74.'),
      getSetting('home_intro', ''),
      getSetting('home_main_text', ''),
      getSetting('home_faq_json', '[]'),
      catalog.getRootCategories(),
    ]);

    let homeFaqItems = [];
    try { homeFaqItems = JSON.parse(homeFaqRaw || '[]'); } catch (_) {}

    renderPage(res, 'home.html', {
      title: homeTitle,
      h1:    homeH1,
      metaDescription: homeMetaDesc,
      canonical: config.siteUrl + '/',
      homeIntro,
      homeHtml,
      homeFaqItems,
      breadcrumbs: [],
      categories,
      products, total, page, totalPages,
      filters, filterValues, queryString: qs,
      hasActiveFilters: hasFilters(filters),
      deployGitSha: config.deployGitSha,
      deployBootAt: config.deployBootAt,
      isHome: true,
    });
  } catch (err) { next(err); }
}

// ── Catalog root ──────────────────────────────────────────────────────────────

async function catalogRoot(req, res, next) {
  try {
    const filters = parseFilters(req.query);
    const page    = Math.max(1, parseInt(req.query.page, 10) || 1);

    const [filterValues, pageResult] = await Promise.all([
      lenta.getLentaFilterValues(),
      hasFilters(filters)
        ? lenta.getLentaProducts(filters, page)
        : lenta.getLentaProducts({}, 1),
    ]);

    const products   = hasFilters(filters) ? pageResult.products : pageResult.products.slice(0, 12);
    const total      = hasFilters(filters) ? pageResult.total      : products.length;
    const totalPages = hasFilters(filters) ? pageResult.totalPages : 1;

    const qs = Object.entries(req.query)
      .filter(([k, v]) => k !== 'page' && v)
      .map(([k, v]) => Array.isArray(v)
        ? v.map(x => `${k}=${encodeURIComponent(x)}`).join('&')
        : `${k}=${encodeURIComponent(v)}`)
      .join('&');

    renderPage(res, 'catalog/root.html', {
      title: 'Каталог | ' + config.siteName,
      h1:    'Каталог',
      metaDescription: 'Каталог категорий металлопроката.',
      canonical: config.siteUrl + '/catalog/',
      breadcrumbs: [],
      categories: await catalog.getRootCategories(),
      products, total, page, totalPages,
      filters, filterValues, queryString: qs,
      hasActiveFilters: hasFilters(filters),
    });
  } catch (err) { next(err); }
}

// ── Product page — /:gradeSlug/:productSlug/ ─────────────────────────────────

function productCanonical(product) {
  return '/' + product.grade_slug + '/' + product.slug + '/';
}

const COMPANY_CONTACTS = {
  phone: '+7 (800) 100-08-74',
  phoneHref: 'tel:+78001000874',
  email: 'orders@lenta-stalnaja.ru',
  emailHref: 'mailto:orders@lenta-stalnaja.ru',
  responseTime: 'Ответ по наличию и цене в течение 15 минут',
  workHours: 'Пн-Пт: 09:00-18:00',
};

const PRODUCT_FAQ_ITEMS = [
  {
    q: 'Есть ли товар в наличии?',
    a: 'Наличие зависит от марки, толщины и ширины. Уточним остатки и ближайшую дату отгрузки по телефону или e-mail.',
  },
  {
    q: 'Можно ли заказать резку в размер?',
    a: 'Да, согласуем резку под ваш размер при оформлении заявки.',
  },
  {
    q: 'Работаете ли с НДС?',
    a: 'Да, работаем с НДС и без НДС в зависимости от формы расчёта.',
  },
  {
    q: 'Есть ли доставка транспортной компанией?',
    a: 'Да, отправляем транспортными компаниями по России, также доступен самовывоз.',
  },
  {
    q: 'Как быстро выставляется счёт?',
    a: 'Счёт подготавливаем после согласования параметров заказа и реквизитов.',
  },
];

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildCompactProductDescription(product) {
  const mark = product.mark || '';
  const thickness = fmtMm(product.thickness_mm);
  const width = fmtMm(product.width_mm);
  const gradeShortDesc = getGradeShortDesc(mark);

  const parts = [];
  if (mark && thickness && width) {
    parts.push(`Лента стальная ${mark} толщиной ${thickness} мм, шириной ${width} мм.`);
  } else if (mark) {
    parts.push(`Лента стальная ${mark}.`);
  }
  if (gradeShortDesc) {
    parts.push(`Марка ${mark} — ${gradeShortDesc}.`);
  }
  parts.push('Поставляем нарезку под заказ, доставка по всей России.');
  parts.push('Для уточнения цены и наличия звоните: 8-800-100-08-74.');

  return `<p>${escapeHtml(parts.join(' '))}</p>`;
}

function buildFaqSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };
}

async function buildProductPageData(product, canonical) {
  const [similarProducts, sameGradeProducts, sameThicknessProducts] = await Promise.all([
    lenta.getSimilarProducts(product.grade_id, product.id, 4),
    lenta.getProductsByGradeId(product.grade_id, product.id, 10),
    lenta.getProductsByThickness(product.thickness_mm, product.id, 10),
  ]);

  const sameThicknessOtherMarks = sameThicknessProducts.filter((p) => p.grade_id !== product.grade_id);
  const productDescriptionHtml = buildCompactProductDescription(product);
  const faqItems = PRODUCT_FAQ_ITEMS;

  return {
    similarProducts,
    sameGradeProducts,
    sameThicknessOtherMarks,
    productDescriptionHtml,
    productFaqItems: faqItems,
    productFaqSchema: faqItems.length ? buildFaqSchema(faqItems) : null,
    productContacts: COMPANY_CONTACTS,
    gradePageUrl: product.grade_slug ? `/${product.grade_slug}/` : canonical,
  };
}

async function productPage(req, res, next) {
  try {
    const product = await lenta.getProductBySlug(req.params.productSlug);
    if (!product) return next();

    // Wrong gradeSlug in URL → 301 to the correct canonical URL.
    // Skip redirect when grade_slug is missing to avoid /null/... URLs.
    if (product.grade_slug && req.params.gradeSlug !== product.grade_slug) {
      return res.redirect(301, productCanonical(product));
    }

    const productSeo  = buildProductSEO(product, config.siteName);
    const productName = normalizeProductName(product.name);
    const canonical   = productCanonical(product);
    const gradeUrl    = '/' + product.grade_slug + '/';
    const pageData    = await buildProductPageData(product, canonical);

    if (!product.short_text_html) product.short_text_html = buildProductShortText(product);

    renderPage(res, 'product.html', {
      title:           productSeo.title,
      h1:              productSeo.h1,
      metaDescription: productSeo.metaDescription,
      canonical:       config.siteUrl + canonical,
      breadcrumbs: [
        { name: product.mark || 'Марка', url: gradeUrl },
        { name: productName,             url: canonical },
      ],
      product,
      category: { name: 'Лента', slug: 'lenta' },
      similarProducts: pageData.similarProducts,
      sameGradeProducts: pageData.sameGradeProducts,
      sameThicknessOtherMarks: pageData.sameThicknessOtherMarks,
      productDescriptionHtml: pageData.productDescriptionHtml,
      productFaqItems: pageData.productFaqItems,
      productFaqSchema: pageData.productFaqSchema,
      productContacts: pageData.productContacts,
      gradePageUrl: pageData.gradePageUrl || gradeUrl,
    });
  } catch (err) { next(err); }
}

// ── 301 redirect from old /product/:slug/ ────────────────────────────────────

async function oldProductRedirect(req, res, next) {
  try {
    const product = await lenta.getProductBySlug(req.params.productSlug);
    if (!product) return next();
    res.redirect(301, productCanonical(product));
  } catch (err) { next(err); }
}

// ── Product-by-slug fallback (single-segment URL) ────────────────────────────
// Called from /:slug/ chain when neither gradePage nor genericCatalogPage matched.
// Handles products whose grade_slug is missing: looks up product by slug and
// either redirects to the canonical /:grade/:product/ URL or renders directly.

async function productBySlugPage(req, res, next) {
  try {
    const product = await lenta.getProductBySlug(req.params.slug);
    if (!product) return next();
    if (product.grade_slug) {
      return res.redirect(301, productCanonical(product));
    }
    const productSeo  = buildProductSEO(product, config.siteName);
    const productName = normalizeProductName(product.name);
    const canonical   = '/' + product.slug + '/';
    const pageData    = await buildProductPageData(product, canonical);

    if (!product.short_text_html) product.short_text_html = buildProductShortText(product);

    renderPage(res, 'product.html', {
      title:           productSeo.title,
      h1:              productSeo.h1,
      metaDescription: productSeo.metaDescription,
      canonical:       config.siteUrl + canonical,
      breadcrumbs: [
        { name: productName, url: canonical },
      ],
      product,
      category: { name: 'Лента', slug: 'lenta' },
      similarProducts: pageData.similarProducts,
      sameGradeProducts: pageData.sameGradeProducts,
      sameThicknessOtherMarks: pageData.sameThicknessOtherMarks,
      productDescriptionHtml: pageData.productDescriptionHtml,
      productFaqItems: pageData.productFaqItems,
      productFaqSchema: pageData.productFaqSchema,
      productContacts: pageData.productContacts,
      gradePageUrl: pageData.gradePageUrl,
    });
  } catch (err) { next(err); }
}

// ── Generic catalog fallback (MySQL categories / landings) ───────────────────
// Used as a middleware chain fallback after grade/product handlers call next().

async function genericCatalogPage(req, res, next) {
  try {
    const fullPath = req.path.replace(/^\/|\/$/g, '');
    const parts = fullPath.split('/').filter(Boolean);
    if (parts.length === 0) return next();

    const lastPart = parts[parts.length - 1];
    const categoryPathParts = parts.slice(0, -1);
    let categoryFromPath = null;
    let parentId = null;
    for (const part of categoryPathParts) {
      if (parentId) {
        const subs = await catalog.getSubcategories(parentId);
        categoryFromPath = subs.find(c => c.slug === part) || null;
      } else {
        categoryFromPath = await catalog.getCategoryBySlug(part);
      }
      if (!categoryFromPath) break;
      parentId = categoryFromPath.id;
    }
    const categoryForLanding = categoryPathParts.length > 0 ? categoryFromPath : null;
    if (categoryForLanding) {
      const landing = await catalog.getLandingByCategoryAndSlug(categoryForLanding.id, lastPart);
      if (landing) {
        req.params.categorySlug = categoryPathParts.join('/');
        req.params.landingSlug = lastPart;
        return await landingPage(req, res, next);
      }
    }

    req.params.categorySlug = fullPath;
    return await categoryPage(req, res, next);
  } catch (err) { next(err); }
}

// ── Search ────────────────────────────────────────────────────────────────────

async function search(req, res, next) {
  try {
    const q    = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const result = await lenta.searchProducts(q, page);

    renderPage(res, 'search.html', {
      title: (q ? 'Поиск: ' + q : 'Поиск') + ' | ' + config.siteName,
      h1:    q ? 'Поиск: ' + q : 'Поиск по каталогу',
      metaDescription: q ? 'Результаты поиска: ' + q : 'Поиск по каталогу металлопроката.',
      robots: 'noindex,follow',
      breadcrumbs: [{ name: 'Поиск', url: '/search/' }],
      query: q,
      ...result,
    });
  } catch (err) { next(err); }
}

// ── Category / landing pages (MySQL-based, may be empty) ──────────────────────

async function categoryPage(req, res, next) {
  try {
    const slug = req.params.categorySlug;
    if (slug === 'list' || slug.startsWith('list/')) {
      return res.status(404).render('404.html', { siteUrl: config.siteUrl, title: 'Страница не найдена' });
    }
    const pathParts = slug.split('/').filter(Boolean);
    let category = null, parentId = null;
    for (const part of pathParts) {
      if (part === 'list') return res.status(404).render('404.html', { siteUrl: config.siteUrl, title: 'Страница не найдена' });
      if (parentId) {
        const subs = await catalog.getSubcategories(parentId);
        category = subs.find(c => c.slug === part) || null;
      } else {
        category = await catalog.getCategoryBySlug(part);
      }
      if (!category) return next();
      parentId = category.id;
    }
    if (!category) return next();

    const filters     = parseFilters(req.query);
    const [breadcrumbs, subcategories] = await Promise.all([
      catalog.getCategoryBreadcrumbs(category),
      catalog.getSubcategories(category.id),
    ]);
    renderPage(res, 'catalog/category.html', {
      title: category.seo_title || category.name + ' | ' + config.siteName,
      h1:    category.seo_h1   || category.name,
      metaDescription: category.seo_description || undefined,
      canonical: config.siteUrl + req.path,
      breadcrumbs, category,
      categoryPath: pathParts.join('/'),
      subcategories,
      products: [], total: 0, page: 1, totalPages: 1, perPage: 24,
      filters, filterValues: { marks: [], thickness: [], width: [], surface: [], state: [], standard: [] },
      queryString: '',
    });
  } catch (err) { next(err); }
}

async function landingPage(req, res, next) {
  try {
    const categorySlug = req.params.categorySlug;
    const landingSlug  = req.params.landingSlug;
    const pathParts    = categorySlug.split('/').filter(Boolean);
    let category = null, parentId = null;
    for (const part of pathParts) {
      if (parentId) {
        const subs = await catalog.getSubcategories(parentId);
        category = subs.find(c => c.slug === part) || null;
      } else {
        category = await catalog.getCategoryBySlug(part);
      }
      if (!category) return next();
      parentId = category.id;
    }
    if (!category) return next();
    const landing = await catalog.getLandingByCategoryAndSlug(category.id, landingSlug);
    if (!landing) return next();

    const breadcrumbs = await catalog.getCategoryBreadcrumbs(category);
    breadcrumbs.push({ name: landing.seo_h1 || landing.slug, url: req.originalUrl });
    renderPage(res, 'catalog/landing.html', {
      title: landing.seo_title || landing.seo_h1 || landing.slug + ' | ' + config.siteName,
      h1:    landing.seo_h1 || landing.slug,
      metaDescription: landing.seo_description || undefined,
      robots: landing.robots || 'index,follow',
      canonical: landing.canonical_url || config.siteUrl + req.path,
      breadcrumbs, category, landing,
      products: [], total: 0, page: 1, totalPages: 1, perPage: 24,
    });
  } catch (err) { next(err); }
}

// ── Static pages ──────────────────────────────────────────────────────────────

function staticPage(req, res, templateName, title, h1, metaDesc) {
  renderPage(res, templateName, {
    title: title + ' | ' + config.siteName, h1, metaDescription: metaDesc,
    canonical: config.siteUrl + req.path,
    breadcrumbs: [{ name: h1, url: req.path }],
  });
}

function about(req, res)        { staticPage(req, res, 'static/about.html',   'О компании',        'О компании',        'О компании «' + config.siteName + '»: металлическая лента от поставщика. Документы, сертификаты, сроки поставки по всей России.'); }
function delivery(req, res)     { staticPage(req, res, 'static/delivery.html', 'Доставка',          'Доставка',          'Условия доставки металлической ленты: самовывоз, транспортная компания, доставка по Москве и регионам. Сроки и стоимость.'); }
function payment(req, res)      { staticPage(req, res, 'static/payment.html',  'Оплата',            'Оплата',            'Способы оплаты металлопроката: безналичный расчёт для юридических лиц, оплата по счёту. Работаем с НДС.'); }
function faq(req, res)          { staticPage(req, res, 'static/faq.html',      'Вопросы и ответы',  'Вопросы и ответы',  'Ответы на часто задаваемые вопросы о металлической ленте: подбор марки, расчёт веса, минимальный заказ, сроки.'); }
function certificates(req, res) { staticPage(req, res, 'static/certificates.html','Сертификаты',    'Сертификаты',       'Сертификаты качества на металлическую ленту: ГОСТ, протоколы испытаний. Документы предоставляются с каждой партией.'); }
function privacy(req, res)      { staticPage(req, res, 'static/privacy.html',  'Политика конфиденциальности', 'Политика обработки персональных данных', 'Политика обработки персональных данных ИП Галанов А. О. в соответствии с 152-ФЗ: цели, сроки, права пользователя.'); }
function cookies(req, res)      { staticPage(req, res, 'static/cookies.html',  'Cookies',           'Политика в отношении файлов cookie', 'Какие файлы cookie использует сайт lenta-stalnaja.ru, как ими управлять и отказаться.'); }
function terms(req, res)        { staticPage(req, res, 'static/terms.html',    'Пользовательское соглашение', 'Пользовательское соглашение', 'Правила использования сайта lenta-stalnaja.ru — права и обязанности сторон, интеллектуальная собственность, ответственность.'); }

function contacts(req, res) {
  renderPage(res, 'static/contacts.html', {
    title: 'Контакты | ' + config.siteName,
    h1:    'Контакты',
    metaDescription: 'Контакты «' + config.siteName + '»: телефон, e-mail, адрес. Оставьте заявку на расчёт стоимости металлической ленты — ответим за 15 минут.',
    canonical: config.siteUrl + '/contacts/',
    breadcrumbs: [{ name: 'Контакты', url: '/contacts/' }],
    leadStatus: req.query.lead,
  });
}

// ── Sitemap ───────────────────────────────────────────────────────────────────

async function sitemapHtml(req, res, next) {
  try {
    const links = await sitemapService.getSitemapHtmlLinks();
    renderPage(res, 'sitemap.html', {
      title: 'Карта сайта | ' + config.siteName,
      h1:    'Карта сайта',
      metaDescription: 'Карта сайта «' + config.siteName + '»: все разделы каталога металлической ленты, страницы марок, назначений и отдельных позиций.',
      canonical: config.siteUrl + '/sitemap/',
      breadcrumbs: [{ name: 'Карта сайта', url: '/sitemap/' }],
      links,
    });
  } catch (err) { next(err); }
}

async function sitemapXml(req, res, next) {
  try {
    const sitemaps = await sitemapService.getSitemapIndex();
    res.type('application/xml');
    res.render('sitemap-index.xml.njk', { sitemaps });
  } catch (err) { next(err); }
}

function makeChunkHandler(loader) {
  return async function (req, res, next) {
    try {
      const urls = await loader(req);
      res.type('application/xml');
      res.render('sitemap.xml.njk', { urls, siteUrl: config.siteUrl });
    } catch (err) { next(err); }
  };
}

const sitemapStatic   = makeChunkHandler(() => sitemapService.getStaticUrls());
const sitemapGrades   = makeChunkHandler(() => sitemapService.getGradeUrls());
const sitemapGroups   = makeChunkHandler(() => sitemapService.getGroupUrls());

async function ymlFeed(req, res, next) {
  try {
    const xml = await ymlService.buildYmlFeed();
    res.type('application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) { next(err); }
}

async function sitemapProducts(req, res, next) {
  try {
    const chunkIdx = parseInt(req.params.chunk, 10);
    if (!Number.isInteger(chunkIdx) || chunkIdx < 1) return next();
    const total  = await sitemapService.getProductCount();
    const chunks = Math.max(1, Math.ceil(total / sitemapService.PRODUCTS_PER_CHUNK));
    if (chunkIdx > chunks) return next();
    const offset = (chunkIdx - 1) * sitemapService.PRODUCTS_PER_CHUNK;
    const urls = await sitemapService.getProductUrls(offset, sitemapService.PRODUCTS_PER_CHUNK);
    res.type('application/xml');
    res.render('sitemap.xml.njk', { urls, siteUrl: config.siteUrl });
  } catch (err) { next(err); }
}

async function llmsTxt(req, res, next) {
  try {
    const body = await llmsService.buildLlmsTxt();
    res.type('text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(body);
  } catch (err) { next(err); }
}

async function llmsFullTxt(req, res, next) {
  try {
    const body = await llmsService.buildLlmsFullTxt();
    res.type('text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(body);
  } catch (err) { next(err); }
}

function robotsTxt(req, res) {
  const sitemapLine = 'Sitemap: ' + config.siteUrl + '/sitemap.xml';
  const utmParams   = 'utm_source&utm_medium&utm_campaign&utm_content&utm_term&yclid&gclid&fbclid';
  const filterParams = 'thickness&width&surface&state&standard&mark&q';
  res.type('text/plain');
  res.send(
    'User-agent: *\n' +
    'Disallow: /admin/\n' +
    'Disallow: /cart/\n' +
    'Disallow: /order/\n' +
    'Disallow: /search/\n' +
    'Disallow: /*?*\n' +
    'Disallow: /uploads/temp/\n' +
    'Allow: /uploads/products/\n' +
    '\n' +
    'User-agent: Yandex\n' +
    'Disallow: /admin/\n' +
    'Disallow: /cart/\n' +
    'Disallow: /order/\n' +
    'Disallow: /search/\n' +
    'Disallow: /*?*\n' +
    'Clean-param: ' + utmParams + '&' + filterParams + '\n' +
    '\n' +
    sitemapLine + '\n' +
    'Host: lenta-stalnaja.ru\n' +
    '\n' +
    '# AI / LLM index — https://llmstxt.org/\n' +
    'Llms-Txt: ' + config.siteUrl + '/llms.txt\n'
  );
}

// ── Lead (MySQL) ─────────────────────────────────────────────────────────────

async function submitLead(req, res) {
  const name    = (req.body.name    || '').trim();
  const phone   = (req.body.phone   || '').trim();
  const message = (req.body.message || '').trim();
  const consent = !!req.body.consent;
  const product_id = req.body.product_id ? parseInt(req.body.product_id, 10) : null;
  if (!name || !phone || !consent) return res.redirect((req.body.redirect || '/contacts/') + '?lead=error');
  try {
    await pool.query(
      'INSERT INTO leads (name, phone, message, product_id) VALUES (?, ?, ?, ?)',
      [name, phone, message || null, product_id]
    );
  } catch (err) {
    console.error('submitLead error:', err.message);
  }
  const redirect = (req.body.redirect || '/contacts/').trim();
  res.redirect(redirect + (redirect.includes('?') ? '&' : '?') + 'lead=ok');
}

module.exports = {
  home, catalogRoot, categoryPage, landingPage, productPage, oldProductRedirect,
  genericCatalogPage, productBySlugPage,
  about, contacts, delivery, payment, faq, certificates,
  privacy, cookies, terms,
  llmsTxt, llmsFullTxt,
  search, sitemapHtml, sitemapXml, robotsTxt, submitLead,
  sitemapStatic, sitemapGrades, sitemapGroups, sitemapProducts,
  ymlFeed,
  parseFilters, hasFilters, renderPage,
};
