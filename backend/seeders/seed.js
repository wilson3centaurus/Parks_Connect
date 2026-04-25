import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { getDb, closeDb } from '../utils/db.js';
import { runMigrations } from '../utils/migrate.js';
import { createAlert } from '../utils/notifier.js';

dotenv.config();

async function upsertUser(db, { name, email, passwordHash, role }) {
  const existing = await db.get(`SELECT id FROM users WHERE email = ?`, [email]);
  if (existing) {
    await db.run(`UPDATE users SET name = ?, role = ? WHERE id = ?`, [name, role, existing.id]);
    return existing.id;
  }

  const inserted = await db.run(
    `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`,
    [name, email, passwordHash, role]
  );
  return inserted.lastID;
}

async function ensureAssignment(db, userId, parkId, role) {
  const existing = await db.get(
    `SELECT id FROM park_assignments WHERE user_id = ? AND park_id = ?`,
    [userId, parkId]
  );

  if (existing) {
    await db.run(`UPDATE park_assignments SET role = ? WHERE id = ?`, [role, existing.id]);
    return existing.id;
  }

  const inserted = await db.run(
    `INSERT INTO park_assignments (user_id, park_id, role) VALUES (?, ?, ?)`,
    [userId, parkId, role]
  );
  return inserted.lastID;
}

