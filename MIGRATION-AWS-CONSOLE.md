# AWS Migration — Console (click-by-click) Runbook

Console/GUI alternative to [MIGRATION-AWS.md](MIGRATION-AWS.md) (Terraform). Same
target, but done by hand in the AWS dashboard. To cut the networking clicks, this
uses your account's **default VPC** and its subnets, and restricts access with
**security groups** instead of private subnets + NAT.

> Set your Console **Region** (top-right) to `ap-southeast-1` and keep it the same
> on every screen. Fill in each `<PLACEHOLDER>` as you go.

**Order:** ECR → Secrets → RDS → EFS → seed DB+EFS (temp EC2) → IAM → ALB+ACM+DNS → ECS.

---

## 1. ECR — push the image

Console: **ECR → Repositories → Create repository**
- Visibility: Private. Name: `itops-webmon`. Create.
- Open the repo → **View push commands** and run them in your terminal. They are
  (prefix with `sudo` if you built with sudo):

```bash
aws ecr get-login-password --region ap-southeast-1 \
  | sudo docker login --username AWS --password-stdin 329432956490.dkr.ecr.ap-southeast-1.amazonaws.com
sudo docker tag web-monitor:latest 329432956490.dkr.ecr.ap-southeast-1.amazonaws.com/itops-webmon:latest
sudo docker push 329432956490.dkr.ecr.ap-southeast-1.amazonaws.com/itops-webmon:latest
```

Copy the pushed **image URI** — you need it in the ECS task definition (§8).

---

## 2. Secrets Manager — one secret, all keys

Console: **Secrets Manager → Store a new secret**
- Type: **Other type of secret** → **Plaintext** tab → paste one JSON object with
  every key from the §4 table of [MIGRATION-AWS.md](MIGRATION-AWS.md) (`JWT_SECRET`,
  `DB_*`, `FLOOR_MAP_DB_*`, `SLACK_*`, `JIRA_*`, `ARCHIVE_*`). Leave `DB_HOST` /
  `FLOOR_MAP_DB_HOST` blank for now — you'll fill in the RDS endpoint after §3.
- Name it `itops-webmon`. Store. Copy the **secret ARN**.

> In the ECS task def (§8) each key maps to an env var via
> `valueFrom = arn:aws:secretsmanager:ap-southeast-1:329432956490:secret:itops-webmon-waQHnx:<KEY>::`.

---

## 3. RDS — MySQL 8.0 (holds both databases)

Console: **RDS → Create database**
- **Standard create** → **MySQL** → Engine 8.0.
- Template: **Dev/Test**. Availability: **Single-AZ** (single instance).
- DB instance identifier: `itops-webmon-mysql`. Master username/password → save these
  into the secret from §2 (`DB_USER`/`DB_PASS`).
- Instance: `db.t3.small`. Storage: 20 GB gp3.
- **Connectivity:** default VPC. **Public access: No.** VPC security group →
  **Create new** named `rds-sg`.
- Additional config → Initial database name: `web_monitor`.
- Create. Wait ~5–10 min → copy the **endpoint** into the secret's `DB_HOST` and
  `FLOOR_MAP_DB_HOST`. Set `DB_NAME=web_monitor`, `FLOOR_MAP_DB_NAME=floor_map_db`.

---

## 4. EFS — mutable files

Console: **EFS → Create file system → Customize**
- Name: `itops-webmon-efs`. VPC: default. Create.
- After it's created → **Access points → Create access point**:
  - Root directory path: `/`
  - POSIX user: **UID 1000 / GID 1000** (the `node` user in the image)
  - Root dir creation perms: owner UID 1000 / GID 1000, permissions `0755`
- Note the **File system ID** (`fs-…`) and **Access point ID** (`fsap-…`).
- Edit the EFS's network security group later (§6) to allow NFS from the task.

---

## 5. Security groups (VPC → Security Groups)

Create/adjust three SGs in the default VPC. You'll fill in the referenced SG IDs
as you create each tier.

