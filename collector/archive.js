// ─── Log archiver ───────────────────────────────────────────────────────────
// The logs / bandwidth_violations tables grow forever. Rather than delete old
// rows outright, we ARCHIVE each completed calendar month into one gzipped SQL
// file, verify the file is fully written, and only THEN prune those rows from
// the DB. So the live DB stays small while nothing is ever lost — an archived
// month can be reloaded any time for traceback (see restore.js, or just:
//   gunzip -c archives/logs-2026-06.sql.gz | mysql -u USER -p web_monitor).
//
// Design guarantees:
//   • Archive-first, delete-after — a crash never loses data.
//   • Atomic file writes (temp → fsync → rename) — a final file is always complete.
//   • Prune only rows we archived (id <= maxArchivedId); late-arriving rows for an
//     already-archived month land in a `.partN` file on the next run, never dropped.
//   • INSERT IGNORE + explicit ids — reloading the same file twice is harmless.
//   • Keyset pagination — bounded memory regardless of how big a month is.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');
const SqlString = require('mysql2');   // re-exports .escape() from sqlstring

// Where archive files live. Persisted via a Docker volume in production.
const ARCHIVE_DIR = process.env.ARCHIVE_DIR
  ? path.resolve(process.env.ARCHIVE_DIR)
  : path.join(__dirname, 'archives');

// Completed calendar months to keep live in the DB, on top of the current
// (partial) month. 1 ⇒ keep current + previous month, archive everything older.
const RETAIN_MONTHS = Number.isFinite(parseInt(process.env.ARCHIVE_RETAIN_MONTHS))
  ? Math.max(0, parseInt(process.env.ARCHIVE_RETAIN_MONTHS))
  : 1;

const SELECT_BATCH = 2000;   // rows pulled per keyset page (also rows per INSERT)
const DELETE_BATCH = 5000;   // rows removed per DELETE statement

// Time-series tables we archive+prune. `ts` is the DATETIME column used for
// month bucketing and pruning; `cols` is the exact column list written out.
const TABLES = [
  {
    name: 'logs',
    prefix: 'logs',
    ts: 'timestamp',
    cols: ['id', 'machine_id', 'username', 'domain', 'full_url', 'timestamp', 'violation', 'category'],
  },
  {
    name: 'bandwidth_violations',
    prefix: 'bwviol',
    ts: 'timestamp',
    cols: ['id', 'machine_id', 'username', 'bytes', 'timestamp'],
  },
];

let running = false;   // guard against overlapping runs (boot run + interval)

// ─── small utilities ────────────────────────────────────────────────────────
function ensureDir() {
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
}

// UTC month helpers — timestamps are stored as UTC, so we bucket by UTC month.
function monthStartUTC(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
function addMonthsUTC(d, n) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)); }

