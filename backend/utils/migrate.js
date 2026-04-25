import { getDb, closeDb } from './db.js';

const ROLE_MAP = {
  admin: 'authority_admin',
  staff: 'environment_officer',
  operator: 'tourism_operator'
};

const WORKFLOW_STATUSES = ['new', 'assigned', 'in_progress', 'resolved', 'escalated'];

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('authority_admin','environment_officer','tourism_operator','tourist')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS parks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    region TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS park_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    park_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('authority_admin','environment_officer','tourism_operator')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS visitor_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id INTEGER,
    operator_id INTEGER,
    visit_date TEXT NOT NULL,
    log_date TEXT,
    visitors_count INTEGER NOT NULL DEFAULT 0,
    local_visitors INTEGER NOT NULL DEFAULT 0,
    international_visitors INTEGER NOT NULL DEFAULT 0,
    units_available INTEGER NOT NULL DEFAULT 0,
    units_occupied INTEGER NOT NULL DEFAULT 0,
    occupancy_rate REAL,
    facility_feedback TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE SET NULL
  );`,
  `CREATE TABLE IF NOT EXISTS occupancy_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id INTEGER NOT NULL,
    operator_id INTEGER,
    log_date TEXT NOT NULL,
    units_available INTEGER NOT NULL DEFAULT 0,
    units_occupied INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (operator_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS environmental_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id INTEGER,
    staff_id INTEGER,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    incident_type TEXT,
    event_type TEXT,
    severity TEXT,
    status TEXT DEFAULT 'new',
    location_lat REAL,
    location_lng REAL,
    photo_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE SET NULL
  );`,
  `CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id INTEGER,
    submitted_by TEXT,
    type TEXT NOT NULL CHECK(type IN ('tourist','operator','tourism_operator')),
    rating INTEGER,
    comments TEXT NOT NULL,
    gps_lat REAL,
    gps_lng REAL,
    photo_path TEXT,
    device_id TEXT,
    status TEXT DEFAULT 'new',
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE SET NULL
  );`,
  `CREATE TABLE IF NOT EXISTS tourist_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    legacy_feedback_id INTEGER UNIQUE,
    park_id INTEGER,
    submitted_by TEXT,
    type TEXT NOT NULL CHECK(type IN ('tourist','tourism_operator')),
    rating INTEGER CHECK (rating BETWEEN 1 AND 5),
    comments TEXT NOT NULL,
    gps_lat REAL,
    gps_lng REAL,
    photo_path TEXT,
    device_id TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','assigned','in_progress','resolved','escalated')),
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE SET NULL
  );`,
  `CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id INTEGER NOT NULL,
    incident_type TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('low','medium','high','critical')),
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','assigned','in_progress','resolved','escalated')),
    gps_lat REAL,
    gps_lng REAL,
    photo_path TEXT,
    device_id TEXT,
    duplicate_of INTEGER,
    reported_by INTEGER,
    reported_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (duplicate_of) REFERENCES incidents(id) ON DELETE SET NULL
  );`,
  `CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id INTEGER,
    source_type TEXT,
    source_id INTEGER,
    alert_type TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','critical')),
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','assigned','in_progress','resolved','escalated')),
    escalation_state TEXT NOT NULL DEFAULT 'none',
    due_at DATETIME,
    escalated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE SET NULL
  );`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id INTEGER,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    severity TEXT DEFAULT 'info',
    resolved INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE SET NULL
  );`,
  `CREATE TABLE IF NOT EXISTS alert_thresholds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id INTEGER,
    metric TEXT NOT NULL,
    threshold REAL NOT NULL,
    comparator TEXT DEFAULT '>',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS facility_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS facilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id INTEGER NOT NULL,
    facility_type_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    units_available INTEGER NOT NULL DEFAULT 0,
    units_occupied INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','maintenance')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE,
    FOREIGN KEY (facility_type_id) REFERENCES facility_types(id) ON DELETE CASCADE
  );`,
  `CREATE TABLE IF NOT EXISTS report_exports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id INTEGER,
    report_type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    generated_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE SET NULL,
    FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
  );`
];

async function tableExists(db, table) {
  const row = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [table]);
  return Boolean(row);
}

