// ─── Archive restore ────────────────────────────────────────────────────────
// Reload a gzipped SQL archive produced by archive.js back into the database,
// e.g. to trace back activity from a month that's been pruned from the live DB.
//
//   node restore.js archives/logs-2026-06.sql.gz
//   node restore.js archives/bwviol-2026-06.sql.gz
//
// The archive uses INSERT IGNORE with explicit ids, so restoring is idempotent —
// rerunning it (or restoring overlapping `.partN` files) will not create
// duplicates or error on rows that are already present. DB connection settings
// are read from collector/.env (the same DB_* vars the collector uses).

require('dotenv').config();
const fs       = require('fs');
const zlib     = require('zlib');
const readline = require('readline');
const mysql    = require('mysql2/promise');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node restore.js <archive.sql.gz>');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }

  const pool = mysql.createPool({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'web_monitor',
    charset:  'utf8mb4_unicode_ci',
    timezone: 'Z',
    connectionLimit: 2,
    multipleStatements: false,
  });

  console.log(`[RESTORE] Loading ${file} into ${process.env.DB_NAME || 'web_monitor'} …`);

  // Each archive line is a complete, self-contained SQL statement (comments
  // start with `--`). String values are escaped, so no raw newlines appear
  // inside a statement — line-by-line splitting is safe and streams the file.
  const rl = readline.createInterface({
    input: fs.createReadStream(file).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });

  let statements = 0, insertedRows = 0;
  try {
    for await (const raw of rl) {
      const line = raw.trim();
      if (!line || line.startsWith('--')) continue;
      const [res] = await pool.query(line);
      statements++;
      if (typeof res.affectedRows === 'number') insertedRows += res.affectedRows;
    }
    console.log(`[RESTORE] Done. Executed ${statements} statement(s); ${insertedRows} row(s) inserted.`);
  } catch (e) {
    console.error('[RESTORE] Failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
