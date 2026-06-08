# Incident Report: PostgREST Schema Corruption — May 26, 2026

**Severity:** Critical  
**Duration:** Unknown start (likely from first Azim Motors migration run) → resolved May 26, 2026  
**Affected Systems:** RoboCore app — all users unable to log in; every authenticated API call returning `PGRST106: Invalid schema: robocore`  
**Resolution Time:** ~4 hours of active diagnosis and repair across a multi-phase debug session  

---

## Summary

Every user was silently logged out and could not log back in. The app would accept credentials, create a Supabase auth session, then immediately fail when trying to load the user's profile — bouncing users back to the login screen in an infinite loop. The root cause was a single line at the bottom of a schema migration script for a separate project (`azim_motors`) that ran `ALTER ROLE authenticator SET pgrst.db_schemas TO 'public,azim_motors'`. This overwrote the in-database PostgREST configuration for the shared `authenticator` PostgreSQL role, limiting PostgREST to only the `public` and `azim_motors` schemas. Because PostgREST v12+ in-database config overrides container environment variables, restarting the container had no effect, and the misconfiguration persisted invisibly until explicitly queried.

---

## Timeline

| Date / Phase | Event |
|---|---|
| Unknown (prior session) | Azim Motors migration `011` run in Supabase SQL Editor. Final lines: `ALTER ROLE authenticator SET pgrst.db_schemas TO 'public,azim_motors'; NOTIFY pgrst;` — silently clobbers shared role config |
| May 26, 2026 — Phase 1 | Users report login loop. Error in app: `Authenticated user has no matching RoboCore profile` |
| Phase 2 | Suspected profile lookup bug. Added service-role client to bypass RLS. Error persisted |
| Phase 3 | Added verbose `[profile]` debug logging to `/api/auth/profile/route.ts` |
| Phase 4 | Dev server logs reveal root cause: `PGRST106: Invalid schema: robocore — Only the following schemas are exposed: public, azim_motors` |
| Phase 5 | Confirmed PostgREST container env `PGRST_DB_SCHEMAS` is correct (includes `robocore`) — but runtime behaviour contradicts it |
| Phase 6 | Deep dive: PostgREST v12+ supports in-database config via `ALTER ROLE authenticator SET "pgrst.db_schemas"` which **overrides** env vars |
| Phase 7 | SSH into server (`178.238.227.229`). Queried `pg_roles`: confirmed `pgrst.db_schemas=public,azim_motors` baked into DB |
| Phase 8 | Applied fix: `ALTER ROLE authenticator SET "pgrst.db_schemas" TO 'public,storage,graphql_public,robocore,robokorda,aura,smartschools'; NOTIFY pgrst;` |
| Phase 8 | HTTP test against `localhost:8000/rest/v1/users` with `Accept-Profile: robocore` → **200 OK**. Login restored |
| Cleanup | Removed debug logging from `route.ts` and `auth-provider.tsx`. Deleted fix script containing server password |

---

## Root Cause Analysis

### The Culprit: `ALTER ROLE authenticator SET pgrst.db_schemas`

The final block of the Azim Motors migration `011` was:

```sql
-- Expose azim_motors to PostgREST
ALTER ROLE authenticator SET pgrst.db_schemas TO 'public,azim_motors';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
```

This command modifies the `authenticator` role's **default session parameters** in PostgreSQL's system catalog (`pg_roles.rolconfig`). Any new PostgREST connection will inherit this value as a session-level GUC (Grand Unified Configuration) parameter.

**This is a shared-server global setting.** The `authenticator` role is the single shared PostgreSQL role that PostgREST uses for every API call across ALL projects on this server. Overwriting its `pgrst.db_schemas` affects every project simultaneously.

### Why Container Restarts Did Not Fix It

PostgREST reads its configuration in two ways:

| Source | Precedence |
|---|---|
| Environment variable `PGRST_DB_SCHEMAS` (docker-compose) | **Lower** |
| In-database GUC via `ALTER ROLE authenticator SET "pgrst.db_schemas"` | **Higher — wins always** |

Once the `ALTER ROLE` is committed to PostgreSQL, it survives forever: container restarts, `docker compose down && up`, even `docker stop && docker rm && docker compose up -d`. None of these touch the PostgreSQL catalog. The only fix is another `ALTER ROLE` or `ALTER ROLE authenticator RESET "pgrst.db_schemas"`.

This was confirmed by inspecting the container env (correct schemas listed) vs. live PostgREST behaviour (only serving `public, azim_motors`).

### The Full Failure Chain

```
azim_motors migration 011 runs
  └─ ALTER ROLE authenticator SET pgrst.db_schemas TO 'public,azim_motors'
       └─ authenticator role's pg_roles.rolconfig updated in PostgreSQL catalog
            └─ Every new PostgREST session picks up pgrst.db_schemas = 'public,azim_motors'
                 └─ Any request with Accept-Profile: robocore → PGRST106 error
                      └─ /api/auth/profile returns { profile: null }
                           └─ AuthProvider treats 200+null as definitive: clears session, redirects to login
                                └─ Login loop — all users locked out
```

### Why It Was Hard to Diagnose

1. **The error was silent at the auth layer.** Supabase auth (`auth.users`) still worked. The session cookie was valid. Only the PostgREST schema lookup failed, and this error was not surfaced clearly to the frontend.

2. **The container environment looked correct.** `docker inspect supabase-rest` showed `PGRST_DB_SCHEMAS=public,storage,graphql_public,robocore,robokorda,aura`. This is a strong false signal — the env is correct but irrelevant once in-DB config is set.

3. **The affected migration was for a different project.** The Azim Motors migration ran without errors (from its own perspective, it succeeded). There was no cross-project validation to catch the global side-effect.

