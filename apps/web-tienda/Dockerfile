# syntax=docker/dockerfile:1.7
# Dockerfile productivo para la tienda Next.js (@gaespos/web-tienda) en monorepo.
# Build con: docker build -f apps/web-tienda/Dockerfile -t gaespos-tienda:latest .
# (correr desde la raíz del repo)

# ===== Stage 1: builder =====
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY .npmrc ./
COPY apps/web-tienda/package.json ./apps/web-tienda/

RUN pnpm install --frozen-lockfile --filter "@gaespos/web-tienda..."

COPY apps/web-tienda ./apps/web-tienda

RUN pnpm --filter @gaespos/web-tienda build

# ===== Stage 2: runtime =====
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home nextjs

WORKDIR /app

# Salida standalone: server.js + node_modules traced + assets estáticos + public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web-tienda/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web-tienda/.next/static ./apps/web-tienda/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web-tienda/public ./apps/web-tienda/public

USER nextjs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3001/ || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web-tienda/server.js"]
