// pm2-runtime process file for the single-container image.
//
// The image bundles BOTH services and pm2-runtime supervises them as one
// container: it keeps the container alive, restarts a crashed process, and
// streams both logs to stdout (so Docker/CloudWatch capture them).
//
// PORT is set PER PROCESS here and always wins over any inherited PORT env,
// so the two servers can never collide on a port:
//   - dashboard (Next.js) -> 4447  (the ONLY published/exposed port)
//   - collector (Express)  -> 4448  (internal only; reached via Next rewrites)
//
// All other collector secrets (JWT_SECRET, DB_*, FLOOR_MAP_DB_*, SLACK_*,
// JIRA_*, ARCHIVE_*) are inherited from the container environment (docker
// env_file locally; AWS Secrets Manager / task env on Fargate).
module.exports = {
  apps: [
    {
      name: "collector",
      cwd: "/app/collector",
      script: "server.js",
      env: { NODE_ENV: "production", PORT: "4448" },
      max_restarts: 20,
      restart_delay: 2000,
      kill_timeout: 8000,
    },
    {
      name: "dashboard",
      cwd: "/app/dashboard",
      script: "server.js",
      env: { NODE_ENV: "production", PORT: "4447", HOSTNAME: "0.0.0.0" },
      max_restarts: 20,
      restart_delay: 2000,
      kill_timeout: 8000,
    },
  ],
};
