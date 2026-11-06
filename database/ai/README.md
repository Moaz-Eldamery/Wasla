# AI database (wasla_ai)

Schema and migrations for `wasla_ai`, the AI Data Store: knowledge base and embeddings, wait-model history, model versions, AI output log.

**Rule:** De-identified data only. No names, phones or patient IDs.

## Files

- `schema.prisma`: Prisma schema for `wasla_ai`, separate from the Clinical database.
- `prisma.config.ts`: points Prisma to this schema and the `migrations/` directory and uses `AI_MIGRATOR_DATABASE_URL`.
- `migrations/`: independent Prisma migration history for `wasla_ai`; never reuse `database/clinical/migrations/`.
- `migrator_permissions.sql`: idempotent provisioning for fresh and existing Postgres volumes. It keeps `wasla_ai` as database owner, assigns the `public` schema to `postgres`, grants `wasla_migrator` `CONNECT` on `wasla_ai` and `USAGE, CREATE` on `public`, and gives `wasla_ai` only `USAGE` on `public`. It removes broad current and default table/sequence grants; application migrations grant the runtime role only the privileges needed on each specific object. Prisma's migration log is excluded.

Prisma migrations run through the `ai-migrate` Compose service or `pnpm db:ai:migrate`, using the existing `wasla_migrator` role and `AI_MIGRATOR_DATABASE_URL`. The AI application continues connecting as `wasla_ai` through `DATABASE_URL`; it does not run migrations. The Clinical migration command and history remain separate.

For an existing Postgres volume, first start only Postgres so the script is mounted, apply the permission script once, then start the full stack:

```powershell
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f /etc/wasla/ai-migrator-permissions.sql
```

The migration history table is explicitly kept inaccessible to `wasla_ai` by the first AI migration. Runtime table and sequence privileges belong in the migration that creates each application object; do not add schema-wide default DML grants.

The KAN-21 knowledge-base migration creates `knowledge_base_entries` and `knowledge_base_embeddings` and grants the runtime role only `SELECT`, `INSERT`, and `UPDATE` on those tables. The follow-up Gemini migration makes the final vector column 1536-dimensional for `gemini-embedding-2`. It clears old derived vectors because embedding spaces are incompatible; source entries remain and the explicit sync command regenerates the vectors. The pgvector extension is provisioned by `database/init.sh`; migrations do not install extensions.

After applying AI migrations and setting `GEMINI_API_KEY`, synchronize the bundled CSV/JSON sample explicitly from the AI container:

```powershell
docker compose exec ai python -m app.admin_chatbot.sync_knowledge_base
```

The command validates both bundled exports, upserts active entries, and regenerates only missing or changed English/Arabic document embeddings. It uses `DATABASE_URL` as `wasla_ai` and does not run during service startup. The configured model and output dimension are fixed to `gemini-embedding-2` and `1536`; mismatched environment values cause an explicit error before embeddings are requested.

The script is safe to reapply. It does not change Clinical database permissions or grant database ownership, superuser, or extension-management privileges to `wasla_migrator`.
