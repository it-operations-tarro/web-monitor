require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

// ─── Floor Map DB (MariaDB) connection pool ────────────────────────────────
let floorMapDb = null;

async function getFloorMapDb() {
  if (floorMapDb) return floorMapDb;
  try {
    floorMapDb = await mysql.createPool({
      host:     process.env.FLOOR_MAP_DB_HOST || 'localhost',
      port:     parseInt(process.env.FLOOR_MAP_DB_PORT) || 3306,
      user:     process.env.FLOOR_MAP_DB_USER || 'root',
      password: process.env.FLOOR_MAP_DB_PASS || '',
      database: process.env.FLOOR_MAP_DB_NAME || 'floor_map_db_staging',
      waitForConnections: true,
      connectionLimit: 5,
    });
    console.log('[FloorMapDB] Connected to MariaDB employee directory.');
  } catch (e) {
    console.warn('[FloorMapDB] Could not connect:', e.message);
    floorMapDb = null;
  }
  return floorMapDb;
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET is not set in your .env file.');
  console.warn('   Anyone with access to the source code can forge portal login tokens.');
  console.warn('   Add JWT_SECRET=<long-random-string> to collector/.env and restart.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 4448;

// Slack incoming-webhook for violation notifications.
// The channel is determined by the webhook itself (set in Slack when you create it).
// Leave unset to disable notifications.
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

// Separate incoming-webhook for "request block" notifications, so block requests
// land in their own channel. Falls back to SLACK_WEBHOOK_URL when unset.
const SLACK_BLOCK_WEBHOOK_URL = process.env.SLACK_BLOCK_WEBHOOK_URL || SLACK_WEBHOOK_URL;

// Post a message to the configured Slack incoming-webhook.
// Resolves on success, rejects on a bad config or non-2xx response so callers
// that need delivery confirmation (e.g. the block-request button) can report it.
function postSlackMessage(text, webhookUrl = SLACK_WEBHOOK_URL) {
  return new Promise((resolve, reject) => {
    if (!webhookUrl) return reject(new Error('Slack webhook URL not configured'));

    let url;
    try { url = new URL(webhookUrl); }
    catch (e) { return reject(new Error('Invalid Slack webhook URL')); }

    const body = JSON.stringify({ text });
    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`Slack returned ${res.statusCode}: ${data}`));
        else resolve();
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sendSlackViolationNotification({ username, machine_id, domain, full_url, category, timestamp }) {
  if (!SLACK_WEBHOOK_URL) return;

  const text = `:warning: *Violation detected*\n` +
    `*Agent:* ${username || '(unknown)'}\n` +
    `*Machine:* ${machine_id}\n` +
    `*Site:* ${domain}\n` +
    `*URL:* ${full_url ? `<${full_url}|${full_url}>` : domain}\n` +
    `*Category:* ${category || 'unknown'}\n` +
    `*Time:* ${timestamp}`;

  // Fire-and-forget; failures are only logged.
  postSlackMessage(text).catch((e) => console.warn('[Slack] Webhook error:', e.message));
}

// ─── Jira Service Management (block-request tickets) ───────────────────────
// The "Request block" button on the Top Offending Domains table raises a Jira
// Service Management request instead of pinging Slack. When that ticket is
// resolved in Jira, a background poller drops the domain from the table.
const JIRA_BASE_URL        = (process.env.JIRA_BASE_URL || '').replace(/\/$/, '');
const JIRA_EMAIL           = process.env.JIRA_EMAIL || '';
const JIRA_API_TOKEN       = process.env.JIRA_API_TOKEN || '';
const JIRA_SERVICE_DESK_ID = process.env.JIRA_SERVICE_DESK_ID || '';   // WIT = 2
const JIRA_REQUEST_TYPE_ID = process.env.JIRA_REQUEST_TYPE_ID || '';   // "Software Installation, Configuration, and Updates" = 271
const JIRA_POLL_MS         = Number(process.env.JIRA_POLL_MS) || 300000;
// Required fields on the WIT request type. Impact/Urgency are options; Location
// and Site are JSM Assets (CMDB) objects referenced by object id.
const JIRA_IMPACT_ID          = process.env.JIRA_IMPACT_ID || '';          // 10002 = Standard
const JIRA_URGENCY_ID         = process.env.JIRA_URGENCY_ID || '';         // 10115 = Standard
const JIRA_WORKSPACE_ID       = process.env.JIRA_WORKSPACE_ID || '';       // Assets workspace id
const JIRA_LOCATION_OBJECT_ID = process.env.JIRA_LOCATION_OBJECT_ID || ''; // e.g. 132529 (PH)
const JIRA_SITE_OBJECT_ID     = process.env.JIRA_SITE_OBJECT_ID || '';     // e.g. 143901 (DGT)

const jiraConfigured = !!(JIRA_BASE_URL && JIRA_EMAIL && JIRA_API_TOKEN &&
                          JIRA_SERVICE_DESK_ID && JIRA_REQUEST_TYPE_ID);

// Minimal HTTPS JSON call to Jira Cloud with Basic auth (email:api-token).
// Resolves with the parsed response body, rejects on a bad config or non-2xx.
function jiraRequest(method, apiPath, bodyObj) {
  return new Promise((resolve, reject) => {
    if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
      return reject(new Error('Jira is not configured'));
    }
    let url;
    try { url = new URL(JIRA_BASE_URL + apiPath); }
    catch (e) { return reject(new Error('Invalid Jira URL')); }

    const body = bodyObj ? JSON.stringify(bodyObj) : null;
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}`, Accept: 'application/json' };
    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request({
      method,
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`Jira ${res.statusCode}: ${data}`));
        try { resolve(data ? JSON.parse(data) : {}); }
        catch (e) { reject(new Error('Bad JSON from Jira')); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Raise a JSM request asking IT to add a domain to the Chrome Enterprise
// blocklist. Returns Jira's create response ({ issueKey, _links: { web }, … }).
function createJiraBlockIssue({ domain, category, count, requestedBy }) {
  const fields = {
    summary: `Block domain in Chrome Enterprise Policy: ${domain}`,
    description:
      `Please add the following site to the Chrome Enterprise blocklist (URLBlocklist).\n\n` +
      `Domain: ${domain}\n` +
      (category ? `Category: ${category}\n` : '') +
      (count != null ? `Recent hits: ${count}\n` : '') +
      (requestedBy ? `Requested by: ${requestedBy}\n` : '') +
      `Raised automatically by web-monitor.`,
  };
  if (JIRA_IMPACT_ID)  fields.customfield_10004 = { id: JIRA_IMPACT_ID };
  if (JIRA_URGENCY_ID) fields.customfield_10123 = { id: JIRA_URGENCY_ID };
  if (JIRA_WORKSPACE_ID && JIRA_LOCATION_OBJECT_ID) {
    fields.customfield_10307 = [{ workspaceId: JIRA_WORKSPACE_ID, id: `${JIRA_WORKSPACE_ID}:${JIRA_LOCATION_OBJECT_ID}`, objectId: JIRA_LOCATION_OBJECT_ID }];
  }
  if (JIRA_WORKSPACE_ID && JIRA_SITE_OBJECT_ID) {
    fields.customfield_10308 = [{ workspaceId: JIRA_WORKSPACE_ID, id: `${JIRA_WORKSPACE_ID}:${JIRA_SITE_OBJECT_ID}`, objectId: JIRA_SITE_OBJECT_ID }];
  }
  return jiraRequest('POST', '/rest/servicedeskapi/request', {
    serviceDeskId: JIRA_SERVICE_DESK_ID,
    requestTypeId: JIRA_REQUEST_TYPE_ID,
    requestFieldValues: fields,
  });
}

// Create the Jira ticket AND record the pending block_request row. Shared by
// the admin dashboard (/api/enforcement/request-block) and the team portal
// (/api/portal/request-block). Returns { jiraKey, jiraUrl }.
async function raiseBlockRequest({ target, domain, category, count, requestedBy }) {
  const issue = await createJiraBlockIssue({ domain: target, category, count, requestedBy });
  const jiraKey = issue.issueKey || null;
  const jiraUrl = (issue._links && issue._links.web) ||
                  (jiraKey ? `${JIRA_BASE_URL}/browse/${jiraKey}` : null);
  const now = toMysqlDateTime(new Date().toISOString());
  await dbRun(`
    INSERT INTO block_requests (url, domain, category, status, requested_at, requested_by, resolved_at, jira_key)
    VALUES (?, ?, ?, 'pending', ?, ?, NULL, ?)
    ON DUPLICATE KEY UPDATE
      domain       = VALUES(domain),
      category     = VALUES(category),
      status       = 'pending',
      requested_at = VALUES(requested_at),
      requested_by = VALUES(requested_by),
      resolved_at  = NULL,
      jira_key     = VALUES(jira_key)
  `, [target, domain || null, category || null, now, requestedBy || null, jiraKey]);
  return { jiraKey, jiraUrl };
}

// Given a list of issue keys we created, return only those already resolved
// (statusCategory = Done). One JQL search scoped to our own keys — never scans
// the whole Jira — so polling stays cheap regardless of site size.
async function findResolvedJiraKeys(keys) {
  if (!keys.length) return [];
  const jql = `key in (${keys.join(',')}) AND statusCategory = Done`;
  const apiPath = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=status&maxResults=100`;
  const data = await jiraRequest('GET', apiPath);
  return (data.issues || []).map((i) => i.key);
}

// Poll the tickets we're still waiting on; flip resolved ones to 'done' so the
// top-domains endpoint drops them. Only touches system-created, still-pending
// tickets, and makes zero Jira calls when nothing is pending.
async function pollJiraResolutions() {
  try {
    const rows = await dbAll(
      `SELECT url, jira_key FROM block_requests WHERE status = 'pending' AND jira_key IS NOT NULL`);
    if (!rows.length) return;
    const urlByKey = new Map(rows.map((r) => [r.jira_key, r.url]));
    const resolved = await findResolvedJiraKeys([...urlByKey.keys()]);
    for (const key of resolved) {
      const url = urlByKey.get(key);
      if (!url) continue;
      await dbRun(`UPDATE block_requests SET status = 'done', resolved_at = ? WHERE url = ?`,
        [toMysqlDateTime(new Date().toISOString()), url]);
      console.log(`[jira-poll] ${key} resolved → dropped ${url} from Top Offending Domains`);
    }
  } catch (e) {
    console.warn('[jira-poll]', e.message);
  }
}

// Middleware
app.use(cors());
app.use(express.json());

// Self-hosted extension distribution.
// Serves the update manifest Chrome polls and the packed .crx.
// Chrome REQUIRES HTTPS for these URLs in ExtensionInstallForcelist —
// terminate TLS at a reverse proxy or run this server behind one.
const updatesDir = path.join(__dirname, 'updates');
if (!fs.existsSync(updatesDir)) fs.mkdirSync(updatesDir, { recursive: true });
app.use('/updates', express.static(updatesDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.crx')) {
      res.setHeader('Content-Type', 'application/x-chrome-extension');
    } else if (filePath.endsWith('.xml')) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    }
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  }
}));

