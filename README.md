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

## Деплой на SpaceWeb (production)

### Требования на сервере

- Node.js 18+
- PM2: `npm install -g pm2`
- MySQL (SpaceWeb → Базы данных → MySQL — создать БД и пользователя)

### Первый деплой (вручную через SSH)

```bash
# 1. Подключиться по SSH
ssh infogkmeta@77.222.40.49

# 2. Склонировать репозиторий в папку сайта
cd ~
git clone https://github.com/moiseev1991-stack/lenta-stalnaja.git lenta-stalnaja
cd lenta-stalnaja

# 3. Установить зависимости
npm ci --omit=dev

# 4. Настроить переменные окружения
cp .env.production.example .env
nano .env   # заполнить MYSQL_*, SITE_URL, SESSION_SECRET, ADMIN_PASSWORD

# 5. Инициализировать SQLite (заявки, настройки)
npm run init-db

# 6. Запустить через PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # выполнить команду, которую выведет PM2
```

### Автодеплой через GitHub Actions (FTP)

При каждом `git push origin main` GitHub автоматически загружает файлы на SpaceWeb по FTP.

**Настройка секретов** (GitHub → Settings → Secrets and variables → Actions → New repository secret):

| Secret | Значение |
|--------|----------|
| `FTP_HOST` | SpaceWeb панель → FTP-аккаунты → Сервер (обычно `ftp.ваш-домен.ru`) |
| `FTP_USER` | SpaceWeb панель → FTP-аккаунты → Логин (например `infogkmeta`) |
| `FTP_PASSWORD` | SpaceWeb панель → FTP-аккаунты → Пароль |
| `FTP_PATH` | **`/`** — FTP уже стартует из домашней папки (`~/`), поэтому значение `/` кладёт файлы прямо в `~`. **Не указывать** абсолютный путь вида `/home/i/infogkmeta/` — иначе файлы уйдут в `~/home/i/infogkmeta/` (вложены сами в себя) |

> **Важно про `FTP_PATH`**: FTP-сессия на SpaceWeb открывается уже внутри `~/` пользователя. Значение `/` → файлы в `~/`. Значение `/myproject/` → файлы в `~/myproject/`. Абсолютный серверный путь здесь писать **нельзя**.

**Шаги:**
1. Перейти: [github.com/moiseev1991-stack/lenta-stalnaja/settings/secrets/actions](https://github.com/moiseev1991-stack/lenta-stalnaja/settings/secrets/actions)
2. Добавить все 4 секрета из таблицы выше
3. После этого каждый `git push origin main` будет автоматически загружать изменения

### Docker-деплой (рекомендуется для стабильных обновлений)

Если сервер поддерживает Docker, используйте контейнерный деплой вместо FTP/PHP-прокси.

Что уже добавлено в проект:
- workflow `.github/workflows/docker-image.yml` (build + push образа в GHCR при каждом push в `main`);
- `docker-compose.prod.yml` для запуска `web + mysql`;
- `.env.docker.example` как шаблон переменных.

Шаги на сервере (один раз):

```bash
mkdir -p ~/lenta-stalnaja && cd ~/lenta-stalnaja
curl -L -o docker-compose.prod.yml https://raw.githubusercontent.com/moiseev1991-stack/lenta-stalnaja/main/docker-compose.prod.yml
curl -L -o .env https://raw.githubusercontent.com/moiseev1991-stack/lenta-stalnaja/main/.env.docker.example
```

Далее отредактируйте `.env`:
- `APP_IMAGE=ghcr.io/moiseev1991-stack/lenta-stalnaja:latest`
- домен `SITE_URL`;
- пароли `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `ADMIN_PASSWORD`, `SESSION_SECRET`.

Запуск:

```bash
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Обновление после нового push:

```bash
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

### Настройка Node.js на SpaceWeb

После первой загрузки через FTP — зайти по SSH и выполнить один раз:
```bash
cd ~/lenta-stalnaja.ru/
npm ci --omit=dev
cp .env.production.example .env
# Заполнить .env данными из SpaceWeb панель
# Для кнопки "Деплой и перезапуск" в админке:
# DEPLOY_REPO_DIR=/home/i/infogkmeta/lenta-stalnaja
pm2 start ecosystem.config.js --env production
pm2 save
```

---

## Критерии приёмки

- Локальный запуск по README без правок кода
- CRUD категорий/товаров/посадочных в админке
- SEO-поля отображаются на страницах
- Фильтрация каталога по атрибутам
- Импорт CSV товаров с построчным логом ошибок
- Наличие `sitemap.xml` и `robots.txt`
- Лёгкий HTML/CSS, SSR
