# syntax=docker/dockerfile:1.7
#
# Build context is the repository root: this is an npm workspace, and the
# lockfile at the root is the only thing that pins the API's dependency tree.

# ── Build ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /repo

# Manifests before sources so editing a .ts file reuses the install layer.
# Every workspace package.json has to be present or `npm ci` cannot reconcile
# the lockfile, even when only one workspace is being built.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY apps/api apps/api
RUN npm run build --workspace=api

# ── Runtime dependencies ───────────────────────────────────────────────
# A second, dev-free install rather than pruning the build tree: the compiled
# API needs neither the Nest CLI nor ts-node, and migrations run from `dist`
# for exactly that reason.
FROM node:22-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace=api --include-workspace-root

# ── Runtime ────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production

# BackupService resolves both its config file and its default destination from
# the home directory. This path is bind-mounted to the *identical* path on the
# host, so the destination shown on the settings screen is one that exists on
# both sides and that the nightly job reads the same way.
ENV HOME=/srv/patient-book/home

WORKDIR /repo
COPY --from=deps  /repo             ./
COPY --from=build /repo/apps/api/dist apps/api/dist

USER node
EXPOSE 3000

# Node 22 ships a global fetch, so readiness needs no curl in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/main.js"]