// ─── Main application DB (MySQL/MariaDB) ────────────────────────────────────
// Connection pool for the web-monitor data (logs, machines, portal users, …).
// Configure via DB_* in collector/.env; manage it through phpMyAdmin.
const pool = mysql.createPool({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'web_monitor',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_unicode_ci',
  // Stored timestamps are UTC; interpret returned DATETIMEs as UTC so they
  // serialize back to the same instant (…T…Z) the dashboard expects.
  timezone: 'Z',
});

// Normalize an ISO-8601 timestamp (…T…Z, with milliseconds) to a MySQL DATETIME
// literal 'YYYY-MM-DD HH:MM:SS' in UTC. MySQL's DATETIME rejects the "T"/"Z" and
// fractional seconds the Chrome extension sends, so every write goes through here.
function toMysqlDateTime(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// Create tables if they don't exist yet — idempotent, mirrors schema/mysql_schema.sql.
// Lets the collector provision a fresh MySQL database on first boot.
async function initSchema() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS logs (
      id          BIGINT AUTO_INCREMENT PRIMARY KEY,
      machine_id  VARCHAR(255),
      username    VARCHAR(255),
      domain      VARCHAR(255),
      full_url    TEXT,
      timestamp   DATETIME,
      violation   TINYINT(1) DEFAULT 0,
      category    VARCHAR(255),
      INDEX idx_logs_machine   (machine_id),
      INDEX idx_logs_username  (username),
      INDEX idx_logs_timestamp (timestamp),
      INDEX idx_logs_domain    (domain),
      INDEX idx_logs_violation (violation)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS machines (
      machine_id        VARCHAR(255) PRIMARY KEY,
      username          VARCHAR(255),
      last_seen         DATETIME,
      ip_address        VARCHAR(64),
      current_bandwidth BIGINT DEFAULT 0,
      total_bandwidth   BIGINT DEFAULT 0,
      extension_version VARCHAR(64),
      INDEX idx_machines_last_seen (last_seen)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS bandwidth_violations (
      id         BIGINT AUTO_INCREMENT PRIMARY KEY,
      machine_id VARCHAR(255),
      username   VARCHAR(255),
      bytes      BIGINT,
      timestamp  DATETIME,
      INDEX idx_bw_machine   (machine_id),
      INDEX idx_bw_timestamp (timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS portal_users (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      name                 VARCHAR(255) NOT NULL,
      username             VARCHAR(255) NOT NULL UNIQUE,
      email                VARCHAR(255),
      password_hash        VARCHAR(255) NOT NULL,
      role                 VARCHAR(32)  NOT NULL,
      must_change_password TINYINT(1)   NOT NULL DEFAULT 1,
      created_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_portal_role CHECK (role IN ('team_lead','manager','director'))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS agent_assignments (
      user_id     INT          NOT NULL,
      agent_email VARCHAR(255) NOT NULL,
      PRIMARY KEY (user_id, agent_email),
      FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    `CREATE TABLE IF NOT EXISTS user_assignments (
      parent_id INT NOT NULL,
      child_id  INT NOT NULL,
      PRIMARY KEY (parent_id, child_id),
      FOREIGN KEY (parent_id) REFERENCES portal_users(id) ON DELETE CASCADE,
      FOREIGN KEY (child_id)  REFERENCES portal_users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Block-request workflow for the Top Offending Domains table.
    // Keyed by the offending host. status:
    // 'pending' (Jira ticket raised, awaiting blocklist) | 'done' (ticket resolved → hidden from the list)
    // jira_key is the Service Management issue key (e.g. WIT-123) the poller watches.
    `CREATE TABLE IF NOT EXISTS block_requests (
      url          VARCHAR(512) PRIMARY KEY,
      domain       VARCHAR(255),
      category     VARCHAR(255),
      status       VARCHAR(16) NOT NULL DEFAULT 'pending',
      requested_at DATETIME,
      requested_by VARCHAR(255),
      resolved_at  DATETIME,
      jira_key     VARCHAR(32)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
  for (const sql of statements) await pool.query(sql);

  // Older databases already have block_requests without jira_key — add it.
  const [jiraKeyCol] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'block_requests' AND COLUMN_NAME = 'jira_key'`);
  if (!jiraKeyCol.length) {
    await pool.query(`ALTER TABLE block_requests ADD COLUMN jira_key VARCHAR(32)`);
    console.log('[DB] Added block_requests.jira_key column.');
  }

  console.log('Connected to the MySQL database.');
}

initSchema().catch((e) => console.error('[DB] Schema init failed:', e.message));

// Watch open block-request tickets; resolved ones drop off Top Offending Domains.
if (jiraConfigured) {
  setInterval(pollJiraResolutions, JIRA_POLL_MS);
  console.log(`[jira-poll] Watching block-request tickets every ${Math.round(JIRA_POLL_MS / 1000)}s.`);
} else {
  console.warn('[Jira] Not fully configured — "Request block" will return 503 until JIRA_* env vars are set.');
}

/**
 * Endpoint to receive logs from workstations
 */
app.post('/logs', async (req, res) => {
  const { machine_id, username, domain, full_url, timestamp, violation } = req.body;
  const ip = req.ip;
  const ts = toMysqlDateTime(timestamp);

  if (!machine_id || !domain) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Lookup category if it's a violation
  let category = null;
  if (violation) {
    try {
      const configPath = path.join(__dirname, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const normalizedUrl = (full_url || '').toLowerCase().replace(/^https?:\/\//, '').split('?')[0].split('#')[0].replace(/\/$/, '');
      category = config.category_map?.[domain] || config.category_map?.[normalizedUrl] || 'manual';
    } catch (e) {
      category = 'manual';
    }
  }

  try {
    // Update machine status
    await dbRun(`
      INSERT INTO machines (machine_id, username, last_seen, ip_address)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        username   = VALUES(username),
        last_seen  = VALUES(last_seen),
        ip_address = VALUES(ip_address)
    `, [machine_id, username, ts, ip]);

    await dbRun(`
      INSERT INTO logs (machine_id, username, domain, full_url, timestamp, violation, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [machine_id, username, domain, full_url, ts, violation ? 1 : 0, category]);

    console.log(`[LOG] Recieved from ${machine_id}: ${domain} [Violation: ${violation ? 'YES' : 'NO'}]`);
    if (violation) {
      sendSlackViolationNotification({ username, machine_id, domain, full_url, category, timestamp });
    }
    res.status(201).json({ status: 'success' });
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: 'Failed to save log' });
  }
});

/**
 * Endpoint for heartbeat/ping
 */
app.post('/ping', async (req, res) => {
  const { machine_id, username, timestamp, bandwidth, extension_version } = req.body;
  const ip = req.ip;
  const currentBandwidth = bandwidth || 0;
  const extVersion = extension_version || null;
  const ts = toMysqlDateTime(timestamp);

  if (!machine_id) return res.status(400).send();

  try {
    await dbRun(`
      INSERT INTO machines (machine_id, username, last_seen, ip_address, current_bandwidth, total_bandwidth, extension_version)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        username          = VALUES(username),
        last_seen         = VALUES(last_seen),
        ip_address        = VALUES(ip_address),
        current_bandwidth = VALUES(current_bandwidth),
        total_bandwidth   = total_bandwidth + VALUES(current_bandwidth),
        extension_version = COALESCE(VALUES(extension_version), extension_version)
    `, [machine_id, username, ts, ip, currentBandwidth, currentBandwidth, extVersion]);

    // Log violation history if threshold exceeded (10MB/min)
    if (currentBandwidth > 10 * 1024 * 1024) {
      await dbRun(`
        INSERT INTO bandwidth_violations (machine_id, username, bytes, timestamp)
        VALUES (?, ?, ?, ?)
      `, [machine_id, username, currentBandwidth, ts]);
    }

    res.status(200).json({ status: 'pong' });
  } catch (err) {
    res.status(500).send();
  }
});

/**
 * Endpoint to fetch all machines
 */
app.get('/api/machines', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM machines ORDER BY last_seen DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch machines' });
  }
});

/**
 * Endpoint to delete a machine
 */
app.delete('/api/machines/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM machines WHERE machine_id = ?', [req.params.id]);
    res.json({ status: 'deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete machine' });
  }
});

