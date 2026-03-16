const bcrypt = require('bcryptjs');
const config = require('../config');

require('./migrations.js');
const db = require('./db');

// ——— Admin ———
const hash = bcrypt.hashSync(config.adminPassword, 10);
db.prepare('INSERT OR IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)').run(config.adminUsername, hash);
console.log('Admin user ensured:', config.adminUsername);

// ——— Steel Groups ———
const STEEL_GROUPS = [
  { name: 'Высокое электросопротивление', slug: 'vysokoe-elektrosoprotivlenie', description: 'Сплавы с высоким удельным электросопротивлением для нагревательных элементов и резисторов' },
  { name: 'Жаростойкие и жаропрочные', slug: 'zharostojkie-zharoprochnye', description: 'Стали и сплавы для работы при высоких температурах' },
  { name: 'Коррозионно-стойкие стали', slug: 'korrozionno-stojkie', description: 'Нержавеющие стали для агрессивных сред и пищевой промышленности' },
  { name: 'Лента холоднокатаная', slug: 'holodnokatanaya', description: 'Холоднокатаная лента из конструкционной стали общего назначения' },
  { name: 'Прецизионные сплавы', slug: 'precizionnye-splavy', description: 'Сплавы с особыми физическими свойствами: магнитными, упругими, тепловыми' },
];

const groupsCount = db.prepare('SELECT COUNT(*) as c FROM steel_groups').get().c;
if (groupsCount === 0) {
  const insGroup = db.prepare('INSERT INTO steel_groups (name, slug, description, sort_order) VALUES (?, ?, ?, ?)');
  STEEL_GROUPS.forEach((g, i) => insGroup.run(g.name, g.slug, g.description, i + 1));
  console.log('Steel groups created:', STEEL_GROUPS.length);
}

// ——— Steel Grades ———
const STEEL_GRADES = [
  { name: '12Х18Н10Т', slug: '12h18n10t', groupSlug: 'korrozionno-stojkie', description: 'Нержавеющая сталь аустенитного класса, стабилизированная титаном' },
  { name: '08Х18Н10', slug: '08h18n10', groupSlug: 'korrozionno-stojkie', description: 'Хромоникелевая нержавеющая сталь' },
  { name: '08Х13', slug: '08h13', groupSlug: 'korrozionno-stojkie', description: 'Коррозионно-стойкая хромистая сталь' },
  { name: '12Х17', slug: '12h17', groupSlug: 'korrozionno-stojkie', description: 'Ферритная нержавеющая сталь' },
  { name: '20Х13', slug: '20h13', groupSlug: 'korrozionno-stojkie', description: 'Коррозионно-стойкая жаропрочная сталь' },
  { name: '40Х13', slug: '40h13', groupSlug: 'zharostojkie-zharoprochnye', description: 'Мартенситная нержавеющая сталь повышенной твёрдости' },
  { name: '10Х17Н13М2Т', slug: '10h17n13m2t', groupSlug: 'korrozionno-stojkie', description: 'Аустенитная сталь с молибденом для химической промышленности' },
  { name: '08Х17Т', slug: '08h17t', groupSlug: 'korrozionno-stojkie', description: 'Ферритная сталь, стабилизированная титаном' },
  { name: 'AISI 304', slug: 'aisi-304', groupSlug: 'korrozionno-stojkie', description: 'Аналог 08Х18Н10, международный стандарт' },
  { name: 'AISI 316', slug: 'aisi-316', groupSlug: 'korrozionno-stojkie', description: 'Аустенитная сталь с молибденом, высокая коррозионная стойкость' },
  { name: 'Х20Н80', slug: 'h20n80', groupSlug: 'vysokoe-elektrosoprotivlenie', description: 'Нихром, сплав для нагревательных элементов' },
  { name: 'Х15Н60', slug: 'h15n60', groupSlug: 'vysokoe-elektrosoprotivlenie', description: 'Нихром, сплав сопротивления' },
  { name: 'ХН70Ю', slug: 'hn70yu', groupSlug: 'vysokoe-elektrosoprotivlenie', description: 'Жаростойкий сплав с высоким электросопротивлением' },
  { name: '36НХТЮ', slug: '36nhtu', groupSlug: 'precizionnye-splavy', description: 'Прецизионный сплав с заданным коэффициентом теплового расширения' },
  { name: '29НК', slug: '29nk', groupSlug: 'precizionnye-splavy', description: 'Ковар, сплав для спаев со стеклом' },
  { name: '65Г', slug: '65g', groupSlug: 'holodnokatanaya', description: 'Рессорно-пружинная сталь' },
  { name: '70С3А', slug: '70s3a', groupSlug: 'holodnokatanaya', description: 'Пружинная кремнистая сталь' },
  { name: '50ХФА', slug: '50hfa', groupSlug: 'holodnokatanaya', description: 'Пружинная хромованадиевая сталь' },
  { name: '08КП', slug: '08kp', groupSlug: 'holodnokatanaya', description: 'Углеродистая сталь обыкновенного качества' },
];

