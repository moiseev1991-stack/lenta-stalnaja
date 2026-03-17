#!/usr/bin/env node
/**
 * Один раз запустить на сервере (через Crontab или вручную):
 *   cd /путь/к/проекту  &&  node deploy-now.js
 * Потом открыть в браузере /admin/restart чтобы перезапустить приложение.
 * После этого на странице «Восстановление базы» появится блок «Деплой с GitHub».
 */
const { execSync } = require('child_process');
try {
  const out = execSync('git pull origin main', { encoding: 'utf8', timeout: 60000 });
  console.log(out || 'OK');
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
