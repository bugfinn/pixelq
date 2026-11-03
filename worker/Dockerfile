ARG NODE_VERSION=26.13

# ---- build stage: install, compile, and keep only production files ----
FROM node:${NODE_VERSION}-slim AS build
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install -g corepack@0.36.0 && corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY worker/package.json worker/
RUN pnpm install --frozen-lockfile --filter "@pixelq/worker..."

COPY worker/tsconfig.json worker/tsconfig.build.json worker/
COPY worker/src worker/src
RUN pnpm --filter @pixelq/worker build \
 && pnpm --filter @pixelq/worker deploy --prod /out

# ---- runtime stage: a fresh image with only what the worker needs ----
FROM node:${NODE_VERSION}-slim
ENV NODE_ENV=production
WORKDIR /app

# Temporary security fixes (found by Trivy in the base image):
# - upgrade perl-base to the fixed Debian version; remove this when the Node
#   base image ships it
# - remove npm, which the worker never runs; its bundled packages (brace-expansion,
#   ip-address, tar, undici) have fixable HIGH CVEs
RUN apt-get update \
 && apt-get install -y --only-upgrade --no-install-recommends perl-base \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
 && mkdir -p /data/uploads /data/outputs \
 && chown -R node:node /data

COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
CMD ["node", "dist/main.js"]