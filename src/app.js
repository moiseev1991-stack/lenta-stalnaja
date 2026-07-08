const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const nunjucks = require('nunjucks');
const config = require('./config');

const app = express();

// Убираем X-Powered-By: Express — версия сервера не должна утекать
// в заголовки (косметика + чуть меньше шума для сканеров).
app.disable('x-powered-by');

// Run async MySQL migrations (add new columns if needed)
require('./db/mysql_migrate').runMysqlMigrations().catch(() => {});


// Статика первой — чтобы /img/, /css/ и т.д. отдавались без участия маршрутов
const publicDir = path.join(__dirname, '..', 'public');
// Явная раздача /img/* из public/img (надёжные пути, без сбоев)
app.use((req, res, next) => {
  if (req.method !== 'GET' || !req.path.startsWith('/img/')) return next();
  const subpath = req.path.slice(5).replace(/\\/g, '/');
  if (!subpath || subpath.includes('..')) return res.status(400).end();
  const filePath = path.join(publicDir, 'img', subpath);
  const resolved = path.resolve(filePath);
  const publicResolved = path.resolve(publicDir);
  if (!resolved.startsWith(publicResolved) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return next();
  res.sendFile(resolved);
});
app.use(express.static(publicDir));

app.use(cookieParser());
app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
}));

const viewsPath = path.join(__dirname, 'views');
const njkEnv = nunjucks.configure(viewsPath, {
  autoescape: true,
  express: app,
  noCache: config.nodeEnv === 'development',
});
// Нормализация URL картинки: всегда начинается с /, без пробелов
njkEnv.addFilter('imgUrl', (s) => {
  if (s == null || typeof s !== 'string') return '';
  const t = s.trim();
  return t.startsWith('/') ? t : '/' + t;
});
// Форматирование числа с пробелами тысяч (5 501 ₽)
njkEnv.addFilter('formatNumber', (n) => {
  if (n == null || Number.isNaN(Number(n))) return '';
  return String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
});
// Удаление числа-остатка в конце названия товара (1 720,312 и т.п.)
njkEnv.addFilter('normalizeName', (s) => {
  if (s == null || typeof s !== 'string') return '';
  return s.replace(/\s+\d[\d\s]*([.,]\d+)?\s*$/, '').trim();
});
// мм в UI: убрать лишние нули (3.00 -> 3, 10.5 -> 10.5)
function formatMmForDisplay(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '';
  const num = Number(n);
  if (!Number.isFinite(num)) return '';
  if (Number.isInteger(num)) return String(num);
  const str = num.toFixed(2);
  return str.replace(/\.?0+$/, '');
}
njkEnv.addFilter('formatThickness', formatMmForDisplay);
njkEnv.addFilter('formatMm', formatMmForDisplay);
// Fallback for legacy templates that still reference formatMm.
const _origGetFilter = njkEnv.getFilter.bind(njkEnv);
njkEnv.getFilter = function patchedGetFilter(name) {
  try {
    return _origGetFilter(name);
  } catch (e) {
    if (name === 'formatMm') {
      try {
        return _origGetFilter('formatThickness');
      } catch (_) {
        return formatMmForDisplay;
      }
    }
    throw e;
  }
};
// JSON-сериализация для использования в JSON-LD (совместно с | safe)
njkEnv.addFilter('json', (v) => JSON.stringify(v));
app.set('view engine', 'html');

app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.locals.deployGitSha = config.deployGitSha;
  res.locals.deployBootAt = config.deployBootAt;
  if (req.path === '/') {
    res.setHeader('X-Deploy-Sha', config.deployGitSha || 'unknown');
    res.setHeader('X-Deploy-Boot-At', config.deployBootAt || 'unknown');
  }
  next();
});

// Menu data middleware - adds grades and groups to all pages (async, MySQL)
const lentaService = require('./services/lenta');
// Только \uXXXX в исходнике — строка корректна в рантайме даже если файл сохранили не в UTF-8
const FALLBACK_SITE_NAME =
  '\u041b\u0435\u043d\u0442\u0430 \u0441\u0442\u0430\u043b\u044c\u043d\u0430\u044f \u2014 \u043a\u0430\u0442\u0430\u043b\u043e\u0433 \u043c\u0435\u0442\u0430\u043b\u043b\u043e\u043f\u0440\u043e\u043a\u0430\u0442\u0430';

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

// Фильтр Nunjucks: при рендере подменяет mojibake на корректное название (работает даже при старом кэше/проде)
njkEnv.addFilter('safeSiteName', (v) => (!v || isMojibake(v)) ? FALLBACK_SITE_NAME : v);
// Единственный источник для og:site_name и JSON-LD name — не зависит от res.locals и кодировки шаблона
njkEnv.addGlobal('fixedSiteName', FALLBACK_SITE_NAME);

