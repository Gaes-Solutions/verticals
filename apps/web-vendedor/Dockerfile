# syntax=docker/dockerfile:1.7
# SPA Vite @gaespos/web-vendedor (build estático + nginx, proxy /api → api). Build desde la raíz del repo:
#   docker build -f apps/web-vendedor/Dockerfile -t gaespos-web-vendedor:latest .

# ===== Stage 1: builder =====
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=development
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY .npmrc ./
COPY apps/web-vendedor/package.json ./apps/web-vendedor/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --filter "@gaespos/web-vendedor..."

COPY packages/ui ./packages/ui
COPY apps/web-vendedor ./apps/web-vendedor

RUN pnpm --filter @gaespos/web-vendedor build

# ===== Stage 2: runtime (nginx estático) =====
FROM nginx:1.27-alpine AS runtime
ENV API_UPSTREAM=api:3000
COPY deploy/nginx-spa.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /repo/apps/web-vendedor/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
