ARG NODE_VERSION=24.21

# ---- build stage: install, compile, and keep only production files ----
FROM node:${NODE_VERSION}-slim AS build
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
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
RUN mkdir -p /data/uploads /data/outputs && chown -R node:node /data
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
CMD ["node", "dist/main.js"]