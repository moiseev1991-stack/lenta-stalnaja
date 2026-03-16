const mysql = require('mysql2/promise');
const config = require('../config');

const poolConfig = {
  user:            config.mysqlUser,
  password:        config.mysqlPassword,
  database:        config.mysqlDatabase,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit:      0,
  charset:         'utf8mb4',
  timezone:        '+00:00',
};

// Use Unix socket if MYSQL_SOCKET env var is set (avoids TCP auth issues on shared hosting)
if (process.env.MYSQL_SOCKET) {
  poolConfig.socketPath = process.env.MYSQL_SOCKET;
} else {
  poolConfig.host = config.mysqlHost;
  poolConfig.port = config.mysqlPort;
}

const pool = mysql.createPool(poolConfig);

module.exports = pool;
