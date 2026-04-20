# SEO-тексты для lenta-stalnaja.ru — инструкция для Cursor

## Структура проекта

В этой папке находятся MD-файлы с готовыми SEO-текстами для сайта lenta-stalnaja.ru.
Сайт работает на Node.js + Express + Nunjucks + MySQL.

## Какие файлы есть

1. `01_homepage.md` — тексты для главной страницы
2. `02_category_korrozionno_stojkie.md` — раздел "Коррозионно-стойкие стали"
3. `03_category_zharostojkie.md` — раздел "Жаростойкие и жаропрочные"
4. `04_category_precizionnye.md` — раздел "Прецизионные сплавы"
5. `05_category_vysokoe_elektro.md` — раздел "Высокое электросопротивление"
6. `06_category_uglerodistye.md` — раздел "Углеродистые стали"
7. `07_category_lenta_holodnokatanaya.md` — раздел "Лента холоднокатаная"
8. `08_mark_12kh18n10t.md` — марка 12Х18Н10Т (флагманская)
9. `09_mark_65g.md` — марка 65Г (пружинная сталь)
10. `10_mark_kh20n80.md` — марка Х20Н80 (нихром)
11. `11_mark_20kh13.md` — марка 20Х13 (нержавейка, массовый спрос)
12. `12_mark_36nkhtyu.md` — марка 36НХТЮ (прецизионная)
13. `13_CURSOR_PROMPT_remaining_marks.md` — промпт для Курсора, чтобы он сам через API сгенерировал тексты для оставшихся 15 марок

## Задача для Cursor

Шаг 1: Добавь в БД (если их ещё нет) поля для SEO-текстов в таблицы `marks` и `categories`:
- `seo_title` VARCHAR(300)
- `seo_description` VARCHAR(500)
- `h1` VARCHAR(300)
- `intro_text` TEXT (короткий текст сверху)
- `main_text` LONGTEXT (основной текст под каталогом, с HTML-разметкой H2/H3/таблицы)
- `faq_json` JSON (массив объектов {question, answer})

Шаг 2: Возьми каждый MD-файл, распарси его секции (они размечены понятно) и положи в соответствующие поля БД.

Шаг 3: Обнови Nunjucks-шаблоны (templates/mark.njk, templates/category.njk, templates/index.njk):
- Выведи `intro_text` СРАЗУ ПОД H1, ДО каталога товаров
- Выведи `main_text` ПОД каталогом товаров
- Выведи FAQ из `faq_json` с микроразметкой Schema.org FAQPage
- Подставь `seo_title` в <title>, `seo_description` в <meta name="description">, `h1` в <h1>

Шаг 4: После выката — в Яндекс.Вебмастере переобойти страницы вручную (это ускорит индексацию).

## Правила текстов (важно)

- Заголовки H2/H3 в MD-файлах обозначены ## и ### — при парсинге конвертируй их в теги <h2>, <h3>
- Таблицы в формате Markdown — конвертируй в HTML <table> с классом для стилей
- Списки — в <ul><li>
- Блоки FAQ в отдельной секции "## FAQ" — собирай их в JSON-массив для поля faq_json

## После внедрения

Обязательно:
1. Проверь, что все страницы валидны по HTML (validator.w3.org)
2. Проверь, что Schema.org JSON-LD валиден (validator.schema.org)
3. Отправь обновлённый sitemap.xml в Яндекс.Вебмастер и GSC
4. Запроси переобход 10 самых важных страниц в Вебмастере
