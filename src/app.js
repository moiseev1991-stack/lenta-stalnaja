const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const nunjucks = require('nunjucks');
const config = require('./config');

const app = express();

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
// Форматирование толщины: 1.00 -> "1", 0.10 -> "0.1", 0.01 -> "0.01"
njkEnv.addFilter('formatThickness', (n) => {
  if (n == null || Number.isNaN(Number(n))) return '';
  const num = Number(n);
  if (Number.isInteger(num)) return String(num);
  const str = num.toFixed(2);
  return str.replace(/\.?0+$/, '');
});
// JSON-сериализация для использования в JSON-LD (совместно с | safe)
njkEnv.addFilter('json', (v) => JSON.stringify(v));
app.set('view engine', 'html');

app.use(express.urlencoded({ extended: true }));

// Menu data middleware - adds grades and groups to all pages (async, MySQL)
const lentaService = require('./services/lenta');
// Только \uXXXX в исходнике — строка корректна в рантайме даже если файл сохранили не в UTF-8
const FALLBACK_SITE_NAME =
  '\u041b\u0435\u043d\u0442\u0430 \u0441\u0442\u0430\u043b\u044c\u043d\u0430\u044f \u2014 \u043a\u0430\u0442\u0430\u043b\u043e\u0433 \u043c\u0435\u0442\u0430\u043b\u043b\u043e\u043f\u0440\u043e\u043a\u0430\u0442\u0430';

// Detect Cyrillic UTF-8 bytes misread as Windows-1251 ("mojibake").
// Two signals:
//   1. Latin-1 supplement chars U+0080-U+00FF mixed in (e.g. °, ¾, ») —
//      these are 0xBx/0xCx low-bytes of Cyrillic UTF-8 sequences.
//   2. Р or С makes up >25 % of all chars — in mojibake every Cyrillic
//      char becomes "Р[x]" or "С[x]"; real Russian text has <5 % Р/С.
function isMojibake(s) {
  if (!s || s.length < 4) return false;
  if (/[-ÿ]/.test(s)) return true;
  const pc = (s.match(/[РС]/g) || []).length;
  return pc / s.length > 0.25;
}

// Фильтр Nunjucks: при рендере подменяет mojibake на корректное название (работает даже при старом кэше/проде)
njkEnv.addFilter('safeSiteName', (v) => (!v || isMojibake(v)) ? FALLBACK_SITE_NAME : v);
// Единственный источник для og:site_name и JSON-LD name — не зависит от res.locals и кодировки шаблона
njkEnv.addGlobal('fixedSiteName', FALLBACK_SITE_NAME);

app.use(async (req, res, next) => {
  if (req.path.startsWith('/admin')) return next();
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
