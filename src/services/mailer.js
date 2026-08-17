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

// Получатели: LEAD_NOTIFY_TO (через запятую) — на обе Яндекс-почты сразу.
function recipients() {
  return String(config.leadNotifyTo || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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

  await tx.sendMail({
    from: config.smtpFrom || config.smtpUser,
    to,
    replyTo: undefined,
    subject: `Заявка с сайта: ${lead.name || 'без имени'} (${lead.phone || 'без телефона'})`,
    text,
    html,
  });
  return true;
}

module.exports = { sendLeadNotification, getTransporter };
