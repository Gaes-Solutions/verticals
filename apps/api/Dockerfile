# syntax=docker/dockerfile:1.7
# Dockerfile productivo multi-stage para @gaespos/api en monorepo Turborepo + pnpm + Prisma.
# Build con: docker build -f apps/api/Dockerfile -t gaespos-api:latest .
# (correr desde la raíz del repo)

# ===== Stage 1: builder =====
FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=development
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

# OpenSSL requerido por Prisma engines (binaryTargets debian/linux)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

# Capa cacheable: solo manifests + lockfile para resolver deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages ./packages

RUN pnpm install --frozen-lockfile --filter "@gaespos/api..."

COPY apps/api ./apps/api

# Genero Prisma clients para master y tenant
RUN pnpm --filter @gaespos/db exec prisma generate --schema=prisma/master/schema.prisma \
    && pnpm --filter @gaespos/db exec prisma generate --schema=prisma/tenant/schema.prisma

# Build TypeScript de la api (genera dist/)
RUN pnpm --filter @gaespos/api build

# pnpm deploy crea un bundle standalone con solo lo que se necesita en prod
# --legacy: workspaces sin inject-workspace-packages (default pnpm 10), válido V1
RUN pnpm --filter @gaespos/api --prod --legacy deploy /tmp/api-bundle

# ===== Stage 2: runtime =====
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home gaespos \
    && npm install -g tsx@4.19.2

WORKDIR /app

# Bundle standalone con node_modules pruned + symlinks resueltos
COPY --from=builder --chown=gaespos:nodejs /tmp/api-bundle ./

# dist compilado de api + prisma generators + migrations
COPY --from=builder --chown=gaespos:nodejs /repo/apps/api/dist ./dist
COPY --from=builder --chown=gaespos:nodejs /repo/packages/db/src/generated ./node_modules/@gaespos/db/src/generated
COPY --from=builder --chown=gaespos:nodejs /repo/packages/db/prisma ./node_modules/@gaespos/db/prisma

USER gaespos

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
# tsx en runtime resuelve los .ts de @gaespos/* workspace packages (node-pure no strip-types desde node_modules)
CMD ["tsx", "dist/server.js"]
