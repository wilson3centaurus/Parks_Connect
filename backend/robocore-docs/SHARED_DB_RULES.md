# Shared Self-Hosted Supabase VPS — Database Rules & Conventions

> **MANDATORY READING** before writing any SQL migration, schema change, PostgREST config, or server-level command.  
> This server hosts **multiple projects simultaneously** on a single PostgreSQL instance. A wrong command in one project's migration can instantly break all other projects. This has already happened once — see [`docs/incidents/2026-05-26-postgrest-schema-corruption.md`](incidents/2026-05-26-postgrest-schema-corruption.md).

---

## 1. Server Overview

| Item | Value |
| --- | --- |
| Server | Contabo VPS — `root@vmi3263043` — `178.238.227.229` |
| OS | Ubuntu 24.04 LTS |
| PostgreSQL | 15.8 — Docker container `supabase-db` |
| PostgREST | v14.8 — Docker container `supabase-rest` |
| Kong API Gateway | Docker container `supabase-kong`, host port `8000` |
| Self-hosted API URL | `https://api.robokorda.duckdns.org` |
| Docker Compose | `/root/supabase/docker/docker-compose.yml` |
| Docker Compose env | `/root/supabase/docker/.env` |

All projects on this server share **one PostgreSQL instance**, **one PostgREST process**, **one Kong gateway**, and **one `authenticator` PostgreSQL role**. There is no isolation between projects at the infrastructure level. Every global configuration change affects all projects.

---

## 2. Registered Projects and Their Schemas

Every project on this server lives in its own PostgreSQL schema. The list below is the canonical schema inventory. **Update this table whenever a new project is added.**

| Schema | Project | Status |
| --- | --- | --- |
| `public` | Supabase internal (auth helpers, extensions) | System — do not create tables here |
| `storage` | Supabase Storage service | System — do not modify |
| `graphql_public` | Supabase GraphQL | System — do not modify |
| `robocore` | RoboCore school management system | Active |
| `robokorda` | Robokorda website / Africa platform | Active |
| `aura` | Aura project | Active |
| `smartschools` | SmartSchools project | Active |
| `azim_motors` | Azim Motors workshop management | Active |
| `icecream_erp` | Absolute Ice Cream Manufacturing ERP | Active |

The full canonical `pgrst.db_schemas` value (what PostgREST must be told about) is:

```text
public,storage,graphql_public,robocore,robokorda,aura,smartschools,azim_motors,icecream_erp
```

If you add a new schema, append it to this list. **Never replace this list with only your schema.**

---

## 3. The Golden Rules

### Rule 1: Every project gets its own schema — never touch `public`

```sql
-- CORRECT
CREATE SCHEMA your_project;
CREATE TABLE your_project.users (...);

-- WRONG — pollutes the shared public schema
CREATE TABLE public.users (...);
```

The `public` schema is reserved for Supabase internals (the `auth` schema is also Supabase-internal). Never create application tables in `public` or `auth`.

---

### Rule 2: NEVER use bare `ALTER ROLE authenticator SET pgrst.db_schemas`

This is the most dangerous thing you can do on this server. It is the mistake that caused the May 2026 incident.

```sql
-- ❌ WRONG — THIS DESTROYS ALL OTHER PROJECTS
ALTER ROLE authenticator SET pgrst.db_schemas TO 'public,your_schema';

-- ❌ ALSO WRONG — same issue, underscore vs dot variant
ALTER ROLE authenticator SET "pgrst.db_schemas" TO 'public,your_schema';
```

The `authenticator` role is **shared by every project**. `ALTER ROLE ... SET` replaces the entire value. If you write `'public,your_schema'` it wipes `robocore`, `robokorda`, `aura`, `smartschools`, `azim_motors`, `storage`, and `graphql_public` from PostgREST's visibility. Every other project will return `PGRST106: Invalid schema` on every API call. All their users will be instantly locked out.

**The correct way to add your schema to PostgREST** is:

