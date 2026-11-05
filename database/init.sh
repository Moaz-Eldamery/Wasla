#!/bin/bash
# Runs once, when Postgres starts on an empty data volume (mounted into
# /docker-entrypoint-initdb.d by docker-compose.yml). Creates the databases,
# the auth + core schemas and one DB user per service. The access rules are in
# schema.md. To run it again, delete the volume: docker compose down -v
set -euo pipefail

: "${MIGRATOR_DB_PASSWORD:?MIGRATOR_DB_PASSWORD is not set}"
: "${AUTH_DB_PASSWORD:?AUTH_DB_PASSWORD is not set}"
: "${CORE_DB_PASSWORD:?CORE_DB_PASSWORD is not set}"
: "${AI_DB_PASSWORD:?AI_DB_PASSWORD is not set}"

run_sql() {
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" \
    -v migrator_pw="$MIGRATOR_DB_PASSWORD" \
    -v auth_pw="$AUTH_DB_PASSWORD" \
    -v core_pw="$CORE_DB_PASSWORD" \
    -v ai_pw="$AI_DB_PASSWORD" \
    "$@"
}

# Users and databases.
run_sql --dbname postgres <<'SQL'
-- Runs the Prisma migrations for wasla_clinical and owns its tables.
-- No service connects as this user at runtime.
CREATE ROLE wasla_migrator LOGIN CREATEDB PASSWORD :'migrator_pw';
CREATE ROLE wasla_auth LOGIN PASSWORD :'auth_pw';
CREATE ROLE wasla_core LOGIN PASSWORD :'core_pw';
CREATE ROLE wasla_ai LOGIN PASSWORD :'ai_pw';

CREATE DATABASE wasla_clinical OWNER wasla_migrator;
CREATE DATABASE wasla_ai OWNER wasla_ai;

-- Nobody connects to a database they weren't given.
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
REVOKE ALL ON DATABASE wasla_clinical FROM PUBLIC;
REVOKE ALL ON DATABASE wasla_ai FROM PUBLIC;
GRANT CONNECT ON DATABASE wasla_clinical TO wasla_auth, wasla_core;
-- wasla_ai owns wasla_ai, so it can connect; nobody else can.
SQL

# wasla_clinical: the auth and core schemas.
run_sql --dbname wasla_clinical <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA auth AUTHORIZATION wasla_migrator;
CREATE SCHEMA core AUTHORIZATION wasla_migrator;

-- auth: wasla_auth reads and writes every table. wasla_core can see the
-- schema but gets no table by default; the migration that creates the account
-- table grants it SELECT on (id, name, phone, roles, active) only.
GRANT USAGE ON SCHEMA auth TO wasla_auth, wasla_core;
ALTER DEFAULT PRIVILEGES FOR ROLE wasla_migrator IN SCHEMA auth
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wasla_auth;
ALTER DEFAULT PRIVILEGES FOR ROLE wasla_migrator IN SCHEMA auth
  GRANT USAGE, SELECT ON SEQUENCES TO wasla_auth;

-- core: wasla_core reads and writes every table. wasla_auth can see the
-- schema but gets no table by default; the migration that creates the audit
-- log grants it INSERT there, and revokes UPDATE and DELETE from wasla_core.
GRANT USAGE ON SCHEMA core TO wasla_core, wasla_auth;
ALTER DEFAULT PRIVILEGES FOR ROLE wasla_migrator IN SCHEMA core
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO wasla_core;
ALTER DEFAULT PRIVILEGES FOR ROLE wasla_migrator IN SCHEMA core
  GRANT USAGE, SELECT ON SEQUENCES TO wasla_core;
SQL

# wasla_ai: only the AI service's user, which owns it and runs its migrations.
run_sql --dbname wasla_ai <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS vector;
SQL