/**
 * Endpoint for the Enforcement tab — policy summary + top offenders.
 * Returns a compact view of config.json (the full file is multi-MB) joined
 * with violation aggregates from the logs table.
 */
app.get('/api/enforcement', async (req, res) => {
  const configPath = path.join(__dirname, 'config.json');

  let config;
  let lastSyncedAt = null;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    lastSyncedAt = fs.statSync(configPath).mtime.toISOString();
  } catch (e) {
    return res.status(500).json({ error: 'Failed to read enforcement config' });
  }

  const categoryMap = config.category_map || {};
  const blacklist = config.blacklist || [];

  // Count domains per category from category_map
  const categoryCounts = {};
  for (const domain in categoryMap) {
    const cat = categoryMap[domain];
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  const summary = {
    lastSyncedAt,
    totalBlockedDomains: blacklist.length,
    enabledCategories: config.categories || [],
    categoryCounts,
    manualBlacklist: config.manual_blacklist || []
  };

  try {
    summary.topOffendingDomains = await dbAll(`
      SELECT domain, category, COUNT(*) as count
      FROM logs
      WHERE violation = 1
      GROUP BY domain, category
      ORDER BY count DESC
      LIMIT 10
    `);

    summary.topOffendingUsers = await dbAll(`
      SELECT username, MAX(machine_id) as machine_id, COUNT(*) as count
      FROM logs
      WHERE violation = 1 AND username IS NOT NULL
      GROUP BY username
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load enforcement summary' });
  }
});

/**
 * Top offending hosts for a date range — backs the date filter on the
 * Enforcement tab's "Top Offending Domains" table. Defaults to the last 7 days
 * when from/to are omitted.
 *
 * Offenders are aggregated by host (one row per domain). Blocking is done at the
 * host level. Aggregation is done in JS so it stays dialect-independent for the
 * MySQL move.
 *
 * `from`/`to` are ISO timestamps; logs.timestamp is stored as UTC ISO, so the
 * parameterized string comparison is also chronological.
 */
app.get('/api/enforcement/top-domains', async (req, res) => {
  const nowIso = new Date().toISOString();
  const defaultFromIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const from = req.query.from || defaultFromIso;
  const to   = req.query.to   || nowIso;

  try {
    const rows = await dbAll(`
      SELECT domain, category
      FROM logs
      WHERE violation = 1 AND timestamp >= ? AND timestamp <= ?
    `, [toMysqlDateTime(from), toMysqlDateTime(to)]);

    // Aggregate violation counts per host.
    const hosts = new Map();
    for (const r of rows || []) {
      const host = (r.domain || '').toLowerCase();
      if (!host) continue;
      let h = hosts.get(host);
      if (!h) { h = { domain: host, category: r.category, count: 0 }; hosts.set(host, h); }
      h.count++;
      if (!h.category && r.category) h.category = r.category;
    }

    // Attach block status + Jira ticket, drop anything resolved ('done'), take top 10.
    const brRows = await dbAll('SELECT url, status, jira_key FROM block_requests');
    const brByHost = new Map((brRows || []).map(b => [b.url, b]));
    const list = Array.from(hosts.values())
      .map(h => {
        const br = brByHost.get(h.domain);
        return {
          ...h,
          block_status: br ? br.status : null,
          jira_key: br ? br.jira_key : null,
          jira_url: br && br.jira_key ? `${JIRA_BASE_URL}/browse/${br.jira_key}` : null,
        };
      })
      .filter(x => x.block_status !== 'done')
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    res.json({ from, to, topOffendingDomains: list });
  } catch (err) {
    console.error('[top-domains] DB error:', err.message);
    res.status(500).json({ error: 'Failed to load top offending domains' });
  }
});

/**
 * Raise a Jira Service Management ticket asking IT to block a domain in the
 * Chrome Enterprise Policy. Backs the "Create Jira ticket" button on the Top
 * Offending Domains table. This does NOT change any policy itself — it files a
 * request; the domain drops off the table once that ticket is resolved in Jira
 * (detected by the background poller).
 */
app.post('/api/enforcement/request-block', async (req, res) => {
  const { url, domain, category, count, requestedBy } = req.body || {};
  const target = domain || url;   // block at the host level
  if (!target) return res.status(400).json({ error: 'Missing domain' });
  if (!jiraConfigured) {
    return res.status(503).json({ error: 'Jira is not configured on the collector.' });
  }

  try {
    const { jiraKey, jiraUrl } = await raiseBlockRequest({ target, domain, category, count, requestedBy });
    res.json({ status: 'pending', jira_key: jiraKey, jira_url: jiraUrl });
  } catch (e) {
    console.error('[request-block] failed:', e.message);
    return res.status(502).json({ error: 'Failed to create Jira ticket.' });
  }
});

/**
 * Mark a URL as blocked ("done blocking") — it's now in the Chrome Enterprise
 * Policy, so drop it from the Top Offending Domains list.
 */
app.post('/api/enforcement/mark-blocked', async (req, res) => {
  const { url, domain, category } = req.body || {};
  const target = domain || url;   // host-level key, matches request-block
  if (!target) return res.status(400).json({ error: 'Missing domain' });

  const now = toMysqlDateTime(new Date().toISOString());
  try {
    await dbRun(`
      INSERT INTO block_requests (url, domain, category, status, requested_at, requested_by, resolved_at)
      VALUES (?, ?, ?, 'done', NULL, NULL, ?)
      ON DUPLICATE KEY UPDATE
        domain      = VALUES(domain),
        status      = 'done',
        resolved_at = VALUES(resolved_at)
    `, [target, domain || null, category || null, now]);
    res.json({ status: 'done' });
  } catch (err) {
    console.error('[mark-blocked] DB error:', err.message);
    res.status(500).json({ error: 'Failed to update block status.' });
  }
});

// ─── Enforcement config mutation helpers ───────────────────────────────────
function readConfig() {
  const configPath = path.join(__dirname, 'config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}
function writeConfig(config) {
  const configPath = path.join(__dirname, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Get domains for a specific category — supports pagination and search
app.get('/api/enforcement/domains', (req, res) => {
  const { category, search = '', limit = '100', offset = '0' } = req.query;
  if (!category) return res.status(400).json({ error: 'Missing category query param' });
  try {
    const config = readConfig();
    const categoryMap = config.category_map || {};

    const normalized = search.trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    let all = Object.keys(categoryMap).filter(d => categoryMap[d] === category);

    if (normalized) all = all.filter(d => d.includes(normalized));
    all.sort();

    const total = all.length;
    const lim   = Math.min(Math.max(parseInt(limit)  || 100, 1), 500);
    const off   = Math.max(parseInt(offset) || 0, 0);

    res.json({ domains: all.slice(off, off + lim), total });
  } catch (e) {
    res.status(500).json({ error: 'Failed to read config' });
  }
});

// Add one or more domains to a category
app.post('/api/enforcement/domains', (req, res) => {
  const { domains, category } = req.body;
  if (!domains || !category) return res.status(400).json({ error: 'Missing domains or category' });
  const list = (Array.isArray(domains) ? domains : [domains])
    .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').split('?')[0].split('#')[0].replace(/\/$/, ''))
    .filter(Boolean);
  try {
    const config = readConfig();
    config.category_map     = config.category_map     || {};
    config.blacklist        = config.blacklist         || [];
    config.manual_blacklist = config.manual_blacklist  || [];
    config.user_category_map = config.user_category_map || {};

    const duplicates = list.filter(d => config.category_map[d] === category);
    const added      = list.filter(d => config.category_map[d] !== category);

    // Detect pre-existing bare-host blocks that a new path-specific entry should
    // supersede. A bare host (e.g. "example.com") blocks the whole domain via
    // exactSet, which would override a path-specific entry ("example.com/foo").
    // We compute this BEFORE adding so a host added as bare in the same batch
    // is respected (not auto-removed).
    const hasBareEntry = (host) =>
      config.blacklist.includes(host) ||
      config.manual_blacklist.includes(host) ||
      Object.prototype.hasOwnProperty.call(config.category_map, host) ||
      Object.prototype.hasOwnProperty.call(config.user_category_map, host);

    const superseded = [];
    for (const entry of list) {
      if (entry.includes('/')) {
        const host = entry.split('/')[0];
        if (host && hasBareEntry(host) && !list.includes(host) && !superseded.includes(host)) {
          superseded.push(host);
        }
      }
    }

    for (const domain of list) {
      config.category_map[domain]      = category;
      config.user_category_map[domain] = category;
      if (!config.blacklist.includes(domain)) config.blacklist.push(domain);
      if (!config.manual_blacklist.includes(domain)) config.manual_blacklist.push(domain);
    }

    // Remove the superseded bare-host blocks from all four lists so only the
    // path-specific entry remains in effect.
    for (const host of superseded) {
      config.blacklist        = config.blacklist.filter(d => d !== host);
      config.manual_blacklist = config.manual_blacklist.filter(d => d !== host);
      delete config.category_map[host];
      delete config.user_category_map[host];
    }

    writeConfig(config);
    res.json({ status: 'ok', added: added.length, duplicates, superseded });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Remove a domain (or path-specific entry) from the blacklist entirely.
// Uses a query param so keys containing "/" aren't mangled by path routing/proxies.
app.delete('/api/enforcement/domains', (req, res) => {
  const domain = (req.query.domain || '').toString();
  if (!domain) return res.status(400).json({ error: 'Missing domain query param' });
  try {
    const config = readConfig();
    config.blacklist = (config.blacklist || []).filter(d => d !== domain);
    config.manual_blacklist = (config.manual_blacklist || []).filter(d => d !== domain);
    delete (config.category_map || {})[domain];
    delete (config.user_category_map || {})[domain];
    writeConfig(config);
    res.json({ status: 'removed' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Legacy path-param variant (kept for backwards compat)
app.delete('/api/enforcement/domains/:domain', (req, res) => {
  const domain = decodeURIComponent(req.params.domain);
  try {
    const config = readConfig();
    config.blacklist = (config.blacklist || []).filter(d => d !== domain);
    config.manual_blacklist = (config.manual_blacklist || []).filter(d => d !== domain);
    delete (config.category_map || {})[domain];
    delete (config.user_category_map || {})[domain];
    writeConfig(config);
    res.json({ status: 'removed' });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Add a new custom category (enables it immediately)
app.post('/api/enforcement/categories', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  const slug = name.trim().toLowerCase().replace(/\s+/g, '_');
  try {
    const config = readConfig();
    config.categories = config.categories || [];
    if (!config.categories.includes(slug)) config.categories.push(slug);
    writeConfig(config);
    res.json({ status: 'added', slug });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Toggle a category on or off
app.patch('/api/enforcement/categories/:name/toggle', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const config = readConfig();
    config.categories = config.categories || [];
    const idx = config.categories.indexOf(name);
    if (idx === -1) config.categories.push(name);
    else config.categories.splice(idx, 1);
    writeConfig(config);
    res.json({ status: 'ok', enabled: config.categories.includes(name) });
  } catch (e) {
    res.status(500).json({ error: 'Failed to toggle category' });
  }
});

// Delete a custom category and all its domain mappings
app.delete('/api/enforcement/categories/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  try {
    const config = readConfig();
    config.categories = (config.categories || []).filter(c => c !== name);
    const map = config.category_map || {};
    const toRemove = Object.keys(map).filter(d => map[d] === name);
    toRemove.forEach(d => {
      delete map[d];
      config.blacklist = (config.blacklist || []).filter(b => b !== d);
    });
    config.category_map = map;
    writeConfig(config);
    res.json({ status: 'deleted', domainsRemoved: toRemove.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

/**
 * Endpoint to serve global extension config
 */
app.get('/api/config', (req, res) => {
  const configPath = path.join(__dirname, 'config.json');
  fs.readFile(configPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read config' });
    }
    res.json(JSON.parse(data));
  });
});

/**
 * Endpoint for Dashboard to fetch data
 */
app.get('/api/logs', async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  try {
    const rows = await dbAll('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?', [limit]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * Endpoint to fetch bandwidth violation history
 */
app.get('/api/bandwidth-violations', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  try {
    const rows = await dbAll('SELECT * FROM bandwidth_violations ORDER BY timestamp DESC LIMIT ?', [limit]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bandwidth violations' });
  }
});

/**
 * Endpoint for dashboard summary stats
 */
app.get('/api/stats', async (req, res) => {
  const stats = {};
  try {
    stats.totalLogs       = (await dbGet('SELECT COUNT(*) as count FROM logs'))?.count || 0;
    stats.totalViolations = (await dbGet('SELECT COUNT(*) as count FROM logs WHERE violation = 1'))?.count || 0;
    stats.uniqueMachines  = (await dbGet('SELECT COUNT(DISTINCT machine_id) as count FROM logs'))?.count || 0;
    stats.topDomains      = await dbAll(`
      SELECT domain, COUNT(*) as count
      FROM logs
      GROUP BY domain
      ORDER BY count DESC
      LIMIT 5
    `);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── DB promise helpers (MySQL) ─────────────────────────────────────────────
// dbRun exposes lastID/changes to mirror the previous sqlite3 helper contract.
async function dbRun(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return { lastID: result.insertId, changes: result.affectedRows };
}
async function dbGet(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows[0];
}
async function dbAll(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows || [];
}

// ─── Auth middleware ───────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.portalUser = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Portal auth ───────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const user = await dbGet('SELECT * FROM portal_users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const mustChange = !!user.must_change_password;
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role, mustChangePassword: mustChange },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role, mustChangePassword: mustChange } });
  } catch (e) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// ─── Portal: change own password (requires auth) ──────────────────────────
app.post('/api/portal/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
  try {
    const user = await dbGet('SELECT * FROM portal_users WHERE id = ?', [req.portalUser.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Skip current password check only when must_change_password is set (first login / forced reset)
    if (!user.must_change_password) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password is required' });
      const ok = await bcrypt.compare(currentPassword, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await dbRun('UPDATE portal_users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, user.id]);

    // Issue a fresh token with mustChangePassword cleared
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role, mustChangePassword: false },
      JWT_SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, username: user.username, role: user.role, mustChangePassword: false } });
  } catch {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ─── Admin: reset a user's password ───────────────────────────────────────
app.post('/api/users/:id/reset-password', async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const result = await dbRun(
      'UPDATE portal_users SET password_hash = ?, must_change_password = 1 WHERE id = ?',
      [hash, req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ status: 'reset', mustChangePassword: true });
  } catch {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─── Portal user management (admin-side, no auth guard — admin UI is internal) ──
app.get('/api/users', async (req, res) => {
  try {
    const users = await dbAll(`
      SELECT id, name, username, email, role, created_at FROM portal_users
      ORDER BY CASE role WHEN 'director' THEN 1 WHEN 'manager' THEN 2 WHEN 'team_lead' THEN 3 ELSE 4 END,
               created_at DESC
    `);
    // Attach assignment counts
    for (const u of users) {
      if (u.role === 'team_lead') {
        const r = await dbGet('SELECT COUNT(*) as cnt FROM agent_assignments WHERE user_id = ?', [u.id]);
        u.assignedCount = r?.cnt || 0;
      } else {
        const r = await dbGet('SELECT COUNT(*) as cnt FROM user_assignments WHERE parent_id = ?', [u.id]);
        u.assignedCount = r?.cnt || 0;
      }
    }
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/users', async (req, res) => {
  const { name, username, email, password, role } = req.body;
  if (!name || !username || !password || !role) return res.status(400).json({ error: 'Missing fields' });
  if (!['team_lead', 'manager', 'director'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await dbRun(
      'INSERT INTO portal_users (name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [name, username, email || null, hash, role]
    );
    res.status(201).json({ id: result.lastID, name, username, email, role });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM portal_users WHERE id = ?', [req.params.id]);
    res.json({ status: 'deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Assign/unassign agents to a team_lead by email
app.get('/api/users/:id/agents', async (req, res) => {
  try {
    const rows = await dbAll('SELECT agent_email FROM agent_assignments WHERE user_id = ?', [req.params.id]);
    res.json(rows.map(r => r.agent_email));
  } catch {
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

app.post('/api/users/:id/agents', async (req, res) => {
  const { agent_email } = req.body;
  if (!agent_email) return res.status(400).json({ error: 'Missing agent_email' });
  try {
    await dbRun('INSERT IGNORE INTO agent_assignments (user_id, agent_email) VALUES (?, ?)', [req.params.id, agent_email.trim().toLowerCase()]);
    res.status(201).json({ status: 'assigned' });
  } catch {
    res.status(500).json({ error: 'Failed to assign agent' });
  }
});

// Bulk assign — accepts array of emails
app.post('/api/users/:id/agents/bulk', async (req, res) => {
  const { emails } = req.body;
  if (!Array.isArray(emails) || !emails.length) return res.status(400).json({ error: 'Missing emails array' });
  try {
    for (const email of emails) {
      await dbRun('INSERT IGNORE INTO agent_assignments (user_id, agent_email) VALUES (?, ?)', [req.params.id, email.trim().toLowerCase()]);
    }
    res.status(201).json({ status: 'assigned', count: emails.length });
  } catch {
    res.status(500).json({ error: 'Failed to bulk assign agents' });
  }
});

app.delete('/api/users/:id/agents/:email', async (req, res) => {
  try {
    await dbRun('DELETE FROM agent_assignments WHERE user_id = ? AND agent_email = ?', [req.params.id, decodeURIComponent(req.params.email)]);
    res.json({ status: 'unassigned' });
  } catch {
    res.status(500).json({ error: 'Failed to unassign agent' });
  }
});

// Agents with no Team Lead assignment
app.get('/api/users/unassigned-agents', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT m.machine_id, m.username, m.last_seen, m.ip_address, m.current_bandwidth
      FROM machines m
      WHERE m.username IS NOT NULL
        AND m.username != ''
        AND LOWER(m.username) NOT IN (SELECT LOWER(agent_email) FROM agent_assignments)
      ORDER BY m.last_seen DESC
    `);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch unassigned agents' });
  }
});

