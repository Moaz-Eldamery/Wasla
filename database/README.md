# Database

Everything about the database. See `schema.md` for the databases, schemas, DB users and tables.

## Files

- `init.sh`: runs once, when Postgres starts on an empty volume. It creates:
  - the `wasla_clinical` database, with the `auth` and `core` schemas
  - the `wasla_ai` database, with pgvector
  - the DB users and their access rules

  Passwords come from `.env`. To run it again, delete the volume with `docker compose down -v`.
