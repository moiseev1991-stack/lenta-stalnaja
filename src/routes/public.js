const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const controller = require('../controllers/publicController');
const lentaController = require('../controllers/lentaController');

router.get('/', controller.home);

// ── File downloads ────────────────────────────────────────────────────────────
const dataDir = path.join(__dirname, '..', '..', 'data');

router.get('/download/price', (req, res) => {
  const file = path.join(dataDir, 'price.xlsx');
  if (!fs.existsSync(file)) return res.status(404).send('Файл не найден');
  res.download(file, 'price.xlsx');
});

router.get('/download/certificates', (req, res) => {
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.pdf'));
  if (!files.length) return res.status(404).send('Файл не найден');
  const file = path.join(dataDir, files[0]);
  res.download(file, 'certificates.pdf');
});

// ── Static / utility pages (must precede parameterized catch-all routes) ───────
router.get('/about/', controller.about);
router.get('/contacts/', controller.contacts);
router.get('/delivery/', controller.delivery);
router.get('/payment/', controller.payment);
router.get('/faq/', controller.faq);
router.get('/certificates/', controller.certificates);
router.get('/privacy/', controller.privacy);
router.get('/cookies/', controller.cookies);
router.get('/terms/', controller.terms);
router.get('/kalkulyator-vesa-lenty/', controller.kalkulyatorVesaLenty);
router.get('/gost/', controller.gostIndex);
router.get('/gost/:slug/', controller.gostDetail);
router.get('/search/', controller.search);
router.get('/sitemap/', controller.sitemapHtml);
router.get('/sitemap.xml', controller.sitemapXml);
router.get('/sitemap-static.xml', controller.sitemapStatic);
router.get('/sitemap-grades.xml', controller.sitemapGrades);
router.get('/sitemap-groups.xml', controller.sitemapGroups);
router.get('/sitemap-products-:chunk(\\d+).xml', controller.sitemapProducts);
router.get('/yml.xml', controller.ymlFeed);
router.get('/llms.txt', controller.llmsTxt);
router.get('/llms-full.txt', controller.llmsFullTxt);
router.get('/robots.txt', controller.robotsTxt);
router.post('/lead', controller.submitLead);

// ── 301 redirects from old /catalog/lenta/ URLs ───────────────────────────────
router.get('/catalog/', (req, res) => res.redirect(301, '/'));
router.get('/catalog/lenta/', (req, res) => {
  const qs = Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '';
  res.redirect(301, '/' + qs);
});
router.get('/catalog/lenta/grades/', (req, res) => res.redirect(301, '/'));
router.get('/catalog/lenta/groups/', (req, res) => res.redirect(301, '/'));
router.get('/catalog/lenta/grade/:gradeSlug/:productSlug/', (req, res) =>
  res.redirect(301, '/' + req.params.gradeSlug + '/' + req.params.productSlug + '/'));
router.get('/catalog/lenta/grade/:slug/', (req, res) =>
  res.redirect(301, '/' + req.params.slug + '/'));
router.get('/catalog/lenta/group/:slug/', (req, res) =>
  res.redirect(301, '/' + req.params.slug + '/'));
router.get(/^\/catalog\/(.+?)\/?$/, (req, res) => res.redirect(301, '/'));

// ── 301 redirects from old /product/ and /lenta/ URLs ────────────────────────
router.get('/product/:productSlug/', controller.oldProductRedirect);
router.get('/lenta/', (req, res) => {
  const qs = Object.keys(req.query).length ? '?' + new URLSearchParams(req.query).toString() : '';
  res.redirect(301, '/' + qs);
});
router.get('/lenta/marka/:slug/', (req, res) =>
  res.redirect(301, '/' + req.params.slug + '/'));
router.get('/lenta/naznachenie/:slug/', (req, res) =>
  res.redirect(301, '/' + req.params.slug + '/'));
router.get('/lenta/:gradeSlug/:productSlug/', (req, res) =>
  res.redirect(301, '/' + req.params.gradeSlug + '/' + req.params.productSlug + '/'));

// ── 301 redirect from old /group/:slug/ URLs ─────────────────────────────────
router.get('/group/:slug/', (req, res) => res.redirect(301, '/' + req.params.slug + '/'));

// ── Canonical routes ──────────────────────────────────────────────────────────
router.get('/:gradeSlug/:productSlug/', controller.productPage, controller.genericCatalogPage);
router.get('/:slug/', lentaController.gradePage, lentaController.groupPage, controller.genericCatalogPage, controller.productBySlugPage);

module.exports = router;