// Import direct reports from the org directory for a Team Lead
// Looks up the TL's work email in floor_map_db employees, finds their Full-Time reports
app.get('/api/users/:id/org-reports', async (req, res) => {
  try {
    // 1. Get the Team Lead's email from portal_users
    const tlUser = await dbGet('SELECT username, email, role FROM portal_users WHERE id = ?', [req.params.id]);
    if (!tlUser) return res.status(404).json({ error: 'User not found' });
    if (tlUser.role !== 'team_lead') return res.status(400).json({ error: 'Only Team Leads can import org reports' });

    const tlEmail = (tlUser.email || tlUser.username || '').toLowerCase().trim();
    if (!tlEmail) return res.status(400).json({ error: 'Team Lead has no email set' });

    // 2. Connect to MariaDB
    const db = await getFloorMapDb();
    if (!db) return res.status(503).json({ error: 'Cannot connect to employee directory. Check FLOOR_MAP_DB_* settings in .env' });

    // 3. Find TL's full display name from the org DB by matching their work email
    //    Data lives in jira_schema8_objects.attributes (JSON), not employees table
    const [tlRows] = await db.query(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."First Name"')) AS first_name,
              JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Last Name"'))  AS last_name
       FROM jira_schema8_objects
       WHERE LOWER(JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Work Email"'))) = ?
       LIMIT 1`,
      [tlEmail]
    );

    if (!tlRows.length) {
      return res.status(404).json({
        error: `No employee record found for email "${tlEmail}" in the org directory. Make sure the Team Lead's email matches their work email in the employee database.`
      });
    }

    const tlFirstName = tlRows[0].first_name || '';
    const tlLastName  = tlRows[0].last_name  || '';
    const tlFullName  = `${tlFirstName} ${tlLastName}`.trim();

    if (!tlFullName) return res.status(404).json({ error: 'Could not determine Team Lead full name from org directory' });

    // 4. Find all Full-Time employees reporting to this Team Lead
    const [empRows] = await db.query(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Work Email"'))  AS work_email,
              JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."First Name"'))  AS first_name,
              JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Last Name"'))   AS last_name,
              JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Job Title"'))   AS job_title,
              JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Department"'))  AS department
       FROM jira_schema8_objects
       WHERE JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Reporting to"'))     = ?
         AND JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Employment Status"')) = 'Full-Time'
         AND JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Work Email"')) IS NOT NULL
         AND JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Work Email"')) != 'null'
         AND JSON_UNQUOTE(JSON_EXTRACT(attributes, '$."Work Email"')) != ''
       ORDER BY last_name, first_name`,
      [tlFullName]
    );

    // Dedupe by work email — directory can hold multiple rows per person
    // (e.g. rehires). Keep the first occurrence.
    const seen = new Set();
    const employees = empRows
      .map(r => ({
        work_email:  (r.work_email || '').toLowerCase().trim(),
        first_name:  r.first_name  || '',
        last_name:   r.last_name   || '',
        job_title:   r.job_title   || '',
        department:  r.department  || '',
      }))
      .filter(r => {
        if (!r.work_email || seen.has(r.work_email)) return false;
        seen.add(r.work_email);
        return true;
      });

    res.json({ tlEmail, tlFullName, employees });
  } catch (e) {
    console.error('[OrgImport]', e.message);
    res.status(500).json({ error: `Org directory query failed: ${e.message}` });
  }
});

// Assign/unassign direct reports (TL→manager, manager→director)
app.post('/api/users/:id/reports', async (req, res) => {
  const { child_id } = req.body;
  if (!child_id) return res.status(400).json({ error: 'Missing child_id' });
  try {
    await dbRun('INSERT IGNORE INTO user_assignments (parent_id, child_id) VALUES (?, ?)', [req.params.id, child_id]);
    res.status(201).json({ status: 'assigned' });
  } catch {
    res.status(500).json({ error: 'Failed to assign report' });
  }
});

app.delete('/api/users/:id/reports/:childId', async (req, res) => {
  try {
    await dbRun('DELETE FROM user_assignments WHERE parent_id = ? AND child_id = ?', [req.params.id, req.params.childId]);
    res.json({ status: 'unassigned' });
  } catch {
    res.status(500).json({ error: 'Failed to unassign report' });
  }
});

app.get('/api/users/:id/reports', async (req, res) => {
  try {
    const rows = await dbAll(`
      SELECT pu.id, pu.name, pu.username, pu.role
      FROM user_assignments ua
      JOIN portal_users pu ON pu.id = ua.child_id
      WHERE ua.parent_id = ?
    `, [req.params.id]);
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ─── Portal dashboard (role-scoped data) ──────────────────────────────────

// Resolves assigned agent emails → machine_ids via the machines table
async function emailsToMachineIds(emails) {
  if (!emails.length) return [];
  const rows = await dbAll(
    `SELECT machine_id FROM machines WHERE username IN (${emails.map(() => '?').join(',')})`,
    emails
  );
  return [...new Set(rows.map(r => r.machine_id))];
}

async function getMachineIdsForUser(userId, role) {
  if (role === 'team_lead') {
    const rows = await dbAll('SELECT agent_email FROM agent_assignments WHERE user_id = ?', [userId]);
    return emailsToMachineIds(rows.map(r => r.agent_email));
  }

  if (role === 'manager') {
    const tls = await dbAll('SELECT child_id FROM user_assignments WHERE parent_id = ?', [userId]);
    if (!tls.length) return [];
    const tlIds = tls.map(t => t.child_id);
    const agents = await dbAll(
      `SELECT agent_email FROM agent_assignments WHERE user_id IN (${tlIds.map(() => '?').join(',')})`,
      tlIds
    );
    return emailsToMachineIds([...new Set(agents.map(a => a.agent_email))]);
  }

  if (role === 'director') {
    const managers = await dbAll('SELECT child_id FROM user_assignments WHERE parent_id = ?', [userId]);
    if (!managers.length) return [];
    const managerIds = managers.map(m => m.child_id);
    const tls = await dbAll(
      `SELECT child_id FROM user_assignments WHERE parent_id IN (${managerIds.map(() => '?').join(',')})`,
      managerIds
    );
    if (!tls.length) return [];
    const tlIds = tls.map(t => t.child_id);
    const agents = await dbAll(
      `SELECT agent_email FROM agent_assignments WHERE user_id IN (${tlIds.map(() => '?').join(',')})`,
      tlIds
    );
    return emailsToMachineIds([...new Set(agents.map(a => a.agent_email))]);
  }

  return [];
}

app.get('/api/portal/dashboard', requireAuth, async (req, res) => {
  const { id, role, name, username } = req.portalUser;
  try {
    const machineIds = await getMachineIdsForUser(id, role);

    let violations = [], recentLogs = [], topDomains = [], bwViolations = [], teamMembers = [];

    if (machineIds.length > 0) {
      const placeholders = machineIds.map(() => '?').join(',');

      violations = await dbAll(
        `SELECT * FROM logs WHERE violation = 1 AND machine_id IN (${placeholders}) ORDER BY timestamp DESC LIMIT 20`,
        machineIds
      );

      recentLogs = await dbAll(
        `SELECT * FROM logs WHERE machine_id IN (${placeholders}) ORDER BY timestamp DESC LIMIT 50`,
        machineIds
      );

      topDomains = await dbAll(
        `SELECT domain, COUNT(*) as count FROM logs WHERE machine_id IN (${placeholders}) GROUP BY domain ORDER BY count DESC LIMIT 5`,
        machineIds
      );

      bwViolations = await dbAll(
        `SELECT * FROM bandwidth_violations WHERE machine_id IN (${placeholders}) ORDER BY timestamp DESC LIMIT 10`,
        machineIds
      );
    }

    // Fetch direct reports for managers/directors
    if (role === 'manager' || role === 'director') {
      teamMembers = await dbAll(`
        SELECT pu.id, pu.name, pu.username, pu.role
        FROM user_assignments ua JOIN portal_users pu ON pu.id = ua.child_id
        WHERE ua.parent_id = ?
      `, [id]);
    }

    // Full machine records for assigned agents (online/offline status)
    let assignedAgents = [];
    if (machineIds.length > 0) {
      const placeholders = machineIds.map(() => '?').join(',');
      assignedAgents = await dbAll(
        `SELECT machine_id, username, last_seen, ip_address, current_bandwidth FROM machines WHERE machine_id IN (${placeholders}) ORDER BY last_seen DESC`,
        machineIds
      );
    }

    // Build team leads list and attach team_lead_id to each agent (for manager/director filtering)
    let teamLeads = [];
    if (role === 'manager') {
      teamLeads = teamMembers; // for managers, direct reports are the team leads
    } else if (role === 'director' && teamMembers.length > 0) {
      const mgrIds = teamMembers.map(m => m.id);
      teamLeads = await dbAll(
        `SELECT DISTINCT pu.id, pu.name, pu.username, pu.role
         FROM user_assignments ua JOIN portal_users pu ON pu.id = ua.child_id
         WHERE ua.parent_id IN (${mgrIds.map(() => '?').join(',')})`,
        mgrIds
      );
    }

    if (teamLeads.length > 0 && assignedAgents.length > 0) {
      const tlIds = teamLeads.map(tl => tl.id);
      const tlAssignments = await dbAll(
        `SELECT user_id AS team_lead_id, agent_email FROM agent_assignments WHERE user_id IN (${tlIds.map(() => '?').join(',')})`,
        tlIds
      );
      const emailToTL = {};
      tlAssignments.forEach(r => { emailToTL[r.agent_email] = r.team_lead_id; });
      assignedAgents = assignedAgents.map(a => ({ ...a, team_lead_id: emailToTL[a.username] ?? null }));
    }

    res.json({
      user: { id, name, username, role },
      machineIds,
      assignedAgents,
      violations,
      recentLogs,
      topDomains,
      bwViolations,
      teamMembers,
      teamLeads,
    });
  } catch (e) {
    console.error('[PORTAL]', e);
    res.status(500).json({ error: 'Failed to fetch portal data' });
  }
});

/**
 * Team-scoped Top Offending Domains for the portal. Same shape as
 * /api/enforcement/top-domains (domain, category, count, block_status, jira_*)
 * but limited to the caller's assigned agents. from/to are optional ISO
 * timestamps; defaults to the last 7 days.
 */
app.get('/api/portal/top-domains', requireAuth, async (req, res) => {
  const { id, role } = req.portalUser;
  const nowIso = new Date().toISOString();
  const defaultFromIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const from = req.query.from || defaultFromIso;
  const to   = req.query.to   || nowIso;

  try {
    const machineIds = await getMachineIdsForUser(id, role);
    if (!machineIds.length) return res.json({ from, to, topOffendingDomains: [] });

    const placeholders = machineIds.map(() => '?').join(',');
    const rows = await dbAll(
      `SELECT domain, category FROM logs
       WHERE violation = 1 AND machine_id IN (${placeholders})
         AND timestamp >= ? AND timestamp <= ?`,
      [...machineIds, toMysqlDateTime(from), toMysqlDateTime(to)]
    );

    // Aggregate violation counts per host.
    const hosts = new Map();
    for (const r of rows || []) {
      const host = (r.domain || '').toLowerCase();
      if (!host) continue;
      let h = hosts.get(host);
      if (!h) { h = { domain: host, category: r.category, count: 0 }; hosts.set(host, h); }
      h.count++;
      if (!h.category && r.category) h.category = r.category;
    }

    // Attach block status + Jira ticket, drop resolved ('done'), take top 10.
    const brRows = await dbAll('SELECT url, status, jira_key FROM block_requests');
    const brByHost = new Map((brRows || []).map(b => [b.url, b]));
    const list = Array.from(hosts.values())
      .map(h => {
        const br = brByHost.get(h.domain);
        return {
          ...h,
          block_status: br ? br.status : null,
          jira_key: br ? br.jira_key : null,
          jira_url: br && br.jira_key ? `${JIRA_BASE_URL}/browse/${br.jira_key}` : null,
        };
      })
      .filter(x => x.block_status !== 'done')
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    res.json({ from, to, topOffendingDomains: list });
  } catch (e) {
    console.error('[portal/top-domains]', e.message);
    res.status(500).json({ error: 'Failed to load top offending domains' });
  }
});

/**
 * Portal block request — raises the same Jira ticket as the admin dashboard,
 * but restricted to Managers and Directors (Team Leads see the table read-only).
 */
app.post('/api/portal/request-block', requireAuth, async (req, res) => {
  const { role, name, username } = req.portalUser;
  if (role !== 'manager' && role !== 'director') {
    return res.status(403).json({ error: 'Only managers and directors can request blocks.' });
  }
  const { url, domain, category, count } = req.body || {};
  const target = domain || url;
  if (!target) return res.status(400).json({ error: 'Missing domain' });
  if (!jiraConfigured) {
    return res.status(503).json({ error: 'Jira is not configured on the collector.' });
  }
  try {
    const requestedBy = `${name} (${username}, ${role})`;
    const { jiraKey, jiraUrl } = await raiseBlockRequest({ target, domain, category, count, requestedBy });
    res.json({ status: 'pending', jira_key: jiraKey, jira_url: jiraUrl });
  } catch (e) {
    console.error('[portal/request-block]', e.message);
    res.status(502).json({ error: 'Failed to create Jira ticket.' });
  }
});

// ─── Team Lead lookup (for Fleet filter dropdown) ────────────────────────────

// GET /api/team-leads — all team leads with their assigned agent emails
app.get('/api/team-leads', async (req, res) => {
  try {
    const teamLeads = await dbAll(
      `SELECT id, name, username, role FROM portal_users WHERE role = 'team_lead' ORDER BY name`
    );
    const result = await Promise.all(
      teamLeads.map(async (tl) => {
        const agents = await dbAll(
          'SELECT agent_email FROM agent_assignments WHERE user_id = ?',
          [tl.id]
        );
        return { ...tl, agents: agents.map((a) => a.agent_email) };
      })
    );
    res.json(result);
  } catch (e) {
    console.error('[TEAM LEADS]', e);
    res.status(500).json({ error: 'Failed to fetch team leads' });
  }
});

// ─── Agent Search / Drilldown endpoints ──────────────────────────────────────

// GET /api/agents — all known agents with aggregated stats
app.get('/api/agents', async (req, res) => {
  try {
    // Non-aggregated machine columns are wrapped in MAX() to satisfy MySQL's
    // ONLY_FULL_GROUP_BY (a username maps to a single machine in practice).
    const agents = await dbAll(`
      SELECT
        l.username,
        MAX(m.machine_id)                                     AS machine_id,
        MAX(m.last_seen)                                      AS last_seen,
        MAX(m.ip_address)                                     AS ip_address,
        MAX(m.current_bandwidth)                              AS current_bandwidth,
        MAX(m.total_bandwidth)                                AS total_bandwidth,
        COUNT(l.id)                                           AS total_sessions,
        SUM(CASE WHEN l.violation = 1 THEN 1 ELSE 0 END)      AS total_violations
      FROM logs l
      LEFT JOIN machines m ON l.username = m.username
      WHERE l.username IS NOT NULL AND l.username != ''
      GROUP BY l.username
      ORDER BY total_sessions DESC
    `);
    res.json(agents);
  } catch (e) {
    console.error('[AGENTS]', e);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// GET /api/agents/:email/stats — detailed analytics for a single agent
app.get('/api/agents/:email/stats', async (req, res) => {
  const email = decodeURIComponent(req.params.email);
  try {
    const [overview, topDomains, categoryBreakdown, machine, bwHistory] = await Promise.all([
      dbGet(`
        SELECT
          COUNT(*)                                              AS total_sessions,
          SUM(CASE WHEN violation = 1 THEN 1 ELSE 0 END)       AS total_violations,
          MIN(timestamp)                                        AS first_seen,
          MAX(timestamp)                                        AS last_activity
        FROM logs WHERE username = ?
      `, [email]),
      dbAll(`
        SELECT domain, COUNT(*) AS count,
               MAX(violation)   AS is_violation,
               MAX(category)    AS category
        FROM logs WHERE username = ?
        GROUP BY domain ORDER BY count DESC LIMIT 10
      `, [email]),
      dbAll(`
        SELECT category, COUNT(*) AS count
        FROM logs
        WHERE username = ? AND violation = 1
          AND category IS NOT NULL AND category != ''
        GROUP BY category ORDER BY count DESC
      `, [email]),
      dbGet('SELECT * FROM machines WHERE username = ?', [email]),
      dbAll(`
        SELECT * FROM bandwidth_violations
        WHERE username = ? ORDER BY timestamp DESC LIMIT 10
      `, [email]),
    ]);
    res.json({ overview, topDomains, categoryBreakdown, machine, bwHistory });
  } catch (e) {
    console.error('[AGENT STATS]', e);
    res.status(500).json({ error: 'Failed to fetch agent stats' });
  }
});

// GET /api/agents/:email/logs — paginated browsing history for a single agent
// Query params:
//   filter  = 'violations'        → only flagged entries
//   date    = 'YYYY-MM-DD'        → restrict to a specific calendar date (default: today)
//   limit   = number (max 200)
//   offset  = number
app.get('/api/agents/:email/logs', async (req, res) => {
  const email  = decodeURIComponent(req.params.email);
  const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const filter = req.query.filter; // 'violations' | undefined
  // EST helper — shift UTC epoch by −5 h, then take the YYYY-MM-DD slice
  const estToday = () => new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Default to the agent's most recent log date in EST (not today, which may have no data)
  let date = req.query.date;
  if (!date) {
    const last = await dbGet(
      "SELECT DATE_FORMAT(timestamp - INTERVAL 5 HOUR, '%Y-%m-%d') as d FROM logs WHERE username = ? ORDER BY timestamp DESC LIMIT 1",
      [email]
    );
    date = last?.d || estToday();
  }
  try {
    // Shift UTC by −5h before DATE() so the day boundary is midnight EST, not UTC
    let sql = "SELECT * FROM logs WHERE username = ? AND DATE(timestamp - INTERVAL 5 HOUR) = ?";
    const params = [email, date];
    if (filter === 'violations') sql += ' AND violation = 1';
    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const logs = await dbAll(sql, params);
    res.json(logs);
  } catch (e) {
    console.error('[AGENT LOGS]', e);
    res.status(500).json({ error: 'Failed to fetch agent logs' });
  }
});

/**
 * All violation logs for a specific domain (no date restriction)
 */
app.get('/api/logs/domain/:domain', async (req, res) => {
  const domain = decodeURIComponent(req.params.domain);
  const limit  = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const rows = await dbAll(
      'SELECT * FROM logs WHERE domain = ? AND violation = 1 ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      [domain, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch domain logs' });
  }
});

/**
 * All violations for an agent across all dates (no date restriction)
 */
app.get('/api/agents/:email/violations', async (req, res) => {
  const email  = decodeURIComponent(req.params.email);
  const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const rows = await dbAll(
      'SELECT * FROM logs WHERE username = ? AND violation = 1 ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      [email, limit, offset]
    );
    res.json(rows);
  } catch (e) {
    console.error('[AGENT VIOLATIONS]', e);
    res.status(500).json({ error: 'Failed to fetch agent violations' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Collector API running on http://0.0.0.0:${PORT}`);
  console.log(`📂 Database: MySQL ${process.env.DB_NAME || 'web_monitor'}@${process.env.DB_HOST || 'localhost'}:${parseInt(process.env.DB_PORT) || 3306}`);

  // Initial sync and schedule daily sync (every 24 hours)
  syncBlacklists();
  setInterval(syncBlacklists, 24 * 60 * 60 * 1000);
});

