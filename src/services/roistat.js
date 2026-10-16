// Roistat: связка заявок с визитами (сквозная аналитика).
// Счётчик (layout.html) кладёт номер визита в cookie `roistat_visit`; мы читаем её при
// отправке заявки и (если задан ROISTAT_WEBHOOK_URL) шлём заявку в Roistat Webhook-интеграцией.
// Webhook: POST application/json, обязательно phone и/или email, roistat_visit — опционально.
// URL вебхука выдаёт кабинет Roistat (Интеграции → Добавить интеграцию → Webhook).
const config = require('../config');

// Номер визита — число/короткая строка. Cookie приходит от клиента, поэтому валидируем.
function parseVisit(raw) {
  const v = String(raw == null ? '' : raw).trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
}

// Серверный Webhook включается ТОЛЬКО явно (ROISTAT_WEBHOOK_ENABLED=1 вместе с ROISTAT_WEBHOOK_URL).
// Заявки с формы в Roistat уже собирает счётчик в браузере («Настройки → Заявки с форм сайта»); если
// включить оба канала, в CRM появятся дубли.
function isEnabled() {
  return !!config.roistatWebhookUrl && config.roistatWebhookEnabled;
}

// Тело запроса — по формату «Интеграция через Webhook» (title, name, email, phone, comment,
// roistat_visit, fields). Обязателен phone или email; остальное можно передавать null.
function buildBody(lead) {
  const files = (lead.attachments || []).map((a) => a.filename).join(', ');
  const comment = [
    lead.message || null,
    lead.page ? 'Страница: ' + lead.page : null,
    files ? 'Файлы (во вложении к письму): ' + files : null,
  ].filter(Boolean).join('\n');
  const fields = { site: 'lenta-stalnaja.ru' };
  if (lead.page) fields.page = String(lead.page);
  if (lead.product_id) fields.product_id = String(lead.product_id);
  // Текст заявки дублируем в название сделки: в CRM поле «комментарий» иногда показывается не там,
  // где его ждёт менеджер (вместо текста видно, например, «мессенджер»), а название видно всегда.
  const snippet = String(lead.message || '').replace(/\s+/g, ' ').trim();
  const title = snippet
    ? 'Заявка с сайта lenta-stalnaja.ru: ' + snippet.slice(0, 100) + (snippet.length > 100 ? '…' : '')
    : 'Заявка с сайта lenta-stalnaja.ru';
  return {
    title,
    name: lead.name || null,
    phone: lead.phone || null,
    comment: comment || null,
    // Без cookie номер визита не передаём (по документации допустим null): источник определить нельзя.
    roistat_visit: lead.roistat_visit || null,
    fields,
  };
}

async function sendLead(lead) {
  if (!isEnabled()) return false;
  const res = await fetch(config.roistatWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildBody(lead)),
    signal: AbortSignal.timeout(8000),
  });
  const answer = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
  // Ответ Roistat в лог (без ключа): по нему видно, принята ли заявка, не заходя на сервер.
  console.log('roistat webhook: HTTP', res.status, answer);
  if (!res.ok) throw new Error('Roistat webhook HTTP ' + res.status + (answer ? ' ' + answer : ''));
  return true;
}

module.exports = { parseVisit, isEnabled, sendLead, buildBody };
