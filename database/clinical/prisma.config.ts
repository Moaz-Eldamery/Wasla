// Prisma CLI settings for wasla_clinical: where the schema and migrations are,
// and which database to migrate. Migrations run as wasla_migrator, never as a
// service's own user (see schema.md).
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'schema.prisma',
  migrations: {
    path: 'migrations',
  },
  datasource: {
    url: env('MIGRATOR_DATABASE_URL'),
  },
});
