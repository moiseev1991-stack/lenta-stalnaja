try { require('dotenv').config(); } catch (e) { if (e && e.code !== 'MODULE_NOT_FOUND') throw e; }

// Resolve the deployed commit even when node is started without the
// DEPLOY_GIT_SHA env (e.g. start_node.sh on deploy, or a cron/PHP restart).
// Order: env -> live git -> .deploy_sha stamp file -> 'unknown'.
function resolveDeploySha() {
  const envSha = (process.env.DEPLOY_GIT_SHA || '').trim();
  if (envSha && envSha !== 'unknown') return envSha;
  const path = require('path');
  const repoRoot = path.join(__dirname, '..');
  try {
    const sha = require('child_process')
      .execSync('git rev-parse --short HEAD', { cwd: repoRoot, timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (sha) return sha;
  } catch (_) {}
  try {
    const sha = require('fs').readFileSync(path.join(repoRoot, '.deploy_sha'), 'utf8').trim();
    if (sha) return sha;
  } catch (_) {}
  return 'unknown';
}

module.exports = {
  port: parseInt(process.env.PORT || '8765', 10),
  socketPath: process.env.SOCKET_PATH || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  siteName:
    process.env.SITE_NAME_OVERRIDE ||
    '\u041b\u0435\u043d\u0442\u0430 \u0441\u0442\u0430\u043b\u044c\u043d\u0430\u044f \u2014 \u043a\u0430\u0442\u0430\u043b\u043e\u0433 \u043c\u0435\u0442\u0430\u043b\u043b\u043e\u043f\u0440\u043e\u043a\u0430\u0442\u0430',
  siteUrl: (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  dbPath: process.env.DB_PATH || './data/app.db',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  priceRandomMin: parseFloat(process.env.PRICE_RANDOM_MIN || '1000'),
  priceRandomMax: parseFloat(process.env.PRICE_RANDOM_MAX || '10000'),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  catalogPerPage: 24,
  mysqlHost:     process.env.MYSQL_HOST     || 'localhost',
  mysqlPort:     parseInt(process.env.MYSQL_PORT || '3306', 10),
  mysqlUser:     process.env.MYSQL_USER     || 'root',
  mysqlPassword: process.env.MYSQL_PASSWORD || '',
  mysqlDatabase: process.env.MYSQL_DATABASE || 'metal_catalog',
  deployGitSha:  resolveDeploySha(),
  deployBootAt:  process.env.DEPLOY_BOOT_AT || new Date().toISOString(),
  smtpHost:     process.env.SMTP_HOST     || '',
  smtpPort:     parseInt(process.env.SMTP_PORT || '465', 10),
  smtpSecure:   process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true,
  smtpUser:     process.env.SMTP_USER     || '',
  smtpPassword: process.env.SMTP_PASSWORD || '',
  smtpFrom:     process.env.SMTP_FROM     || process.env.SMTP_USER || '',
  leadNotifyTo: process.env.LEAD_NOTIFY_TO || '',
};
