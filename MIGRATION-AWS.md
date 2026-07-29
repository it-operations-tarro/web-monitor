# AWS Migration Runbook — web-monitor (ECS Fargate + RDS)

Lift-and-shift of the **single-container** image (collector + dashboard under
`pm2-runtime`, see [SINGLE-CONTAINER.md](SINGLE-CONTAINER.md)) onto AWS.

**Decisions locked in for this migration**
- IaC: **Terraform**
- Public endpoint: **Route 53 + ACM** (HTTPS)
- Availability: **Single-AZ RDS, 1 Fargate task** (upgrade later)
- This document is the **review-first runbook**; Terraform files are generated
  only after this is approved.

> Fill in every `<PLACEHOLDER>` before running anything. Nothing here creates
> billable resources until you reach Phase 3 (`terraform apply`).

---

## 0. Target architecture

```
Internet
   │  HTTPS :443  (hostname: <APP_HOSTNAME>)
   ▼
Route 53  ──alias──▶  ALB (public subnets, ACM cert)
                          │  HTTP :4447  (ALB SG → task SG)
                          ▼
                  ECS Fargate task (private subnets)  0.5 vCPU / 1 GB
                    ├─ dashboard  :4447  (exposed via ALB)
                    └─ collector  :4448  (internal; reached by Next.js rewrites)
                          │
             ┌────────────┴─────────────┐
             ▼                            ▼
      RDS MySQL 8.0 :3306          EFS  :2049  mounted at /app/collector
      (single-AZ, private)         ├─ config.json   (5.9 MB, read+write)
      ├─ web_monitor               ├─ updates/      (.crx + updates.xml)
      └─ floor_map_db              └─ archives/     (monthly gz archives)

Browser extensions ──▶ https://<APP_HOSTNAME>/logs ──▶ ALB ──▶ 4447 ──▶ rewrite ──▶ 4448
```

Only the ALB is internet-facing. Task, RDS, and EFS live in private subnets.

---

## 1. Prerequisites

### Local tooling
- [ ] **Docker** installed and running — ⚠️ the single-container image has
      **never been built** yet (Docker wasn't available when the refactor was
      done). Building it locally is the first validation step (Phase 2).
- [ ] **AWS CLI v2**, authenticated (`aws sts get-caller-identity` works).
- [ ] **Terraform** ≥ 1.6.
- [ ] A MySQL client (`mysql`) for seeding the databases.

### AWS account / decisions to fill in
- [ ] Region: `<AWS_REGION>` (e.g. `ap-southeast-1` — closest to PH offices).
- [ ] Domain in Route 53: `<APP_HOSTNAME>` (e.g. `webmonitor.example.com`) and
      the hosted zone that owns it.
- [ ] Naming prefix for resources: `<PREFIX>` (e.g. `webmon`).
- [ ] Values for every secret in the table in §4.

---

## 2. Build & push the image (ECR)

Run from the repo root (`D:\vibe-code\web-monitor\web-monitor`).

```bash
# 2a. Validate the build locally FIRST (never built before)
docker build -t web-monitor .
# Smoke test with the local compose if you have a reachable DB:
#   docker compose -f docker-compose.single.yml up -d --build
#   curl http://localhost:4447/            # dashboard HTML
#   curl http://localhost:4447/api/stats   # collector via rewrite

# 2b. Create the ECR repo (or let Terraform create it — see §3)
aws ecr create-repository --repository-name <PREFIX>/web-monitor --region <AWS_REGION>

# 2c. Log in, tag, push
aws ecr get-login-password --region <AWS_REGION> \
  | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com
docker tag web-monitor:latest <ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/<PREFIX>/web-monitor:latest
docker push <ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/<PREFIX>/web-monitor:latest
```

**Gate:** do not proceed until the image builds and (ideally) serves `/` and
`/api/stats` locally.

---

## 3. Provision infrastructure (Terraform)

Terraform will create the following. This is the inventory to review — the
actual `.tf` files come next, once you approve.