// «Каталог металлопроката» в виде кракозябры — только коды, без кириллицы в файле (иначе на сервере строка могла не совпасть)
const MOJIBAKE_SITE = String.fromCharCode(
  1056, 1113, 1056, 176, 1057, 8218, 1056, 176, 1056, 187, 1056, 1109, 1056, 1110, 32,
  1056, 1112, 1056, 181, 1057, 8218, 1056, 176, 1056, 187, 1056, 187, 1056, 1109, 1056, 1111,
  1057, 1026, 1056, 1109, 1056, 1108, 1056, 176, 1057, 8218, 1056, 176
);
/** Экранирование для HTML-атрибута */
function htmlEscapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

const LOGO_ALT =
  '\u041b\u0435\u043d\u0442\u0430 \u0441\u0442\u0430\u043b\u044c\u043d\u0430\u044f';

/**
 * После рендера принудительно чинит бренд: og:site_name, JSON-LD WebSite/Organization,
 * alt логотипа, копирайт в подвале. Работает даже если на сервере старый layout.html
 * в кэше Nunjucks или деплой не туда.
 */
function forceSiteBrandingInHtml(html) {
  if (typeof html !== 'string' || html.length < 300) return html;
  if (!html.includes('og:site_name') && !html.includes('schema.org')) return html;

  let out = html;

  out = out.replace(
    /<meta\s+property="og:site_name"\s+content="[^"]*"\s*\/?>/gi,
    '<meta property="og:site_name" content="' + htmlEscapeAttr(FALLBACK_SITE_NAME) + '">',
  );
  out = out.replace(
    /<meta\s+content="[^"]*"\s+property="og:site_name"\s*\/?>/gi,
    '<meta property="og:site_name" content="' + htmlEscapeAttr(FALLBACK_SITE_NAME) + '">',
  );

  const webOrgNameRe = (type) =>
    new RegExp(`"@type"\\s*:\\s*"${type}"\\s*,\\s*"name"\\s*:\\s*"([^"]*)"`, 'g');
  out = out.replace(webOrgNameRe('WebSite'), (m, n) => {
    if (!isMojibake(n)) return m;
    return m.replace(/"name"\s*:\s*"[^"]*"/, '"name":' + JSON.stringify(FALLBACK_SITE_NAME));
  });
  out = out.replace(webOrgNameRe('Organization'), (m, n) => {
    if (!isMojibake(n)) return m;
    return m.replace(/"name"\s*:\s*"[^"]*"/, '"name":' + JSON.stringify(FALLBACK_SITE_NAME));
  });

  out = out.replace(
    /<img\s+src="\/img\/logo-icon\.png"\s+alt="([^"]*)"/gi,
    (m, alt) => (isMojibake(alt) ? m.replace(/alt="[^"]*"/, 'alt="' + htmlEscapeAttr(LOGO_ALT) + '"') : m),
  );

  out = out.replace(
    /(<footer[^>]*class="footer"[^>]*>[\s\S]*?<p>&copy;\s*)([^<]+)(<\/p>)/i,
    (full, pre, mid, post) => (isMojibake(String(mid).trim()) ? pre + FALLBACK_SITE_NAME + post : full),
  );

  // Чиним <title> и og:title (Telegram/vk ломают кодировку без charset в Content-Type)
  out = out.replace(/<title>([^<]*)<\/title>/i, (m, inner) =>
    isMojibake(inner) ? '<title>' + FALLBACK_SITE_NAME + '</title>' : m
  );
  out = out.replace(
    /<meta\s+property="og:title"\s+content="([^"]*)"\s*\/?>/gi,
    (m, c) => isMojibake(c) ? '<meta property="og:title" content="' + htmlEscapeAttr(FALLBACK_SITE_NAME) + '">' : m,
  );
  out = out.replace(
    /<meta\s+content="([^"]*)"\s+property="og:title"\s*\/?>/gi,
    (m, c) => isMojibake(c) ? '<meta property="og:title" content="' + htmlEscapeAttr(FALLBACK_SITE_NAME) + '">' : m,
  );

  return out;
}

