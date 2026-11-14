# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------
# SwiftDrop API (NestJS) — TEMPLATE
# Ready for when apps/api is scaffolded. Build context = repo root
# (needed for npm workspaces + packages/contracts):
#   docker compose --profile app build api
# Assumes: package.json scripts "build" (nest build → dist/main.js),
# Prisma schema in apps/api/prisma, and `prisma` in "dependencies"
# (not devDependencies) so `prisma migrate deploy` works at runtime.
# ---------------------------------------------------------------------

# ---------- 1. Build ----------
FROM node:22-alpine AS build
WORKDIR /repo

# Install dependencies first (cached unless a package.json/lockfile changes)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --workspace apps/api --workspace packages/contracts --include-workspace-root

# Then copy source and build
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build --workspace packages/contracts --if-present \
 && DATABASE_URL=postgresql://build:build@localhost:5432/build npx --workspace apps/api prisma generate \
 && npm run build --workspace apps/api \
 && mkdir -p apps/api/node_modules

# ---------- 2. Runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
# Prisma 7 reads the datasource URL from this file — `prisma migrate deploy` needs it
COPY --from=build /repo/apps/api/prisma.config.ts ./apps/api/

# Run as the non-root "node" user that ships with the image
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node

EXPOSE 4000
CMD ["node", "apps/api/dist/src/main.js"]
