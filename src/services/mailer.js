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
  });
  return transporter;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    ['Страница', lead.page || '—'],
    ['Визит Roistat', lead.roistat_visit || '—'],
  ];
  const html =
    '<h2>Новая заявка с сайта</h2>' +
    '<table cellpadding="6" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
    rows.map(([k, v]) =>
      `<tr><td style="border:1px solid #ddd;background:#f7f7f7"><b>${esc(k)}</b></td>` +
      `<td style="border:1px solid #ddd">${esc(v)}</td></tr>`).join('') +
    '</table>' +
    (site ? `<p style="color:#888;font-size:12px">${esc(site)}</p>` : '');
  const text = rows.map(([k, v]) => `${k}: ${v == null ? '' : v}`).join('\n');

  const info = await tx.sendMail({
    from: config.smtpFrom || config.smtpUser,
    to,
    replyTo: undefined,
    subject: `Заявка с сайта: ${lead.name || 'без имени'} (${lead.phone || 'без телефона'})`,
    text,
    html,
  });
  // Результат в лог: иначе по серверу не видно, принял ли SMTP получателей.
  console.log('lead mail sent:', info.messageId, 'accepted:', (info.accepted || []).join(','), 'rejected:', (info.rejected || []).join(','));
  return true;
}

module.exports = { sendLeadNotification, getTransporter };
