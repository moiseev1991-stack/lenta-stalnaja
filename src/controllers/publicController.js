const config          = require('../config');
const catalog         = require('../services/catalog');
const lenta           = require('../services/lenta');
const sitemapService  = require('../services/sitemap');
const { normalizeProductName } = require('../helpers/normalize');
const { buildProductSEO }      = require('../helpers/seoTemplates');
const db              = require('../db/db');

function getSetting(key, fallback = '') {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return (row && row.value) ? row.value : fallback;
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
  res.render(template, { siteName: config.siteName, siteUrl: config.siteUrl, ...data });
}

// ── Home ──────────────────────────────────────────────────────────────────────

async function home(req, res, next) {
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

    const homeTitle       = getSetting('home_title', config.siteName);
    const homeH1          = getSetting('home_h1', 'Каталог металлопроката');
    const homeMetaDesc    = getSetting('home_meta_description', 'Каталог металлопроката: лента и другие позиции. Сортамент, цены.');
    const homeHtml        = getSetting('home_html', '');

    renderPage(res, 'home.html', {
      title: homeTitle,
      h1:    homeH1,
      metaDescription: homeMetaDesc,
      homeHtml,
      breadcrumbs: [],
      categories: catalog.getRootCategories(),
      products, total, page, totalPages,
      filters, filterValues, queryString: qs,
      hasActiveFilters: hasFilters(filters),
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
      breadcrumbs: [],
      categories: catalog.getRootCategories(),
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

async function productPage(req, res, next) {
  try {
    const product = await lenta.getProductBySlug(req.params.productSlug);
    if (!product) return next();

    // Wrong gradeSlug in URL → 301 to the correct canonical URL.
    // Skip redirect when grade_slug is missing to avoid /null/... URLs.
    if (product.grade_slug && req.params.gradeSlug !== product.grade_slug) {
      return res.redirect(301, productCanonical(product));
    }

    const similarProducts = await lenta.getSimilarProducts(product.grade_id, product.id, 4);
    const productSeo  = buildProductSEO(product, config.siteName);
    const productName = normalizeProductName(product.name);
    const canonical   = productCanonical(product);
    const gradeUrl    = '/' + product.grade_slug + '/';

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
      similarProducts,
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
    const similarProducts = await lenta.getSimilarProducts(product.grade_id, product.id, 4);
    const productSeo  = buildProductSEO(product, config.siteName);
    const productName = normalizeProductName(product.name);
    const canonical   = '/' + product.slug + '/';
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
      similarProducts,
    });
  } catch (err) { next(err); }
}

// ── Generic catalog fallback (SQLite categories / landings) ──────────────────
// Used as a middleware chain fallback after grade/product handlers call next().

function genericCatalogPage(req, res, next) {
  const fullPath = req.path.replace(/^\/|\/$/g, '');
  const parts = fullPath.split('/').filter(Boolean);
  if (parts.length === 0) return next();

  const lastPart = parts[parts.length - 1];
  const categoryPathParts = parts.slice(0, -1);
  let categoryFromPath = null;
  let parentId = null;
  for (const part of categoryPathParts) {
    categoryFromPath = parentId
      ? catalog.getSubcategories(parentId).find(c => c.slug === part)
      : catalog.getCategoryBySlug(part);
    if (!categoryFromPath) break;
    parentId = categoryFromPath.id;
  }
  const categoryForLanding = categoryPathParts.length > 0 ? categoryFromPath : null;
  if (categoryForLanding) {
    const landing = catalog.getLandingByCategoryAndSlug(categoryForLanding.id, lastPart);
    if (landing) {
      req.params.categorySlug = categoryPathParts.join('/');
      req.params.landingSlug = lastPart;
      return landingPage(req, res, next);
    }
  }

  req.params.categorySlug = fullPath;
  return categoryPage(req, res, next);
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

// ── Category / landing pages (SQLite-based, may be empty) ─────────────────────

function categoryPage(req, res, next) {
  const slug = req.params.categorySlug;
  if (slug === 'list' || slug.startsWith('list/')) {
    return res.status(404).render('404.html', { siteName: config.siteName, siteUrl: config.siteUrl, title: 'Страница не найдена' });
  }
  const pathParts = slug.split('/').filter(Boolean);
  let category = null, parentId = null;
  for (const part of pathParts) {
    if (part === 'list') return res.status(404).render('404.html', { siteName: config.siteName, siteUrl: config.siteUrl, title: 'Страница не найдена' });
    category = parentId
      ? catalog.getSubcategories(parentId).find(c => c.slug === part)
      : catalog.getCategoryBySlug(part);
    if (!category) return next();
    parentId = category.id;
  }
  if (!category) return next();

  const filters    = parseFilters(req.query);
  const breadcrumbs = catalog.getCategoryBreadcrumbs(category);
  renderPage(res, 'catalog/category.html', {
    title: category.seo_title || category.name + ' | ' + config.siteName,
    h1:    category.seo_h1   || category.name,
    metaDescription: category.seo_description || undefined,
    breadcrumbs, category,
    categoryPath: pathParts.join('/'),
    subcategories: catalog.getSubcategories(category.id),
    products: [], total: 0, page: 1, totalPages: 1, perPage: 24,
    filters, filterValues: { marks: [], thickness: [], width: [], surface: [], state: [], standard: [] },
    queryString: '',
  });
}

function landingPage(req, res, next) {
  const categorySlug = req.params.categorySlug;
  const landingSlug  = req.params.landingSlug;
  const pathParts    = categorySlug.split('/').filter(Boolean);
  let category = null, parentId = null;
  for (const part of pathParts) {
    category = parentId
      ? catalog.getSubcategories(parentId).find(c => c.slug === part)
      : catalog.getCategoryBySlug(part);
    if (!category) return next();
    parentId = category.id;
  }
  if (!category) return next();
  const landing = catalog.getLandingByCategoryAndSlug(category.id, landingSlug);
  if (!landing) return next();

  const breadcrumbs = catalog.getCategoryBreadcrumbs(category);
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
}

// ── Static pages ──────────────────────────────────────────────────────────────

function staticPage(req, res, templateName, title, h1, metaDesc) {
  renderPage(res, templateName, {
    title: title + ' | ' + config.siteName, h1, metaDescription: metaDesc,
    breadcrumbs: [{ name: h1, url: req.path }],
  });
}

function about(req, res)        { staticPage(req, res, 'static/about.html',   'О компании',        'О компании',        'Информация о компании.'); }
function delivery(req, res)     { staticPage(req, res, 'static/delivery.html', 'Доставка',          'Доставка',          'Условия доставки.'); }
function payment(req, res)      { staticPage(req, res, 'static/payment.html',  'Оплата',            'Оплата',            'Способы оплаты.'); }
function faq(req, res)          { staticPage(req, res, 'static/faq.html',      'Вопросы и ответы',  'Вопросы и ответы',  'Часто задаваемые вопросы.'); }
function certificates(req, res) { staticPage(req, res, 'static/certificates.html','Сертификаты',    'Сертификаты',       'Сертификаты качества.'); }

function contacts(req, res) {
  renderPage(res, 'static/contacts.html', {
    title: 'Контакты | ' + config.siteName,
    h1:    'Контакты',
    metaDescription: 'Контактная информация. Заявка на расчёт и заказ металлопроката.',
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
      breadcrumbs: [{ name: 'Карта сайта', url: '/sitemap/' }],
      links,
    });
  } catch (err) { next(err); }
}

async function sitemapXml(req, res, next) {
  try {
    const urls = await sitemapService.getSitemapUrls();
    res.type('application/xml');
    res.render('sitemap.xml.njk', { urls, siteUrl: config.siteUrl });
  } catch (err) { next(err); }
}

function robotsTxt(req, res) {
  res.type('text/plain');
  res.send('User-agent: *\nAllow: /\n\nSitemap: ' + config.siteUrl + '/sitemap.xml');
}

// ── Lead (SQLite) ─────────────────────────────────────────────────────────────

function submitLead(req, res) {
  const db      = require('../db/db');
  const name    = (req.body.name    || '').trim();
  const phone   = (req.body.phone   || '').trim();
  const message = (req.body.message || '').trim();
  const product_id = req.body.product_id ? parseInt(req.body.product_id, 10) : null;
  if (!name || !phone) return res.redirect((req.body.redirect || '/contacts/') + '?lead=error');
  db.prepare('INSERT INTO leads (name, phone, message, product_id) VALUES (?, ?, ?, ?)').run(name, phone, message || null, product_id);
  const redirect = (req.body.redirect || '/contacts/').trim();
  res.redirect(redirect + (redirect.includes('?') ? '&' : '?') + 'lead=ok');
}

module.exports = {
  home, catalogRoot, categoryPage, landingPage, productPage, oldProductRedirect,
  genericCatalogPage, productBySlugPage,
  about, contacts, delivery, payment, faq, certificates,
  search, sitemapHtml, sitemapXml, robotsTxt, submitLead,
  parseFilters, hasFilters, renderPage,
};