| SG | Inbound rule | Source |
|---|---|---|
| `alb-sg` | HTTPS 443 | `0.0.0.0/0` |
| `task-sg` | TCP 4447 | `alb-sg` |
| `rds-sg` (from §3) | MySQL 3306 | `task-sg` |
| `efs-sg` (EFS's SG) | NFS 2049 | `task-sg` |

Create `alb-sg` and `task-sg` now; edit `rds-sg` and the EFS SG to reference
`task-sg` once it exists. (You can create `task-sg` empty first, then wire it up.)

---

## 6. Seed RDS + EFS (temporary EC2 helper)

The console has no built-in MySQL client, and EFS/RDS are private — launch a
throwaway EC2 in the default VPC to do both, then terminate it.

1. **EC2 → Launch instance:** Amazon Linux 2023, `t3.micro`, default VPC, a
   **public subnet**, auto-assign public IP **on**. Attach a temp SG allowing
   your IP on SSH 22 (or use **Session Manager** → no SSH needed). Also add this
   instance's SG (or its private IP) to `rds-sg` 3306 and the EFS SG 2049
   temporarily.
2. Connect (EC2 → Connect → Session Manager). Then:

```bash
sudo dnf install -y mariadb105 amazon-efs-utils

# --- seed the databases ---
mysql -h <RDS_ENDPOINT> -u <DB_USER> -p web_monitor < mysql_schema.sql
mysql -h <RDS_ENDPOINT> -u <DB_USER> -p web_monitor < data_export.sql
mysql -h <RDS_ENDPOINT> -u <DB_USER> -p -e "CREATE DATABASE IF NOT EXISTS floor_map_db;"
mysql -h <RDS_ENDPOINT> -u <DB_USER> -p floor_map_db < floor_map_db.sql

# --- seed EFS ---
sudo mkdir -p /mnt/efs
sudo mount -t efs -o tls,accesspoint=<fsap-ID> <fs-ID>:/ /mnt/efs
sudo cp config.json   /mnt/efs/config.json         # the 5.9 MB enforcement config
sudo cp -r updates     /mnt/efs/updates
sudo mkdir -p /mnt/efs/archives
sudo chown -R 1000:1000 /mnt/efs
```

(Get the SQL files + `config.json` + `updates/` onto the box first — `scp`, or
`aws s3 cp` from a temp bucket, or paste. They live in `collector/` and
`collector/schema/` in this repo.)

3. **Terminate the EC2** and remove its temporary rules from `rds-sg` / EFS SG.

**Gate:** `SELECT COUNT(*) FROM web_monitor.logs;` returns rows; `/mnt/efs/config.json` exists.

---

## 7. IAM — two roles for ECS

Console: **IAM → Roles → Create role → AWS service → Elastic Container Service → Elastic Container Service Task**

1. **Execution role** `itops-webmon-ecs-exec`: attach managed policy
   `AmazonECSTaskExecutionRolePolicy`, plus an inline policy allowing
   `secretsmanager:GetSecretValue` on the secret ARN from §2. (ECS uses this to
   pull the image, write logs, and read secrets.)
2. **Task role** `itops-webmon-ecs-task`: attach `AmazonElasticFileSystemClientReadWriteAccess`
   (lets the running container read/write EFS).

---

## 8. ALB + ACM cert + Route 53

**ACM first** (Console: **Certificates → Request** → public):
- Domain: `<APP_HOSTNAME>`. Validation: **DNS**. Request → **Create records in
  Route 53** (one click if the zone is in this account). Wait until **Issued**.

**Target group** (EC2 → Target groups → Create):
- Type: **IP addresses** (Fargate). Protocol HTTP, **port 4447**. VPC: default.
- Health check path: `/`. Create. (Don't register targets — ECS does it.)

**ALB** (EC2 → Load Balancers → Create → Application Load Balancer):
- Internet-facing. Default VPC, pick **2+ public subnets**. SG: `alb-sg`.
- Listener: **HTTPS 443** → forward to the target group above → attach the ACM cert.
- Create. Copy the ALB DNS name.

**Route 53** (Hosted zone → Create record):
- Name `<APP_HOSTNAME>`, type **A**, **Alias → Application Load Balancer** →
  region → your ALB. Save.

---

## 9. ECS — cluster, task definition, service

**Cluster** (ECS → Clusters → Create): name `itops-webmon-cluster`, **AWS Fargate**. Create.

**Task definition** (ECS → Task definitions → Create new):
- Launch type: **Fargate**. Name `itops-webmon-task`.
- Task size: **0.5 vCPU / 1 GB**.
- Task role: `itops-webmon-ecs-task`. Execution role: `itops-webmon-ecs-exec`.
- **Container:**
  - Name `web-monitor`, Image URI from §1.
  - Port mapping: **4447** TCP.
  - **Environment variables → Add from Secrets Manager:** one row per key,
    `valueFrom = arn:aws:secretsmanager:ap-southeast-1:329432956490:secret:itops-webmon-waQHnx:<KEY>::`.
  - **Plain environment variables** (NOT secrets) — these point the mutable paths
    at the EFS mount so EFS never overlays the app code:
    - `CONFIG_PATH=/data/config.json`
    - `UPDATES_DIR=/data/updates`
    - `ARCHIVE_DIR=/data/archives`
  - Health check (optional): `CMD-SHELL, wget -qO- http://localhost:4447/ || exit 1`.
- **Storage → Add volume:** type **EFS**, file system `<fs-ID>`, access point
  `<fsap-ID>`, transit encryption **on**. **Mount point:** container path
  **`/data`**, source = that volume. (Do NOT mount at `/app/collector` — that hides
  server.js/node_modules.) Create.

**Service** (Cluster → Services → Create):
- Launch type Fargate. Task def = the one above. Service name `itops-webmon`.
- **Desired tasks: 1.**
- Networking: VPC **`vpc-081819541c020e58d`**, **private** subnets
  `subnet-0e6a166f09655f67e` + `subnet-031e1584d06a29c9d`, SG = `task-sg`
  (`sg-0377fbbdd342e6d70`), public IP **off** (egress via the VPC's NAT gateways).
- **Load balancing:** Application Load Balancer → existing → pick your ALB and the
  **4447 target group**. Create.

---

## 10. Verify

- ECS → Service → **Tasks**: task reaches **RUNNING**; check **Logs** tab
  (pm2 streams both `collector` + `dashboard`).
- Target group: target shows **healthy**.
- Browse `https://<APP_HOSTNAME>/` (dashboard), then `/api/stats`, `/ping`.
- Confirm a log write lands in `web_monitor.logs`.

---

## 11. Extension (LAST)

Only after AWS is verified. Edit [extension/api.js:7](extension/api.js):

```js
const API_ENDPOINT = 'https://<APP_HOSTNAME>/logs';   // drop the :4448
```

Repack with [pack-extension.ps1](pack-extension.ps1) and redistribute. Until you
do this, all agents still report to on-prem — so AWS can run in parallel for
testing with zero risk (that's also your rollback).

---

### Console vs. Terraform note
Every step above is a one-time set of clicks with no state file, so changes and
teardown are manual. If you expect to rebuild/iterate, the Terraform path in
[MIGRATION-AWS.md](MIGRATION-AWS.md) captures all of this as code you can
`apply`/`destroy`.
