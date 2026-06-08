-- =============================================================================
-- Parks Connect — One-Time Supabase Setup
-- Run this ONCE in the Supabase SQL Editor (Studio → SQL Editor → New Query).
-- After this runs, `npm run migrate` and `npm run start` will work.
--
-- Follows SHARED_DB_RULES.md:
--   Rule 1: Own schema (parks_connect), never touch public.
--   Rule 2: Additive PostgREST registration — never replaces existing schemas.
--   Rule 6: Grants scoped to parks_connect only.
--   Rule 7: RLS enabled on all tables (done by npm run migrate).
-- =============================================================================

-- STEP 1: Create the project schema
CREATE SCHEMA IF NOT EXISTS parks_connect;

-- STEP 2: Register parks_connect with PostgREST — SAFE additive DO block
-- Never replaces existing schemas. Reads current list, appends if missing.
DO $$
DECLARE
  v_current text;
  v_schema  text := 'parks_connect';
BEGIN
  SELECT split_part(cfg, '=', 2) INTO v_current
  FROM pg_roles, unnest(rolconfig) AS cfg
  WHERE rolname = 'authenticator'
    AND cfg LIKE 'pgrst.db_schemas=%';

  IF v_current IS NULL OR v_current = '' THEN
    v_current := 'public,storage,graphql_public,robocore,robokorda,aura,smartschools,azim_motors,icecream_erp';
  END IF;

  IF position(v_schema IN v_current) = 0 THEN
    EXECUTE format(
      'ALTER ROLE authenticator SET "pgrst.db_schemas" TO %L',
      v_current || ',' || v_schema
    );
    NOTIFY pgrst;
    RAISE NOTICE 'pgrst.db_schemas updated to include parks_connect';
  ELSE
    RAISE NOTICE 'parks_connect already registered in pgrst.db_schemas — no change';
  END IF;
END $$;

-- STEP 3: Universal SQL executor function
-- Allows the backend (service_role) to run any SQL via RPC — including DDL.
-- SECURITY DEFINER runs as the postgres superuser so DDL is permitted.
-- Only service_role can call this (see STEP 4 grants).
-- NOTE: params are inlined by the JS client before calling — no substitution needed here.
CREATE OR REPLACE FUNCTION parks_connect.exec_dyn(
  sql_text  text,
  params    jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = parks_connect, public
AS $$
DECLARE
  result    jsonb := '[]'::jsonb;
  trimmed   text;
  r         record;
BEGIN
  trimmed := upper(ltrim(sql_text));

  -- SELECT / WITH queries: wrap in jsonb_agg to return rows as array
  IF trimmed LIKE 'SELECT%' OR trimmed LIKE 'WITH%' THEN
    BEGIN
      EXECUTE
        'SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), ''[]''::jsonb) FROM ('
        || sql_text || ') t'
        INTO result;
      RETURN COALESCE(result, '[]'::jsonb);
    EXCEPTION WHEN others THEN
      -- Fallback: plain execute (e.g. data-modifying CTE without final SELECT)
      EXECUTE sql_text;
      RETURN '[]'::jsonb;
    END;
  END IF;

  -- INSERT / UPDATE / DELETE with RETURNING: use FOR loop (most reliable in PL/pgSQL)
  IF sql_text ~* '\bRETURNING\b' THEN
    FOR r IN EXECUTE sql_text LOOP
      result := result || to_jsonb(r);
    END LOOP;
    RETURN result;
  END IF;

  -- DDL and plain DML (no RETURNING): execute and return empty array
  EXECUTE sql_text;
  RETURN '[]'::jsonb;
END;
$$;

-- STEP 4: Grant permissions (Rule 6 — scoped to parks_connect only)
GRANT USAGE ON SCHEMA parks_connect TO anon, authenticated, service_role;

-- Only service_role may call exec_dyn — anon/authenticated cannot
REVOKE ALL ON FUNCTION parks_connect.exec_dyn(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION parks_connect.exec_dyn(text, jsonb) TO service_role;