function fixMojibakeInHtml(body) {
  if (typeof body !== 'string') return body;
  let out = body;
  const deployMarker = `<!-- DEPLOY_CHECK_RUNTIME: git_sha=${config.deployGitSha || 'unknown'} boot_at=${config.deployBootAt || 'unknown'} -->`;
  // Inject deploy marker ONLY into HTML — XML (sitemap, yml) and plain text
  // (robots.txt) are corrupted by a leading HTML comment: an XML declaration
  // must be at byte 0, and robots.txt parsers treat the comment as content.
  if (out.includes('</head>') && !out.includes('DEPLOY_CHECK_RUNTIME:')) {
    out = out.replace('</head>', `  ${deployMarker}\n</head>`);
  }
  if (out.includes(MOJIBAKE_SITE)) {
    out = out.split(MOJIBAKE_SITE).join(FALLBACK_SITE_NAME);
  }
  out = forceSiteBrandingInHtml(out);
  return out;
}
app.use((req, res, next) => {
  const origSend = res.send;
  const origEnd = res.end;
  res.send = function (body) {
    if (typeof body === 'string') {
      body = fixMojibakeInHtml(body);
      // Явный charset для Telegram/VK и др. — без него кракозябры в превью
      if (/^\s*<!DOCTYPE/i.test(body) || body.trim().startsWith('<html')) {
        this.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
    } else if (Buffer.isBuffer(body)) {
      const s = body.toString('utf8');
      const f = fixMojibakeInHtml(s);
      if (f !== s) body = Buffer.from(f, 'utf8');
      if (/^\s*<!DOCTYPE/i.test(s) || s.trim().startsWith('<html')) {
        this.setHeader('Content-Type', 'text/html; charset=utf-8');
      }
    }
    return origSend.call(this, body);
  };
  // Нельзя origEnd.apply(this, arguments) после правки chunk — arguments[0] остаётся старым
  res.end = function () {
    const args = Array.prototype.slice.call(arguments);
    if (typeof args[0] === 'string') args[0] = fixMojibakeInHtml(args[0]);
    else if (Buffer.isBuffer(args[0])) {
      const s = args[0].toString('utf8');
      const f = fixMojibakeInHtml(s);
      if (f !== s) args[0] = Buffer.from(f, 'utf8');
    }
    return origEnd.apply(this, args);
  };
  next();
});

// Show full Organization/LocalBusiness/WebSite JSON-LD only on entry pages
// where Yandex/Google look for company info. On other pages this saves
// ~3 KB per response and avoids "Org repeated 9000 times" signal.
const FULL_ORG_SCHEMA_PATHS = new Set(['/', '/contacts/', '/about/']);

app.use(async (req, res, next) => {
  if (req.path.startsWith('/admin')) return next();
  res.locals.showFullOrgSchema = FULL_ORG_SCHEMA_PATHS.has(req.path);
  try {
    const [menuGrades, menuGroups] = await Promise.all([
      lentaService.getAllGrades(),
      lentaService.getAllGroups(),
    ]);
    res.locals.menuGrades = menuGrades;
    res.locals.menuGroups = menuGroups;
    // Не брать site_name из БД: на проде часто битая кодировка (og:site_name / подвал / alt),
    // при этом home_title из той же БД может быть нормальным.
    res.locals.siteName = FALLBACK_SITE_NAME;
    res.locals.displaySiteName = FALLBACK_SITE_NAME;
    res.locals.siteUrl    = config.siteUrl;
    res.locals.isAdmin    = !!(req.session && req.session.adminUserId);
    next();
  } catch (err) {
    // If MySQL is unavailable, still render the page with empty menus.
    res.locals.menuGrades = [];
    res.locals.menuGroups = [];
    res.locals.siteName   = FALLBACK_SITE_NAME;
    res.locals.displaySiteName = FALLBACK_SITE_NAME;
    res.locals.siteUrl    = config.siteUrl;
    res.locals.isAdmin    = !!(req.session && req.session.adminUserId);
    next();
  }
});

// Любая страница с UTM / рекламными трекерами должна быть noindex,follow,
// иначе плодятся дубли в индексе. Контроллеры могут перезаписать res.locals.robots
// если ставят свой (например, у фильтрованных страниц уже стоит noindex,follow).
const TRACKER_PARAMS = ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gclid','fbclid','yclid','ymclid','msclkid','mc_cid','mc_eid','from','ref'];
app.use((req, res, next) => {
  if (req.path.startsWith('/admin')) return next();
  const hasTracker = TRACKER_PARAMS.some(p => Object.prototype.hasOwnProperty.call(req.query, p));
  if (hasTracker) res.locals.robots = 'noindex,follow';
  next();
});

app.use('/', require('./routes/public'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => {
  res.status(404).render('404.html', { siteUrl: config.siteUrl });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Server error');
});

if (config.socketPath) {
  // Unix domain socket — bypasses per-process network namespace isolation on shared hosting
  try { fs.unlinkSync(config.socketPath); } catch (_) {}
  app.listen(config.socketPath, () => {
    // Make socket readable/writable by web server process
    try { fs.chmodSync(config.socketPath, 0o666); } catch (_) {}
    console.log('Server at unix:' + config.socketPath);
  });
} else {
  app.listen(config.port, '0.0.0.0', () => {
    console.log('Server at http://localhost:' + config.port);
  });
}
