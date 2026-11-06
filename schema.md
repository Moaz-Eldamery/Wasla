# Database schema

The source of truth for the database. If a table or column isn't listed here, it doesn't exist yet.

- PostgreSQL 16 with pgvector, managed with Prisma.
- The Prisma schema for the clinical database lives at `database/clinical/schema.prisma`. This file must always match it.
- The AI database (`wasla_ai`) is migrated from `database/ai/` with its own Prisma config and migration history, separate from Clinical.
- Databases, schemas and DB users are created by `database/init.sh`.
- Update this file in the same change as any migration.
- Clinical migrations live in `database/clinical/migrations/` and run as `wasla_migrator`: the `migrate` service applies them on `docker compose up`, or run `pnpm db:migrate` with `MIGRATOR_DATABASE_URL` set. AI migrations live in `database/ai/migrations/` and use `AI_MIGRATOR_DATABASE_URL` via the separate `ai-migrate` service or `pnpm db:ai:migrate`. Each database has its own Prisma `_prisma_migrations` table in `public`.

## Databases, schemas and who can access them

One Postgres server, two databases. Each service connects with its own DB user, and the database itself blocks anything outside these grants.

| Database | Schema | Holds | DB users with access |
|---|---|---|---|
| `wasla_clinical` | `auth` | Accounts (patients and staff), password hashes, sessions, OTP codes | `wasla_auth`: read/write. `wasla_core`: read-only on `auth.accounts` (id, type, name, phone, roles, active) plus `REFERENCES` for foreign keys; **no access** to password hashes, sessions or OTP codes |
| `wasla_clinical` | `core` | Appointments, slots, queue, visits, notes, tests, results, notifications, journey, audit log, outbox | `wasla_core`: read/write (audit log: insert and read only). `wasla_auth`: insert-only on the audit log, so login events go into the same log |
| `wasla_ai` | `public` | Knowledge-base entries and embeddings, queue history for the wait model, model versions, AI output log. **De-identified data only** | `wasla_ai`: schema usage and per-object runtime privileges; `wasla_migrator`: migration access only. The AI service has **no** user on `wasla_clinical` |

Tables in `core` may reference `auth` tables with foreign keys (same database), so an appointment can't point to a patient that doesn't exist.

### DB users (created by `database/init.sh`)

