-- Web Monitor — MySQL/MariaDB schema
-- Translated from the SQLite schema in collector/server.js.
-- Run once against an empty database:
--   mysql -u webmon -p web_monitor < schema/mysql_schema.sql

-- Page-visit log (high-volume table)
CREATE TABLE IF NOT EXISTS logs (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  machine_id  VARCHAR(255),
  username    VARCHAR(255),
  domain      VARCHAR(255),
  full_url    TEXT,
  timestamp   DATETIME,
  violation   TINYINT(1) DEFAULT 0,
  category    VARCHAR(255),
  -- Indexes matter far more in MySQL than in single-file SQLite;
  -- these back the dashboard's most common filters.
  INDEX idx_logs_machine   (machine_id),
  INDEX idx_logs_username   (username),
  INDEX idx_logs_timestamp  (timestamp),
  INDEX idx_logs_domain     (domain),
  INDEX idx_logs_violation  (violation)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per workstation; upserted on every /logs and /ping
CREATE TABLE IF NOT EXISTS machines (
  machine_id        VARCHAR(255) PRIMARY KEY,
  username          VARCHAR(255),
  last_seen         DATETIME,
  ip_address        VARCHAR(64),
  current_bandwidth BIGINT DEFAULT 0,
  total_bandwidth   BIGINT DEFAULT 0,
  extension_version VARCHAR(64),
  INDEX idx_machines_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bandwidth-threshold breaches (10MB/min)
CREATE TABLE IF NOT EXISTS bandwidth_violations (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  machine_id VARCHAR(255),
  username   VARCHAR(255),
  bytes      BIGINT,
  timestamp  DATETIME,
  INDEX idx_bw_machine   (machine_id),
  INDEX idx_bw_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Portal (supervisor) login accounts
CREATE TABLE IF NOT EXISTS portal_users (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  name                 VARCHAR(255) NOT NULL,
  username             VARCHAR(255) NOT NULL UNIQUE,
  email                VARCHAR(255),
  password_hash        VARCHAR(255) NOT NULL,
  role                 VARCHAR(32)  NOT NULL,
  must_change_password TINYINT(1)   NOT NULL DEFAULT 1,
  created_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_portal_role CHECK (role IN ('team_lead','manager','director'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team lead -> supervised agents (keyed by agent email/username)
CREATE TABLE IF NOT EXISTS agent_assignments (
  user_id     INT          NOT NULL,
  agent_email VARCHAR(255) NOT NULL,
  PRIMARY KEY (user_id, agent_email),
  FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- manager->team_lead / director->manager relationships
CREATE TABLE IF NOT EXISTS user_assignments (
  parent_id INT NOT NULL,
  child_id  INT NOT NULL,
  PRIMARY KEY (parent_id, child_id),
  FOREIGN KEY (parent_id) REFERENCES portal_users(id) ON DELETE CASCADE,
  FOREIGN KEY (child_id)  REFERENCES portal_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Block-request workflow for the Top Offending Domains table.
-- status: 'pending' (Slack sent) | 'done' (blocked -> hidden from the list)
CREATE TABLE IF NOT EXISTS block_requests (
  url          VARCHAR(512) PRIMARY KEY,
  domain       VARCHAR(255),
  category     VARCHAR(255),
  status       VARCHAR(16) NOT NULL DEFAULT 'pending',
  requested_at DATETIME,
  requested_by VARCHAR(255),
  resolved_at  DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
