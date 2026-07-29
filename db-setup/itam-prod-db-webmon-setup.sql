-- =====================================================================
-- web-monitor onboarding on the  itam-prod-db  instance
-- Run ONCE, as an admin / master user, against itam-prod-db.
--
-- What this does:
--   * Creates two NEW databases:  web_monitor,  floor_map_db
--   * Creates ONE limited application user:  'webmon'
--   * Grants 'webmon' access to ONLY those two databases
--
-- What this does NOT do:
--   * It does not touch ITAM or any other existing schema on this instance.
--   * The 'webmon' user has NO privileges outside web_monitor / floor_map_db.
--   * It does not read or change the admin/master account.
-- =====================================================================

-- 1) Databases (utf8mb4 to match the application's schema dumps)
CREATE DATABASE IF NOT EXISTS web_monitor  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE DATABASE IF NOT EXISTS floor_map_db CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

-- 2) Application user.
--    >>> REPLACE the password below before running. <<<
--    Host '%' is safe here: the instance is private and its security group
--    only admits the web-monitor task. Tighten to 'webmon'@'10.8.%' (the VPC
--    CIDR) if you prefer host-scoping.
CREATE USER IF NOT EXISTS 'webmon'@'%' IDENTIFIED BY 'REPLACE_WITH_A_STRONG_PASSWORD';

-- 3) Scope the user to only the two web-monitor databases
GRANT ALL PRIVILEGES ON web_monitor.*  TO 'webmon'@'%';
GRANT ALL PRIVILEGES ON floor_map_db.* TO 'webmon'@'%';
FLUSH PRIVILEGES;

-- 4) (Optional) confirm the grants
SHOW GRANTS FOR 'webmon'@'%';
