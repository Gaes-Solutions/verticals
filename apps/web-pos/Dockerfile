# syntax=docker/dockerfile:1.7
# Dockerfile productivo para la SPA Vite @gaespos/web-pos (build estático + nginx).
# Build con: docker build -f apps/web-pos/Dockerfile -t gaespos-web-pos:latest .
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
COPY apps/web-pos/package.json ./apps/web-pos/
COPY packages/ui/package.json ./packages/ui/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@gaespos/web-pos..."

COPY packages/ui ./packages/ui
COPY apps/web-pos ./apps/web-pos

RUN pnpm --filter @gaespos/web-pos build

# ===== Stage 2: runtime (nginx estático) =====
FROM nginx:1.27-alpine AS runtime
# Upstream del API (envsubst al arrancar). compose: api:3000 · Railway: <api>.railway.internal:3000
ENV API_UPSTREAM=api:3000
COPY deploy/nginx-spa.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /repo/apps/web-pos/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
