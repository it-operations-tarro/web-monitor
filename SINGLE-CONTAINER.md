# Single-container build (migration-ready)

Collector (Express) **and** dashboard (Next.js) run in **one image**, supervised
by `pm2-runtime`. This is the shape we deploy to AWS Fargate.

- **One published port: `4447`** (the dashboard).
- The **collector runs internally on `4448`** and is never exposed. The dashboard
  proxies the collector's public paths to it via Next.js `rewrites`
  (`next.config.ts`): `/api/*`, `/logs`, `/ping`, `/updates/*` → `127.0.0.1:4448`.
- The browser calls **same-origin** (`getBaseUrl()` returns `''`), so there is no
  cross-origin `:4448` and no CORS dependency.

```
browser ──▶ :4447 (Next.js) ──▶ rewrites /api,/logs,/ping,/updates ──▶ 127.0.0.1:4448 (collector)
                                                                              │
extension (after repack) ──▶ https://<host>/logs,/ping,/api/config ──────────┘
```

## Files

| File | Role |
|---|---|
| `Dockerfile` (repo root) | Multi-stage build of the merged image |
| `ecosystem.config.js` | pm2 process list; pins collector→4448, dashboard→4447 |
| `docker-compose.single.yml` | Local run of the single container |
| `dashboard/next.config.ts` | `rewrites` proxying collector paths |

The old `docker-compose.yml` and per-service `collector/Dockerfile` /
`dashboard/Dockerfile` are left in place but are **not** used by this build.

## Build & run locally

```bash
cd /d/vibe-code/web-monitor/web-monitor      # repo root
docker compose -f docker-compose.single.yml up -d --build
docker compose -f docker-compose.single.yml logs -f
```

Open `http://localhost:4447`. Verify the proxied collector API:

```bash
curl http://localhost:4447/api/stats          # served by the collector via rewrite
```

### Database

Unlike the old host-networking compose, this does **not** put the DB on
`localhost`. Set `DB_HOST` / `FLOOR_MAP_DB_HOST` in `collector/.env` to a
reachable address:

- **Local dev against a DB on your machine:** `host.docker.internal`
- **AWS:** the RDS endpoint

## Runtime inputs (not baked into the image)

Provided via `env_file` + volumes locally; via Secrets Manager + EFS on Fargate.

- **Secrets/env:** `JWT_SECRET`, `DB_*`, `FLOOR_MAP_DB_*`, `SLACK_*`, `JIRA_*`,
  `ARCHIVE_*`. (`PORT` is set per-process in `ecosystem.config.js` and ignored
  from the environment.)
- **Mutable state** (mount targets inside the container):
  - `/app/collector/config.json` — enforcement/blacklist config (read+written)
  - `/app/collector/updates` — self-hosted extension `.crx` artifacts
  - `/app/collector/archives` — monthly gzipped SQL log archives

## What changed vs. the two-container setup

- `dashboard/next.config.ts` — added `rewrites` for `/api`, `/logs`, `/ping`, `/updates`.
- `dashboard/src/app/page.tsx`, `dashboard/src/app/portal/page.tsx` —
  `getBaseUrl()` now returns `''` (same-origin) instead of `http://<host>:4448`.
- No collector code changes.

## Extension

No change needed to build/run the container. When the system is live on AWS,
repack the extension pointing at the new collector origin (drop the `:4448` — it
is now same-origin behind the dashboard host):

```js
// extension/api.js:7
const API_ENDPOINT = 'https://<new-aws-host>/logs';   // → /ping, /api/config derived
```

## Health check

`GET /` on `4447` returns the dashboard HTML (no DB needed) — use it as the ALB
target-group health check. pm2 restarts either process if it crashes and streams
both logs to stdout (captured by Docker / CloudWatch).