| User | Used by | Can do |
|---|---|---|
| `wasla_migrator` | Prisma migrations for `wasla_clinical` and `wasla_ai`, never a running service | Owns `wasla_clinical` and the `auth` and `core` schemas, so it owns every Clinical table it creates. In `wasla_ai`, has `CONNECT` and `USAGE, CREATE` on `public`; AI application migrations grant `wasla_ai` object-specific runtime access. It does not own the AI database or manage extensions. Can create databases (Prisma's Clinical shadow database) |
| `wasla_auth` | auth service | Connects to `wasla_clinical`. Read/write on every table in `auth`. Sees the `core` schema but no table, except what a migration grants |
| `wasla_core` | core service | Connects to `wasla_clinical`. Read/write on every table in `core`. Sees the `auth` schema but no table, except what a migration grants |
| `wasla_ai` | AI service | Owns `wasla_ai`; has `USAGE` on `public` and only the table/sequence privileges explicitly granted by AI application migrations. It does not run migrations and can't connect to `wasla_clinical` |

- **Default rights:** `init.sh` sets default privileges, so every table the migrator creates in `auth` is read/write for `wasla_auth`, and every table in `core` is read/write for `wasla_core`. AI tables receive no schema-wide runtime defaults; each AI application migration grants only the required access to `wasla_ai`. Its Prisma migration log is excluded. Nobody else gets access by default.
- **Rights that go further** come from the migration that creates the table:
  - `auth.accounts`: `GRANT SELECT (id, type, name, phone, roles, active)` and `GRANT REFERENCES (id)` to `wasla_core`
  - `core.audit_log`: `GRANT INSERT` on the table and `USAGE` on its id sequence to `wasla_auth`, and `REVOKE UPDATE, DELETE, TRUNCATE` from `wasla_core`. A trigger also refuses those three for everyone (see "Raw SQL in the first migration")
- **Locked down:** the `public` schema of `wasla_clinical` is closed to everyone, and so is the `postgres` database.
- **Extensions:** `wasla_ai` has the `vector` extension (pgvector).

## Conventions

- Table and column names are `snake_case` in the database. The Prisma models use `PascalCase` and `camelCase` names mapped to them.
- IDs are `uuid`, except `core.audit_log` (`bigint`, auto-increment) and `core.journey_stages` (keyed by stage code).
- Every time column is `timestamptz(3)`, stored in UTC.
- Bilingual text is two columns, `*_ar` and `*_en`.

## Tables

### auth.accounts
Every patient and staff account.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| type | AccountType | no | `PATIENT` or `STAFF` |
| name | text | no | |
| phone | text | no | unique; login identifier for everyone (E.164, e.g. `+201000000001`) |
| password_hash | text | no | argon2. Only `wasla_auth` can read it |
| roles | StaffRole[] | no | empty for patients |
| active | boolean | no | default `true`. `false` = can't log in; sessions are revoked |
| phone_verified_at | timestamptz | yes | patients can't log in until set. Staff accounts are created verified |
| created_at | timestamptz | no | default now |
| updated_at | timestamptz | no | |

Indexes / constraints:
- unique `phone`
- check: patients have no roles (raw SQL)

### auth.sessions
Login sessions. The client holds the token; only its hash is stored.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| account_id | uuid | no | → `auth.accounts.id`, cascade delete |
| token_hash | text | no | unique; SHA-256 of the session token |
| created_at | timestamptz | no | default now |
| last_seen_at | timestamptz | no | updated by the auth check |
| expires_at | timestamptz | no | |
| revoked_at | timestamptz | yes | set on logout or deactivation |

Indexes: unique `token_hash`; `account_id`.

### auth.otp_codes
Phone verification codes. Rate limits for sending and checking codes are counted from this table.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| account_id | uuid | no | → `auth.accounts.id`, cascade delete |
| purpose | OtpPurpose | no | |
| code_hash | text | no | the 6-digit code is never stored in plain text |
| attempts | int | no | default 0; wrong guesses on this code |
| created_at | timestamptz | no | default now |
| expires_at | timestamptz | no | |
| consumed_at | timestamptz | yes | set when the code is used |

Indexes: (`account_id`, `purpose`, `created_at`).

### core.departments
Hospital departments. Clinical ones are booked; lab and radiology ones receive tests.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| kind | DepartmentKind | no | |
| name_ar | text | no | |
| name_en | text | no | |
| active | boolean | no | default `true`. Inactive = hidden from booking; old appointments still show it |
| created_at | timestamptz | no | default now |

### core.clinics
A place in a department where patients go: a clinic room, the lab, a radiology room.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| department_id | uuid | no | → `core.departments.id` |
| name_ar | text | no | |
| name_en | text | no | |
| building | text | no | |
| floor | text | no | |
| directions_ar | text | no | |
| directions_en | text | no | |
| active | boolean | no | default `true` |
| created_at | timestamptz | no | default now |

Indexes: `department_id`.

### core.staff_clinics
Which clinics each staff member works in (doctors, receptionists, lab staff). Set by an admin.

| Column | Type | Null | Notes |
|---|---|---|---|
| staff_id | uuid | no | → `auth.accounts.id` |
| clinic_id | uuid | no | → `core.clinics.id` |
| assigned_at | timestamptz | no | default now |

Indexes / constraints: primary key (`staff_id`, `clinic_id`); `clinic_id`.

### core.slots
A doctor's bookable time in a clinic. Each slot has its own start and end, so slot length isn't fixed.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| doctor_id | uuid | no | → `auth.accounts.id` |
| clinic_id | uuid | no | → `core.clinics.id` |
| starts_at | timestamptz | no | |
| ends_at | timestamptz | no | |
| status | SlotStatus | no | default `OPEN` |
| created_at | timestamptz | no | default now |

Indexes / constraints:
- unique (`doctor_id`, `starts_at`)
- (`clinic_id`, `starts_at`)
- check `ends_at > starts_at` (raw SQL)

A slot is **free** when it is `OPEN`, starts in the future, and has no active appointment.

### core.appointments
A patient's booking of a slot, and the visit that follows. There is no queue table: a doctor's queue in a clinic is the `CHECKED_IN` appointments whose slot has that doctor and clinic, ordered by `checked_in_at` (then `id`, to break ties).

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| patient_id | uuid | no | → `auth.accounts.id` |
| slot_id | uuid | no | → `core.slots.id` |
| status | AppointmentStatus | no | default `BOOKED`. Allowed moves are in `business.md` |
| booked_at | timestamptz | no | default now |
| checked_in_at | timestamptz | yes | |
| started_at | timestamptz | yes | when the doctor called the patient in |
| completed_at | timestamptz | yes | |
| cancelled_at | timestamptz | yes | |
| cancel_reason | text | yes | |
| no_show_reason | text | yes | |
| updated_at | timestamptz | no | |

Indexes / constraints:
- `patient_id`; `slot_id`; (`status`, `checked_in_at`)
- **unique `slot_id` where `status <> 'CANCELLED'`** (raw SQL): one active booking per slot, enforced by the database

### core.visit_note_versions
Every saved version of a visit's notes. Never updated: each edit inserts the next version.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| appointment_id | uuid | no | → `core.appointments.id` |
| version | int | no | 1, 2, 3… |
| clinical_notes | text | no | doctor only |
| patient_summary | text | yes | what the patient sees once the visit is completed |
| author_id | uuid | no | → `auth.accounts.id` |
| created_at | timestamptz | no | default now |

Indexes / constraints: unique (`appointment_id`, `version`).

### core.test_orders
A lab or radiology test a doctor ordered during a visit.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| appointment_id | uuid | no | → `core.appointments.id` |
| clinic_id | uuid | no | → `core.clinics.id`; a clinic of a `LAB` or `RADIOLOGY` department |
| test_name | text | no | |
| instructions | text | yes | |
| status | TestStatus | no | default `REQUESTED` |
| ordered_by_id | uuid | no | → `auth.accounts.id` |
| ordered_at | timestamptz | no | default now |
| started_at | timestamptz | yes | |
| released_at | timestamptz | yes | |
| released_by_id | uuid | yes | → `auth.accounts.id` |

Indexes: `appointment_id`; (`clinic_id`, `status`).

### core.test_result_files
The uploaded result file for a test. The file itself is in the private MinIO bucket.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| test_order_id | uuid | no | unique; → `core.test_orders.id` |
| storage_key | text | no | unique; MinIO object key |
| file_name | text | no | |
| content_type | text | no | `application/pdf`, `image/jpeg` or `image/png` (raw SQL check) |
| size_bytes | int | no | 1 to 10 485 760 (raw SQL check) |
| uploaded_by_id | uuid | no | → `auth.accounts.id` |
| uploaded_at | timestamptz | no | default now |

### core.journey_stages
What the patient sees at each stage of a visit. Data, not code: change the text here, not in the apps. Seeded by migration `20261106083500_journey_stages` with all six stages (`BOOKED`, `CHECKED_IN`, `WITH_DOCTOR`, `TEST_ORDERED`, `RESULT_READY`, `DONE`).

| Column | Type | Null | Notes |
|---|---|---|---|
| code | JourneyStageCode | no | primary key |
| sort_order | int | no | |
| title_ar | text | no | |
| title_en | text | no | |
| next_step_ar | text | no | |
| next_step_en | text | no | |
| location | JourneyLocation | no | where the "go here" location comes from |

### core.audit_log
Who did what, when. Append-only.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | bigint | no | primary key, auto-increment |
| occurred_at | timestamptz | no | default now |
| actor_id | uuid | yes | → `auth.accounts.id`; null when unknown (e.g. failed login for an unknown phone) |
| actor_type | AccountType | yes | |
| action | text | no | dotted name, e.g. `auth.login`, `appointment.book`, `result.download` |
| entity_type | text | yes | e.g. `appointment`, `test_order` |
| entity_id | text | yes | |
| outcome | AuditOutcome | no | |
| ip | text | yes | |
| details | jsonb | yes | extra context. No names, phone numbers or medical content |

Indexes: `occurred_at`; (`actor_id`, `occurred_at`); (`entity_type`, `entity_id`).

Constraints: a trigger refuses every `UPDATE`, `DELETE` and `TRUNCATE` (raw SQL), on top of the grants.

### public.knowledge_base_entries
Approved de-identified hospital information used by the admin chatbot. `source_id` preserves the stable source-file ID so imports are idempotent. Removed source entries are marked inactive by a subsequent sync rather than physically deleted.

| Column | Type | Null | Notes |
|---|---|---|---|
| id | uuid | no | primary key |
| source_id | varchar(64) | no | unique stable ID from the source dataset |
| slug | varchar(128) | no | unique source slug |
| category | varchar(64) | no | |
| title_en, title_ar | text | no | bilingual titles |
| content_en, content_ar | text | no | bilingual content |
| data_type | varchar(64) | no | e.g. `synthetic_demo` |
| is_active | boolean | no | default `true`; inactive entries are excluded from retrieval |
| created_at, updated_at | timestamptz(3) | no | UTC; defaults to now |

Indexes: unique `source_id`; unique `slug`; `category`.

### public.knowledge_base_embeddings
One normalized Gemini document vector per active source entry and language. The model and source-content hash allow safe refreshes after content or model changes.

| Column | Type | Null | Notes |
|---|---|---|---|
| entry_id | uuid | no | primary key part; foreign key to `public.knowledge_base_entries.id`, cascade delete |
| language | varchar(2) | no | primary key part; `en` or `ar` |
| model | varchar(128) | no | currently `gemini-embedding-2` |
| content_hash | char(64) | no | SHA-256 of model, language, title and content |
| embedding | vector(1536) | no | pgvector; HNSW cosine index |
| created_at, updated_at | timestamptz(3) | no | UTC; defaults to now |

Indexes: primary key (`entry_id`, `language`); HNSW cosine similarity on `embedding`.

The `wasla_ai` runtime role has `SELECT`, `INSERT`, and `UPDATE` on these two tables only. It has no delete privilege and cannot access `_prisma_migrations`.

## Enums

| Enum | Schema | Values |
|---|---|---|
| AccountType | auth | `PATIENT`, `STAFF` |
| StaffRole | auth | `RECEPTIONIST`, `DOCTOR`, `LAB`, `ADMIN` |
| OtpPurpose | auth | `PHONE_VERIFICATION` |
| DepartmentKind | core | `CLINICAL`, `LAB`, `RADIOLOGY` |
| SlotStatus | core | `OPEN`, `BLOCKED`, `CANCELLED` |
| AppointmentStatus | core | `BOOKED`, `CHECKED_IN`, `IN_CONSULTATION`, `COMPLETED`, `CANCELLED`, `NO_SHOW` |
| TestStatus | core | `REQUESTED`, `IN_PROGRESS`, `AWAITING_REVIEW`, `RELEASED` |
| JourneyStageCode | core | `BOOKED`, `CHECKED_IN`, `WITH_DOCTOR`, `TEST_ORDERED`, `RESULT_READY`, `DONE` |
| JourneyLocation | core | `APPOINTMENT_CLINIC`, `TEST_CLINIC`, `NONE` |
| AuditOutcome | core | `SUCCESS`, `DENIED`, `FAILED` |

## Raw SQL in the first migration

Prisma can't express these, so they are written by hand at the end of `database/clinical/migrations/20261105121531_init/migration.sql`:

1. `CREATE UNIQUE INDEX appointments_one_active_per_slot ON core.appointments (slot_id) WHERE status <> 'CANCELLED';`
2. Check on `core.slots`: `ends_at > starts_at`.
3. Checks on `core.test_result_files`: `size_bytes BETWEEN 1 AND 10485760`, and `content_type IN ('application/pdf', 'image/jpeg', 'image/png')`.
4. Check on `auth.accounts`: `type = 'STAFF' OR roles = '{}'`.
5. A trigger on `core.audit_log` that raises an error on `UPDATE`, `DELETE` and `TRUNCATE`.
6. The grants listed under "DB users" above, under "Rights that go further".

## Not drafted yet

These are in the access table but belong to later cards: notifications (KAN-38) and the outbox (`core.outbox_events`, KAN-27).
