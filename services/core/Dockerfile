# Build context: the repo root (see docker-compose.yml), so pnpm can use the
# workspace lockfile.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/core/package.json services/core/
# Installing runs `prisma generate`, which needs the schema.
COPY database/clinical/schema.prisma database/clinical/
RUN pnpm install --frozen-lockfile --filter @wasla/core
COPY services/core services/core
RUN pnpm --filter @wasla/core build \
 && pnpm --filter @wasla/core deploy --prod --legacy /out

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/main.js"]
