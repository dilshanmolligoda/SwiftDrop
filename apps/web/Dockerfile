# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------
# SwiftDrop Web (React + Vite) — TEMPLATE
# Builds static files, then serves them with nginx.
# VITE_* values are baked in at BUILD time (they are public — no secrets).
# ---------------------------------------------------------------------

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN npm ci --workspace apps/web --workspace packages/contracts --include-workspace-root

COPY packages/contracts packages/contracts
COPY apps/web apps/web

ARG VITE_API_BASE_URL
ARG VITE_AI_ASSISTANT_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_AI_ASSISTANT_URL=$VITE_AI_ASSISTANT_URL
RUN npm run build --workspace packages/contracts --if-present \
 && npm run build --workspace apps/web

FROM nginx:1.27-alpine AS runtime
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