const gradesCount = db.prepare('SELECT COUNT(*) as c FROM steel_grades').get().c;
if (gradesCount === 0) {
  const insGrade = db.prepare('INSERT INTO steel_grades (name, slug, group_id, description, sort_order) VALUES (?, ?, ?, ?, ?)');
  STEEL_GRADES.forEach((gr, i) => {
    const group = db.prepare('SELECT id FROM steel_groups WHERE slug = ?').get(gr.groupSlug);
    insGrade.run(gr.name, gr.slug, group ? group.id : null, gr.description, i + 1);
  });
  console.log('Steel grades created:', STEEL_GRADES.length);
}

// ——— Categories (only if empty) ———
const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
if (catCount === 0) {
  const lentaDesc = `<p>Лента из нержавеющей и конструкционной стали — один из самых востребованных видов металлопроката. Мы поставляем ленту по ГОСТ 4986-79 и другим стандартам, в различном исполнении поверхности (2Б, 2Г, 3Б и др.) и состоянии (мягкая, нагартованная, полунагартованная).</p>
<p>Ассортимент включает марки 12Х18Н10Т, 08Х18Н10, 08Х13 и другие. Лента применяется в производстве крепежа, элементов конструкций, в пищевой и химической промышленности. Наличие на складе и быстрая отгрузка.</p>
<p>Цены зависят от марки, размера и объёма заказа. Отправьте заявку — рассчитаем стоимость и сроки доставки.</p>`;
  const listDesc = `<p>Листовой металлопрокат: холоднокатаный и горячекатаный лист, нержавеющий и конструкционный. Резка в размер, доставка по регионам.</p>
<p>Работаем с юридическими и физическими лицами. Оплата по счёту и наличными. Подробности уточняйте по телефону или через форму заявки.</p>`;

  db.prepare(`
    INSERT INTO categories (parent_id, name, slug, description_html, seo_title, seo_h1, seo_description, sort_order)
    VALUES (NULL, 'Лента', 'lenta', ?, 'Лента — нержавеющая и стальная | Каталог', 'Лента', 'Лента стальная и нержавеющая по ГОСТ. Цены, наличие, доставка.', 1),
           (NULL, 'Лист', 'list', ?, 'Лист — металлопрокат | Каталог', 'Лист', 'Листовой металл: холоднокатаный и горячекатаный лист.', 2)
  `).run(lentaDesc, listDesc);
  console.log('Categories created.');
}

