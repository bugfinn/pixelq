ARG NODE_VERSION=24.21

# ---- build stage: install, compile, and keep only production files ----
FROM node:${NODE_VERSION}-slim AS build
ENV CI=true \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/
RUN pnpm install --frozen-lockfile --filter "@pixelq/api..."

COPY api/tsconfig.json api/tsconfig.build.json api/
COPY api/src api/src
COPY api/drizzle api/drizzle
RUN pnpm --filter @pixelq/api build \
 && pnpm --filter @pixelq/api deploy --prod /out

# ---- runtime stage: a fresh image with only what the API needs ----
FROM node:${NODE_VERSION}-slim
ENV NODE_ENV=production
WORKDIR /app
RUN mkdir -p /data/uploads /data/outputs && chown -R node:node /data
COPY --from=build --chown=node:node /out/package.json ./package.json
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
COPY --from=build --chown=node:node /out/drizzle ./drizzle
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]