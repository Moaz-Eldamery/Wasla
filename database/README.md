# Database

Everything about the database. See `schema.md` for the databases, schemas, DB users and tables.

## Files

- `init.sh`: runs once, when Postgres starts on an empty volume. It creates:
  - the `wasla_clinical` database, with the `auth` and `core` schemas
  - the `wasla_ai` database, with pgvector
  - the DB users and their access rules
  - AI migration and runtime object privileges via `ai/migrator_permissions.sql`

  Passwords come from `.env`. To run it again, delete the volume with `docker compose down -v`. It must stay executable (mode 755): Docker Desktop on macOS otherwise fails to run it.
- `ai/migrator_permissions.sql`: repeatable, AI-only provisioning. Fresh installations run it from `init.sh`. For an existing volume, first start only Postgres so the file is mounted, apply it as a Postgres administrator with `docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /etc/wasla/ai-migrator-permissions.sql`, then start the full stack. It makes `postgres` the owner of the AI `public` schema, grants `wasla_migrator` connection and migration privileges, and removes blanket runtime grants from `wasla_ai`. AI migrations grant runtime access per application object; Prisma's migration log remains private.
- `Dockerfile`: image for the one-off `migrate` and `ai-migrate` services, which run separate Prisma histories as `wasla_migrator`. The `seed` service reuses it to load the Clinical demo data. It installs only the root package's dependencies.