// --- Automated Blacklist Sync Engine ---

// Categories for automated syncing (Professional Sources)
const CATEGORY_URLS = {
  social: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/social/hosts',
  gambling: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling/hosts',
  streaming: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-gambling/hosts',
  adult: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts'
};

// PH Shopping Preset (High-Traffic PH E-Commerce)
const PH_SHOPPING_PRESET = [
  'shopee.ph', 'www.shopee.ph', 'shopee.com.my', 'shopee.vn',
  'lazada.com.ph', 'www.lazada.com.ph', 'lazada.com.my',
  'zalora.com.ph', 'www.zalora.com.ph',
  'carousell.ph', 'www.carousell.ph',
  'beautymnl.com', 'www.beautymnl.com',
  'metrodeal.com', 'www.metrodeal.com',
  'globe.com.ph', 'smart.com.ph', 'dito.ph'
];

// PH Gambling Preset
const PH_GAMBLING_PRESET = [
  'bet88.ph', 'www.bet88.ph', 'okada.ph', 'solaire.ph', 'cityofdreams.ph',
  'jili.com', '747.live', 'mwplay.net', 'pitmaster.live',
  'bingoplus.com.ph', 'www.bingoplus.com.ph', 'inplay.ph', 'megapanalo.com', 'jilipark.com'
];

