# syntax=docker/dockerfile:1
#
# Single-container image: collector (Express) + dashboard (Next.js) in one image,
# supervised by pm2-runtime. Only the dashboard port (4447) is exposed; the
# collector runs internally on 4448 and is reached through Next.js rewrites.
#
# Build from the repo root:
#   docker build -t web-monitor .

# ── dashboard deps ───────────────────────────────────────────────────────────
FROM node:22-alpine AS dash-deps
WORKDIR /dash
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci

# ── dashboard build → Next.js standalone output ──────────────────────────────
FROM node:22-alpine AS dash-build
WORKDIR /dash
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dash-deps /dash/node_modules ./node_modules
COPY dashboard/ ./
RUN npm run build

# ── collector deps (production only) ─────────────────────────────────────────
FROM node:22-alpine AS coll-deps
WORKDIR /coll
COPY collector/package.json collector/package-lock.json ./
RUN npm ci --omit=dev

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Process manager that runs both services as one container.
RUN npm install -g pm2

# Collector: production node_modules + source. config.json and .env/secrets are
# supplied at RUNTIME (volume + env), never baked into the image. updates/ ships
# with defaults but is bind-mounted/EFS-mounted at runtime for drop-in .crx.
COPY --from=coll-deps /coll/node_modules ./collector/node_modules
COPY collector/package.json collector/server.js collector/archive.js collector/restore.js ./collector/
COPY collector/updates ./collector/updates

# Dashboard: Next.js standalone server + static assets + public. The standalone
# root becomes /app/dashboard, so server.js resolves ./public and ./.next/static
# alongside itself (see dashboard/Dockerfile for the same layout).
COPY --from=dash-build /dash/.next/standalone ./dashboard/
COPY --from=dash-build /dash/public ./dashboard/public
COPY --from=dash-build /dash/.next/static ./dashboard/.next/static

COPY ecosystem.config.js ./

# The single public port is the dashboard's; the collector (4448) stays internal.
EXPOSE 4447

CMD ["pm2-runtime", "ecosystem.config.js"]
