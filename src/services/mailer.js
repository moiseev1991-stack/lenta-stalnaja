// Отправка e-mail через SMTP (nodemailer). Используется для уведомлений о заявках.
// Настройки берутся из .env: SMTP_HOST/PORT/SECURE/USER/PASSWORD/FROM, LEAD_NOTIFY_TO.
// Если SMTP не сконфигурирован — функции тихо пропускают отправку (заявка всё равно в БД).
const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.smtpHost || !config.smtpUser || !config.smtpPassword) return null;
  transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPassword },
    // Короткие таймауты: при недоступном SMTP ошибка видна сразу, а не через 2 минуты.
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  return transporter;
}

// Публичный ящик сайта (тот, что в шапке) получает копию каждой заявки независимо от .env.
const ALWAYS_NOTIFY = ['info@lenta-stalnaja.ru'];

// Получатели: LEAD_NOTIFY_TO (через запятую) + ящик сайта, без дублей.
function recipients() {
  const list = String(config.leadNotifyTo || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const addr of ALWAYS_NOTIFY) {
    if (!list.some((s) => s.toLowerCase() === addr)) list.push(addr);
  }
  return list;
}

// Адрес сайта для темы письма: хост из SITE_URL (lenta-stalnaja.ru).
function siteHost() {
  try {
    return new URL(config.siteUrl).host || 'lenta-stalnaja.ru';
  } catch (_) {
    return 'lenta-stalnaja.ru';
  }
}

async function sendLeadNotification(lead) {
  const tx = getTransporter();
  const to = recipients();
  if (!tx || !to.length) return false;

  const site = config.siteUrl || '';
  const rows = [
    ['Имя', lead.name],
    ['Телефон', lead.phone],
    ['Сообщение', lead.message || '—'],
    ['Товар (ID)', lead.product_id || '—'],
    ['Файлы', (lead.attachments || []).map((a) => a.filename).join(', ') || '—'],
    ['Страница', lead.page || '—'],
    ['Визит Roistat', lead.roistat_visit || '—'],
  ];
  // Только текстовая часть: в старой веб-почте SpaceWeb HTML-версия отображалась мусорным вложением
  // «untitled-[1.2].html». Все поля заявки в тексте есть.
  const text =
    `Новая заявка с формы сайта ${siteHost()}\n\n` +
    rows.map(([k, v]) => `${k}: ${v == null ? '' : v}`).join('\n') +
    (site ? `\n\n${site}` : '');

  const info = await tx.sendMail({
    from: config.smtpFrom || config.smtpUser,
    to,
    replyTo: undefined,
    subject: `Заявка с формы сайта ${siteHost()}: ${lead.name || 'без имени'} (${lead.phone || 'без телефона'})`,
    text,
    attachments: (lead.attachments || []).map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
  });
  // Результат в лог: иначе по серверу не видно, принял ли SMTP получателей.
  console.log('lead mail sent:', info.messageId, 'accepted:', (info.accepted || []).join(','), 'rejected:', (info.rejected || []).join(','));
  if (info.rejected && info.rejected.length) {
    throw new Error('SMTP отклонил получателей: ' + info.rejected.join(', '));
  }
  return true;
}

module.exports = { sendLeadNotification, getTransporter };