| Group | Resources |
|---|---|
| **Network** | VPC, 2 public + 2 private subnets across 2 AZs, IGW, 1 NAT gateway, route tables |
| **Security groups** | `alb-sg`, `task-sg`, `rds-sg`, `efs-sg` (rules in §5) |
| **ECR** | `<PREFIX>/web-monitor` repo (skip if created in §2b) |
| **RDS** | MySQL 8.0, `db.t3.small`, single-AZ, private, 20 GB gp3, automated backups 7 days, in a DB subnet group |
| **EFS** | File system + mount targets in both private subnets + access point (uid/gid for the container) |
| **ALB** | Internet-facing ALB, HTTPS:443 listener (ACM cert), target group → port 4447, health check `GET /` |
| **ACM** | Certificate for `<APP_HOSTNAME>`, DNS-validated via Route 53 |
| **Route 53** | Alias A-record `<APP_HOSTNAME>` → ALB |
| **Secrets Manager** | One secret per §4 entry (or one JSON secret with all keys) |
| **IAM** | Task **execution** role (ECR pull, CloudWatch Logs, Secrets read) + task role (EFS mount) |
| **CloudWatch** | Log group `/ecs/<PREFIX>/web-monitor` |
| **ECS** | Cluster, task definition (image, secrets→env, EFS volume at `/app/collector`), service (1 task, ALB-attached) |

**Order of apply** (Terraform handles dependencies, but note the manual gaps):
1. `terraform apply` network + RDS + EFS + ECR + secrets + IAM + ALB + ACM/Route53.
2. **Manual: seed RDS** (§6) — needs the RDS endpoint from step 1 output.
3. **Manual: seed EFS** (§7) — needs the EFS id from step 1 output.
4. `terraform apply` (or the same apply) the ECS service last, so the task
   starts against an already-seeded DB and EFS.

> The ECS service can be gated behind a `desired_count = 0` → `1` flip so infra
> comes up before the container tries to connect.

---

## 4. Secrets (Secrets Manager → task env)

The collector reads these from the environment. `PORT` is **not** included —
it's pinned per-process in [ecosystem.config.js](ecosystem.config.js) and
ignored from env. Defaults shown are the code fallbacks in
[collector/server.js](collector/server.js) / [collector/archive.js](collector/archive.js).

| Env var | Required | Notes / default |
|---|---|---|
| `JWT_SECRET` | ✅ | dashboard/portal auth signing key |
| `DB_HOST` | ✅ | RDS endpoint |
| `DB_PORT` | | `3306` |
| `DB_USER` | ✅ | RDS user |
| `DB_PASS` | ✅ | RDS password |
| `DB_NAME` | ✅ | `web_monitor` |
| `FLOOR_MAP_DB_HOST` | ✅ | same RDS endpoint |
| `FLOOR_MAP_DB_PORT` | | `3306` |
| `FLOOR_MAP_DB_USER` | ✅ | |
| `FLOOR_MAP_DB_PASS` | ✅ | |
| `FLOOR_MAP_DB_NAME` | ✅ | code default `floor_map_db_staging` — set to `floor_map_db` |
| `SLACK_WEBHOOK_URL` | | violation alerts |
| `SLACK_BLOCK_WEBHOOK_URL` | | block alerts |
| `JIRA_BASE_URL` | | Jira Service Desk integration |
| `JIRA_EMAIL` | | |
| `JIRA_API_TOKEN` | | |
| `JIRA_SERVICE_DESK_ID` | | |
| `JIRA_REQUEST_TYPE_ID` | | |
| `JIRA_POLL_MS` | | `300000` |
| `JIRA_IMPACT_ID` | | |
| `JIRA_URGENCY_ID` | | |
| `JIRA_WORKSPACE_ID` | | |
| `JIRA_LOCATION_OBJECT_ID` | | |
| `JIRA_SITE_OBJECT_ID` | | |
| `ARCHIVE_ENABLED` | | set `false` to disable monthly archiving |
| `ARCHIVE_DIR` | | defaults to collector-local path → resolves under the EFS mount |
| `ARCHIVE_RETAIN_MONTHS` | | months of archives to keep |
| `LOG_REQUESTS` | | `true` for verbose request logging |

---

## 5. Security group rules

| SG | Inbound | From |
|---|---|---|
| `alb-sg` | 443 | `0.0.0.0/0` |
| `task-sg` | 4447 | `alb-sg` only |
| `rds-sg` | 3306 | `task-sg` only |
| `efs-sg` | 2049 | `task-sg` only |

Outbound: default allow-all (task needs egress to RDS, EFS, ECR, Secrets,
Slack/Jira via NAT).

---

## 6. Seed the databases (manual, after RDS exists)

Both databases live on the **one** RDS instance. Run from a host that can reach
RDS (bastion, your laptop over a temporary SG rule, or a one-off ECS task).

