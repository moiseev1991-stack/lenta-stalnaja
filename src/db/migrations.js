/**
 * Legacy entry point kept so that `npm run init-db` does not crash.
 * All schema setup is handled by mysql_migrate.js which is also called
 * automatically on every app start inside app.js.
 */
require('dotenv').config();
const { runMysqlMigrations } = require('./mysql_migrate');

runMysqlMigrations()
  .then(() => {
    console.log('Migrations OK (MySQL).');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration error:', err.message);
    process.exit(1);
  });
