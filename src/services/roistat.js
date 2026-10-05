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

function isEnabled() {
  return !!config.roistatWebhookUrl;
}

async function sendLead(lead) {
  if (!isEnabled()) return false;
  const body = {
    title: 'Заявка с сайта lenta-stalnaja.ru',
    name: lead.name || null,
    phone: lead.phone || null,
    comment: lead.message || null,
    roistat_visit: lead.roistat_visit || 'nocookie',
    fields: { page: lead.page || null, product_id: lead.product_id || null },
  };
  const res = await fetch(config.roistatWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error('Roistat webhook HTTP ' + res.status);
  return true;
}

module.exports = { parseVisit, isEnabled, sendLead };
