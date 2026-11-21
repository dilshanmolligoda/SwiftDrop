# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------
# SwiftDrop mock merchant store (demo webhook receiver)
# Build context = repo root (needed for the npm workspace lockfile):
#   docker compose --profile app build mock-merchant
# No runtime dependencies — only the compiled JavaScript is shipped.
# ---------------------------------------------------------------------

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY tools/mock-merchant/package.json tools/mock-merchant/
RUN npm ci --workspace tools/mock-merchant --include-workspace-root

COPY tools/mock-merchant tools/mock-merchant
RUN npm run build --workspace tools/mock-merchant

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /repo/tools/mock-merchant/package.json ./
COPY --from=build /repo/tools/mock-merchant/dist ./dist
USER node
EXPOSE 5000
CMD ["node", "dist/main.js"]