4. **PostgREST v12+ in-database config is not widely documented.** Finding documentation confirming that `ALTER ROLE` GUCs override env vars required deep reading of PostgREST release notes and source.

---

## What Was Confirmed After Fix

Query run via SSH before fix:
```sql
SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';
-- rolconfig: {"pgrst.db_schemas=public,azim_motors", ...}
```

Fix applied:
```sql
ALTER ROLE authenticator SET "pgrst.db_schemas"
  TO 'public,storage,graphql_public,robocore,robokorda,aura,smartschools';
NOTIFY pgrst;
```

Query run after fix:
```sql
-- rolconfig: {"pgrst.db_schemas=public,storage,graphql_public,robocore,robokorda,aura,smartschools", ...}
```

Live test:
```bash
curl -s -o /dev/null -w '%{http_code}' \
  -H 'Accept-Profile: robocore' \
  -H 'apikey: <anon-key>' \
  'http://localhost:8000/rest/v1/users?select=id&limit=1'
# 200
```

---

## How It Was Fixed

### Step 1 — Confirm the in-DB config via SSH

```bash
ssh root@178.238.227.229
docker exec supabase-db psql -U postgres -c \
  "SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';"
# Output confirms: pgrst.db_schemas=public,azim_motors
```

### Step 2 — Apply corrected schema list

```bash
docker exec supabase-db psql -U postgres -c "
  ALTER ROLE authenticator
    SET \"pgrst.db_schemas\"
    TO 'public,storage,graphql_public,robocore,robokorda,aura,smartschools';
  NOTIFY pgrst;
"
# ALTER ROLE
# NOTIFY
```

No container restart required. PostgREST picks up the new GUC on the next connection cycle via the `NOTIFY pgrst` signal.

### Step 3 — Verify

```bash
sleep 3
curl -s -o /dev/null -w '%{http_code}' \
  -H 'Accept-Profile: robocore' \
  -H 'apikey: <anon-key>' \
  'http://localhost:8000/rest/v1/users?select=id&limit=1'
# 200
```

---

## Code Changes Made During Diagnosis (Now Reverted / Cleaned)

During diagnosis, the following were temporarily added and later removed:

| File | Change | Status |
|---|---|---|
| `src/app/api/auth/profile/route.ts` | Added verbose `[profile]` console.log statements | Removed after fix |
| `src/components/providers/auth-provider.tsx` | Added `[auth]` console.log on profile response | Removed after fix |
| `src/lib/supabase/get-user.ts` | Switched to service-role client for DB reads | **Kept** (correct approach — bypasses RLS safely) |
| `fix-pgrst.py` | Paramiko SSH script to apply fix | Deleted (contained server password) |

---

## Prevention

### Immediate Actions Taken

- Correct schema list restored to `authenticator` role in PostgreSQL
- Full canonical schema list documented: `public, storage, graphql_public, robocore, robokorda, aura, smartschools`
- Shared-server rules document created: `docs/SHARED_DB_RULES.md`

### Rules Going Forward

1. **Never use bare `ALTER ROLE authenticator SET pgrst.db_schemas TO ...`** in a migration. This replaces the entire list, wiping all other projects. See `docs/SHARED_DB_RULES.md` for the correct additive approach.

2. **Every new project/schema must append to the existing list**, not replace it. The safe migration block is:

   ```sql
   -- SAFE: read → modify → write, in a DO block
   DO $$
   DECLARE
     current_schemas text;
     new_schema      text := 'your_new_schema';
   BEGIN
     SELECT split_part(unnested, '=', 2) INTO current_schemas
     FROM pg_roles, unnest(rolconfig) AS unnested
     WHERE rolname = 'authenticator'
       AND unnested LIKE 'pgrst.db_schemas=%';

     IF current_schemas IS NULL THEN
       current_schemas := 'public';
     END IF;

     IF position(new_schema IN current_schemas) = 0 THEN
       EXECUTE format(
         'ALTER ROLE authenticator SET "pgrst.db_schemas" TO %L',
         current_schemas || ',' || new_schema
       );
       NOTIFY pgrst;
     END IF;
   END $$;
   ```

3. **Always verify after any schema migration** that login/profile still works on all other projects.

4. **Keep the canonical schema list updated** in `docs/SHARED_DB_RULES.md` whenever a new project is added.

---

## Infrastructure Reference

| Item | Value |
|---|---|
| Server | `root@vmi3263043` — IP `178.238.227.229` |
| OS | Ubuntu 24.04 |
| PostgreSQL | 15.8 (container: `supabase-db`) |
| PostgREST | v14.8 (container: `supabase-rest`) |
| Kong gateway | `supabase-kong`, host port `8000` |
| Self-hosted API | `https://api.robokorda.duckdns.org` |
| Compose directory | `/root/supabase/docker/` |
| Docker network | `supabase_default` |
| Shared authenticator role | `authenticator` (PostgREST DB user) |
| Canonical `pgrst.db_schemas` | `public,storage,graphql_public,robocore,robokorda,aura,smartschools` |

---

## Key Commands for Future Reference

```bash
# Diagnose: read current pgrst config from DB
docker exec supabase-db psql -U postgres -c \
  "SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';"

# Fix: restore full schema list (update this list as new projects are added)
docker exec supabase-db psql -U postgres -c "
  ALTER ROLE authenticator
    SET \"pgrst.db_schemas\"
    TO 'public,storage,graphql_public,robocore,robokorda,aura,smartschools';
  NOTIFY pgrst;
"

# Verify PostgREST is serving a specific schema (replace robocore with target)
curl -s -o /dev/null -w '%{http_code}' \
  -H 'Accept-Profile: robocore' \
  -H 'apikey: <anon-key>' \
  'http://localhost:8000/rest/v1/<any-table>?select=id&limit=1'
# Expected: 200
```
