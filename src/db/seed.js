const bcrypt = require('bcryptjs');
const config = require('../config');
const pool = require('./mysql');

async function run() {
  // ——— Admin (INSERT IGNORE if migrations didn't create) ———
  const hash = bcrypt.hashSync(config.adminPassword, 10);
  await pool.query(
    'INSERT IGNORE INTO admin_users (username, password_hash) VALUES (?, ?)',
    [config.adminUsername, hash]
  );
  console.log('Admin user ensured:', config.adminUsername);

  // ——— Groups ———
  const STEEL_GROUPS = [
    { name: 'Высокое электросопротивление', slug: 'vysokoe-elektrosoprotivlenie' },
    { name: 'Жаростойкие и жаропрочные', slug: 'zharostojkie-zharoprochnye' },
    { name: 'Коррозионно-стойкие стали', slug: 'korrozionno-stojkie' },
    { name: 'Лента холоднокатаная', slug: 'holodnokatanaya' },
    { name: 'Прецизионные сплавы', slug: 'precizionnye-splavy' },
  ];

  const [[{ groupsCount }]] = await pool.query('SELECT COUNT(*) AS groupsCount FROM `groups`');
  if (groupsCount === 0) {
    for (let i = 0; i < STEEL_GROUPS.length; i++) {
      const g = STEEL_GROUPS[i];
      await pool.query(
        'INSERT INTO `groups` (name, slug, sort_order) VALUES (?, ?, ?)',
        [g.name, g.slug, i + 1]
      );
    }
    console.log('Groups created:', STEEL_GROUPS.length);
  }

  // ——— Grades ———
  const STEEL_GRADES = [
    { name: '12Х18Н10Т', slug: '12h18n10t', groupSlug: 'korrozionno-stojkie' },
    { name: '08Х18Н10', slug: '08h18n10', groupSlug: 'korrozionno-stojkie' },
    { name: '08Х13', slug: '08h13', groupSlug: 'korrozionno-stojkie' },
    { name: '12Х17', slug: '12h17', groupSlug: 'korrozionno-stojkie' },
    { name: '20Х13', slug: '20h13', groupSlug: 'korrozionno-stojkie' },
    { name: '40Х13', slug: '40h13', groupSlug: 'zharostojkie-zharoprochnye' },
    { name: '10Х17Н13М2Т', slug: '10h17n13m2t', groupSlug: 'korrozionno-stojkie' },
    { name: '08Х17Т', slug: '08h17t', groupSlug: 'korrozionno-stojkie' },
    { name: 'AISI 304', slug: 'aisi-304', groupSlug: 'korrozionno-stojkie' },
    { name: 'AISI 316', slug: 'aisi-316', groupSlug: 'korrozionno-stojkie' },
    { name: 'Х20Н80', slug: 'h20n80', groupSlug: 'vysokoe-elektrosoprotivlenie' },
    { name: 'Х15Н60', slug: 'h15n60', groupSlug: 'vysokoe-elektrosoprotivlenie' },
    { name: 'ХН70Ю', slug: 'hn70yu', groupSlug: 'vysokoe-elektrosoprotivlenie' },
    { name: '36НХТЮ', slug: '36nhtu', groupSlug: 'precizionnye-splavy' },
    { name: '29НК', slug: '29nk', groupSlug: 'precizionnye-splavy' },
    { name: '65Г', slug: '65g', groupSlug: 'holodnokatanaya' },
    { name: '70С3А', slug: '70s3a', groupSlug: 'holodnokatanaya' },
    { name: '50ХФА', slug: '50hfa', groupSlug: 'holodnokatanaya' },
    { name: '08КП', slug: '08kp', groupSlug: 'holodnokatanaya' },
  ];

  const [[{ gradesCount }]] = await pool.query('SELECT COUNT(*) AS gradesCount FROM grades');
  if (gradesCount === 0) {
    for (let i = 0; i < STEEL_GRADES.length; i++) {
      const gr = STEEL_GRADES[i];
      const [[group]] = await pool.query('SELECT id FROM `groups` WHERE slug = ?', [gr.groupSlug]);
      await pool.query(
        'INSERT INTO grades (name, slug, group_id, sort_order) VALUES (?, ?, ?, ?)',
        [gr.name, gr.slug, group ? group.id : null, i + 1]
      );
    }
    console.log('Grades created:', STEEL_GRADES.length);
  }

  // ——— Categories ———
  const [[{ catCount }]] = await pool.query('SELECT COUNT(*) AS catCount FROM categories');
  if (catCount === 0) {
    const lentaDesc = `<p>Лента из нержавеющей и конструкционной стали — один из самых востребованных видов металлопроката. Мы поставляем ленту по ГОСТ 4986-79 и другим стандартам, в различном исполнении поверхности (2Б, 2Г, 3Б и др.) и состоянии (мягкая, нагартованная, полунагартованная).</p>
<p>Ассортимент включает марки 12Х18Н10Т, 08Х18Н10, 08Х13 и другие. Лента применяется в производстве крепежа, элементов конструкций, в пищевой и химической промышленности. Наличие на складе и быстрая отгрузка.</p>
<p>Цены зависят от марки, размера и объёма заказа. Отправьте заявку — рассчитаем стоимость и сроки доставки.</p>`;
    const listDesc = `<p>Листовой металлопрокат: холоднокатаный и горячекатаный лист, нержавеющий и конструкционный. Резка в размер, доставка по регионам.</p>
<p>Работаем с юридическими и физическими лицами. Оплата по счёту и наличными. Подробности уточняйте по телефону или через форму заявки.</p>`;

    await pool.query(`
      INSERT INTO categories (parent_id, name, slug, description_html, seo_title, seo_h1, seo_description, sort_order)
      VALUES (NULL, 'Лента', 'lenta', ?, 'Лента — нержавеющая и стальная | Каталог', 'Лента', 'Лента стальная и нержавеющая по ГОСТ. Цены, наличие, доставка.', 1),
             (NULL, 'Лист', 'list', ?, 'Лист — металлопрокат | Каталог', 'Лист', 'Листовой металл: холоднокатаный и горячекатаный лист.', 2)
    `, [lentaDesc, listDesc]);
    console.log('Categories created.');
  }

  // ——— Products (12Х18Н10Т ленты) ———
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
    const res = { name: line.trim(), mark: '12Х18Н10Т', surface: '3Б', state: null, standard: 'ГОСТ 4986-79', thickness_mm: null, width_mm: null, stock_kg: 1, price: null };
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
      if (!isNaN(val)) res.stock_kg = val < 10000 ? 1 : 1;
    }
    if (res.price == null) res.price = Math.round(config.priceRandomMin + Math.random() * (config.priceRandomMax - config.priceRandomMin));
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
    const desc = `Лента 12Х18Н10Т ${t}×${w} мм по ГОСТ 4986-79. Уточняйте наличие и цену. Доставка по России.`;
    return { seo_h1: h1, seo_title: title, seo_description: desc.slice(0, 200) };
  }

  const PRODUCT_IMAGES = ['lenta-1.svg', 'lenta-2.svg', 'lenta-3.svg', 'lenta-4.svg'];

  const [[grade12]] = await pool.query('SELECT id, group_id FROM grades WHERE name = ?', ['12Х18Н10Т']);
  if (!grade12) {
    console.log('Grade 12Х18Н10Т not found — run seed after grades exist.');
  } else {
    const [[{ prodCount }]] = await pool.query('SELECT COUNT(*) AS prodCount FROM products WHERE grade_id = ?', [grade12.id]);
    if (prodCount < 30) {
      await pool.query('DELETE FROM products WHERE grade_id = ?', [grade12.id]);
      const usedSlugs = new Set();
      for (let i = 0; i < RAW_LINES.length; i++) {
        const line = RAW_LINES[i];
        const p = parseLine(line);
        let slug = slugFromProduct(p);
        let idx = 0;
        while (usedSlugs.has(slug)) slug = slugFromProduct(p) + '-' + (++idx);
        usedSlugs.add(slug);
        const seo = seoFromProduct(p);
        const imageFilename = PRODUCT_IMAGES[i % PRODUCT_IMAGES.length];
        await pool.query(`
          INSERT INTO products (name, slug, grade_id, group_id, h1, seo_title, seo_description,
            thickness_mm, width_mm, surface, state, gost, price_per_kg, stock_kg, image_filename)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          p.name, slug, grade12.id, grade12.group_id, seo.seo_h1, seo.seo_title, seo.seo_description,
          p.thickness_mm, p.width_mm, p.surface, p.state, p.standard, p.price, p.stock_kg, imageFilename
        ]);
      }
      console.log('Products (12Х18Н10Т):', RAW_LINES.length);
    }
  }

  console.log('Seed OK.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