// ISO value → MySQL DATETIME literal 'YYYY-MM-DD HH:MM:SS' (UTC). Accepts a JS
// Date (as returned by mysql2 for DATETIME columns) or an ISO string.
function toMysqlUTC(v) {
  if (v == null) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// SQL literal for one column value. Timestamps are normalized to a UTC string;
// everything else goes through SqlString.escape (numbers stay bare, NULL stays NULL).
function sqlLiteral(val, col) {
  if (val === null || val === undefined) return 'NULL';
  if (col === 'timestamp') return SqlString.escape(toMysqlUTC(val));
  if (typeof val === 'number') return String(val);
  return SqlString.escape(val);
}

// Await backpressure so huge months don't balloon memory in the gzip buffer.
function writeChunk(stream, s) {
  return new Promise((resolve) => {
    if (stream.write(s)) resolve();
    else stream.once('drain', resolve);
  });
}

function fsyncFile(p) {
  // Open 'r+' (read/write): fsync/FlushFileBuffers needs a writable handle on
  // Windows, and the data is already flushed to the OS once the stream closed —
  // this forces it from the OS cache to disk.
  return new Promise((resolve, reject) => {
    fs.open(p, 'r+', (e, fd) => {
      if (e) return reject(e);
      fs.fsync(fd, (e2) => fs.close(fd, () => (e2 ? reject(e2) : resolve())));
    });
  });
}

// Delete any orphaned temp files from a previous crashed run.
function cleanTmp() {
  if (!fs.existsSync(ARCHIVE_DIR)) return;
  for (const f of fs.readdirSync(ARCHIVE_DIR)) {
    if (f.endsWith('.tmp')) { try { fs.unlinkSync(path.join(ARCHIVE_DIR, f)); } catch { /* ignore */ } }
  }
}

// Pick the archive path for a month. If the base file already exists (a prior
// complete run, or a crashed run whose rows weren't pruned yet), write a new
// `.partN` file instead of overwriting — so nothing already archived is lost.
function pickPartPath(prefix, monthStr) {
  const base = path.join(ARCHIVE_DIR, `${prefix}-${monthStr}.sql.gz`);
  if (!fs.existsSync(base)) return base;
  for (let n = 2; ; n++) {
    const p = path.join(ARCHIVE_DIR, `${prefix}-${monthStr}.part${n}.sql.gz`);
    if (!fs.existsSync(p)) return p;
  }
}

// ─── archive one month of one table, then prune it ──────────────────────────
async function archiveMonth(pool, table, monthStr, rangeStart, rangeEnd) {
  ensureDir();
  const filePath = pickPartPath(table.prefix, monthStr);
  const tmpPath  = filePath + '.tmp';

  const gzip = zlib.createGzip();
  const out  = fs.createWriteStream(tmpPath);
  const closed = new Promise((resolve, reject) => {
    out.on('finish', resolve);
    out.on('error', reject);
    gzip.on('error', reject);
  });
  gzip.pipe(out);

  const colList = table.cols.join(', ');
  await writeChunk(gzip,
    `-- web-monitor archive\n` +
    `-- table:     ${table.name}\n` +
    `-- month:     ${monthStr} (UTC)\n` +
    `-- generated: ${new Date().toISOString()}\n` +
    `-- reload:    gunzip -c <this-file> | mysql <db>   (or: node restore.js <this-file>)\n` +
    `SET NAMES utf8mb4;\n`);

  // Keyset pagination on the PK — bounded memory, one INSERT statement per page,
  // each on a single line so restore.js can split safely on newlines.
  let lastId = 0, total = 0, maxId = 0;
  for (;;) {
    const [rows] = await pool.query(
      `SELECT ${colList} FROM ${table.name}
       WHERE ${table.ts} >= ? AND ${table.ts} < ? AND id > ?
       ORDER BY id LIMIT ${SELECT_BATCH}`,
      [rangeStart, rangeEnd, lastId]
    );
    if (!rows.length) break;
    const values = rows
      .map((r) => '(' + table.cols.map((c) => sqlLiteral(r[c], c)).join(',') + ')')
      .join(',');
    await writeChunk(gzip, `INSERT IGNORE INTO ${table.name} (${colList}) VALUES ${values};\n`);
    lastId = rows[rows.length - 1].id;
    maxId  = lastId;
    total += rows.length;
  }

  gzip.end();
  await closed;

  if (total === 0) { try { fs.unlinkSync(tmpPath); } catch { /* ignore */ } return { total: 0, deleted: 0, file: null }; }

  // Fsync + atomic rename: from here the final file is guaranteed complete.
  await fsyncFile(tmpPath);
  fs.renameSync(tmpPath, filePath);

  // Only now prune — and only rows we actually archived (id <= maxId). Any row
  // that arrived after we started (higher id) is left for the next run.
  let deleted = 0;
  for (;;) {
    const [res] = await pool.query(
      `DELETE FROM ${table.name}
       WHERE ${table.ts} >= ? AND ${table.ts} < ? AND id <= ?
       LIMIT ${DELETE_BATCH}`,
      [rangeStart, rangeEnd, maxId]
    );
    deleted += res.affectedRows;
    if (res.affectedRows < DELETE_BATCH) break;
  }

  return { total, deleted, file: path.basename(filePath) };
}

// ─── main entry — archive every eligible month of every table ───────────────
async function runArchive(pool) {
  if (running) { console.log('[ARCHIVE] Previous run still in progress — skipping.'); return; }
  running = true;
  const started = Date.now();
  try {
    ensureDir();
    cleanTmp();

    const cutoff = toMysqlUTC(addMonthsUTC(monthStartUTC(new Date()), -RETAIN_MONTHS));
    console.log(`[ARCHIVE] Archiving rows older than ${cutoff} UTC ` +
                `(keeping current month + ${RETAIN_MONTHS} completed month(s)). Dir: ${ARCHIVE_DIR}`);

    for (const table of TABLES) {
      let months;
      try {
        [months] = await pool.query(
          `SELECT DATE_FORMAT(${table.ts}, '%Y-%m-01') AS ms
           FROM ${table.name}
           WHERE ${table.ts} < ?
           GROUP BY ms ORDER BY ms`,
          [cutoff]
        );
      } catch (e) {
        console.error(`[ARCHIVE] ${table.name}: month scan failed:`, e.message);
        continue;
      }
      if (!months.length) { console.log(`[ARCHIVE] ${table.name}: nothing to archive.`); continue; }

      for (const row of months) {
        const monthStart = row.ms;                 // 'YYYY-MM-01'
        const monthStr   = monthStart.slice(0, 7); // 'YYYY-MM'
        const rangeStart = `${monthStart} 00:00:00`;
        const rangeEnd   = toMysqlUTC(addMonthsUTC(new Date(`${monthStart}T00:00:00Z`), 1));
        try {
          const r = await archiveMonth(pool, table, monthStr, rangeStart, rangeEnd);
          if (r.total) {
            console.log(`[ARCHIVE] ${table.name} ${monthStr}: archived ${r.total} row(s), ` +
                        `pruned ${r.deleted} → ${r.file}`);
          }
        } catch (e) {
          // Leave the month's rows in place; the next run retries safely.
          console.error(`[ARCHIVE] ${table.name} ${monthStr}: failed (rows kept in DB):`, e.message);
        }
      }
    }
    console.log(`[ARCHIVE] Run complete in ${Math.round((Date.now() - started) / 1000)}s.`);
  } finally {
    running = false;
  }
}

// List archive files on disk (newest first) for the admin/list endpoint.
function listArchives() {
  ensureDir();
  return fs.readdirSync(ARCHIVE_DIR)
    .filter((f) => f.endsWith('.sql.gz'))
    .map((f) => {
      const st = fs.statSync(path.join(ARCHIVE_DIR, f));
      return { file: f, bytes: st.size, modified: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.file < b.file ? 1 : -1));
}

module.exports = { runArchive, listArchives, ARCHIVE_DIR, RETAIN_MONTHS };