```bash
# web_monitor: schema first, then existing data
mysql -h <RDS_ENDPOINT> -u <DB_USER> -p -e "CREATE DATABASE IF NOT EXISTS web_monitor;"
mysql -h <RDS_ENDPOINT> -u <DB_USER> -p web_monitor < collector/schema/mysql_schema.sql
mysql -h <RDS_ENDPOINT> -u <DB_USER> -p web_monitor < collector/schema/data_export.sql

# floor_map_db (set FLOOR_MAP_DB_NAME to match whatever you create here)
mysql -h <RDS_ENDPOINT> -u <DB_USER> -p -e "CREATE DATABASE IF NOT EXISTS floor_map_db;"
mysql -h <RDS_ENDPOINT> -u <DB_USER> -p floor_map_db < collector/schema/floor_map_db.sql
```

**Gate:** `SELECT COUNT(*) FROM web_monitor.logs;` returns rows; floor_map tables exist.

---

## 7. Seed EFS (manual, after EFS exists)

The collector starts with defaults if EFS is empty — you must place the current
mutable state onto the EFS mount **before** the task starts (especially the
5.9 MB `config.json`, which holds the enforcement/blacklist rules).

Mount the EFS access point on a temporary EC2/bastion (or a one-off task) and copy:

```bash
# target layout on EFS (mounted at, e.g., /mnt/efs which maps to /app/collector)
/mnt/efs/config.json      <-- from collector/config.json   (5.9 MB)
/mnt/efs/updates/         <-- from collector/updates/       (agent-monitor.crx, extension.crx, updates.xml)
/mnt/efs/archives/        <-- create empty (collector writes here)
```

Set ownership to the uid/gid the EFS access point / container uses.

**Gate:** `config.json` and `updates/updates.xml` are present on EFS.

---

## 8. Deploy & verify

1. Flip the ECS service `desired_count` to `1` (or `terraform apply` the service).
2. Watch startup: `aws logs tail /ecs/<PREFIX>/web-monitor --follow`.
   pm2 streams both `collector` and `dashboard` logs to stdout → CloudWatch.
3. Confirm the ALB target is **healthy** (health check `GET /`).
4. End-to-end checks against `https://<APP_HOSTNAME>`:
   - [ ] `GET /` → dashboard loads
   - [ ] `GET /api/stats` → collector responds through the rewrite proxy
   - [ ] `GET /ping` → collector alive
   - [ ] a test log write reaches `web_monitor.logs`
   - [ ] Slack alert fires (if configured)
   - [ ] Jira poll runs without auth errors (if configured)

---

## 9. Repack & redistribute the extension (LAST)

Only after the AWS endpoint is confirmed working. The extension currently points
at the on-prem host:

```js
// extension/api.js:7  — CURRENT
const API_ENDPOINT = 'http://messageboard-svr-dgt1-1.prod.letsdowonders.io:4448/logs';
```

Change to same-origin HTTPS (drop `:4448` — it's now behind 4447 via rewrites):

```js
const API_ENDPOINT = 'https://<APP_HOSTNAME>/logs';   // /ping and /api/config are derived from this
```

Then repack with [pack-extension.ps1](pack-extension.ps1) and redistribute the
`.crx`. `/ping` and `/api/config` are derived from `API_ENDPOINT`, so no other
extension edits are needed.

---

## 10. Rollback

- The on-prem host and databases are untouched by this migration — the fastest
  rollback is to **not repack the extension** (Phase 9). Until then, all agents
  still report to on-prem; AWS runs in parallel for verification.
- Tear down AWS cleanly with `terraform destroy` (RDS final snapshot + EFS are
  the only stateful resources — snapshot/back up before destroying).

---

## 11. Rough monthly cost (single-AZ, 1 task, us/ap region ballpark)

| Item | Est. |
|---|---|
| Fargate 0.5 vCPU / 1 GB, 24×7 | ~$18 |
| RDS `db.t3.small` single-AZ + 20 GB gp3 | ~$30 |
| ALB | ~$18 + traffic |
| NAT gateway | ~$32 + traffic |
| EFS (few GB) | ~$1 |
| **Total** | **~$100/mo** before data transfer |

NAT is a big line item — if the task needs no outbound internet except AWS
services, VPC endpoints (ECR/S3/Secrets/Logs) can replace NAT later.

---

## Open items to confirm before Terraform generation
- `<AWS_REGION>`, `<APP_HOSTNAME>` + hosted zone, `<PREFIX>`, `<ACCOUNT_ID>`.
- Whether ECR is created by Terraform or pre-created in §2b.
- Whether to keep the DB name as `floor_map_db` (code default is `floor_map_db_staging`).
- Bastion vs. one-off ECS task for the DB/EFS seeding steps.
