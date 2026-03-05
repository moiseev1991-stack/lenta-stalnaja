# Каталог металлопроката (SSR + админка)

Лёгкий SSR-сайт каталога с категориями, товарами, фильтрами, SEO-полями и админкой для CRUD, импорта/экспорта CSV.

## Стек

- **Node.js** (LTS) + **Express**
- **SQLite** (файл `./data/app.db`)
- **Nunjucks** (шаблоны)
- Чистый **CSS** (один файл `public/css/styles.css`), без Bootstrap/Tailwind

## Быстрый старт

```bash
npm i
npm run init-db
npm run seed
npm run dev
```

Сайт: **http://localhost:3000**  
Админка: **http://localhost:3000/admin** (логин/пароль из `.env`, по умолчанию `admin` / `admin123`)

**Проверка после запуска:**
- Главная / каталог: http://localhost:3000/
- Марка стали (пример): http://localhost:3000/12h18n10t/
- Карточка товара (пример slug после seed): http://localhost:3000/12h18n10t/lenta-12h18n10t-0-2x400-3b-gost-4986-79/

## Скрипты

| Команда | Описание |
|--------|----------|
| `npm run dev` | Запуск с nodemon (перезапуск при изменениях) |
| `npm start` | Запуск сервера |
| `npm run init-db` | Создание файла БД и таблиц |
| `npm run seed` | Создание админа и демо категорий/товаров |

## Конфигурация

Скопируйте `.env.example` в `.env` и при необходимости измените:

- `PORT` — порт (по умолчанию 3000)
- `DB_PATH` — путь к файлу SQLite (по умолчанию `./data/app.db`)
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` — учётные данные админа (используются при `npm run seed`)
- `PRICE_RANDOM_MIN` / `PRICE_RANDOM_MAX` — диапазон случайной цены при импорте CSV, если поле цены пустое
- `SESSION_SECRET` — секрет сессий (обязательно сменить в продакшене)

## Структура проекта

```
├── src/
│   ├── app.js              # Точка входа Express
│   ├── config.js           # Настройки из .env
│   ├── db/
│   │   ├── db.js           # Подключение к SQLite
│   │   ├── migrations.js   # Создание таблиц
│   │   └── seed.js         # Админ + демо-данные
│   ├── routes/
│   │   ├── public.js       # Публичные страницы
│   │   └── admin.js        # Админка
│   ├── controllers/
│   ├── services/          # catalog, csv, sitemap
│   ├── middleware/        # auth (requireAdmin)
│   └── views/              # Шаблоны Nunjucks
├── public/
│   ├── css/
│   │   └── styles.css
│   └── img/
│       └── placeholder.svg   # заглушка для фото товара
├── data/                   # SQLite (создаётся при init-db)
├── .env.example
└── package.json
```

## Публичные страницы

- `/` — главная / каталог ленты
- `/:gradeSlug/` — страница марки стали (фильтры, товары)
- `/:gradeSlug/:productSlug/` — карточка товара
- `/group/:groupSlug/` — страница группы назначения
- `/:slug/` — SEO-категория (SQLite)
- `/:category/:landingSlug/` — посадочная страница (SQLite)
- `/about/`, `/contacts/`, `/delivery/`, `/payment/`, `/faq/`, `/certificates/`
- `/search/?q=...` — поиск по каталогу
- `/sitemap/` — HTML-карта сайта
- `/sitemap.xml` — XML sitemap
- `/robots.txt`

## Фильтры (query string)

На странице марки: `mark`, `thickness`, `width`, `surface`, `state`, `standard`, `q` (поиск). Пример:  
`/12h18n10t/?thickness=0.2&width=400`

## Админка

- **Вход:** `/admin/login`
- **Дашборд:** `/admin`
- **CRUD:** категории, товары, посадочные страницы
- **Импорт CSV:** товары (и при необходимости категории), UTF-8, разделитель `;`, при пустой цене — случайная из диапазона, по `slug` — upsert, ошибки по строкам в логе
- **Экспорт CSV:** товары, категории, посадочные

## SEO

- `title` из `seo_title` (fallback: название + бренд)
- `h1` из `seo_h1` (fallback: название)
- `meta name="description"` из `seo_description`
- Canonical: для категории с фильтрами — на чистую категорию; для посадочных — на себя или `canonical_url`
- Страницы с query-фильтрами: `noindex,follow`
- В sitemap.xml только опубликованные категории/товары и посадочные с `robots` содержащим `index`

## Критерии приёмки

- Локальный запуск по README без правок кода
- CRUD категорий/товаров/посадочных в админке
- SEO-поля отображаются на страницах
- Фильтрация каталога по атрибутам
- Импорт CSV товаров с построчным логом ошибок
- Наличие `sitemap.xml` и `robots.txt`
- Лёгкий HTML/CSS, SSR
