/**
 * Удаляет число-остаток в конце названия товара.
 * Примеры:
 *   "Лента ... ГОСТ 4986-79 1 720,312" => "Лента ... ГОСТ 4986-79"
 *   "Лента ... ГОСТ 4986-79 120,000" => "Лента ... ГОСТ 4986-79"
 * Если в конце нет числа — возвращает как есть.
 */
function normalizeProductName(name) {
  if (name == null || typeof name !== 'string') return '';
  return name.replace(/\s+\d[\d\s]*([.,]\d+)?\s*$/, '').trim();
}

module.exports = { normalizeProductName };
