# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------
# SwiftDrop AI Delivery Assistant (chat endpoint + MCP tools)
# Build context = repo root (npm workspaces):
#   docker compose --profile ai build ai-assistant
# Talks only to the SwiftDrop API (AI_BACKEND_API_URL) and the LLM
# provider; it has no database access.
# ---------------------------------------------------------------------

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/ai-assistant/package.json apps/ai-assistant/
RUN npm ci --workspace apps/ai-assistant --include-workspace-root

COPY apps/ai-assistant apps/ai-assistant
RUN npm run build --workspace apps/ai-assistant \
 && npm prune --omit=dev --workspace apps/ai-assistant --include-workspace-root \
 && mkdir -p apps/ai-assistant/node_modules

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/ai-assistant/package.json ./apps/ai-assistant/
COPY --from=build /repo/apps/ai-assistant/node_modules ./apps/ai-assistant/node_modules
COPY --from=build /repo/apps/ai-assistant/dist ./apps/ai-assistant/dist
USER node
EXPOSE 3100
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://localhost:3100/api/assistant/health || exit 1
CMD ["node", "apps/ai-assistant/dist/main.js"]
