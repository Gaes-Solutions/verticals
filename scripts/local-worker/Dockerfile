FROM node:24-bookworm-slim@sha256:ec857ea6bb60cb3d0fa4d97495590c5fe7d51be8572c307b55957eeb06569cf7
RUN apt-get update && apt-get install -y --no-install-recommends bash git python3 ca-certificates ffmpeg chromium \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @openai/codex@0.163.0 pnpm@10.33.2
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV CI=true
WORKDIR /workspace
