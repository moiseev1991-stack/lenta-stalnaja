const pool = require('./mysql');
const bcrypt = require('bcryptjs');
const config = require('../config');

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

async function runMysqlMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS \`groups\` (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      slug         VARCHAR(255) NOT NULL UNIQUE,
      sort_order   INT NOT NULL DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS grades (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      name         VARCHAR(255) NOT NULL,
      slug         VARCHAR(255) NOT NULL UNIQUE,
      group_id     INT NULL REFERENCES \`groups\`(id),
      sort_order   INT NOT NULL DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      name             VARCHAR(512) NOT NULL,
      slug             VARCHAR(512) NOT NULL UNIQUE,
      grade_id         INT NOT NULL,
      group_id         INT NULL,
      h1               VARCHAR(512) NULL,
      seo_title        VARCHAR(512) NULL,
      seo_description  TEXT NULL,
      thickness_mm     DECIMAL(10,3) NULL,
      width_mm         DECIMAL(10,3) NULL,
      state            VARCHAR(128) NULL,
      surface          VARCHAR(128) NULL,
      gost             VARCHAR(128) NULL,
      price_per_kg     DECIMAL(12,2) NULL,
      stock_kg         TINYINT(1) NOT NULL DEFAULT 0,
      lead_time        VARCHAR(128) NULL,
      image_filename   VARCHAR(512) NULL,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_grade_id (grade_id),
      INDEX idx_group_id (group_id),
      INDEX idx_slug    (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      \`key\`      VARCHAR(255) NOT NULL,
      value        TEXT,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_key (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(255) NOT NULL,
      phone      VARCHAR(255) NOT NULL,
      message    TEXT,
      product_id INT NULL,
      is_done    TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      parent_id        INT NULL,
      name             VARCHAR(255) NOT NULL,
      slug             VARCHAR(255) NOT NULL UNIQUE,
      description_html TEXT,
      seo_title        VARCHAR(512),
      seo_h1           VARCHAR(512),
      seo_description  TEXT,
      is_published     TINYINT(1) DEFAULT 1,
      sort_order       INT DEFAULT 0,
      intro            TEXT,
      article_title    VARCHAR(512),
      article_text     LONGTEXT,
      article_format   VARCHAR(16) DEFAULT 'html',
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS landing_pages (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      category_id   INT NOT NULL,
      slug          VARCHAR(255) NOT NULL,
      filter_json   TEXT,
      seo_title     VARCHAR(512),
      seo_h1        VARCHAR(512),
      seo_description TEXT,
      text_html     LONGTEXT,
      robots        VARCHAR(64) DEFAULT 'index,follow',
      canonical_url VARCHAR(512),
      is_published  TINYINT(1) DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cat_slug (category_id, slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  console.log('MySQL CREATE TABLE OK');

  const alterCols = [
    `ALTER TABLE products ADD COLUMN full_gost_name TEXT NULL AFTER seo_description`,
    `ALTER TABLE products ADD COLUMN spring_props TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE products ADD COLUMN short_text_html TEXT NULL`,
    `ALTER TABLE grades ADD COLUMN seo_h1 VARCHAR(512) NULL`,
    `ALTER TABLE grades ADD COLUMN seo_title VARCHAR(512) NULL`,
    `ALTER TABLE grades ADD COLUMN seo_description TEXT NULL`,
    `ALTER TABLE grades ADD COLUMN intro TEXT NULL`,
    `ALTER TABLE grades ADD COLUMN article_title VARCHAR(512) NULL`,
    `ALTER TABLE grades ADD COLUMN article_text LONGTEXT NULL`,
    `ALTER TABLE grades ADD COLUMN article_format VARCHAR(16) DEFAULT 'html'`,
    `ALTER TABLE grades ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`,
    `ALTER TABLE \`groups\` ADD COLUMN seo_h1 VARCHAR(512) NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN seo_title VARCHAR(512) NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN seo_description TEXT NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN intro TEXT NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN article_title VARCHAR(512) NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN article_text LONGTEXT NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN article_format VARCHAR(16) DEFAULT 'html'`,
    `ALTER TABLE \`groups\` ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`,
    `ALTER TABLE grades ADD COLUMN faq_json JSON NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN faq_json JSON NULL`,
    `ALTER TABLE settings MODIFY COLUMN value LONGTEXT`,
    `ALTER TABLE grades ADD COLUMN key_specs_html LONGTEXT NULL`,
    `ALTER TABLE \`groups\` ADD COLUMN key_specs_html LONGTEXT NULL`,
    // Sitemap reads COALESCE(updated_at, created_at) from these tables;
    // missing column silently empties sitemap-grades.xml / sitemap-groups.xml.
    `ALTER TABLE grades ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    `ALTER TABLE \`groups\` ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    `ALTER TABLE grades ADD COLUMN aisi_analog VARCHAR(100) NULL`,
  ];

  for (const sql of alterCols) {
    try { await pool.query(sql); } catch (_) {}
  }
  console.log('MySQL migrations OK');

  // ── Backfill: зарубежные аналоги для отечественных марок ───────────────────
  // UPDATE ... WHERE aisi_analog IS NULL — не перезатирает ручную правку в админке.
  const analogMapping = [
    ['08Х18Н10',      'AISI 304'],
    ['10Х17Н13М3Т',   'AISI 316Ti'],
    ['12Х18Н10Т',     'AISI 321'],
    ['12Х18Н9',       'AISI 302'],
    ['12Х18Н9СМР',    '≈ AISI 316'],
    ['20Х13',         'AISI 420'],
    ['27КХ',          'Vicalloy II'],
    ['29НК',          'ASTM F15 / Kovar'],
    ['36НХТЮ',        'Ni-Span-C 902'],
    ['40КХНМ',        'Havar'],
    ['65Г',           '≈ AISI 1066'],
    ['Х15Н60',        'Nichrome 60 / NiCr60'],
    ['Х15Ю5',         'FeCrAl / Kanthal APM'],
    ['Х20Н80',        'Nichrome 80 / NiCr80/20'],
    ['Х20Н80-Н',      'Nichrome 80 (нагартованный)'],
    ['Х23Ю5',         'Kanthal A'],
    ['Х23Ю5Т',        'Kanthal AF'],
    ['ХН78Т',         '≈ Inconel 600'],
  ];
  try {
    for (const [name, analog] of analogMapping) {
      await pool.query(
        'UPDATE grades SET aisi_analog = ? WHERE name = ? AND (aisi_analog IS NULL OR aisi_analog = ?)',
        [analog, name, '']
      );
    }
    console.log('MySQL aisi_analog backfill OK');
  } catch (e) {
    console.warn('MySQL aisi_analog backfill skipped:', e.message);
  }

  // ── SEO: update home title and meta description ───────────────────────────
  try {
    // 60 символов — оптимальный размер для SERP без обрезки.
    // Бренд дублируется в JSON-LD WebSite/Organization (см. layout.html).
    const HOME_TITLE = 'Лента стальная купить оптом — все марки, доставка по России';
    const HOME_DESC  = 'Стальная лента всех марок: 12Х18Н10Т, 65Г, 20Х13, Х20Н80 и другие. Коррозионностойкие, жаростойкие, прецизионные сплавы. Доставка по России. Тел: 8-800-100-08-74.';
    await pool.query(
      'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
      ['home_title', HOME_TITLE, HOME_TITLE]
    );
    await pool.query(
      'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
      ['home_meta_description', HOME_DESC, HOME_DESC]
    );

    // Дефолтный FAQ для главной (рендерится как FAQPage JSON-LD + видимый блок).
    // Пишется ТОЛЬКО если ключа ещё нет (INSERT IGNORE) — не перезаписывает ручную правку.
    const HOME_FAQ = JSON.stringify([
      {
        question: 'Какие марки стальной ленты есть в наличии?',
        answer:  'В каталоге представлены все основные марки: коррозионностойкие (12Х18Н10Т, 08Х18Н10, 20Х13, 10Х17Н13М3Т), рессорно-пружинные (65Г), нихромовые (Х20Н80, Х15Н60), фехралевые (Х23Ю5, Х23Ю5Т), жаропрочные (ХН78Т) и прецизионные сплавы (36НХТЮ, 40КХНМ, 29НК и др.). Всего более 7000 типоразмеров.',
      },
      {
        question: 'Делаете ли вы нарезку ленты в нужный размер?',
        answer:  'Да, нарезаем ленту в любой размер по толщине и ширине от 1 рулона. Срок изготовления — 1–3 рабочих дня в зависимости от объёма заказа. Точность реза соответствует требованиям ГОСТ.',
      },
      {
        question: 'Как осуществляется доставка по России?',
        answer:  'Отправляем транспортными компаниями (ПЭК, Деловые Линии, ТК Кит, СДЭК) во все регионы РФ. Срок доставки — от 1 до 10 дней в зависимости от региона. Также возможен самовывоз со склада в Нижнем Новгороде (Московское ш., 320Б).',
      },
      {
        question: 'Как рассчитать стоимость заказа и оформить покупку?',
        answer:  'Позвоните по телефону 8-800-100-08-74 (бесплатно по РФ) или оставьте заявку на сайте — менеджер рассчитает стоимость в течение 15 минут. Работаем как с юридическими лицами (безналичный расчёт с НДС и без), так и с физическими лицами.',
      },
      {
        question: 'Какие ГОСТы и нормативы поддерживаются?',
        answer:  'Поставляем ленту по ГОСТ 4986-79 (нержавеющая), ГОСТ 2283-79 (пружинная), ГОСТ 12766.1-90 и 12766.2-90 (для сплавов с высоким электросопротивлением), ГОСТ 10994-74 (прецизионные сплавы). По запросу предоставляем сертификаты соответствия.',
      },
    ]);
    await pool.query(
      'INSERT IGNORE INTO settings (`key`, value) VALUES (?, ?)',
      ['home_faq_json', HOME_FAQ]
    );
  } catch (_) {}

  // ── SEO: seed grade intro texts (only when intro is empty) ────────────────
  const GRADE_INTROS = [
    ['12Х18Н10Т', 'Лента 12Х18Н10Т — наиболее распространённая коррозионностойкая сталь в России. Аустенитная нержавеющая сталь с добавкой титана, что обеспечивает стойкость к межкристаллитной коррозии после сварки. Российский аналог AISI 321. Применяется в химическом машиностроении, пищевом оборудовании, медицине, авиации. ГОСТ 4986-79. Поставляем нарезку под заказ, доставка по всей России.'],
    ['65Г', 'Лента 65Г — углеродистая рессорно-пружинная сталь. Высокая твёрдость и упругость после термообработки делают её основным материалом для пружин, рессор, шайб Гровера, ножей и режущего инструмента. ГОСТ 2283-79. Поставляем в отожжённом и нагартованном состоянии, нарезка под заказ, доставка по России.'],
    ['20Х13', 'Лента 20Х13 — мартенситная коррозионностойкая сталь. Хорошо полируется, магнитная, стойкая к атмосферной коррозии и слабоагрессивным средам. Применяется для столовых приборов, медицинского инструмента, деталей турбин, компрессоров. ГОСТ 4986-79. Доставка по России, нарезка от заказа.'],
    ['08Х18Н10', 'Лента 08Х18Н10 — аустенитная нержавеющая сталь с низким содержанием углерода, аналог AISI 304L. Отличная свариваемость, высокая коррозионная стойкость в большинстве агрессивных сред. Применяется в химической промышленности, криогенной технике, пищевом оборудовании. ГОСТ 4986-79.'],
    ['Х20Н80', 'Лента Х20Н80 — сплав на никелевой основе с высоким электросопротивлением и жаростойкостью до 1100°C. Основной материал для нагревательных элементов промышленных и бытовых электроприборов. Аналог нихрома. ГОСТ 12766.1-90. Поставляем нарезку под заказ.'],
    ['Х15Н60', 'Лента Х15Н60 — нихромовый сплав с рабочей температурой до 1000°C. Высокое удельное электросопротивление, стойкость к окислению. Применяется для нагревательных элементов, резисторов, термопар. ГОСТ 12766.1-90.'],
    ['12Х18Н9', 'Лента 12Х18Н9 — аустенитная коррозионностойкая сталь, близкая к AISI 302. Хорошая формуемость и свариваемость, стойкость к коррозии в атмосферных условиях и слабоагрессивных средах. Применяется в пищевой промышленности, архитектуре, производстве посуды. ГОСТ 4986-79.'],
    ['10Х17Н13М3Т', 'Лента 10Х17Н13М3Т — аустенитная нержавеющая сталь с молибденом и титаном, аналог AISI 316Ti. Повышенная стойкость к питтинговой коррозии в хлоридных средах, кислотах. Применяется в химическом машиностроении, судостроении, нефтегазовой промышленности. ГОСТ 4986-79.'],
    ['17ХНГТ', 'Лента 17ХНГТ (ЭИ814) — цементуемая легированная сталь. Высокая поверхностная твёрдость после цементации при вязкой сердцевине. Применяется для шестерён, втулок, кулачков и других деталей, работающих на износ. ГОСТ 4543-71.'],
    ['Х23Ю5', 'Лента Х23Ю5 — жаростойкий сплав системы Fe-Cr-Al с рабочей температурой до 1300°C. Применяется для нагревательных элементов высокотемпературных печей, термопар, печных конвейеров. ГОСТ 12766.2-90.'],
    ['Х23Ю5Т', 'Лента Х23Ю5Т — жаростойкий фехралевый сплав с добавкой титана, рабочая температура до 1300°C. Применяется для нагревательных элементов высокотемпературных печей и печных конвейеров. ГОСТ 12766.2-90.'],
    ['ХН78Т', 'Лента ХН78Т — жаропрочный никелевый сплав, стойкий к окислению до 900°C. Применяется в авиационной и ракетной технике, газовых турбинах, высокотемпературных нагревательных устройствах. ГОСТ 10994-74.'],
    ['36НХТЮ', 'Лента 36НХТЮ — прецизионный сплав с заданными упругими характеристиками. Применяется в приборостроении, электронике, точном машиностроении. Поставляем под заказ, нарезка в размер, доставка по России. Уточняйте наличие по телефону 8-800-100-08-74.'],
    ['40КХНМ', 'Лента 40КХНМ — прецизионный магнитомягкий сплав для приборостроения. Применяется в приборостроении, электронике, точном машиностроении. Поставляем под заказ, нарезка в размер, доставка по России. Уточняйте наличие по телефону 8-800-100-08-74.'],
    ['12Х18Н9СМР', 'Лента 12Х18Н9СМР — аустенитная сталь с улучшенной обрабатываемостью резанием. Применяется в приборостроении, электронике, точном машиностроении. Поставляем под заказ, нарезка в размер, доставка по России.'],
    ['Х15Ю5', 'Лента Х15Ю5 — фехралевый сплав для нагревательных элементов средней температуры. Применяется в приборостроении, электронике, точном машиностроении. Поставляем под заказ, нарезка в размер, доставка по России. Уточняйте наличие по телефону 8-800-100-08-74.'],
    ['Х20Н80-Н', 'Лента Х20Н80-Н — нихромовый сплав нагартованный с повышенной прочностью. Применяется в приборостроении, электронике, точном машиностроении. Поставляем под заказ, нарезка в размер, доставка по России. Уточняйте наличие по телефону 8-800-100-08-74.'],
    ['27КХ', 'Лента 27КХ — прецизионный сплав для постоянных магнитов. Применяется в приборостроении, электронике, точном машиностроении. Поставляем под заказ, нарезка в размер, доставка по России. Уточняйте наличие по телефону 8-800-100-08-74.'],
    ['29НК', 'Лента 29НК — прецизионный сплав с заданным коэффициентом теплового расширения. Применяется в приборостроении, электронике, точном машиностроении. Поставляем под заказ, нарезка в размер, доставка по России. Уточняйте наличие по телефону 8-800-100-08-74.'],
  ];
  try {
    for (const [name, intro] of GRADE_INTROS) {
      await pool.query(
        'UPDATE grades SET intro = ? WHERE name = ? AND (intro IS NULL OR intro = \'\')',
        [intro, name]
      );
    }
  } catch (_) {}

  // ── SEO: seed group intro texts (only when intro is empty) ────────────────
  const GROUP_INTROS = [
    ['Высокое электросопротивление', 'Лента из сплавов с высоким электросопротивлением — нихром, фехраль и аналоги. Применяется для производства нагревательных элементов, резисторов, реостатов, термопар. Основные марки: Х20Н80, Х15Н60, Х23Ю5, Х15Ю5. Поставляем нарезку под заказ по всей России.'],
    ['Жаростойкие и жаропрочные', 'Жаростойкие и жаропрочные стальные ленты для работы при температурах до 1300°C. Применяются в печной промышленности, авиации, энергетике, химическом машиностроении. Основные марки: ХН78Т, Х23Ю5Т, Х20Н80, 12Х18Н10Т.'],
    ['Коррозионно-стойкие стали', 'Ленты из коррозионностойких сталей для агрессивных сред, пищевой промышленности, медицины и химического оборудования. Аустенитные и мартенситные марки: 12Х18Н10Т, 08Х18Н10, 10Х17Н13М3Т, 20Х13, 12Х18Н9. ГОСТ 4986-79.'],
    ['Лента холоднокатаная', 'Лента холоднокатаная стальная — точные размеры, чистая поверхность, минимальные допуски по толщине. Применяется в приборостроении, автомобилестроении, производстве пружин и штамповке. ГОСТ 2283-79, ГОСТ 10234-77.'],
    ['Прецизионные сплавы', 'Прецизионные сплавы с заданными физическими характеристиками: термобиметаллы, магнитомягкие, магнитотвёрдые, сплавы с заданным ТКЛР. Применяются в приборостроении, электронике, точном машиностроении. Марки: 36НХТЮ, 40КХНМ, 29НК, 27КХ.'],
    ['Углеродистые стали', 'Лента из углеродистых и рессорно-пружинных сталей. Высокая твёрдость и упругость после термообработки. Применяется для пружин, рессор, ножей, инструмента. Основная марка: 65Г. ГОСТ 2283-79.'],
  ];
  try {
    for (const [name, intro] of GROUP_INTROS) {
      await pool.query(
        'UPDATE `groups` SET intro = ? WHERE name = ? AND (intro IS NULL OR intro = \'\')',
        [intro, name]
      );
    }
  } catch (_) {}


  // Auto-fix garbled settings (missing Cyrillic = stored with wrong charset)
  const SN =
    '\u041b\u0435\u043d\u0442\u0430 \u0441\u0442\u0430\u043b\u044c\u043d\u0430\u044f \u2014 \u043a\u0430\u0442\u0430\u043b\u043e\u0433 \u043c\u0435\u0442\u0430\u043b\u043b\u043e\u043f\u0440\u043e\u043a\u0430\u0442\u0430';
  const defaultSettings = [
    ['site_name', SN],
    ['home_title', SN],
    ['home_h1', '\u041a\u0430\u0442\u0430\u043b\u043e\u0433 \u0441\u0442\u0430\u043b\u044c\u043d\u043e\u0439 \u043b\u0435\u043d\u0442\u044b \u2014 \u0431\u043e\u043b\u0435\u0435 7000 \u0442\u0438\u043f\u043e\u0440\u0430\u0437\u043c\u0435\u0440\u043e\u0432 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438'],
    [
      'home_meta_description',
      '\u041d\u0435\u0440\u0436\u0430\u0432\u0435\u044e\u0449\u0430\u044f \u0438 \u043a\u043e\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u043e\u043d\u043d\u0430\u044f \u043b\u0435\u043d\u0442\u0430 \u043f\u043e \u0413\u041e\u0421\u0422. \u041d\u0430\u043b\u0438\u0447\u0438\u0435 \u043d\u0430 \u0441\u043a\u043b\u0430\u0434\u0435, \u0440\u0435\u0437\u043a\u0430 \u0432 \u0440\u0430\u0437\u043c\u0435\u0440, \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0430 \u043f\u043e \u0420\u043e\u0441\u0441\u0438\u0438.',
    ],
  ];
  try {
    const [[row]] = await pool.query("SELECT value FROM settings WHERE `key` = 'site_name'");
    const _v = row ? (row.value || '') : '';
    if (!_v || isMojibake(_v)) {
      for (const [key, val] of defaultSettings) {
        await pool.query(
          'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?',
          [key, val, val]
        );
      }
      console.log('Settings encoding fixed');
    }
  } catch (_) {}

  // Seed admin user if table is empty
  try {
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM admin_users');
    if (cnt === 0) {
      const username = config.adminUsername || 'admin';
      const password = config.adminPassword || 'admin123';
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'INSERT INTO admin_users (username, password_hash) VALUES (?, ?)',
        [username, hash]
      );
      console.log('Admin user created:', username);
    }
  } catch (err) {
    console.error('Admin seed error:', err.message);
  }
}

module.exports = { runMysqlMigrations };
