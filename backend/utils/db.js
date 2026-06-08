import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// Self-hosted Supabase VPS may use a certificate not trusted by Node.js.
// Must be set before the first fetch call — dotenv.config() is called above.
if (process.env.PGSSL !== 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const supabaseUrl  = process.env.SUPABASE_URL;
const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbSchema     = process.env.DB_SCHEMA || 'parks_connect';

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  db:       { schema: dbSchema },
  auth:     { persistSession: false },
  realtime: { transport: ws }   // required for Node.js < 22
});

// Separate anon-key client used only for auth sign-in operations.
// signInWithPassword must use the anon key, not the service_role key.
const anonKey = process.env.SUPABASE_ANON_KEY || supabaseKey;
export const supabaseAnon = createClient(supabaseUrl, anonKey, {
  auth:     { persistSession: false },
  realtime: { transport: ws }
});

// ---------------------------------------------------------------------------
// Query helpers — same interface as the previous pg adapter
// ---------------------------------------------------------------------------

/**
 * Safely quote a JS value into a SQL literal string.
 * Used to inline params directly into SQL before sending to exec_dyn,
 * which avoids all server-side $N substitution complexity.
 */
function quoteLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  // String: wrap in single quotes, escape any existing single quotes by doubling
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/**
 * Replace ? placeholders with safely-quoted literal values, returning
 * a fully-formed SQL string with no remaining placeholders.
 */
function inlineQuery(sql, params = []) {
  let index = 0;
  return sql.replace(/\?/g, () => {
    const value = params[index++];
    if (Array.isArray(value)) {
      if (!value.length) return 'NULL';
      return value.map(quoteLiteral).join(', ');
    }
    return quoteLiteral(value);
  });
}

function withReturningId(sql) {
  if (!/^\s*insert\b/i.test(sql) || /\breturning\b/i.test(sql)) return sql;
  return `${sql} RETURNING id`;
}

/**
 * Execute any SQL via the parks_connect.exec_dyn RPC function.
 * Returns an array of row objects (empty array for DDL/DML without RETURNING).
 */
async function execDyn(sql, params = []) {
  // Inline all params as quoted literals — exec_dyn receives clean SQL with no placeholders.
  const text = inlineQuery(sql, params);
  const { data, error } = await supabase.rpc('exec_dyn', {
    sql_text: text,
    params:   []            // no server-side substitution needed
  }, {
    head: false,
    count: null
  });
  if (error) {
    throw new Error(error.message || JSON.stringify(error));
  }
  // data is the jsonb array returned by the function (already parsed by the client)
  return Array.isArray(data) ? data : (data ? [data] : []);
}

// ---------------------------------------------------------------------------
// DatabaseAdapter — identical public interface as before
// ---------------------------------------------------------------------------

class DatabaseAdapter {
  async get(sql, params = []) {
    const rows = await this.all(sql, params);
    return rows[0];
  }

  async all(sql, params = []) {
    return execDyn(sql, params);
  }

  async run(sql, params = []) {
    const query = withReturningId(sql);
    const result = await execDyn(query, params);
    return {
      lastID: result?.[0]?.id ?? null,
      changes: result?.length ?? 0
    };
  }

  async exec(sql) {
    await execDyn(sql, []);
  }
}

let dbInstance;

export async function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseAdapter();
  }
  return dbInstance;
}

export async function closeDb() {
  // No connection pool to drain — HTTP client is stateless
  dbInstance = null;
}

export { supabase };
