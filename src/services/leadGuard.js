// Защита формы заявки (POST /lead) от ботов и спама. Слои, от дешёвых к дорогим:
//  1. ловушки: скрытое поле-приманка, одноразовый подписанный токен формы, минимальное время заполнения, Origin;
//  2. проверка полей: имя, телефон, длина, ссылки, управляющие символы (защита от инъекции в заголовки письма);
//  3. лимиты частоты: по IP, по телефону и общий;
//  4. Google reCAPTCHA v3 — только если в .env заданы RECAPTCHA_SITE_KEY и RECAPTCHA_SECRET_KEY.
// От SQL-инъекций защищает не этот модуль, а параметризованные запросы (`?`) в submitLead.
'use strict';

const crypto = require('crypto');
const config = require('../config');

const MIN_FILL_MS = 2000;                 // быстрее человек форму не заполнит
const TOKEN_TTL_MS = 12 * 3600 * 1000;    // токен живёт 12 часов
const HOUR = 3600 * 1000;
const LIMIT_PER_IP = 6;                   // заявок в час с одного IP
const LIMIT_PER_IP_UNKNOWN = 40;          // если IP определить нельзя (весь трафик «с одного адреса»)
const LIMIT_PER_PHONE = 3;                // заявок в час с одного телефона
const LIMIT_GLOBAL = 150;                 // общий предохранитель от почтовой бомбардировки

// Секрет подписи токена: производный от серверных секретов из .env, которых нет в репозитории.
const SECRET = crypto.createHash('sha256')
  .update(['lead-form', config.mysqlPassword, config.smtpPassword, config.sessionSecret, config.adminPassword].join('|'))
  .digest();

function sign(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex').slice(0, 32);
}

// ── Токен формы ──────────────────────────────────────────────────────────────

/** Токен для скрытого поля формы: «время.случайность.подпись». Выдаётся при показе страницы. */
function issueToken(now = Date.now()) {
  const body = now + '.' + crypto.randomBytes(9).toString('hex');
  return body + '.' + sign(body);
}

const usedNonces = new Map(); // nonce -> { phone, at }

function pruneUsed(now) {
  if (usedNonces.size < 2000) return;
  for (const [k, v] of usedNonces) if (now - v.at > TOKEN_TTL_MS) usedNonces.delete(k);
}

const digitsOf = (s) => String(s == null ? '' : s).replace(/\D/g, '');

/**
 * Проверка токена. Состояния:
 *  ok        — можно принимать заявку (токен после этого «сгорает»);
 *  missing   — поля нет (старая страница из кэша или бот, не открывавший страницу);
 *  bad       — подпись не сошлась или формат неверный;
 *  expired   — старше 12 часов;
 *  fast      — отправлено быстрее 2 секунд после показа формы (бот);
 *  duplicate — тот же токен уже использован тем же телефоном (двойной клик);
 *  replay    — токен уже использован с другим телефоном.
 */
function verifyToken(token, { phone, now = Date.now() } = {}) {
  const t = String(Array.isArray(token) ? token[0] : (token == null ? '' : token));
  if (!t) return { state: 'missing' };
  const parts = t.split('.');
  if (parts.length !== 3 || !/^\d{10,15}$/.test(parts[0]) || !/^[0-9a-f]{18}$/.test(parts[1])) return { state: 'bad' };
  const expected = sign(parts[0] + '.' + parts[1]);
  const a = Buffer.from(parts[2]); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { state: 'bad' };
  const age = now - Number(parts[0]);
  if (age > TOKEN_TTL_MS || age < -60000) return { state: 'expired' };
  const nonce = parts[1];
  const prev = usedNonces.get(nonce);
  if (prev) return { state: prev.phone && prev.phone === digitsOf(phone) ? 'duplicate' : 'replay' };
  if (age < MIN_FILL_MS) return { state: 'fast' };
  pruneUsed(now);
  usedNonces.set(nonce, { phone: digitsOf(phone), at: now });
  return { state: 'ok' };
}

// ── Origin и IP ──────────────────────────────────────────────────────────────

const stripWww = (h) => String(h || '').toLowerCase().replace(/^www\./, '');

/** Заявка должна приходить со страниц нашего сайта. Нет заголовка Origin — пропускаем (старые браузеры). */
function originOk(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin || origin === 'null') return true;
  try {
    return stripWww(new URL(origin).host) === stripWww(new URL(config.siteUrl).host);
  } catch (_) {
    return false;
  }
}

