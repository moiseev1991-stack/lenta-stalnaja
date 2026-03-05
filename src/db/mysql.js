const mysql = require('mysql2/promise');
const config = require('../config');

const pool = mysql.createPool({
  host:            config.mysqlHost,
  port:            config.mysqlPort,
  user:            config.mysqlUser,
  password:        config.mysqlPassword,
  database:        config.mysqlDatabase,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit:      0,
  charset:         'utf8mb4',
  timezone:        '+00:00',
});

module.exports = pool;
