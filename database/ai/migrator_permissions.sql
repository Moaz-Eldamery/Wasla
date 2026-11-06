-- Provision least-privilege Prisma migration access to wasla_ai.
-- Run as a PostgreSQL administrator, connected to the postgres database.
GRANT CONNECT ON DATABASE wasla_ai TO wasla_migrator;

\connect wasla_ai

-- Do not let the database owner implicitly control public through
-- pg_database_owner. The administrator retains the schema and extension;
-- migrations create application objects as wasla_migrator.
ALTER SCHEMA public OWNER TO postgres;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM wasla_ai;
GRANT USAGE ON SCHEMA public TO wasla_ai;
GRANT USAGE, CREATE ON SCHEMA public TO wasla_migrator;

-- Remove the previous blanket runtime grants. Each AI application migration
-- must grant wasla_ai only the operations needed on its specific objects.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM wasla_ai;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM wasla_ai;

-- The application has no reason to inspect or change Prisma's migration log.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public._prisma_migrations FROM wasla_ai';
  END IF;
END
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE wasla_migrator IN SCHEMA public
  REVOKE ALL ON TABLES FROM wasla_ai;
ALTER DEFAULT PRIVILEGES FOR ROLE wasla_migrator IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM wasla_ai;