```sql
-- ✅ CORRECT — additive, reads the current list first
DO $$
DECLARE
  v_current text;
  v_schema  text := 'your_new_schema';  -- ← only change this
BEGIN
  -- Read whatever is already configured in the DB
  SELECT split_part(cfg, '=', 2) INTO v_current
  FROM pg_roles, unnest(rolconfig) AS cfg
  WHERE rolname = 'authenticator'
    AND cfg LIKE 'pgrst.db_schemas=%';

  -- If nothing is configured yet, start from the known canonical list
  IF v_current IS NULL OR v_current = '' THEN
    v_current := 'public,storage,graphql_public,robocore,robokorda,aura,smartschools,azim_motors';
  END IF;

  -- Only add if not already present
  IF position(v_schema IN v_current) = 0 THEN
    EXECUTE format(
      'ALTER ROLE authenticator SET "pgrst.db_schemas" TO %L',
      v_current || ',' || v_schema
    );
    RAISE NOTICE 'pgrst.db_schemas updated to: %', v_current || ',' || v_schema;
    NOTIFY pgrst;
  ELSE
    RAISE NOTICE 'Schema % already in pgrst.db_schemas — no change needed', v_schema;
  END IF;
END $$;
```

---

### Rule 3: NEVER use bare `ALTER ROLE authenticator SET search_path`

Same danger as Rule 2. The `search_path` GUC on the `authenticator` role is also shared across all projects. If you set it to only your schema, every other project's DB queries will start resolving to the wrong schema.

```sql
-- ❌ WRONG
ALTER ROLE authenticator SET search_path TO 'your_schema,public,extensions';

-- ✅ CORRECT — only set search_path on your own application roles
CREATE ROLE your_schema_api;
ALTER ROLE your_schema_api SET search_path TO 'your_schema,public,extensions';
```

Never alter the `authenticator`, `anon`, or `authenticated` roles' `search_path` unless you are explicitly adding your schema to the existing list (same read-modify-write pattern as Rule 2).

---

### Rule 4: PostgREST in-database config overrides env vars — always

PostgREST v12+ reads configuration from two sources:

| Source | Where set | Precedence |
| --- | --- | --- |
| Environment variables (`PGRST_DB_SCHEMAS`, etc.) | `docker-compose.yml` / `.env` | **Lower — overridden by DB** |
| PostgreSQL role GUCs (`pg_roles.rolconfig`) | `ALTER ROLE authenticator SET ...` | **Higher — wins always** |

This means even if `docker-compose.yml` has the correct `PGRST_DB_SCHEMAS`, if there is an `ALTER ROLE authenticator SET "pgrst.db_schemas"` in the DB catalog, that value wins. Container restarts, `docker compose down && up`, `docker stop && rm && up` — none of them fix this. The only fix is another `ALTER ROLE` or `ALTER ROLE authenticator RESET "pgrst.db_schemas"`.

**To diagnose what PostgREST is actually using:**

```bash
docker exec supabase-db psql -U postgres -c \
  "SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';"
```

Do not trust `docker inspect` or `docker-compose.yml` as ground truth. The DB catalog is the truth.

---

### Rule 5: Schema names must be unique across the entire server

Before creating a new schema, check what schemas already exist:

```bash
docker exec supabase-db psql -U postgres -c \
  "SELECT nspname FROM pg_catalog.pg_namespace ORDER BY nspname;"
```

If someone already registered `inventory` or `hr` for a different project, you cannot use that name. Pick a project-specific name (e.g., `tenant_hr`, `acme_inventory`).

---

### Rule 6: Grant only to your schema — never re-grant on system schemas

```sql
-- ✅ CORRECT — grants scoped to your schema only
GRANT USAGE ON SCHEMA your_schema TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA your_schema TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA your_schema TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA your_schema TO authenticated;

-- ❌ WRONG — this affects all projects
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

-- ❌ WRONG — this is Supabase-internal and will break auth for everyone
REVOKE ALL ON SCHEMA auth FROM authenticated;
```

---

### Rule 7: RLS must be enabled on every table

Row Level Security is mandatory. Without it, any `anon` or `authenticated` API request can read any row in your table.

```sql
ALTER TABLE your_schema.your_table ENABLE ROW LEVEL SECURITY;

-- Example policy — adapt to your auth model
CREATE POLICY "service_role_full_access"
  ON your_schema.your_table
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

If you are using a custom auth model (not Supabase Auth with `auth.uid()`), you still need policies that limit `anon` access. At minimum:

```sql
-- Block all anon access
CREATE POLICY "deny_anon"
  ON your_schema.your_table
  FOR ALL
  TO anon
  USING (false);
```

---

### Rule 8: Functions must specify their schema explicitly

Never create functions in `public` unless they are genuinely cross-schema utilities. Always prefix:

```sql
-- ✅
CREATE FUNCTION your_schema.calculate_total(...) ...;

