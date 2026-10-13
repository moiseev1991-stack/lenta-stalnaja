// Приём вложений из форм заявки (POST /lead, multipart/form-data).
// Файлы держим в памяти и сразу прикладываем к письму: на диск и в публичные папки не пишем.
// Обычные urlencoded-формы (без файлов) multer пропускает как есть.
const multer = require('multer');

const MAX_FILES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ на файл: 3 файла в письме укладываются в лимит почты (~25 МБ)

// Разрешены документы, таблицы, изображения, чертежи и архивы. Исполняемые файлы и скрипты не пропускаем.
const ALLOWED_EXT = new Set([
  '.pdf', '.doc', '.docx', '.rtf', '.odt', '.txt',
  '.xls', '.xlsx', '.csv', '.ods',
  '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png',
  '.dwg', '.dxf',
  '.zip', '.rar', '.7z',
]);

function extOf(name) {
  const m = /\.[^.\\/]+$/.exec(String(name || '').toLowerCase());
  return m ? m[0] : '';
}

// multer отдаёт имя файла в latin1: возвращаем нормальную кириллицу и убираем опасные символы.
function cleanFileName(raw) {
  let name = String(raw || '');
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (!decoded.includes('�')) name = decoded;
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return name.slice(0, 120) || 'file';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES, fields: 20, fieldSize: 20000 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_EXT.has(extOf(file.originalname))) return cb(null, true);
    const err = new Error('Недопустимый тип файла');
    err.code = 'BAD_TYPE';
    cb(err);
  },
}).array('files', MAX_FILES);

// Ошибки загрузки не роняют запрос: submitLead вернёт посетителя на форму с понятным сообщением.
function leadUpload(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    const map = {
      LIMIT_FILE_SIZE: 'toobig',
      LIMIT_FILE_COUNT: 'toomany',
      LIMIT_UNEXPECTED_FILE: 'toomany',
      BAD_TYPE: 'badtype',
    };
    req.leadUploadError = map[err.code] || 'filesError';
    req.body = req.body || {};
    next();
  });
}

module.exports = { leadUpload, cleanFileName, MAX_FILES, MAX_FILE_SIZE };
