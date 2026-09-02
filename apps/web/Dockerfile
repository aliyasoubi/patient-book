# syntax=docker/dockerfile:1.7
#
# Builds the Angular bundle and bakes it into the Caddy image that serves it.
# Build context is the repository root.

# ── Build ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY apps/web apps/web
RUN npm run build --workspace=web

# ── Runtime ────────────────────────────────────────────────────────────
# Caddy rather than nginx + certbot: certificates are obtained and renewed
# automatically, which removes "nobody noticed the cert expired" as a way for
# the practice to lose access to its records on a Sunday.
FROM caddy:2-alpine AS runtime
COPY --from=build /repo/apps/web/dist/web/browser /srv
COPY ops/deploy/Caddyfile /etc/caddy/Caddyfile