// PH Streaming & Anime Preset
const PH_STREAMING_PRESET = [
  // Local/Regional Official
  'vivamax.com.ph', 'iwanttfc.com', 'app.iwanttfc.com', 'viu.com', 'viki.com', 'wetv.vip', 'iq.com', 
  'bilibili.tv', 'bilibili.com', 'netflix.com', 'disneyplus.com', 'hulu.com', 'hbo.com', 'hbomax.com',
  // Piracy/Mirror (High Traffic in PH)
  'loklok.com', 'www.loklok.com', 'pinoymovieshub.co', 'pinoyhdmovies.ch', 'pinoyflix.com', 
  'tagalogflux.com', 'upstream.ph', 'doodstream.com', 'dood.to', 'dood.la',
  // Anime Specific
  'gogoanime.pe', 'animepahe.com', '9anime.to', 'aniwave.to', 'aniwaves.ru', 
  'kissanime.com.ru', 'ani-cli.com', 'zoro.to', 'animesuge.to', 'animixplay.to', 'hidive.com'
];

// Adult Content Preset (Top-traffic adult sites — guaranteed coverage even if upstream fetch fails)
const ADULT_PRESET = [
  'pornhub.com', 'www.pornhub.com',
  'xvideos.com', 'www.xvideos.com',
  'xnxx.com', 'www.xnxx.com',
  'xhamster.com', 'www.xhamster.com',
  'redtube.com', 'www.redtube.com',
  'youporn.com', 'www.youporn.com',
  'spankbang.com', 'www.spankbang.com',
  'onlyfans.com', 'www.onlyfans.com',
  'chaturbate.com', 'www.chaturbate.com',
  'stripchat.com', 'www.stripchat.com',
  'brazzers.com', 'www.brazzers.com',
  'tnaflix.com', 'www.tnaflix.com'
];

