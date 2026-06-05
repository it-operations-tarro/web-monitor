require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
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

// Database Setup
const dbPath = path.join(__dirname, 'logs.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// WAL mode — allows concurrent reads during writes, critical for 500+ agents
db.run('PRAGMA journal_mode=WAL');
db.run('PRAGMA busy_timeout=5000');   // wait up to 5s before failing on a locked write
db.run('PRAGMA synchronous=NORMAL'); // faster fsync, still crash-safe

// Initialize Tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT,
      username TEXT,
      domain TEXT,
      full_url TEXT,
      timestamp DATETIME,
      violation BOOLEAN,
      category TEXT
    )
  `);

  // Simple migration for existing logs table
  db.run("ALTER TABLE logs ADD COLUMN category TEXT", () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS machines (
      machine_id TEXT PRIMARY KEY,
      username TEXT,
      last_seen DATETIME,
      ip_address TEXT,
      current_bandwidth INTEGER DEFAULT 0,
      total_bandwidth INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bandwidth_violations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_id TEXT,
      username TEXT,
      bytes INTEGER,
      timestamp DATETIME
    )
  `);

  // Simple migration for existing databases
  db.run("ALTER TABLE machines ADD COLUMN current_bandwidth INTEGER DEFAULT 0", () => {});
  db.run("ALTER TABLE machines ADD COLUMN total_bandwidth INTEGER DEFAULT 0", () => {});

  db.run(`
    CREATE TABLE IF NOT EXISTS portal_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('team_lead','manager','director')),
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration for existing portal_users rows
  db.run("ALTER TABLE portal_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1", () => {});

  // Team leads → agents they supervise (keyed by agent email/username)
  db.run(`
    CREATE TABLE IF NOT EXISTS agent_assignments (
      user_id INTEGER NOT NULL,
      agent_email TEXT NOT NULL,
      PRIMARY KEY(user_id, agent_email),
      FOREIGN KEY(user_id) REFERENCES portal_users(id) ON DELETE CASCADE
    )
  `);

  // Migrate existing rows: rename machine_id → agent_email if old schema is present
  db.run(`ALTER TABLE agent_assignments RENAME COLUMN machine_id TO agent_email`, () => {});

  // manager→team_lead or director→manager relationships
  db.run(`
    CREATE TABLE IF NOT EXISTS user_assignments (
      parent_id INTEGER NOT NULL,
      child_id INTEGER NOT NULL,
      PRIMARY KEY(parent_id, child_id),
      FOREIGN KEY(parent_id) REFERENCES portal_users(id) ON DELETE CASCADE,
      FOREIGN KEY(child_id) REFERENCES portal_users(id) ON DELETE CASCADE
    )
  `);
});

/**
 * Endpoint to receive logs from workstations
 */
app.post('/logs', (req, res) => {
  const { machine_id, username, domain, full_url, timestamp, violation } = req.body;
  const ip = req.ip;

  if (!machine_id || !domain) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Update machine status
  db.run(`
    INSERT INTO machines (machine_id, username, last_seen, ip_address)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(machine_id) DO UPDATE SET
      username = excluded.username,
      last_seen = excluded.last_seen,
      ip_address = excluded.ip_address
  `, [machine_id, username, timestamp, ip]);

  // Lookup category if it's a violation
  let category = null;
  if (violation) {
    try {
      const configPath = path.join(__dirname, 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      category = config.category_map?.[domain] || 'manual';
    } catch (e) {
      category = 'manual';
    }
  }

  const query = `
    INSERT INTO logs (machine_id, username, domain, full_url, timestamp, violation, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.run(query, [machine_id, username, domain, full_url, timestamp, violation ? 1 : 0, category], function(err) {
    if (err) {
      console.error('Database error:', err.message);
      return res.status(500).json({ error: 'Failed to save log' });
    }
    console.log(`[LOG] Recieved from ${machine_id}: ${domain} [Violation: ${violation ? 'YES' : 'NO'}]`);
    res.status(201).json({ status: 'success' });
  });
});

/**
 * Endpoint for heartbeat/ping
 */
app.post('/ping', (req, res) => {
  const { machine_id, username, timestamp, bandwidth } = req.body;
  const ip = req.ip;
  const currentBandwidth = bandwidth || 0;

  if (!machine_id) return res.status(400).send();

  db.run(`
    INSERT INTO machines (machine_id, username, last_seen, ip_address, current_bandwidth, total_bandwidth)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(machine_id) DO UPDATE SET
      username = excluded.username,
      last_seen = excluded.last_seen,
      ip_address = excluded.ip_address,
      current_bandwidth = excluded.current_bandwidth,
      total_bandwidth = machines.total_bandwidth + excluded.current_bandwidth
  `, [machine_id, username, timestamp, ip, currentBandwidth, currentBandwidth], (err) => {
    if (err) return res.status(500).send();
    
    // Log violation history if threshold exceeded (10MB/min)
    if (currentBandwidth > 10 * 1024 * 1024) {
      db.run(`
        INSERT INTO bandwidth_violations (machine_id, username, bytes, timestamp)
        VALUES (?, ?, ?, ?)
      `, [machine_id, username, currentBandwidth, timestamp]);
    }

    res.status(200).json({ status: 'pong' });
  });
});

/**
 * Endpoint to fetch all machines
 */
app.get('/api/machines', (req, res) => {
  db.all('SELECT * FROM machines ORDER BY last_seen DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch machines' });
    res.json(rows);
  });
});

/**
 * Endpoint to delete a machine
 */
app.delete('/api/machines/:id', (req, res) => {
  const machineId = req.params.id;
  db.run('DELETE FROM machines WHERE machine_id = ?', [machineId], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete machine' });
    res.json({ status: 'deleted' });
  });
});

