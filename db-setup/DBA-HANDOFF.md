# DBA hand-off — add `web-monitor` databases to `itam-prod-db`

**Requesting team:** IT Ops (web-monitor migration to AWS)
**Instance:** `itam-prod-db` (`itam-prod-db.c5s26lulb97s.ap-southeast-1.rds.amazonaws.com`, MariaDB 11.8, `ap-southeast-1`)
**What we're asking:** create two new databases and one limited user on this
instance, then load two schema dumps. This does **not** affect ITAM.

## Why this is safe

- Two **new** databases (`web_monitor`, `floor_map_db`) — nothing existing is modified.
- One **new** user (`webmon`) whose privileges are scoped to **only** those two
  databases. It cannot read or change ITAM or any other schema.
- No change to the `admin`/master account. You never share the admin password —
  you run the script; IT Ops already holds the `webmon` password they chose.

## Files in this hand-off

| File | Purpose |
|---|---|
| `itam-prod-db-webmon-setup.sql` | Creates the two empty databases + the `webmon` user + grants |

That is the **only** thing we need you to run. IT Ops loads the application data
itself (a dump of the live system) as the `webmon` user afterwards — the browsing
logs and user records never pass through you.

## Prerequisites

- A MySQL/MariaDB client with network access to `itam-prod-db` (however you
  normally administer this instance — bastion, VPN, etc.).
- **TLS is required.** This instance has `require_secure_transport=ON`, so the
  client must connect over TLS. Grab the RDS CA bundle once:
  ```bash
  curl -sO https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
  ```
  and pass `--ssl-ca=global-bundle.pem` on every `mysql` command (shown below).

## Steps

**1. Set the `webmon` password.** Edit `itam-prod-db-webmon-setup.sql` and replace
`REPLACE_WITH_A_STRONG_PASSWORD` with the password IT Ops gave you (do not invent
your own — they need it to match their app config).

**2. Create the databases + user** (run as the admin/master user):

```bash
DB=itam-prod-db.c5s26lulb97s.ap-southeast-1.rds.amazonaws.com
mysql --ssl-ca=global-bundle.pem -h $DB -u admin -p < itam-prod-db-webmon-setup.sql
```

**3. Verify** the user and empty databases exist, then tell IT Ops:

```bash
mysql --ssl-ca=global-bundle.pem -h $DB -u admin -p -e "SHOW DATABASES LIKE '%map%'; SHOW DATABASES LIKE 'web_monitor'; SELECT user,host FROM mysql.user WHERE user='webmon';"
```

Expected: both `web_monitor` and `floor_map_db` listed, and one `webmon` row.
The databases will be **empty** at this point — that is correct. IT Ops loads the
data next.

## What to report back to IT Ops

Just confirm: **"webmon user + both empty databases created."** IT Ops already
has the `webmon` password (they chose it), so nothing sensitive needs to come
back, and IT Ops loads the application data itself.

## Rollback (if ever needed)

```sql
DROP USER IF EXISTS 'webmon'@'%';
DROP DATABASE IF EXISTS web_monitor;
DROP DATABASE IF EXISTS floor_map_db;
```
