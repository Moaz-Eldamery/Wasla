# The `migrate` service in docker-compose.yml: applies the wasla_clinical
# migrations as wasla_migrator, then exits. Build context: the repo root.
FROM node:24-alpine
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Only the root package: it holds the Prisma CLI.
RUN pnpm install --frozen-lockfile --filter .
COPY database/clinical database/clinical
USER node
# Runs the CLI directly: the data network has no internet, so pnpm can't be
# fetched at runtime.
CMD ["node_modules/.bin/prisma", "migrate", "deploy", "--config", "database/clinical/prisma.config.ts"]
