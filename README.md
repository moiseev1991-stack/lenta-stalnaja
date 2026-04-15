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

---

### Шаг 1 — Первый деплой (один раз вручную через SSH)

```bash
# Подключиться по SSH
ssh infogkmeta@77.222.40.49

# Склонировать репозиторий
cd ~
git clone https://github.com/moiseev1991-stack/lenta-stalnaja.git lenta-stalnaja
cd lenta-stalnaja

# Установить зависимости
npm ci --omit=dev

# Настроить переменные окружения
cp .env.production.example .env
nano .env
# Заполнить: MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE,
#            SITE_URL, SESSION_SECRET, ADMIN_PASSWORD,
#            DEPLOY_REPO_DIR=/home/i/infogkmeta/lenta-stalnaja

# Запустить через PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # выполнить команду, которую выведет PM2
```

---

### Шаг 2 — Автодеплой: каждый `git push` → сервер сам обновляется

Используется GitHub Actions (`.github/workflows/deploy.yml`).  
При каждом `git push origin main` GitHub по SSH заходит на сервер и выполняет:

```
git pull origin main  →  npm ci --omit=dev  →  pm2 restart
```

**Настройка секретов** (GitHub → Settings → Secrets and variables → Actions → New repository secret):

| Secret | Значение | Пример |
|--------|----------|--------|
| `SSH_HOST` | IP или домен сервера | `77.222.40.49` |
| `SSH_USER` | SSH-логин | `infogkmeta` |
| `SSH_PASSWORD` | SSH-пароль **или** | `ваш_пароль` |
| `SSH_KEY` | Приватный SSH-ключ (альтернатива паролю) | содержимое `~/.ssh/id_rsa` |
| `DEPLOY_DIR` | Путь к проекту на сервере | `/home/i/infogkmeta/lenta-stalnaja` |

> Достаточно задать **либо** `SSH_PASSWORD`, **либо** `SSH_KEY` — не оба сразу.  
> `SSH_KEY` предпочтительнее: он не требует интерактивного ввода и надёжнее.

**Как добавить секреты:**
1. Перейти: [github.com/moiseev1991-stack/lenta-stalnaja/settings/secrets/actions](https://github.com/moiseev1991-stack/lenta-stalnaja/settings/secrets/actions)
2. Нажать «New repository secret» и добавить все 5 значений из таблицы
3. Готово — теперь каждый `git push origin main` автоматически деплоит сервер

**Проверить последний деплой:**  
GitHub → Actions → «Deploy to SpaceWeb via SSH» → последний запуск.  
В логе шага «Deploy via SSH» должно быть `Done: <дата>`.

---

### Ручной деплой из админки

Кнопка «Деплой и перезапуск» на странице `/admin/db-restore` выполняет то же самое:
`git pull + npm ci + pm2 restart` — прямо с сервера, без GitHub.  
Требует, чтобы в `.env` был заполнен `DEPLOY_REPO_DIR`.

---

### Docker-деплой (если сервер поддерживает Docker)

```bash
mkdir -p ~/lenta-stalnaja && cd ~/lenta-stalnaja
curl -L -o docker-compose.prod.yml \
  https://raw.githubusercontent.com/moiseev1991-stack/lenta-stalnaja/main/docker-compose.prod.yml
curl -L -o .env \
  https://raw.githubusercontent.com/moiseev1991-stack/lenta-stalnaja/main/.env.docker.example
# Отредактировать .env: APP_IMAGE, SITE_URL, пароли MySQL, SESSION_SECRET
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

Обновление после нового push:
```bash
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d
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
