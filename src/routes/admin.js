const path = require('path');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const multer = require('multer');
const config = require('../config');
const controller = require('../controllers/adminController');
const { requireAdmin } = require('../middleware/auth');

// Wrap async route handlers so errors go to Express error handler
function a(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Multer: memory storage for DB restore
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Multer: disk storage for product images (same directory as existing files)
const imgDir = path.join(process.cwd(), 'public', 'uploads', 'products');
if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

const imgUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, imgDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      const slug = (req.body.slug || '').trim() || ('product-' + Date.now());
      cb(null, slug + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(jpe?g|png|webp)$/i.test(file.originalname);
    cb(null, ok);
  },
});

// ─── Public auth routes ───────────────────────────────────────────────────────
router.get('/login', controller.loginForm);
router.post('/login', a(controller.login));
router.get('/logout', controller.logout);

router.use(requireAdmin);

// ─── Деплой и перезапуск (литеральные пути первыми, чтобы не перехватили :id) ─
router.get('/deploy', controller.deployForm);
router.post('/deploy', a(controller.deploy));
router.get('/restart', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Перезапуск</title><link rel="stylesheet" href="/css/admin.css"></head><body class="adm-body"><div class="adm-main" style="padding: 2rem;"><p class="adm-text">Приложение перезапускается. Через 5–10 сек обновите <a href="/">главную</a> или <a href="/admin">админку</a>.</p></div></body></html>`);
  setTimeout(() => process.exit(0), 1000);
});
router.post('/restart', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Перезапуск</title><link rel="stylesheet" href="/css/admin.css"></head><body class="adm-body"><div class="adm-main" style="padding: 2rem;"><p class="adm-text">Приложение перезапускается. Через 5–10 сек обновите <a href="/">главную</a> или <a href="/admin">админку</a>.</p></div></body></html>`);
  setTimeout(() => process.exit(0), 800);
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', a(controller.dashboard));

// ─── Categories = Grades (MySQL) ──────────────────────────────────────────────
router.get('/categories', a(controller.listCategories));
router.get('/categories/new', a((req, res) => controller.categoryForm(req, res, false)));
router.get('/categories/:id/edit', a((req, res) => controller.categoryForm(req, res, true)));
router.post('/categories', a(controller.saveCategory));
router.post('/categories/:id', a(controller.saveCategory));
router.post('/categories/:id/delete', a(controller.deleteCategory));

// ─── Groups (MySQL) ───────────────────────────────────────────────────────────
router.get('/groups', a(controller.listGroups));
router.get('/groups/new', a((req, res) => controller.groupForm(req, res, false)));
router.get('/groups/:id/edit', a((req, res) => controller.groupForm(req, res, true)));
router.post('/groups', a(controller.saveGroup));
router.post('/groups/:id', a(controller.saveGroup));
router.post('/groups/:id/delete', a(controller.deleteGroup));

// ─── Products (MySQL) ─────────────────────────────────────────────────────────
router.get('/products', a(controller.listProducts));
router.get('/products/new', a((req, res) => controller.productForm(req, res, false)));
router.get('/products/:id/edit', a((req, res) => controller.productForm(req, res, true)));
router.post('/products', imgUpload.single('image'), a(controller.saveProduct));
router.post('/products/:id', imgUpload.single('image'), a(controller.saveProduct));
router.post('/products/:id/delete', a(controller.deleteProduct));

// ─── Leads (MySQL) ────────────────────────────────────────────────────────────
router.get('/leads', a(controller.listLeads));
router.post('/leads/:id/done', a(controller.markLeadDone));

// ─── CSV Import / Export ──────────────────────────────────────────────────────
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.get('/import', controller.importForm);
router.post('/import', csvUpload.single('file'), a(controller.handleImport));
router.get('/export', a(controller.exportData));

// ─── SEO текст-импорт из text/*.md ───────────────────────────────────────────
router.get('/import-seo', controller.importSeoForm);
router.post('/import-seo', a(controller.importSeoRun));

// ─── Settings pages ───────────────────────────────────────────────────────────
router.get('/main-page', a(controller.mainPageForm));
router.post('/main-page', a(controller.saveMainPage));

router.get('/bonus-page', a(controller.bonusPageForm));
router.post('/bonus-page', a(controller.saveBonusPage));

// ─── Database restore ─────────────────────────────────────────────────────────
router.get('/db-restore', controller.dbRestoreForm);
router.post('/db-restore', memUpload.single('db_file'), a(controller.dbRestore));
router.post('/fix-settings-encoding', a(controller.fixSettingsEncoding));

module.exports = router;
