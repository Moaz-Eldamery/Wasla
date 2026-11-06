# Database

Everything about the database. See `schema.md` for the databases, schemas, DB users and tables.

## Files

- `init.sh`: runs once, when Postgres starts on an empty volume. It creates:
  - the `wasla_clinical` database, with the `auth` and `core` schemas
  - the `wasla_ai` database, with pgvector
  - the DB users and their access rules

  Passwords come from `.env`. To run it again, delete the volume with `docker compose down -v`. It must stay executable (mode 755): Docker Desktop on macOS otherwise fails to run it.
- `Dockerfile`: image for the one-off `migrate` service, which runs `prisma migrate deploy` as `wasla_migrator`. The `seed` service reuses it to load the demo data. It installs only the root package's dependencies.