/** IP посетителя из заголовков прокси; если определить нельзя — null. */
function clientIp(req) {
  const h = req.headers || {};
  const raw = String(h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(raw) ? raw : null;
}

// ── Проверка полей ───────────────────────────────────────────────────────────

const CONTROL = /[\u0000-\u001f\u007f]/;
const URL_RE = /https?:\/\/|www\./gi;

/** Телефон: 10–15 цифр, не «0000000000» и не «1111111111». */
function normalizePhone(raw) {
  const s = String(raw || '');
  const digits = digitsOf(s);
  const letters = (s.match(/\p{L}/gu) || []).length;
  if (s.length > 40 || CONTROL.test(s) || letters > 8) return { ok: false, digits };
  if (digits.length < 10 || digits.length > 15) return { ok: false, digits };
  if (/^(\d)\1+$/.test(digits.slice(-10)) || digits.slice(-10) === '1234567890') return { ok: false, digits };
  return { ok: true, digits };
}

/** Возвращает { ok: true, phoneDigits } или { ok: false, status } (status — код сообщения для формы). */
function validateLead({ name, phone, message }) {
  const n = String(name || '');
  if (n.length < 2 || n.length > 100 || !/\p{L}/u.test(n) || /[<>]/.test(n) || CONTROL.test(n) || (n.match(URL_RE) || []).length) {
    return { ok: false, status: 'badname' };
  }
  const p = normalizePhone(phone);
  if (!p.ok) return { ok: false, status: 'badphone' };
  const m = String(message || '');
  if (m.length > 3000 || /<\s*\/?\s*(a|script|iframe|img|link|meta)\b/i.test(m) || (m.match(URL_RE) || []).length > 1) {
    return { ok: false, status: 'spam' };
  }
  return { ok: true, phoneDigits: p.digits };
}

// ── Лимиты частоты ───────────────────────────────────────────────────────────

const hits = new Map(); // ключ -> [время, ...]

function hit(key, limit, windowMs, now) {
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { hits.set(key, arr); return false; }
  arr.push(now);
  hits.set(key, arr);
  return true;
}

function pruneHits(now) {
  if (hits.size < 5000) return;
  for (const [k, arr] of hits) if (!arr.some((t) => now - t < HOUR)) hits.delete(k);
}

/** true — заявку можно принимать. Учитываются только заявки, прошедшие остальные проверки. */
function rateLimitOk({ ip, phoneDigits, now = Date.now() }) {
  pruneHits(now);
  const ipKey = ip ? 'ip:' + ip : 'ip:unknown';
  const ipLimit = ip ? LIMIT_PER_IP : LIMIT_PER_IP_UNKNOWN;
  const ok = hit(ipKey, ipLimit, HOUR, now) && hit('phone:' + phoneDigits, LIMIT_PER_PHONE, HOUR, now) && hit('global', LIMIT_GLOBAL, HOUR, now);
  return ok;
}

// ── Google reCAPTCHA v3 ──────────────────────────────────────────────────────

function captchaEnabled() {
  return !!(config.recaptchaSiteKey && config.recaptchaSecret);
}

/**
 * { ok:true, skipped:true } — капча выключена или Google недоступен (при сбое Google заявки не блокируем);
 * { ok:false } — токена нет или Google счёл посетителя ботом.
 */
async function verifyCaptcha(token, ip) {
  if (!captchaEnabled()) return { ok: true, skipped: true };
  const t = String(Array.isArray(token) ? token[0] : (token == null ? '' : token));
  if (!t) return { ok: false, reason: 'no-token' };
  try {
    const params = new URLSearchParams({ secret: config.recaptchaSecret, response: t });
    if (ip) params.set('remoteip', ip);
    const res = await fetch(config.recaptchaVerifyUrl, { method: 'POST', body: params, signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    const scoreOk = data.score == null || data.score >= config.recaptchaMinScore;
    const ok = !!data.success && scoreOk && (!data.action || data.action === 'lead');
    return { ok, score: data.score, reason: ok ? '' : ((data['error-codes'] || []).join(',') || 'low-score') };
  } catch (err) {
    console.error('recaptcha verify error:', err.message);
    return { ok: true, skipped: true, error: true };
  }
}

module.exports = {
  issueToken, verifyToken, originOk, clientIp, normalizePhone, validateLead,
  rateLimitOk, captchaEnabled, verifyCaptcha, MIN_FILL_MS,
};
