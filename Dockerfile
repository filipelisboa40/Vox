# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

WORKDIR /app

FROM debian:bookworm-slim AS yt-dlp

ARG TARGETARCH
ARG YT_DLP_VERSION=2026.07.04

RUN apt-get update \
    && apt-get install --no-install-recommends --yes ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && case "$TARGETARCH" in \
        amd64) asset=yt-dlp_linux ;; \
        arm64) asset=yt-dlp_linux_aarch64 ;; \
        *) echo "Unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl --fail --location --silent --show-error \
        "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${asset}" \
        --output "/tmp/${asset}" \
    && curl --fail --location --silent --show-error \
        "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/SHA2-256SUMS" \
        --output /tmp/SHA2-256SUMS \
    && grep " ${asset}$" /tmp/SHA2-256SUMS | (cd /tmp && sha256sum --check -) \
    && install --mode=0755 "/tmp/${asset}" /usr/local/bin/yt-dlp

FROM base AS build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM base AS production-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-prod,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile

FROM node:24-bookworm-slim AS runtime

LABEL org.opencontainers.image.source="https://github.com/filipelisboa40/Vox"

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=256"
ENV UV_THREADPOOL_SIZE=2
ENV YT_DLP_PATH=/usr/local/bin/yt-dlp

RUN apt-get update \
    && apt-get install --no-install-recommends --yes ca-certificates dumb-init ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=yt-dlp /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp
COPY --chown=node:node package.json ./package.json

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