// ——— Products: raw strings + parser ———
const RAW_LINES = [
  'Лента 0,05х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  897,900',
  'Лента 0,1х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  1 720,312',
  'Лента 0,15х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  246,000',
  'Лента 0,2х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  165,800',
  'Лента 0,25х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  444,210',
  'Лента 0,3х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  121,100',
  'Лента 0,4х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  293,700',
  'Лента 0,5х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  1 491,950',
  'Лента 0,8х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  1 776,600',
  'Лента 1,0х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  742,300',
  'Лента 0,1х300-М-НТ-О-12Х18Н10Т-2-Б ГОСТ 4986-79  520,000',
  'Лента 0,2х300-М-НТ-О-12Х18Н10Т-2-Б ГОСТ 4986-79  380,500',
  'Лента 0,3х300-М-НТ-О-12Х18Н10Т-2-Г ГОСТ 4986-79  410,200',
  'Лента 0,5х300-М-НТ-О-12Х18Н10Т-3-Г ГОСТ 4986-79  890,100',
  'Лента 0,15х500-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  310,000',
  'Лента 0,2х500-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  198,400',
  'Лента 0,4х500-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  350,600',
  'Лента 0,1х200-Н-О-12Х18Н10Т-2-Б ГОСТ 4986-79  255,800',
  'Лента 0,2х200-М-О-12Х18Н10Т-3-Б ГОСТ 4986-79  142,300',
  'Лента 0,25х350-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  398,700',
  'Лента 0,35х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  205,500',
  'Лента 0,6х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  1 120,000',
  'Лента 1,2х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  920,400',
  'Лента 0,18х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  178,200',
  'Лента 0,22х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  172,100',
  'Лента 0,45х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  268,900',
  'Лента 0,55х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  1 380,500',
  'Лента 0,7х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  1 650,200',
  'Лента 0,9х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  815,700',
  'Лента 1,5х400-М-НТ-О-12Х18Н10Т-3-Б ГОСТ 4986-79  1 050,000',
];

function parseLine(line) {
  const res = { name: line.trim(), mark: '12Х18Н10Т', surface: '3Б', state: null, standard: 'ГОСТ 4986-79', thickness_mm: null, width_mm: null, stock_qty: null, price: null };
  const matchSize = line.match(/(\d+[,.]?\d*)\s*[хx×]\s*(\d+)/i);
  if (matchSize) {
    res.thickness_mm = parseFloat(matchSize[1].replace(',', '.'));
    res.width_mm = parseInt(matchSize[2], 10);
  }
  if (/12Х18Н10Т/i.test(line)) res.mark = '12Х18Н10Т';
  const surf = line.match(/([23])[-]?([БГ])/i);
  if (surf) res.surface = surf[1] + (surf[2].toUpperCase() === 'Г' ? 'Г' : 'Б');
  if (/\bМ\b/.test(line) || /-М-/.test(line)) res.state = 'М';
  else if (/\bН\b/.test(line) || /-Н-/.test(line)) res.state = 'Н';
  else if (/ПН/.test(line)) res.state = 'ПН';
  const gost = line.match(/ГОСТ\s*[\d-]+/i);
  if (gost) res.standard = gost[0];
  const numEnd = line.match(/([\d\s,]+)\s*$/);
  if (numEnd) {
    const n = numEnd[1].replace(/\s/g, '').replace(',', '.');
    const val = parseFloat(n);
    if (!isNaN(val)) res.stock_qty = val < 10000 ? val : Math.round(val);
  }
  if (res.price == null) res.price = Math.round(1000 + Math.random() * 9000);
  return res;
}

function slugFromProduct(p) {
  const t = (p.thickness_mm != null ? String(p.thickness_mm).replace('.', '-') : '0');
  const w = (p.width_mm != null ? p.width_mm : 400);
  const surf = (p.surface || '3b').replace(/[^a-zа-я0-9]/gi, '').toLowerCase().replace('б', 'b').replace('г', 'g');
  return `lenta-12h18n10t-${t}x${w}-${surf}-gost-4986-79`.replace(/\s/g, '');
}

function seoFromProduct(p) {
  const t = p.thickness_mm != null ? p.thickness_mm : '?';
  const w = p.width_mm != null ? p.width_mm : '?';
  const h1 = `Лента 12Х18Н10Т ${t}×${w}`;
  const title = `Лента 12Х18Н10Т ${t}×${w} — цена, ГОСТ 4986-79`;
  const desc = `Лента 12Х18Н10Т ${t}×${w} мм по ГОСТ 4986-79. Уточняйте наличие и цену. Доставка по России. Оставьте заявку на сайте — менеджер свяжется в течение дня.`;
  return { seo_h1: h1, seo_title: title, seo_description: desc.slice(0, 200) };
}

