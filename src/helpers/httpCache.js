// Last-Modified / If-Modified-Since для Яндекса.
// Яндекс использует Last-Modified для инкрементального краулинга — без него
// ходит реже и жжёт crawl-budget на бесполезные повторные обходы.
//
// Использование:
//   if (setLastModified(req, res, entity.updated_at)) return; // 304 отправлен
//   res.render(...)                                           // 200 + Last-Modified

function setLastModified(req, res, date) {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return false;

  // HTTP Last-Modified — с точностью до секунды.
  const lastMod = d.toUTCString();
  res.setHeader('Last-Modified', lastMod);

  const ims = req.headers['if-modified-since'];
  if (ims) {
    const imsDate = new Date(ims);
    // Округляем нашу дату вниз до секунды (Last-Modified имеет точность 1 сек),
    // чтобы совпасть с тем, что клиент прислал в If-Modified-Since.
    if (!isNaN(imsDate.getTime()) && Math.floor(d.getTime() / 1000) <= Math.floor(imsDate.getTime() / 1000)) {
      res.status(304).end();
      return true;
    }
  }
  return false;
}

module.exports = { setLastModified };
