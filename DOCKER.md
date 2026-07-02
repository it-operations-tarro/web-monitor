# Running Web Monitor with Docker

Two containers — **collector** (Node/Express API, port 4448) and **dashboard**
(Next.js, port 3000) — orchestrated by `docker-compose.yml`. The **database is
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

# 1. Free the ports — the pm2 processes currently own 4448 and 3000.
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
Then open the dashboard on port 3000.

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
- **`config.json`** and **`updates/`** are bind-mounted, so edits and new `.crx`
  drops persist.

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