const PRODUCT_IMAGES = ['/img/products/lenta-1.svg', '/img/products/lenta-2.svg', '/img/products/lenta-3.svg', '/img/products/lenta-4.svg'];
const LENTA_MIN_PRODUCTS = 30;

const lentaId = db.prepare('SELECT id FROM categories WHERE slug = ?').get('lenta');
if (!lentaId) {
  console.log('Category "lenta" not found — run seed after categories exist.');
} else {
  const lid = lentaId.id;
  const countInLenta = db.prepare('SELECT COUNT(*) as c FROM products WHERE category_id = ?').get(lid).c;
  if (countInLenta < LENTA_MIN_PRODUCTS) {
    db.prepare('DELETE FROM products WHERE category_id = ?').run(lid);
    const now = new Date().toISOString();
    const ins = db.prepare(`
      INSERT INTO products (category_id, name, slug, mark, thickness_mm, width_mm, surface, state, standard, unit, price, stock_qty, seo_title, seo_h1, seo_description, image_url, is_published, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'kg', ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    const usedSlugs = new Set();
    RAW_LINES.forEach((line, i) => {
      const p = parseLine(line);
      let slug = slugFromProduct(p);
      let idx = 0;
      while (usedSlugs.has(slug)) slug = slugFromProduct(p) + '-' + (++idx);
      usedSlugs.add(slug);
      const seo = seoFromProduct(p);
      const imageUrl = PRODUCT_IMAGES[i % PRODUCT_IMAGES.length];
      ins.run(
        lid, p.name, slug, p.mark, p.thickness_mm, p.width_mm, p.surface, p.state, p.standard,
        p.price, p.stock_qty, seo.seo_title, seo.seo_h1, seo.seo_description, imageUrl, now, now
      );
    });
    console.log('Products in "Лента":', RAW_LINES.length, '(with images)');
  } else {
    const updateImg = db.prepare('UPDATE products SET image_url = ? WHERE id = ?');
    const rows = db.prepare('SELECT id FROM products WHERE category_id = ? ORDER BY id').all(lid);
    rows.forEach((row, i) => {
      updateImg.run(PRODUCT_IMAGES[i % PRODUCT_IMAGES.length], row.id);
    });
    if (rows.length > 0) console.log('Image URLs updated for', rows.length, 'products');
  }
}

const noImg = db.prepare("SELECT id FROM products WHERE image_url IS NULL OR image_url = '' ORDER BY id").all();
const updateImg = db.prepare('UPDATE products SET image_url = ? WHERE id = ?');
if (noImg.length > 0) {
  noImg.forEach((row, i) => updateImg.run(PRODUCT_IMAGES[i % PRODUCT_IMAGES.length], row.id));
  console.log('Image URLs set for', noImg.length, 'products without photo');
}
const allProducts = db.prepare('SELECT id, image_url FROM products ORDER BY id').all();
const validPaths = new Set(PRODUCT_IMAGES);
const broken = allProducts.filter(p => !p.image_url || !validPaths.has(p.image_url));
if (broken.length > 0) {
  broken.forEach((row, i) => updateImg.run(PRODUCT_IMAGES[i % PRODUCT_IMAGES.length], row.id));
  console.log('Image URLs fixed for', broken.length, 'products (missing or invalid path)');
}

// ——— Link products to grades/groups ———
const productsToLink = db.prepare('SELECT id, mark FROM products WHERE grade_id IS NULL AND mark IS NOT NULL').all();
if (productsToLink.length > 0) {
  const updateGrade = db.prepare('UPDATE products SET grade_id = ?, group_id = ? WHERE id = ?');
  let linked = 0;
  productsToLink.forEach(p => {
    const grade = db.prepare('SELECT id, group_id FROM steel_grades WHERE name = ?').get(p.mark);
    if (grade) {
      updateGrade.run(grade.id, grade.group_id, p.id);
      linked++;
    }
  });
  if (linked > 0) console.log('Products linked to grades:', linked);
}

console.log('Seed OK.');
