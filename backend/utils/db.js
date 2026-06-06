import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

function safeDecodeUriComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeDatabaseUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!/^postgres(?:ql)?:\/\//i.test(value)) {
    return value;
  }

  const protocolSeparatorIndex = value.indexOf('://');
  const protocol = value.slice(0, protocolSeparatorIndex);
  const rest = value.slice(protocolSeparatorIndex + 3);
  const slashIndex = rest.indexOf('/');

  if (slashIndex === -1) {
    return value;
  }

  const authority = rest.slice(0, slashIndex);
  const suffix = rest.slice(slashIndex);
  const lastAtIndex = authority.lastIndexOf('@');
  if (lastAtIndex === -1) {
    return value;
  }

  const credentials = authority.slice(0, lastAtIndex);
  const host = authority.slice(lastAtIndex + 1);
  const firstColonIndex = credentials.indexOf(':');
  if (firstColonIndex === -1) {
    return value;
  }

  const rawUser = credentials.slice(0, firstColonIndex);
  const rawPassword = credentials.slice(firstColonIndex + 1);
  const safeUser = encodeURIComponent(safeDecodeUriComponent(rawUser));
  const safePassword = encodeURIComponent(safeDecodeUriComponent(rawPassword));

  return `${protocol}://${safeUser}:${safePassword}@${host}${suffix}`;
}

function resolveConnectionString() {
  if (process.env.DATABASE_URL) {
    return normalizeDatabaseUrl(process.env.DATABASE_URL);
  }

  const user = process.env.DB_USER || process.env.PGUSER || 'postgres';
  const password = encodeURIComponent(process.env.DB_PASSWORD || process.env.PGPASSWORD || '');
  const host = process.env.DB_HOST || process.env.PGHOST || '127.0.0.1';
  const port = process.env.DB_PORT || process.env.PGPORT || '5432';
  const database = process.env.DB_NAME || process.env.PGDATABASE || 'postgres';

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

function normalizeQuery(sql, params = []) {
  let index = 0;
  const values = [];
  const text = sql.replace(/\?/g, () => {
    const value = params[index++];

    if (Array.isArray(value)) {
      if (!value.length) return 'NULL';
      return value.map((item) => {
        values.push(item);
        return `$${values.length}`;
      }).join(', ');
    }

    values.push(value);
    return `$${values.length}`;
  });

  return { text, values };
}

function withReturningId(sql) {
  if (!/^\s*insert\b/i.test(sql) || /\breturning\b/i.test(sql)) {
    return sql;
  }

  return `${sql} RETURNING id`;
}

class DatabaseAdapter {
  constructor(pool) {
    this.pool = pool;
  }

  async get(sql, params = []) {
    const rows = await this.all(sql, params);
    return rows[0];
  }

  async all(sql, params = []) {
    const { text, values } = normalizeQuery(sql, params);
    const result = await this.pool.query(text, values);
    return result.rows;
  }

  async run(sql, params = []) {
    const query = withReturningId(sql);
    const { text, values } = normalizeQuery(query, params);
    const result = await this.pool.query(text, values);
    return {
      lastID: result.rows?.[0]?.id ?? null,
      changes: result.rowCount ?? 0
    };
  }

  async exec(sql) {
    await this.pool.query(sql);
  }
}

let poolInstance;
let dbInstance;

export async function getDb() {
  if (!poolInstance) {
    const sslDisabled = process.env.PGSSL === 'false' || process.env.DB_SSL === 'false';
    poolInstance = new Pool({
      connectionString: resolveConnectionString(),
      max: Number(process.env.DB_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 10000),
      ssl: sslDisabled ? false : { rejectUnauthorized: false }
    });

    poolInstance.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error', err);
    });
  }

  if (!dbInstance) {
    dbInstance = new DatabaseAdapter(poolInstance);
  }

  return dbInstance;
}

export async function closeDb() {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
    dbInstance = null;
  }
}
