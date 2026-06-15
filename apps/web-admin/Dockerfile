# syntax=docker/dockerfile:1.7
# Dockerfile productivo para la SPA Vite @gaespos/web-admin (build estático + nginx).
# Build con: docker build -f apps/web-admin/Dockerfile -t gaespos-web-admin:latest .
# (correr desde la raíz del repo)

# ===== Stage 1: builder =====
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=development
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY .npmrc ./
COPY apps/web-admin/package.json ./apps/web-admin/
COPY packages/ui/package.json ./packages/ui/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@gaespos/web-admin..."

COPY packages/ui ./packages/ui
COPY apps/web-admin ./apps/web-admin

RUN pnpm --filter @gaespos/web-admin build

# ===== Stage 2: runtime (nginx estático) =====
FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/apps/web-admin/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
