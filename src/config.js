try { require('dotenv').config(); } catch (e) { if (e && e.code !== 'MODULE_NOT_FOUND') throw e; }

module.exports = {
  port: parseInt(process.env.PORT || '8765', 10),
  socketPath: process.env.SOCKET_PATH || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  siteName: process.env.SITE_NAME_OVERRIDE || 'Лента стальная — каталог металлопроката',
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
};
