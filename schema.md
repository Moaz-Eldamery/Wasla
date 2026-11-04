# Database schema

The source of truth for the database. If a table or column isn't listed here, it doesn't exist yet.

- PostgreSQL 16 with pgvector, managed with Prisma.
- The Prisma schema for the clinical database lives at `database/clinical/schema.prisma`. This file must always match it.
- The AI database (`wasla_ai`) is migrated from `database/ai/`.
- Databases, schemas and DB users are created by `database/init.sh`.
- Update this file in the same change as any migration.

## Databases, schemas and who can access them

One Postgres server, two databases. Each service connects with its own DB user, and the database itself blocks anything outside these grants.

| Database | Schema | Holds | DB users with access |
|---|---|---|---|
| `wasla_clinical` | `auth` | Accounts (patients and staff), password hashes, sessions, OTP codes | `wasla_auth`: read/write. `wasla_core`: read-only on the account table (id, name, phone, roles, active); **no access** to password hashes, sessions or OTP codes |
| `wasla_clinical` | `core` | Appointments, slots, queue, visits, notes, tests, results, notifications, journey, audit log, outbox | `wasla_core`: read/write (audit log: insert and read only). `wasla_auth`: insert-only on the audit log, so login events go into the same log |
| `wasla_ai` | `public` | Knowledge-base entries and embeddings, queue history for the wait model, model versions, AI output log. **De-identified data only** | `wasla_ai`: read/write. No other user. The AI service has **no** user on `wasla_clinical` |

Tables in `core` may reference `auth` tables with foreign keys (same database), so an appointment can't point to a patient that doesn't exist.

## Tables

_No tables yet. The first ones are added by the "Agree on the API for all features" card (KAN-4)._

<!--
Format for each table:

### schema.TableName
What it stores, in one line.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |

Indexes / constraints:
- ...

Relations:
- ...
-->

## Enums

_None yet._
