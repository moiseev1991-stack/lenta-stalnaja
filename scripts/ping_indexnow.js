/**
 * Разовый пинг IndexNow по новым и обновлённым URL.
 *
 * IndexNow — оповещение поисковиков (Яндекс, Bing, Seznam, Naver) о том, что
 * страницы появились или изменились. Отправляются только URL, никакого контента.
 *
 * Запуск:
 *   node scripts/ping_indexnow.js stati      — все статьи + /stati/
 *   node scripts/ping_indexnow.js gost       — все страницы ГОСТов + /gost/
 *   node scripts/ping_indexnow.js all        — и то и другое
 *   node scripts/ping_indexnow.js https://lenta-stalnaja.ru/stati/foo/  — конкретные URL
 *
 * По умолчанию печатает список и ничего не отправляет. Для отправки добавьте --send.
 */

'use strict';

const config = require('../src/config');
const indexnow = require('../src/services/indexnow');
const { ARTICLES } = require('../src/data/articles');
const { GOSTS } = require('../src/data/gosts');

const SITE = String(config.siteUrl || 'https://lenta-stalnaja.ru').replace(/\/+$/, '');

function collect(args) {
  const urls = [];
  const wants = (name) => args.includes(name) || args.includes('all');

  if (wants('stati')) {
    urls.push(`${SITE}/stati/`);
    ARTICLES.forEach((a) => urls.push(`${SITE}/stati/${a.slug}/`));
  }
  if (wants('gost')) {
    urls.push(`${SITE}/gost/`);
    GOSTS.forEach((g) => urls.push(`${SITE}/gost/${g.slug}/`));
  }
  args.filter((a) => a.startsWith('http')).forEach((u) => urls.push(u));

  return [...new Set(urls)];
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--send');
  const send = process.argv.includes('--send');

  if (!args.length) {
    console.log('Укажите, что пинговать: stati | gost | all | <url> ... [--send]');
    process.exit(1);
  }

  const urls = collect(args);
  if (!urls.length) {
    console.log('Нечего отправлять.');
    process.exit(1);
  }

  console.log(`URL к отправке: ${urls.length}`);
  urls.forEach((u) => console.log('  ' + u));

  if (!indexnow.isEnabled()) {
    console.error('IndexNow отключён: ключ не прошёл проверку формата.');
    process.exit(1);
  }
  console.log(`keyLocation: ${SITE}/${indexnow.getKey()}.txt`);

  if (!send) {
    console.log('\nСухой прогон. Добавьте --send, чтобы отправить.');
    return;
  }

  const res = await indexnow.pingUrls(urls);
  console.log('\nОтвет IndexNow:', res === undefined ? '(без тела)' : JSON.stringify(res));
}

main().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
