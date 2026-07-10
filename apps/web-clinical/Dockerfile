# syntax=docker/dockerfile:1.7
# SPA Vite @gaespos/web-clinical (build estático + nginx, proxy /api → api). Build desde la raíz del repo:
#   docker build -f apps/web-clinical/Dockerfile -t gaespos-web-clinical:latest .

# ===== Stage 1: builder =====
FROM node:22-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=development
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY .npmrc ./
COPY apps/web-clinical/package.json ./apps/web-clinical/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --filter "@gaespos/web-clinical..."

COPY packages/ui ./packages/ui
COPY apps/web-clinical ./apps/web-clinical

RUN pnpm --filter @gaespos/web-clinical build

# ===== Stage 2: runtime (nginx estático) =====
FROM nginx:1.27-alpine AS runtime
ENV API_UPSTREAM=api:3000
COPY deploy/nginx-spa.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /repo/apps/web-clinical/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