async function ensureColumn(db, table, column, definition) {
  if (!(await tableExists(db, table))) return;
  const info = await db.all(`PRAGMA table_info(${table});`);
  const hasColumn = info.some((c) => c.name === column);
  if (!hasColumn) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

async function ensureIndex(db, indexName, sql) {
  await db.exec(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${sql};`);
}

function mapLegacyRole(role) {
  return ROLE_MAP[role] || role;
}

function hasLegacyRoleSql(sql) {
  if (!sql) return false;
  return sql.includes("'admin'") || sql.includes("'staff'") || sql.includes("'operator'");
}

async function migrateRoleTables(db) {
  const usersSqlRow = await db.get(`SELECT sql FROM sqlite_master WHERE type='table' AND name = 'users'`);
  const assignmentsSqlRow = await db.get(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name = 'park_assignments'`
  );

  const legacyUsers = await db.get(
    `SELECT COUNT(*) AS total FROM users WHERE role IN ('admin','staff','operator')`
  ).catch(() => ({ total: 0 }));
  const legacyAssignments = await db.get(
    `SELECT COUNT(*) AS total FROM park_assignments WHERE role IN ('admin','staff','operator')`
  ).catch(() => ({ total: 0 }));

  const needsUserRebuild = hasLegacyRoleSql(usersSqlRow?.sql) || (legacyUsers?.total || 0) > 0;
  const needsAssignmentRebuild =
    hasLegacyRoleSql(assignmentsSqlRow?.sql) || (legacyAssignments?.total || 0) > 0;

  if (!needsUserRebuild && !needsAssignmentRebuild) {
    return;
  }

  await db.exec('PRAGMA foreign_keys = OFF;');
  try {
    await db.exec('BEGIN TRANSACTION;');

    if (needsUserRebuild) {
      await db.exec(`DROP TABLE IF EXISTS users_new;`);
      await db.exec(`CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('authority_admin','environment_officer','tourism_operator','tourist')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`);

      const users = await db.all(`SELECT id, name, email, password, role, created_at FROM users ORDER BY id ASC`);
      for (const user of users) {
        await db.run(
          `INSERT INTO users_new (id, name, email, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)` ,
          [user.id, user.name, user.email, user.password, mapLegacyRole(user.role), user.created_at]
        );
      }

      await db.exec(`DROP TABLE users;`);
      await db.exec(`ALTER TABLE users_new RENAME TO users;`);
    }

    if (needsAssignmentRebuild && (await tableExists(db, 'park_assignments'))) {
      await db.exec(`DROP TABLE IF EXISTS park_assignments_new;`);
      await db.exec(`CREATE TABLE park_assignments_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        park_id INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('authority_admin','environment_officer','tourism_operator')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (park_id) REFERENCES parks(id) ON DELETE CASCADE
      );`);

      const assignments = await db.all(
        `SELECT id, user_id, park_id, role, created_at FROM park_assignments ORDER BY id ASC`
      );
      for (const assignment of assignments) {
        const mappedRole = mapLegacyRole(assignment.role);
        if (!['authority_admin', 'environment_officer', 'tourism_operator'].includes(mappedRole)) {
          continue;
        }
        await db.run(
          `INSERT INTO park_assignments_new (id, user_id, park_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
          [assignment.id, assignment.user_id, assignment.park_id, mappedRole, assignment.created_at]
        );
      }

      await db.exec(`DROP TABLE park_assignments;`);
      await db.exec(`ALTER TABLE park_assignments_new RENAME TO park_assignments;`);
    }

    await db.exec('COMMIT;');
  } catch (err) {
    await db.exec('ROLLBACK;');
    throw err;
  } finally {
    await db.exec('PRAGMA foreign_keys = ON;');
  }
}

function normalizeWorkflowStatus(status, fallback = 'new') {
  if (!status) return fallback;
  const trimmed = String(status).trim().toLowerCase();
  if (WORKFLOW_STATUSES.includes(trimmed)) return trimmed;
  if (trimmed === 'open') return 'new';
  if (trimmed === 'closed') return 'resolved';
  return fallback;
}

export async function runMigrations() {
  const db = await getDb();

  for (const sql of schemaStatements) {
    await db.exec(sql);
  }

  await migrateRoleTables(db);

  await ensureColumn(db, 'visitor_logs', 'park_id', 'INTEGER REFERENCES parks(id)');
  await ensureColumn(db, 'visitor_logs', 'local_visitors', 'INTEGER DEFAULT 0');
  await ensureColumn(db, 'visitor_logs', 'international_visitors', 'INTEGER DEFAULT 0');
  await ensureColumn(db, 'visitor_logs', 'log_date', 'TEXT');
  await ensureColumn(db, 'visitor_logs', 'units_available', 'INTEGER DEFAULT 0');
  await ensureColumn(db, 'visitor_logs', 'units_occupied', 'INTEGER DEFAULT 0');

  await ensureColumn(db, 'environmental_logs', 'park_id', 'INTEGER REFERENCES parks(id)');
  await ensureColumn(db, 'environmental_logs', 'incident_type', 'TEXT');
  await ensureColumn(db, 'environmental_logs', 'event_type', 'TEXT');
  await ensureColumn(db, 'environmental_logs', 'status', "TEXT DEFAULT 'new'");
  await ensureColumn(db, 'environmental_logs', 'photo_path', 'TEXT');

  await ensureColumn(db, 'feedback', 'park_id', 'INTEGER REFERENCES parks(id)');
  await ensureColumn(db, 'feedback', 'device_id', 'TEXT');
  await ensureColumn(db, 'feedback', 'submitted_at', 'DATETIME');

  await ensureColumn(db, 'notifications', 'park_id', 'INTEGER REFERENCES parks(id)');

  await ensureColumn(db, 'alerts', 'status', "TEXT DEFAULT 'new'");
  await ensureColumn(db, 'alerts', 'escalation_state', "TEXT DEFAULT 'none'");
  await ensureColumn(db, 'alerts', 'due_at', 'DATETIME');
  await ensureColumn(db, 'alerts', 'escalated_at', 'DATETIME');
  await ensureColumn(db, 'alerts', 'updated_at', 'DATETIME');

  await ensureColumn(db, 'incidents', 'device_id', 'TEXT');
  await ensureColumn(db, 'incidents', 'duplicate_of', 'INTEGER');
  await ensureColumn(db, 'incidents', 'reported_at', 'DATETIME');

  await db.exec(`
    UPDATE visitor_logs
    SET
      log_date = COALESCE(log_date, visit_date),
      visitors_count = CASE WHEN visitors_count < 0 THEN 0 ELSE visitors_count END,
      local_visitors = CASE WHEN COALESCE(local_visitors, 0) < 0 THEN 0 ELSE COALESCE(local_visitors, 0) END,
      international_visitors = CASE WHEN COALESCE(international_visitors, 0) < 0 THEN 0 ELSE COALESCE(international_visitors, 0) END,
      units_available = CASE WHEN COALESCE(units_available, 0) < 0 THEN 0 ELSE COALESCE(units_available, 0) END,
      units_occupied = CASE
        WHEN COALESCE(units_occupied, 0) < 0 THEN 0
        WHEN COALESCE(units_occupied, 0) > COALESCE(units_available, 0) THEN COALESCE(units_available, 0)
        ELSE COALESCE(units_occupied, 0)
      END
    WHERE 1 = 1;
  `);

  await db.exec(`
    UPDATE environmental_logs
    SET status = CASE
      WHEN status IS NULL OR trim(status) = '' THEN 'new'
      WHEN lower(status) IN ('open') THEN 'new'
      WHEN lower(status) IN ('closed') THEN 'resolved'
      WHEN lower(status) IN ('new','assigned','in_progress','resolved','escalated') THEN lower(status)
      ELSE 'new'
    END;
  `);

  await db.exec(`
    UPDATE feedback
    SET
      type = CASE
        WHEN lower(type) = 'operator' THEN 'operator'
        WHEN lower(type) = 'tourism_operator' THEN 'operator'
        ELSE 'tourist'
      END,
      rating = CASE
        WHEN rating IS NOT NULL AND (rating < 1 OR rating > 5) THEN NULL
        ELSE rating
      END,
      status = CASE
        WHEN status IS NULL OR trim(status) = '' THEN 'new'
        WHEN lower(status) = 'open' THEN 'new'
        WHEN lower(status) = 'closed' THEN 'resolved'
        WHEN lower(status) IN ('new','assigned','in_progress','resolved','escalated') THEN lower(status)
        ELSE 'new'
      END,
      submitted_at = COALESCE(submitted_at, created_at, CURRENT_TIMESTAMP);
  `);

  await db.exec(`UPDATE alerts SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP);`);
  await db.exec(`UPDATE incidents SET reported_at = COALESCE(reported_at, created_at, CURRENT_TIMESTAMP);`);

  await db.exec(`
    INSERT OR IGNORE INTO tourist_feedback (
      legacy_feedback_id,
      park_id,
      submitted_by,
      type,
      rating,
      comments,
      gps_lat,
      gps_lng,
      photo_path,
      device_id,
      status,
      submitted_at,
      created_at
    )
    SELECT
      f.id,
      f.park_id,
      f.submitted_by,
      CASE WHEN lower(f.type) = 'tourism_operator' THEN 'tourism_operator' ELSE 'tourist' END,
      CASE WHEN f.rating BETWEEN 1 AND 5 THEN f.rating ELSE NULL END,
      f.comments,
      f.gps_lat,
      f.gps_lng,
      f.photo_path,
      f.device_id,
      CASE
        WHEN lower(COALESCE(f.status, 'new')) = 'open' THEN 'new'
        WHEN lower(COALESCE(f.status, 'new')) = 'closed' THEN 'resolved'
        WHEN lower(COALESCE(f.status, 'new')) IN ('new','assigned','in_progress','resolved','escalated') THEN lower(f.status)
        ELSE 'new'
      END,
      COALESCE(f.submitted_at, f.created_at, CURRENT_TIMESTAMP),
      COALESCE(f.created_at, CURRENT_TIMESTAMP)
    FROM feedback f;
  `);

  const thresholds = [
    { metric: 'visitors', threshold: 500, comparator: '>' },
    { metric: 'occupancy', threshold: 0.85, comparator: '>' },
    { metric: 'rating_drop_7d', threshold: 3, comparator: '<' },
    { metric: 'incident_high', threshold: 1, comparator: '>=' }
  ];

  for (const threshold of thresholds) {
    await db.run(
      `INSERT INTO alert_thresholds (park_id, metric, threshold, comparator)
       SELECT NULL, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM alert_thresholds WHERE park_id IS NULL AND metric = ?
       )`,
      [threshold.metric, threshold.threshold, threshold.comparator, threshold.metric]
    );
  }

  await db.exec(`
    INSERT INTO alerts (
      park_id,
      source_type,
      source_id,
      alert_type,
      message,
      severity,
      status,
      escalation_state,
      due_at,
      created_at,
      updated_at
    )
    SELECT
      n.park_id,
      'notification',
      n.id,
      COALESCE(n.type, 'legacy_notification'),
      n.message,
      CASE
        WHEN lower(COALESCE(n.severity, 'info')) IN ('critical','warning','info') THEN lower(n.severity)
        ELSE 'warning'
      END,
      CASE WHEN COALESCE(n.resolved, 0) = 1 THEN 'resolved' ELSE 'new' END,
      'none',
      datetime(COALESCE(n.created_at, CURRENT_TIMESTAMP), '+24 hours'),
      COALESCE(n.created_at, CURRENT_TIMESTAMP),
      COALESCE(n.created_at, CURRENT_TIMESTAMP)
    FROM notifications n
    WHERE NOT EXISTS (
      SELECT 1
      FROM alerts a
      WHERE a.source_type = 'notification' AND a.source_id = n.id
    );
  `);

  await ensureIndex(db, 'idx_park_assignments_user_park', 'park_assignments(user_id, park_id)');
  await ensureIndex(db, 'idx_visitor_logs_park_log_date', 'visitor_logs(park_id, log_date)');
  await ensureIndex(db, 'idx_occupancy_logs_park_log_date', 'occupancy_logs(park_id, log_date)');
  await ensureIndex(db, 'idx_tourist_feedback_park_submitted_at', 'tourist_feedback(park_id, submitted_at)');
  await ensureIndex(db, 'idx_incidents_park_reported_status', 'incidents(park_id, reported_at, status)');
  await ensureIndex(db, 'idx_alerts_park_created_status', 'alerts(park_id, created_at, status)');
  await ensureIndex(db, 'idx_alerts_due_status', 'alerts(status, due_at)');
}

if (process.argv[1] && process.argv[1].includes('migrate.js')) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed.');
    })
    .catch((err) => {
      console.error('Migration failed', err);
    })
    .finally(async () => {
      await closeDb();
    });
}
