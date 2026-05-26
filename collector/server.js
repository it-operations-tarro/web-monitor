require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 4448;

// Middleware
app.use(cors());
app.use(express.json());

// Database Setup
const dbPath = path.join(__dirname, 'logs.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

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
