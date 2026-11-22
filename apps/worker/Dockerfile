# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------
# SwiftDrop Worker (NestJS standalone RabbitMQ consumers)
# Build context = repo root (npm workspaces + packages/contracts):
#   docker compose --profile app build worker
# The Prisma client is generated from apps/api/prisma/schema.prisma into
# apps/worker/src/generated (committed, like the API's), so no
# `prisma generate` step is needed here.
# ---------------------------------------------------------------------

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --workspace apps/worker --workspace packages/contracts --include-workspace-root

COPY packages/contracts packages/contracts
COPY apps/worker apps/worker
RUN npm run build --workspace apps/worker \
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
# Internal health endpoint for the container healthcheck (not published)
EXPOSE 4010
CMD ["node", "apps/worker/dist/main.js"]
