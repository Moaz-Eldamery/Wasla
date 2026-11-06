// Prisma CLI settings for wasla_ai. This database has an independent schema,
// migration history, and connection URL from wasla_clinical.
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: env('AI_MIGRATOR_DATABASE_URL'),
  },
});
