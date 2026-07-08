// IndexNow — открытый протокол мгновенного оповещения поисковиков
// об изменившихся URL. Поддерживают: Яндекс, Bing, Seznam, Naver.
// Спека: https://www.indexnow.org/documentation
//
// Как это работает:
//   1. В корне сайта висит keyfile /<key>.txt с самим ключом (валидация владения).
//   2. Приложение шлёт POST на https://api.indexnow.org/indexnow со списком URL.
//   3. IndexNow-шлюз (Bing) раздаёт список всем участникам протокола, включая Яндекс.
//
// Ключ не секрет: он публично отдаётся по /<key>.txt, любой может его прочитать.
// Поэтому храним прямо в коде — это стабильная константа привязки к домену.
// Через ENV можно переопределить, но по умолчанию используется значение ниже.

const config = require('../config');

const DEFAULT_KEY = 'c64a8f458c79770ef8edc8eccbc8451d';
const KEY = String(process.env.INDEXNOW_KEY || DEFAULT_KEY).trim();
const HOST = new URL(config.siteUrl || 'https://lenta-stalnaja.ru').host;

function isEnabled() {
  // Спека: ключ = 8–128 символов, только hex / буквы / цифры / дефис.
  return /^[a-zA-Z0-9\-]{8,128}$/.test(KEY);
}

function getKey() {
  return KEY;
}

function getKeyfileText() {
  return KEY + '\n';
}

// Fire-and-forget. Не await'ится вызывающим кодом, чтобы админ-запрос
// возвращался мгновенно, даже если IndexNow медлит или лёг.
async function pingUrls(urls) {
  if (!isEnabled()) return;
  const clean = (Array.isArray(urls) ? urls : [urls])
    .map(u => String(u || '').trim())
    .filter(u => u.startsWith('http'));
  if (!clean.length) return;

  const body = {
    host: HOST,
    key: KEY,
    keyLocation: `https://${HOST}/${KEY}.txt`,
    urlList: clean.slice(0, 10000),  // спека: макс 10 000 URL за запрос
  };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      // AbortSignal.timeout — Node 20+. Для 18/19 просто не отвалится, просто нет таймаута.
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
        ? AbortSignal.timeout(5000)
        : undefined,
    });
    // 200 = accepted, 202 = accepted-and-queued, 400 = bad body, 403 = bad key.
    if (res.status >= 400) {
      console.error(`[indexnow] HTTP ${res.status} for ${clean.length} url(s)`);
    } else {
      console.log(`[indexnow] pinged ${clean.length} url(s), HTTP ${res.status}`);
    }
  } catch (e) {
    console.error('[indexnow] request failed:', e && e.message || e);
  }
}

// Wrapper, который не блокирует вызывающий код и глотает ошибки.
// Использовать из админ-контроллеров: indexnow.notify([url1, url2]).
function notify(urls) {
  pingUrls(urls).catch(() => {});
}

module.exports = {
  isEnabled,
  getKey,
  getKeyfileText,
  pingUrls,
  notify,
};