/**
 * Endpoint for the Enforcement tab — policy summary + top offenders.
 * Returns a compact view of config.json (the full file is multi-MB) joined
 * with violation aggregates from the logs table.
 */
app.get('/api/enforcement', (req, res) => {
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

  db.serialize(() => {
    db.all(`
      SELECT domain, category, COUNT(*) as count
      FROM logs
      WHERE violation = 1
      GROUP BY domain
      ORDER BY count DESC
      LIMIT 10
    `, (err, topDomains) => {
      summary.topOffendingDomains = topDomains || [];

      db.all(`
        SELECT username, machine_id, COUNT(*) as count
        FROM logs
        WHERE violation = 1 AND username IS NOT NULL
        GROUP BY username
        ORDER BY count DESC
        LIMIT 10
      `, (err, topUsers) => {
        summary.topOffendingUsers = topUsers || [];
        res.json(summary);
      });
    });
  });
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

// Add one or more domains to a category
app.post('/api/enforcement/domains', (req, res) => {
  const { domains, category } = req.body;
  if (!domains || !category) return res.status(400).json({ error: 'Missing domains or category' });
  const list = (Array.isArray(domains) ? domains : [domains])
    .map(d => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
  try {
    const config = readConfig();
    config.category_map = config.category_map || {};
    config.blacklist = config.blacklist || [];
    config.manual_blacklist = config.manual_blacklist || [];
    for (const domain of list) {
      config.category_map[domain] = category;
      if (!config.blacklist.includes(domain)) config.blacklist.push(domain);
      if (category === 'manual' && !config.manual_blacklist.includes(domain)) {
        config.manual_blacklist.push(domain);
      }
    }
    writeConfig(config);
    res.json({ status: 'added', count: list.length });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update config' });
  }
});

// Remove a domain from the blacklist entirely
app.delete('/api/enforcement/domains/:domain', (req, res) => {
  const domain = decodeURIComponent(req.params.domain);
  try {
    const config = readConfig();
    config.blacklist = (config.blacklist || []).filter(d => d !== domain);
    config.manual_blacklist = (config.manual_blacklist || []).filter(d => d !== domain);
    delete (config.category_map || {})[domain];
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
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  db.all('SELECT * FROM logs ORDER BY timestamp DESC LIMIT ?', [limit], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch logs' });
    }
    res.json(rows);
  });
});

/**
 * Endpoint to fetch bandwidth violation history
 */
app.get('/api/bandwidth-violations', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  db.all('SELECT * FROM bandwidth_violations ORDER BY timestamp DESC LIMIT ?', [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch bandwidth violations' });
    res.json(rows);
  });
});

/**
 * Endpoint for dashboard summary stats
 */
app.get('/api/stats', (req, res) => {
  const stats = {};
  
  db.serialize(() => {
    db.get('SELECT COUNT(*) as count FROM logs', (err, row) => {
      stats.totalLogs = row?.count || 0;
    });

    db.get('SELECT COUNT(*) as count FROM logs WHERE violation = 1', (err, row) => {
      stats.totalViolations = row?.count || 0;
    });

    db.get('SELECT COUNT(DISTINCT machine_id) as count FROM logs', (err, row) => {
      stats.uniqueMachines = row?.count || 0;
    });

    db.all(`
      SELECT domain, COUNT(*) as count 
      FROM logs 
      GROUP BY domain 
      ORDER BY count DESC 
      LIMIT 5
    `, (err, rows) => {
      stats.topDomains = rows || [];
      res.json(stats);
    });
  });
});

// ─── DB promise helpers ────────────────────────────────────────────────────
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })
  );
}
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  );
}
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])))
  );
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
      SELECT id, name, username, email, role, created_at FROM portal_users ORDER BY created_at DESC
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
    if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Username already exists' });
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
    await dbRun('INSERT OR IGNORE INTO agent_assignments (user_id, agent_email) VALUES (?, ?)', [req.params.id, agent_email.trim().toLowerCase()]);
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
      await dbRun('INSERT OR IGNORE INTO agent_assignments (user_id, agent_email) VALUES (?, ?)', [req.params.id, email.trim().toLowerCase()]);
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
    await dbRun('INSERT OR IGNORE INTO user_assignments (parent_id, child_id) VALUES (?, ?)', [req.params.id, child_id]);
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

    res.json({
      user: { id, name, username, role },
      machineIds,
      assignedAgents,
      violations,
      recentLogs,
      topDomains,
      bwViolations,
      teamMembers,
    });
  } catch (e) {
    console.error('[PORTAL]', e);
    res.status(500).json({ error: 'Failed to fetch portal data' });
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
    const agents = await dbAll(`
      SELECT
        l.username,
        m.machine_id,
        m.last_seen,
        m.ip_address,
        m.current_bandwidth,
        m.total_bandwidth,
        COUNT(l.id)                                             AS total_sessions,
        SUM(CASE WHEN l.violation = 1 THEN 1 ELSE 0 END)       AS total_violations
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
  // Default to today's date in YYYY-MM-DD (UTC) if not supplied
  const date   = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    let sql = 'SELECT * FROM logs WHERE username = ? AND DATE(timestamp) = ?';
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Collector API running on http://0.0.0.0:${PORT}`);
  console.log(`📂 Database located at: ${dbPath}`);
  
  // Initial sync and schedule daily sync (every 24 hours)
  syncBlacklists();
  setInterval(syncBlacklists, 24 * 60 * 60 * 1000);
});

// --- Automated Blacklist Sync Engine ---

// Categories for automated syncing (Professional Sources)
const CATEGORY_URLS = {
  social: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/social/hosts',
  gambling: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling/hosts',
  streaming: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/fakenews-gambling/hosts'
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
