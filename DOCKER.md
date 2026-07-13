# Running Web Monitor with Docker

Two containers — **collector** (Node/Express API, port 4448) and **dashboard**
(Next.js, port 4447) — orchestrated by `docker-compose.yml`. The **database is
not containerized**: both connect to the existing host MariaDB (`web-monitor`
and `floor_map_db`).

## Prerequisites

- A **Linux host** with Docker Engine + the Compose plugin (`network_mode: host`
  is Linux-only).
- The host MariaDB reachable on `localhost:3306` (it already is).
- These runtime files present on the server (both are gitignored, so they are
  NOT pulled — they must already exist / be created on the host):
  - `collector/.env` — secrets + DB config (`JWT_SECRET`, `DB_*`, `FLOOR_MAP_DB_*`, `SLACK_*`)
  - `collector/config.json` — the enforcement/blacklist config (bind-mounted so
    runtime edits persist)

## First run

```bash
cd /var/www/html/web-monitor         # repo root (where docker-compose.yml lives)

# 1. Free the ports — the pm2 processes currently own 4448 and 3000
#    (the dashboard container now serves on 4447; make sure it's free too).
pm2 delete web-monitor-collector web-monitor-dashboard   # use their real names
#   (or `pm2 stop ...`). With host networking, the containers bind these ports
#   directly, so the old processes must not be running.

# 2. Build and start.
docker compose up -d --build

# 3. Watch it come up.
docker compose logs -f collector
#   Expect: "Connected to the MySQL database." and
#           "📂 Database: MySQL web-monitor@localhost:3306"
```

Verify:
```bash
curl http://localhost:4448/api/stats      # expect real numbers, "totalLogs": 46571
```
Then open the dashboard on port 4447.

## Everyday operations

```bash
docker compose ps                    # status
docker compose logs -f dashboard     # tail logs
docker compose restart collector     # restart one service
docker compose down                  # stop & remove both containers
```

## Deploying an update

```bash
git pull
docker compose up -d --build         # rebuilds changed images, recreates containers
```

Config/data are safe across rebuilds:
- **DB** lives on the host, untouched by container rebuilds.
- **`config.json`**, **`updates/`**, and **`archives/`** are bind-mounted, so
  edits, new `.crx` drops, and log archives persist.

## Log archiving & retention

The `logs` and `bandwidth_violations` tables would otherwise grow forever. A
daily job in the collector archives each completed calendar month older than the
retention window into one gzipped SQL file under `collector/archives/`
(e.g. `logs-2026-06.sql.gz`), verifies the file is fully written, and only then
deletes those rows. Nothing is lost — an archived month can be reloaded any time.

- **Runs** ~1 min after boot and every 24 h. Watch it: `docker compose logs -f collector | grep ARCHIVE`.
- **Retention** (env, in `collector/.env`):
  - `ARCHIVE_ENABLED=false` — turn the job off entirely.
  - `ARCHIVE_RETAIN_MONTHS=1` — completed months kept live in addition to the
    current month (default `1` ⇒ keep current + previous month, archive older).
  - `ARCHIVE_DIR` — override the archive location (default `collector/archives`).
- **List archives:** `curl http://localhost:4448/api/admin/archives`
- **Run now:** `curl -X POST http://localhost:4448/api/admin/archives/run`
- **Reload a month for traceback** (idempotent — uses `INSERT IGNORE`):
  ```bash
  # inside the collector container (or any host with the DB reachable):
  docker compose exec collector node restore.js archives/logs-2026-06.sql.gz
  # or with the mysql client:
  gunzip -c collector/archives/logs-2026-06.sql.gz | mysql -u USER -p web_monitor
  ```

## Container log rotation

The collector prints a line per request to stdout, which Docker captures to a
`*-json.log` file. Both services set a rolling cap in `docker-compose.yml`
(`json-file`, `max-size: 10m`, `max-file: 5` ⇒ ~50 MB per service) so those files
can't fill the disk. Also:

- `LOG_REQUESTS` (env, `collector/.env`) — the noisy per-request `[LOG] Received…`
  line is **off by default**. Set `LOG_REQUESTS=true` to re-enable it for debugging.
- Rotation applies to **new** output. To reclaim an already-huge log from before
  this change, recreate the container: `docker compose up -d --force-recreate collector`.
- **pm2** (if any service still runs under pm2 rather than Docker):
  ```bash
  pm2 install pm2-logrotate
  pm2 set pm2-logrotate:max_size 10M
  pm2 set pm2-logrotate:retain 5
  ```

## Notes & gotchas

- **Host networking.** Chosen so the collector reaches the host MariaDB on
  `localhost:3306` with the exact credentials that already work, and so ports
  match the previous pm2 setup. `ports:` entries are intentionally omitted
  (ignored under `network_mode: host`).
- **`.env` supplies config.** Compose injects `collector/.env` as real
  environment variables; there is no `.env` file inside the image.
- **Dashboard → collector URL.** The browser calls `http://<same-host>:4448`
  (derived from the page URL), so the collector just needs to be reachable on
  4448 from wherever the dashboard is viewed.
- **If you ever move off host networking** (e.g. to a bridge network or a
  separate DB host), you must set `DB_HOST`/`FLOOR_MAP_DB_HOST` accordingly and
  ensure MariaDB listens on the right interface and grants access to the
  container's source host.
