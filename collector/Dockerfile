# syntax=docker/dockerfile:1

# ── deps: install production node_modules from the lockfile ──────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js archive.js restore.js ./
# Default extension artifacts; the updates/ dir is bind-mounted at runtime so
# new .crx builds can be dropped in without rebuilding the image.
COPY updates ./updates

# config.json and secrets (.env) are supplied at runtime via compose
# (bind mount + env_file), never baked into the image.
EXPOSE 4448
CMD ["node", "server.js"]