-- ❌ — goes into public, may conflict with other project functions
CREATE FUNCTION calculate_total(...) ...;
```

Any `SECURITY DEFINER` function that runs with elevated privileges is especially dangerous in `public`.

---

### Rule 9: Never run `docker compose down -v` on this server

The `-v` flag destroys Docker named volumes. The Supabase stack uses named volumes for PostgreSQL data, storage files, and other state. Running `docker compose down -v` will permanently delete all data from every project on the server. There is no confirmation prompt.

Safe commands:

```bash
# ✅ Stop containers — data safe
docker compose down

# ✅ Restart a specific service
docker compose restart rest

# ✅ Recreate a single container (not the DB)
docker compose up -d --force-recreate rest

# ❌ DESTROYS ALL DATA — never run
docker compose down -v
```

---

### Rule 10: Never run DDL on other projects' schemas

Even if you can see another schema's tables (because PostgREST exposes them and `service_role` can access everything), you must not `ALTER`, `DROP`, `TRUNCATE`, or `INSERT` into tables that belong to another project.

```sql
-- ❌ FORBIDDEN — modifying another project's data
DELETE FROM robocore.users WHERE email = 'test@example.com';
ALTER TABLE azim_motors.profiles ADD COLUMN foo text;
DROP TABLE robokorda.posts;
```

If two projects need shared data (e.g., a shared `organisations` table), design a dedicated shared schema for it and coordinate with the other project owner.

---

## 4. PostgREST Configuration Reference

### How PostgREST serves schemas

PostgREST exposes schemas via the `Accept-Profile` HTTP header. A client sets `Accept-Profile: robocore` to query the `robocore` schema, `Accept-Profile: azim_motors` for the Azim Motors schema, etc.

The schema must be listed in `pgrst.db_schemas` on the `authenticator` role (or `PGRST_DB_SCHEMAS` env var, but the role config takes precedence if set).

### Changing the schema list safely

```bash
# 1. Read current value
docker exec supabase-db psql -U postgres -c \
  "SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';"

# 2. Apply updated list (example: adding 'new_project')
docker exec supabase-db psql -U postgres -c "
  ALTER ROLE authenticator
    SET \"pgrst.db_schemas\"
    TO 'public,storage,graphql_public,robocore,robokorda,aura,smartschools,azim_motors,new_project';
  NOTIFY pgrst;
"

# 3. Verify (no container restart needed)
sleep 2
curl -s -o /dev/null -w '%{http_code}' \
  -H 'Accept-Profile: new_project' \
  -H 'apikey: <anon-key>' \
  'http://localhost:8000/rest/v1/<any-table-in-new-schema>?select=id&limit=1'
# Expected: 200 (or 404 if table doesn't exist, but NOT 406 PGRST106)
```

### NOTIFY pgrst

After any `ALTER ROLE authenticator SET ...` change, you must run `NOTIFY pgrst;` to signal PostgREST to reload its in-database config. This takes effect within ~1–2 seconds without any container restart.

```sql
NOTIFY pgrst;
-- or the two-signal variant used in some docs:
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
```

---

## 5. New Project Checklist

Follow this checklist in order when setting up a new project on this server.

### Step 1 — Register the schema name

Check `pg_namespace` for conflicts (see Rule 5). Pick a unique name. Add it to the table in Section 2 of this document.

### Step 2 — Create the schema and tables

```sql
CREATE SCHEMA your_schema;

-- Tables, types, enums, functions — all prefixed with your_schema.
CREATE TABLE your_schema.some_table (...);
```

### Step 3 — Enable RLS on all tables (see Rule 7)

```sql
ALTER TABLE your_schema.some_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "..." ON your_schema.some_table FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Add appropriate policies for anon, authenticated
```

### Step 4 — Grant schema access (see Rule 6)

```sql
GRANT USAGE ON SCHEMA your_schema TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA your_schema TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA your_schema TO service_role;
```

### Step 5 — Add your schema to PostgREST using the safe DO block (see Rule 2)

Copy the DO block from Rule 2, set `v_schema := 'your_schema'`, and run it.

### Step 6 — Verify PostgREST serves your schema

```bash
curl -s -o /dev/null -w '%{http_code}' \
  -H 'Accept-Profile: your_schema' \
  -H 'apikey: <anon-key>' \
  'http://localhost:8000/rest/v1/your_table?select=id&limit=1'