async function ensureSampleData(db, parksByCode, users) {
  const visitorCount = await db.get(`SELECT COUNT(*) AS total FROM visitor_logs`);
  if ((visitorCount?.total || 0) < 4) {
    const sampleVisitorLogs = [
      {
        park: 'HNP',
        operatorId: users.operatorNorth,
        date: '2026-02-01',
        local: 220,
        international: 90,
        occupancy: 0.68,
        unitsAvailable: 80,
        unitsOccupied: 55,
        notes: 'Steady weekend traffic and normal check-ins.'
      },
      {
        park: 'HNP',
        operatorId: users.operatorNorth,
        date: '2026-02-02',
        local: 260,
        international: 140,
        occupancy: 0.83,
        unitsAvailable: 80,
        unitsOccupied: 66,
        notes: 'Peak arrivals from regional tour packages.'
      },
      {
        park: 'MP',
        operatorId: users.operatorWest,
        date: '2026-02-01',
        local: 170,
        international: 70,
        occupancy: 0.59,
        unitsAvailable: 64,
        unitsOccupied: 38,
        notes: 'Normal demand; family campsites stable.'
      },
      {
        park: 'VF',
        operatorId: users.operatorWest,
        date: '2026-02-03',
        local: 280,
        international: 200,
        occupancy: 0.91,
        unitsAvailable: 92,
        unitsOccupied: 84,
        notes: 'High occupancy during festival period.'
      }
    ];

    for (const item of sampleVisitorLogs) {
      const parkId = parksByCode[item.park];
      if (!parkId) continue;
      await db.run(
        `INSERT INTO visitor_logs (
          park_id,
          operator_id,
          visit_date,
          log_date,
          visitors_count,
          local_visitors,
          international_visitors,
          units_available,
          units_occupied,
          occupancy_rate,
          facility_feedback
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          parkId,
          item.operatorId,
          item.date,
          item.date,
          item.local + item.international,
          item.local,
          item.international,
          item.unitsAvailable,
          item.unitsOccupied,
          item.occupancy,
          item.notes
        ]
      );

      await db.run(
        `INSERT INTO occupancy_logs (park_id, operator_id, log_date, units_available, units_occupied)
         VALUES (?, ?, ?, ?, ?)`,
        [parkId, item.operatorId, item.date, item.unitsAvailable, item.unitsOccupied]
      );
    }
  }

  const envCount = await db.get(`SELECT COUNT(*) AS total FROM environmental_logs`);
  if ((envCount?.total || 0) < 4) {
    await db.run(
      `INSERT INTO environmental_logs (park_id, staff_id, category, description, incident_type, event_type, severity, status, location_lat, location_lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [parksByCode.HNP, users.officerNorth, 'water', 'Primary borehole flow interrupted.', 'dry', null, 'high', 'new', -18.629, 26.243]
    );
    await db.run(
      `INSERT INTO environmental_logs (park_id, staff_id, category, description, incident_type, event_type, severity, status, location_lat, location_lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [parksByCode.HNP, users.officerNorth, 'waste', 'Overflowing bins near main picnic area.', 'overflow', null, 'high', 'assigned', -18.634, 26.251]
    );
    await db.run(
      `INSERT INTO environmental_logs (park_id, staff_id, category, description, incident_type, event_type, severity, status, location_lat, location_lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [parksByCode.MP, users.officerWest, 'wildlife', 'Buffalo carcass discovered by patrol.', null, 'mortality', 'critical', 'in_progress', -16.820, 29.310]
    );
    await db.run(
      `INSERT INTO environmental_logs (park_id, staff_id, category, description, incident_type, event_type, severity, status, location_lat, location_lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [parksByCode.VF, users.officerWest, 'incident', 'Unauthorized campsite fire reported.', 'fire', null, 'high', 'new', -17.925, 25.846]
    );
  }

  const feedbackCount = await db.get(`SELECT COUNT(*) AS total FROM tourist_feedback`);
  if ((feedbackCount?.total || 0) < 6) {
    const feedbackSamples = [
      [parksByCode.HNP, 'Visitor Mary', 'tourist', 5, 'Excellent wildlife viewing and clean facilities.', 'device_demo_1', 'resolved'],
      [parksByCode.HNP, 'Visitor Joel', 'tourist', 2, 'Water points were dry near campsite B.', 'device_demo_1', 'new'],
      [parksByCode.MP, 'Visitor Tariro', 'tourist', 3, 'Guided walks were great but signage needs updates.', 'device_demo_2', 'assigned'],
      [parksByCode.VF, 'Operator West Team', 'operator', 2, 'Waste handling backlog affecting guest areas.', 'web_operator', 'in_progress'],
      [parksByCode.VF, 'Visitor Rudo', 'tourist', 1, 'Illegal dump near parking area.', 'device_demo_3', 'new'],
      [parksByCode.MP, 'Operator North Team', 'operator', 4, 'Occupancy stable and check-in smooth.', 'web_operator', 'resolved']
    ];

    for (const sample of feedbackSamples) {
      const [parkId, submittedBy, feedbackType, rating, comments, deviceId, status] = sample;
      const normalizedTouristFeedbackType = feedbackType === 'operator' ? 'tourism_operator' : feedbackType;
      const legacyInsert = await db.run(
        `INSERT INTO feedback (park_id, submitted_by, type, rating, comments, device_id, status, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [parkId, submittedBy, feedbackType, rating, comments, deviceId, status]
      );

      await db.run(
        `INSERT INTO tourist_feedback (legacy_feedback_id, park_id, submitted_by, type, rating, comments, device_id, status, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [legacyInsert.lastID, parkId, submittedBy, normalizedTouristFeedbackType, rating, comments, deviceId, status]
      );
    }
  }

  const incidentCount = await db.get(`SELECT COUNT(*) AS total FROM incidents`);
  if ((incidentCount?.total || 0) < 4) {
    await db.run(
      `INSERT INTO incidents (park_id, incident_type, description, severity, status, gps_lat, gps_lng, device_id, reported_by, reported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [parksByCode.HNP, 'water_supply', 'Dry water trench near sector A.', 'high', 'new', -18.621, 26.247, 'device_demo_1', users.officerNorth]
    );
    await db.run(
      `INSERT INTO incidents (park_id, incident_type, description, severity, status, gps_lat, gps_lng, device_id, reported_by, reported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [parksByCode.MP, 'wildlife_conflict', 'Human-wildlife conflict at buffer zone.', 'critical', 'assigned', -16.826, 29.302, 'device_demo_2', users.officerWest]
    );
    await db.run(
      `INSERT INTO incidents (park_id, incident_type, description, severity, status, gps_lat, gps_lng, device_id, reported_by, reported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [parksByCode.VF, 'illegal_dump', 'Illegal dumping reported by tourist.', 'high', 'in_progress', -17.932, 25.842, 'device_demo_3', users.officerWest]
    );
    await db.run(
      `INSERT INTO incidents (park_id, incident_type, description, severity, status, gps_lat, gps_lng, device_id, reported_by, reported_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [parksByCode.HNP, 'poaching', 'Snare traps discovered at patrol point 7.', 'medium', 'resolved', -18.639, 26.255, 'device_demo_4', users.officerNorth]
    );
  }

  await createAlert({
    parkId: parksByCode.HNP,
    sourceType: 'seed',
    sourceId: 1,
    alertType: 'water_status_issue',
    message: 'Seed alert: water status dry in Hwange sector A.',
    severity: 'critical',
    status: 'new'
  });
  await createAlert({
    parkId: parksByCode.MP,
    sourceType: 'seed',
    sourceId: 2,
    alertType: 'wildlife_event_issue',
    message: 'Seed alert: wildlife mortality event under review.',
    severity: 'critical',
    status: 'assigned'
  });
  await createAlert({
    parkId: parksByCode.VF,
    sourceType: 'seed',
    sourceId: 3,
    alertType: 'incident_high_severity',
    message: 'Seed alert: illegal dump incident requires escalation watch.',
    severity: 'critical',
    status: 'in_progress'
  });
}

async function seed() {
  await runMigrations();
  const db = await getDb();

  const parks = [
    { name: 'Hwange National Park', code: 'HNP', region: 'Matabeleland North' },
    { name: 'Mana Pools', code: 'MP', region: 'Mashonaland West' },
    { name: 'Victoria Falls', code: 'VF', region: 'Matabeleland North' }
  ];

  for (const park of parks) {
    await db.run(
      `INSERT OR IGNORE INTO parks (name, code, region) VALUES (?, ?, ?)`,
      [park.name, park.code, park.region]
    );
  }

  const parkRows = await db.all(`SELECT id, code FROM parks`);
  const parksByCode = Object.fromEntries(parkRows.map((row) => [row.code, row.id]));

  const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASSWORD || 'changeme123', 12);
  const officerPasswordHash = await bcrypt.hash('env12345', 12);
  const operatorPasswordHash = await bcrypt.hash('tour12345', 12);

  const adminId = await upsertUser(db, {
    name: 'Authority Admin',
    email: process.env.ADMIN_DEFAULT_EMAIL || 'admin@parksconnect.local',
    passwordHash: adminPasswordHash,
    role: 'authority_admin'
  });

  const operatorNorth = await upsertUser(db, {
    name: 'Tourism Operator North',
    email: 'operator1@parksconnect.local',
    passwordHash: operatorPasswordHash,
    role: 'tourism_operator'
  });

  const operatorWest = await upsertUser(db, {
    name: 'Tourism Operator West',
    email: 'operator2@parksconnect.local',
    passwordHash: operatorPasswordHash,
    role: 'tourism_operator'
  });

  const officerNorth = await upsertUser(db, {
    name: 'Environment Officer North',
    email: 'officer1@parksconnect.local',
    passwordHash: officerPasswordHash,
    role: 'environment_officer'
  });

  const officerWest = await upsertUser(db, {
    name: 'Environment Officer West',
    email: 'officer2@parksconnect.local',
    passwordHash: officerPasswordHash,
    role: 'environment_officer'
  });

  await ensureAssignment(db, operatorNorth, parksByCode.HNP, 'tourism_operator');
  await ensureAssignment(db, operatorWest, parksByCode.MP, 'tourism_operator');
  await ensureAssignment(db, officerNorth, parksByCode.HNP, 'environment_officer');
  await ensureAssignment(db, officerWest, parksByCode.VF, 'environment_officer');

  await db.run(
    `INSERT INTO alert_thresholds (metric, threshold, comparator, park_id)
     SELECT 'rating_drop_7d', 3, '<', NULL
     WHERE NOT EXISTS (SELECT 1 FROM alert_thresholds WHERE metric = 'rating_drop_7d' AND park_id IS NULL)`
  );
  await db.run(
    `INSERT INTO alert_thresholds (metric, threshold, comparator, park_id)
     SELECT 'incident_high', 1, '>=', NULL
     WHERE NOT EXISTS (SELECT 1 FROM alert_thresholds WHERE metric = 'incident_high' AND park_id IS NULL)`
  );

  const facilityTypes = [
    ['Lodge', 'Accommodation units and cabins'],
    ['Campsite', 'Tent and camping slots'],
    ['Water Point', 'Boreholes and water sources'],
    ['Waste Station', 'Waste sorting and disposal points']
  ];

  for (const [name, description] of facilityTypes) {
    await db.run(`INSERT OR IGNORE INTO facility_types (name, description) VALUES (?, ?)`, [name, description]);
  }

  const typeRows = await db.all(`SELECT id, name FROM facility_types`);
  const typeMap = Object.fromEntries(typeRows.map((row) => [row.name, row.id]));

  const facilities = [
    [parksByCode.HNP, typeMap.Lodge, 'Main Safari Lodge', 80, 66, 'active'],
    [parksByCode.HNP, typeMap['Water Point'], 'Borehole Cluster A', 10, 10, 'maintenance'],
    [parksByCode.MP, typeMap.Campsite, 'Riverbank Camp', 64, 38, 'active'],
    [parksByCode.VF, typeMap['Waste Station'], 'North Waste Hub', 20, 19, 'active']
  ];

  for (const facility of facilities) {
    const exists = await db.get(
      `SELECT id FROM facilities WHERE park_id = ? AND name = ?`,
      [facility[0], facility[2]]
    );
    if (!exists) {
      await db.run(
        `INSERT INTO facilities (park_id, facility_type_id, name, units_available, units_occupied, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        facility
      );
    }
  }

  await ensureSampleData(db, parksByCode, {
    adminId,
    operatorNorth,
    operatorWest,
    officerNorth,
    officerWest
  });
}

seed()
  .then(() => {
    console.log('Seed data inserted.');
  })
  .catch((err) => {
    console.error('Seed failed', err);
  })
  .finally(async () => {
    await closeDb();
  });
