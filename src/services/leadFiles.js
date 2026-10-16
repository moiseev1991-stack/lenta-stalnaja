// Хранение файлов, приложенных к заявке с формы.
// Раньше файлы жили только вложением в письмо, а письма о заявках выключены (они создавали дубли в amoCRM),
// поэтому файлы сохраняются на диск сервера вне публичных папок и отдаются по секретной ссылке
// /lead-file/<ключ>/<номер>. Ключ — случайный nonce токена формы (72 бита): угадать нельзя, а браузер
// посетителя знает его заранее, поэтому счётчик Roistat может положить ссылку в комментарий сделки.
'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

const BASE = process.env.LEAD_FILES_DIR || path.join(__dirname, '..', '..', 'storage', 'lead_files');
const KEEP_DAYS = 180;
const NONCE_RE = /^[0-9a-f]{18}$/;
let lastPrune = 0;

function dirFor(nonce) { return path.join(BASE, nonce); }

/** Раз в час удаляет папки старше KEEP_DAYS, чтобы не копились на диске хостинга. */
function prune(now = Date.now()) {
  if (now - lastPrune < 3600 * 1000) return;
  lastPrune = now;
  try {
    for (const d of fs.readdirSync(BASE)) {
      const p = path.join(BASE, d);
      if (now - fs.statSync(p).mtimeMs > KEEP_DAYS * 86400000) fs.rmSync(p, { recursive: true, force: true });
    }
  } catch (_) { /* папки ещё нет или нет прав — не страшно */ }
}

/** Сохраняет вложения заявки. Возвращает [{ n, name, size }] (n — номер файла с 1). */
function save(nonce, attachments) {
  if (!NONCE_RE.test(String(nonce || '')) || !attachments || !attachments.length) return [];
  const dir = dirFor(nonce);
  fs.mkdirSync(dir, { recursive: true });
  const items = attachments.map((a, i) => ({ n: i + 1, name: a.filename, size: a.content.length }));
  attachments.forEach((a, i) => fs.writeFileSync(path.join(dir, String(i + 1)), a.content));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(items));
  prune();
  return items;
}

/** Находит файл по ключу и номеру. Возвращает { path, name, size } или null. */
function find(nonce, n) {
  if (!NONCE_RE.test(String(nonce)) || !/^[1-9]$/.test(String(n))) return null;
  try {
    const items = JSON.parse(fs.readFileSync(path.join(dirFor(nonce), 'meta.json'), 'utf8'));
    const it = items.find((x) => x.n === Number(n));
    return it ? { path: path.join(dirFor(nonce), String(it.n)), name: it.name, size: it.size } : null;
  } catch (_) {
    return null;
  }
}

/** Полная ссылка на файл. */
function url(nonce, n) {
  return (config.siteUrl || '') + '/lead-file/' + nonce + '/' + n;
}

module.exports = { save, find, url, BASE };