# Must be 200 or 404 — NOT 406
```

### Step 7 — Verify all other projects still work

Test at least one authenticated endpoint for each active project (robocore, azim_motors, etc.) to confirm they were not affected.

### Step 8 — Update this document

Add the new schema to the table in Section 2 and update the canonical `pgrst.db_schemas` string.

---

## 6. Supabase Client Configuration (SDK)

When initialising the Supabase JS/TS client for a project on this server, always specify the `db.schema` option:

```ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: 'your_schema',   // ← your project's schema
  },
})
```

Without this, the SDK defaults to `public`, and all queries will hit the wrong schema.

For projects using Supabase SSR (Next.js server clients), apply the same to all client factories:

```ts
// server.ts
createServerClient(url, key, {
  db: { schema: 'your_schema' },
  cookies: { ... },
})

// service-role client
createClient(url, SERVICE_ROLE_KEY, {
  db: { schema: 'your_schema' },
  auth: { persistSession: false },
})
```

---

## 7. Quick Diagnostic Commands

Run these via SSH (`ssh root@178.238.227.229`) when something breaks.

```bash
# What schemas does PostgREST think it can serve? (the ground truth)
docker exec supabase-db psql -U postgres -c \
  "SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';"

# List all schemas in PostgreSQL
docker exec supabase-db psql -U postgres -c \
  "SELECT nspname, nspowner::regrole FROM pg_namespace ORDER BY nspname;"

# Test if PostgREST is serving a specific schema
curl -s -H 'Accept-Profile: robocore' \
  -H 'apikey: <anon-key>' \
  'http://localhost:8000/rest/v1/users?select=id&limit=1'

# Check running containers
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# PostgREST logs (last 50 lines)
docker logs --tail 50 supabase-rest

# PostgreSQL logs (last 50 lines)
docker logs --tail 50 supabase-db

# Kong logs (API gateway — shows all HTTP in/out)
docker logs --tail 50 supabase-kong

# Check what env PostgREST container has (may disagree with DB config)
docker inspect supabase-rest | grep -A 30 '"Env"'
```

---

## 8. Server-Level Safety Rules

### SSH Access

- Default user: `root`
- SSH on standard port 22
- Change the password after any session where it was shared with an external tool or AI assistant

### File system paths

| Path | Purpose |
| --- | --- |
| `/root/supabase/docker/` | All Docker Compose files |
| `/root/supabase/docker/.env` | Supabase secrets (JWT keys, DB password, etc.) |
| `/root/supabase/docker/volumes/db/data/` | PostgreSQL data directory |
| `/root/supabase/docker/volumes/storage/` | Supabase Storage file volume |
| `/root/migrations/` | Ad-hoc SQL and recovery scripts |

### Backup rules

- **Storage files:** Use `tar --xattrs` — `cp` and `rsync` without `-X` do not preserve xattrs and will cause 500 errors on file serve (see [`docs/incidents/2026-05-07-storage-outage.md`](incidents/2026-05-07-storage-outage.md))
- **Database:** `pg_dump` from inside `supabase-db` container, or rely on scheduled WAL backups if configured
- Never use `docker compose down -v` (destroys volumes — see Rule 9)

---

## 9. What Happens When You Get These Errors

| Error | Meaning | Fix |
| --- | --- | --- |
| `PGRST106: Invalid schema: <name>` | Your schema is not in `pgrst.db_schemas` on the authenticator role | Run the additive DO block from Rule 2 |
| `PGRST205: Could not find table 'public.<name>'` | Schema not set on client — defaulting to `public` | Set `db: { schema: 'your_schema' }` in Supabase client init |
| `PGRST301: JWT expired` | Auth token is stale | Re-sign or generate a new JWT |
| `403 Forbidden` on a table | RLS policy blocking the request | Add an appropriate RLS policy |
| `500 InternalError` on storage file | Missing xattrs on the file | Run `fix_xattrs.sh` (see storage incident doc) |
| Login loop in app | Profile API returning null | Check `PGRST106` in server logs — likely a schema config issue |

---

## 10. Document Maintenance

This document must be updated when:

- A new project/schema is added to the server (update Section 2 and the canonical schema list)
- A project is decommissioned (mark it in the table, update the canonical list)
- Server infrastructure changes (new container versions, new VPS, etc.)
- A new incident occurs that reveals a new failure mode

**Last updated:** June 7, 2026 — Added `icecream_erp` schema for Absolute Ice Cream Manufacturing ERP.