// Core Category Mapping (Guarantees major sites have correct labels)
const CORE_CATEGORY_PRESETS = {
  social: ['youtube.com', 'www.youtube.com', 'facebook.com', 'www.facebook.com', 'tiktok.com', 'twitter.com', 'x.com', 'instagram.com'],
  gambling: ['bet88.ph', 'www.bet88.ph', 'bet365.com', '888casino.com'],
  streaming: ['netflix.com', 'disneyplus.com', 'hulu.com', 'twitch.tv', 'fmovies.to', '123movies.com']
};

/**
 * Periodically fetches and merges professional blacklists
 */
async function syncBlacklists() {
  console.log('[SYNC] Starting multi-category blacklist sync...');
  const configPath = path.join(__dirname, 'config.json');
  
  try {
    if (!fs.existsSync(configPath)) return;
    
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    let newBlacklist = new Set();
    let categoryMap = {};

    // 1. Apply Core Presets First (High Priority)
    Object.entries(CORE_CATEGORY_PRESETS).forEach(([cat, domains]) => {
      domains.forEach(domain => {
        newBlacklist.add(domain);
        categoryMap[domain] = cat;
      });
    });
    
    // 2. Add PH Shopping Preset
    if (config.categories?.includes('ph_shopping')) {
      PH_SHOPPING_PRESET.forEach(domain => {
        newBlacklist.add(domain);
        categoryMap[domain] = 'ph_shopping';
      });
      console.log(`[SYNC] Added PH Shopping Preset (${PH_SHOPPING_PRESET.length} domains)`);
    }

    // 3. Add PH Gambling Preset
    if (config.categories?.includes('gambling')) {
      PH_GAMBLING_PRESET.forEach(domain => {
        newBlacklist.add(domain);
        categoryMap[domain] = 'gambling';
      });
      console.log(`[SYNC] Added PH Gambling Preset (${PH_GAMBLING_PRESET.length} domains)`);
    }

    // 4. Add PH Streaming Preset
    if (config.categories?.includes('streaming')) {
      PH_STREAMING_PRESET.forEach(domain => {
        newBlacklist.add(domain);
        categoryMap[domain] = 'streaming';
      });
      console.log(`[SYNC] Added PH Streaming Preset (${PH_STREAMING_PRESET.length} domains)`);
    }

    // 4b. Add Adult Preset
    if (config.categories?.includes('adult')) {
      ADULT_PRESET.forEach(domain => {
        newBlacklist.add(domain);
        categoryMap[domain] = 'adult';
      });
      console.log(`[SYNC] Added Adult Preset (${ADULT_PRESET.length} domains)`);
    }

    // 5. Fetch external categories from GitHub
    for (const cat of (config.categories || [])) {
      if (CATEGORY_URLS[cat]) {
        try {
          const data = await fetchExternalList(CATEGORY_URLS[cat]);
          data.forEach(domain => {
            newBlacklist.add(domain);
            // Don't overwrite CORE presets with external category labels
            if (!categoryMap[domain]) categoryMap[domain] = cat;
          });
          console.log(`[SYNC] Successfully synced category: ${cat} (${data.length} domains)`);
        } catch (e) {
          console.error(`[SYNC] Failed to sync category ${cat}:`, e.message);
        }
      }
    }

    // 6. Add manual entries (overwrites if necessary, or tagged as manual)
    (config.manual_blacklist || []).forEach(domain => {
      newBlacklist.add(domain);
      if (!categoryMap[domain]) categoryMap[domain] = 'manual';
    });

    // 7. Apply user category overrides — dashboard-assigned categories win over presets/upstream
    Object.entries(config.user_category_map || {}).forEach(([domain, cat]) => {
      newBlacklist.add(domain);
      categoryMap[domain] = cat;
    });

    // Update config with the expanded list and category map
    config.blacklist = Array.from(newBlacklist);
    config.category_map = categoryMap;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`[SYNC] Complete. Total blocked domains: ${config.blacklist.length}`);
  } catch (e) {
    console.error('[SYNC] Global sync failure:', e.message);
  }
}

/**
 * Helper to fetch and parse host-file formatted lists
 */
function fetchExternalList(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch: ${res.statusCode}`));
      }
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const domains = body.split('\n')
          .filter(line => line.startsWith('0.0.0.0'))
          .map(line => line.split(/\s+/)[1]?.trim())
          .filter(domain => domain && domain !== '0.0.0.0' && domain !== 'localhost');
        resolve(domains);
      });
    }).on('error', reject);
  });
}
