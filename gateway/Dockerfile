ARG NODE_VERSION=26.13
ARG NGINX_VERSION=1.30

# Stage 1: build the React page.
FROM node:${NODE_VERSION}-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN npm install -g corepack@0.36.0 && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter frontend...
COPY frontend frontend
RUN pnpm --filter frontend build

# Stage 2: Nginx with only the built files and the config. No Node, no source code.
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine

# Temporary: the base image still ships brotli-libs, curl and libcurl versions
# with fixable HIGH/CRITICAL CVEs (found by Trivy). Upgrade just these packages,
# then go back to the non-root user. Remove this block once the base image has
# the fixed versions.
USER root
RUN apk upgrade --no-cache brotli-libs curl libcurl
USER 101

COPY gateway/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/frontend/dist /usr/share/nginx/html