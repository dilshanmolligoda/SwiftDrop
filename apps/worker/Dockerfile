# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------
# SwiftDrop Worker (NestJS standalone consumers) — TEMPLATE
# Ready for when apps/worker is scaffolded. Build context = repo root.
# If the worker uses the Prisma client from apps/api, add the same
# `prisma generate` step as in apps/api/Dockerfile.
# ---------------------------------------------------------------------

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --workspace apps/worker --workspace packages/contracts --include-workspace-root

COPY packages/contracts packages/contracts
COPY apps/worker apps/worker
RUN npm run build --workspace packages/contracts --if-present \
 && npm run build --workspace apps/worker \
 && mkdir -p apps/worker/node_modules

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/worker/package.json ./apps/worker/
COPY --from=build /repo/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /repo/apps/worker/dist ./apps/worker/dist
USER node
CMD ["node", "apps/worker/dist/main.js"]
