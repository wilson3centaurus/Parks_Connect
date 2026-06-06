import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { getDb, closeDb } from '../utils/db.js';
import { runMigrations } from '../utils/migrate.js';
import { createAlert } from '../utils/notifier.js';

dotenv.config();

async function upsertUser(db, { name, email, passwordHash, role }) {
  const existing = await db.get(`SELECT id FROM users WHERE email = ?`, [email]);
  if (existing) {
    await db.run(`UPDATE users SET name = ?, password = ?, role = ? WHERE id = ?`, [name, passwordHash, role, existing.id]);
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

async function insertFeedbackRecord(db, {
  parkId,
  submittedBy,
  feedbackType,
  rating,
  comments,
  deviceId,
  status,
  category,
  channel,
  visitDate
}) {
  const normalizedTouristFeedbackType = feedbackType === 'operator' ? 'tourism_operator' : feedbackType;
  const existing = await db.get(
    `SELECT id FROM tourist_feedback
     WHERE park_id = ? AND submitted_by = ? AND comments = ? AND visit_date = ?`,
    [parkId, submittedBy, comments, visitDate]
  );

  if (existing) return existing.id;

  const legacyInsert = await db.run(
    `INSERT INTO feedback (park_id, submitted_by, type, category, rating, comments, channel, visit_date, device_id, status, submitted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [parkId, submittedBy, feedbackType, category, rating, comments, channel, visitDate, deviceId, status]
  );

  const inserted = await db.run(
    `INSERT INTO tourist_feedback (legacy_feedback_id, park_id, submitted_by, type, category, rating, comments, channel, visit_date, device_id, status, submitted_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [legacyInsert.lastID, parkId, submittedBy, normalizedTouristFeedbackType, category, rating, comments, channel, visitDate, deviceId, status]
  );

  return inserted.lastID;
}

async function ensureSampleData(db, parksByCode, users) {
  const visitorCount = await db.get(`SELECT COUNT(*) AS total FROM visitor_logs`);
  if ((visitorCount?.total || 0) < 18) {
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
      },
      {
        park: 'HNP',
        operatorId: users.operatorNorth,
        date: '2026-02-08',
        local: 245,
        international: 110,
        occupancy: 0.76,
        unitsAvailable: 80,
        unitsOccupied: 61,
        notes: 'School holiday traffic increased guided safari demand.'
      },
      {
        park: 'HNP',
        operatorId: users.operatorNorth,
        date: '2026-02-16',
        local: 210,
        international: 120,
        occupancy: 0.71,
        unitsAvailable: 80,
        unitsOccupied: 57,
        notes: 'Stable occupancy and strong photography-tour bookings.'
      },
      {
        park: 'MP',
        operatorId: users.operatorWest,
        date: '2026-02-07',
        local: 190,
        international: 86,
        occupancy: 0.64,
        unitsAvailable: 64,
        unitsOccupied: 41,
        notes: 'River activity tours performed well after weather cleared.'
      },
      {
        park: 'MP',
        operatorId: users.operatorWest,
        date: '2026-02-14',
        local: 205,
        international: 95,
        occupancy: 0.69,
        unitsAvailable: 64,
        unitsOccupied: 44,
        notes: 'Weekend family segment grew, campsites near full.'
      },
      {
        park: 'VF',
        operatorId: users.operatorWest,
        date: '2026-02-10',
        local: 295,
        international: 210,
        occupancy: 0.93,
        unitsAvailable: 92,
        unitsOccupied: 86,
        notes: 'Conference visitors pushed demand above forecast.'
      },
      {
        park: 'VF',
        operatorId: users.operatorWest,
        date: '2026-02-18',
        local: 265,
        international: 188,
        occupancy: 0.87,
        unitsAvailable: 92,
        unitsOccupied: 80,
        notes: 'Strong midweek demand and excellent tour conversion.'
      }
    ];

    for (const item of sampleVisitorLogs) {
      const parkId = parksByCode[item.park];
      if (!parkId) continue;
      const existing = await db.get(
        `SELECT id FROM visitor_logs WHERE park_id = ? AND operator_id = ? AND log_date = ?`,
        [parkId, item.operatorId, item.date]
      );
      if (existing) continue;
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
  if ((envCount?.total || 0) < 12) {
    const envSamples = [
      [parksByCode.HNP, users.officerNorth, 'water', 'Primary borehole flow interrupted.', 'dry', null, 'high', 'new', -18.629, 26.243],
      [parksByCode.HNP, users.officerNorth, 'waste', 'Overflowing bins near main picnic area.', 'overflow', null, 'high', 'assigned', -18.634, 26.251],
      [parksByCode.MP, users.officerWest, 'wildlife', 'Buffalo carcass discovered by patrol.', null, 'mortality', 'critical', 'in_progress', -16.820, 29.310],
      [parksByCode.VF, users.officerWest, 'incident', 'Unauthorized campsite fire reported.', 'fire', null, 'high', 'new', -17.925, 25.846],
      [parksByCode.HNP, users.officerNorth, 'wildlife', 'Elephant herd migrated toward the eastern corridor.', null, 'movement', 'medium', 'resolved', -18.604, 26.281],
      [parksByCode.MP, users.officerWest, 'water', 'River pump pressure reduced by sediment buildup.', 'low_pressure', null, 'medium', 'assigned', -16.814, 29.325],
      [parksByCode.VF, users.officerWest, 'waste', 'Recycling station backlog after weekend surge.', 'overflow', null, 'medium', 'new', -17.911, 25.828],
      [parksByCode.VF, users.officerWest, 'incident', 'Fence breach reported near service road.', 'security_breach', null, 'critical', 'in_progress', -17.938, 25.861]
    ];

    for (const item of envSamples) {
      const existing = await db.get(
        `SELECT id FROM environmental_logs WHERE park_id = ? AND description = ?`,
        [item[0], item[3]]
      );
      if (existing) continue;
      await db.run(
        `INSERT INTO environmental_logs (park_id, staff_id, category, description, incident_type, event_type, severity, status, location_lat, location_lng)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item
      );
    }
  }

  const feedbackCount = await db.get(`SELECT COUNT(*) AS total FROM tourist_feedback`);
  if ((feedbackCount?.total || 0) < 24) {
    const feedbackSamples = [
      [parksByCode.HNP, 'Visitor Mary', 'tourist', 5, 'Excellent wildlife viewing and clean facilities.', 'device_demo_1', 'resolved', 'wildlife', 'mobile', '2026-02-01'],
      [parksByCode.HNP, 'Visitor Joel', 'tourist', 2, 'Water points were dry near campsite B.', 'device_demo_1', 'new', 'facilities', 'mobile', '2026-02-02'],
      [parksByCode.MP, 'Visitor Tariro', 'tourist', 3, 'Guided walks were great but signage needs updates.', 'device_demo_2', 'assigned', 'staff', 'mobile', '2026-02-03'],
      [parksByCode.VF, 'Operator West Team', 'operator', 2, 'Waste handling backlog affecting guest areas.', 'web_operator', 'in_progress', 'facilities', 'web', '2026-02-04'],
      [parksByCode.VF, 'Visitor Rudo', 'tourist', 1, 'Danger near parking area after dark.', 'device_demo_3', 'new', 'safety', 'mobile', '2026-02-05'],
      [parksByCode.MP, 'Operator North Team', 'operator', 4, 'Occupancy stable and check-in smooth.', 'web_operator', 'resolved', 'general', 'web', '2026-02-06'],
      [parksByCode.HNP, 'Visitor Nomsa', 'tourist', 2, 'No water at the shared ablution block and dusty footpaths.', 'device_demo_5', 'new', 'facilities', 'mobile', '2026-02-07'],
      [parksByCode.HNP, 'Visitor Kelvin', 'tourist', 2, 'Dry taps again near camp, wildlife was great though.', 'device_demo_6', 'assigned', 'facilities', 'web', '2026-02-08'],
      [parksByCode.HNP, 'Visitor Laura', 'tourist', 3, 'Staff were helpful but the borehole area felt neglected.', 'device_demo_7', 'new', 'staff', 'email', '2026-02-09'],
      [parksByCode.MP, 'Visitor Patrick', 'tourist', 5, 'Outstanding canoe safari and very knowledgeable guides.', 'device_demo_8', 'resolved', 'wildlife', 'web', '2026-02-10'],
      [parksByCode.MP, 'Visitor Chipo', 'tourist', 4, 'Campsite was clean and ranger briefing was clear.', 'device_demo_9', 'resolved', 'staff', 'email', '2026-02-11'],
      [parksByCode.MP, 'Visitor Brian', 'tourist', 2, 'Facilities need urgent repair and shower pressure was poor.', 'device_demo_10', 'new', 'facilities', 'mobile', '2026-02-12'],
      [parksByCode.VF, 'Visitor Alice', 'tourist', 1, 'Robbery scare near the parking lane made us feel unsafe.', 'device_demo_11', 'new', 'safety', 'email', '2026-02-13'],
      [parksByCode.VF, 'Visitor Tawanda', 'tourist', 4, 'Spectacular views and smooth booking process.', 'device_demo_12', 'resolved', 'general', 'web', '2026-02-14'],
      [parksByCode.VF, 'Operator Falls Lodge', 'operator', 2, 'Facilities backlog continues around waste collection points.', 'web_operator_2', 'in_progress', 'facilities', 'web', '2026-02-15'],
      [parksByCode.VF, 'Visitor Miriam', 'tourist', 3, 'Great wildlife but some areas felt crowded.', 'device_demo_13', 'assigned', 'wildlife', 'mobile', '2026-02-16'],
      [parksByCode.HNP, 'Visitor Jabu', 'tourist', 5, 'Best game drive of our trip, lions spotted before sunrise.', 'device_demo_14', 'resolved', 'wildlife', 'email', '2026-02-17'],
      [parksByCode.MP, 'Visitor Ruth', 'tourist', 4, 'Very friendly staff and strong conservation messaging.', 'device_demo_15', 'resolved', 'staff', 'web', '2026-02-18']
    ];

    for (const sample of feedbackSamples) {
      const [parkId, submittedBy, feedbackType, rating, comments, deviceId, status, category, channel, visitDate] = sample;
      await insertFeedbackRecord(db, {
        parkId,
        submittedBy,
        feedbackType,
        rating,
        comments,
        deviceId,
        status,
        category,
        channel,
        visitDate
      });
    }
  }

  const incidentCount = await db.get(`SELECT COUNT(*) AS total FROM incidents`);
  if ((incidentCount?.total || 0) < 10) {
    const incidentSamples = [
      [parksByCode.HNP, 'water_supply', 'Dry water trench near sector A.', 'high', 'new', -18.621, 26.247, 'device_demo_1', users.officerNorth],
      [parksByCode.MP, 'wildlife_conflict', 'Human-wildlife conflict at buffer zone.', 'critical', 'assigned', -16.826, 29.302, 'device_demo_2', users.officerWest],
      [parksByCode.VF, 'illegal_dump', 'Illegal dumping reported by tourist.', 'high', 'in_progress', -17.932, 25.842, 'device_demo_3', users.officerWest],
      [parksByCode.HNP, 'poaching', 'Snare traps discovered at patrol point 7.', 'medium', 'resolved', -18.639, 26.255, 'device_demo_4', users.officerNorth],
      [parksByCode.VF, 'security_breach', 'Unverified threat reported by night patrol.', 'critical', 'assigned', -17.919, 25.844, 'device_demo_16', users.officerWest],
      [parksByCode.MP, 'facility_damage', 'Jetty handrail broken after heavy use.', 'medium', 'new', -16.801, 29.318, 'device_demo_17', users.officerWest]
    ];

    for (const item of incidentSamples) {
      const existing = await db.get(
        `SELECT id FROM incidents WHERE park_id = ? AND description = ?`,
        [item[0], item[2]]
      );
      if (existing) continue;
      await db.run(
        `INSERT INTO incidents (park_id, incident_type, description, severity, status, gps_lat, gps_lng, device_id, reported_by, reported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        item
      );
    }
  }

  const exportCount = await db.get(`SELECT COUNT(*) AS total FROM report_exports`);
  if ((exportCount?.total || 0) < 4) {
    const exportSamples = [
      [parksByCode.HNP, 'visitor-summary', '/exports/visitor_summary_hnp_may_2026.pdf', 'https://parks-connect-api.vercel.app/exports/visitor_summary_hnp_may_2026.pdf', users.adminId],
      [parksByCode.MP, 'environmental-status', '/exports/environmental_status_mp_may_2026.pdf', 'https://parks-connect-api.vercel.app/exports/environmental_status_mp_may_2026.pdf', users.hqAnalystId],
      [parksByCode.VF, 'revenue-report', '/exports/revenue_report_vf_may_2026.pdf', 'https://parks-connect-api.vercel.app/exports/revenue_report_vf_may_2026.pdf', users.sysadminId],
      [parksByCode.HNP, 'blockchain-audit-trail', '/exports/blockchain_audit_hnp_may_2026.pdf', 'https://parks-connect-api.vercel.app/exports/blockchain_audit_hnp_may_2026.pdf', users.parkManagerId]
    ];

    for (const sample of exportSamples) {
      const existing = await db.get(
        `SELECT id FROM report_exports WHERE park_id = ? AND report_type = ? AND file_path = ?`,
        [sample[0], sample[1], sample[2]]
      );
      if (existing) continue;
      await db.run(
        `INSERT INTO report_exports (park_id, report_type, file_path, file_url, generated_by)
         VALUES (?, ?, ?, ?, ?)`,
        sample
      );
    }
  }

  await createAlert({
    parkId: parksByCode.HNP,
    sourceType: 'seed',
    sourceId: 1,
    alertType: 'water_status_issue',
    message: 'Seed alert: water status dry in Hwange sector A.',
    severity: 'critical',
    status: 'open'
  });
  await createAlert({
    parkId: parksByCode.MP,
    sourceType: 'seed',
    sourceId: 2,
    alertType: 'wildlife_event_issue',
    message: 'Seed alert: wildlife mortality event under review.',
    severity: 'critical',
    status: 'acknowledged'
  });
  await createAlert({
    parkId: parksByCode.VF,
    sourceType: 'seed',
    sourceId: 3,
    alertType: 'incident_high_severity',
    message: 'Seed alert: illegal dump incident requires escalation watch.',
    severity: 'critical',
    status: 'acknowledged'
  });
}

async function seed() {
  await runMigrations();
  const db = await getDb();

  const parks = [
    { name: 'Hwange National Park', code: 'HNP', region: 'Matabeleland North', managerEmail: 'hwange.manager@parksconnect.local', dailyCapacityLimit: 8 },
    { name: 'Mana Pools', code: 'MP', region: 'Mashonaland West', managerEmail: 'manapools.manager@parksconnect.local', dailyCapacityLimit: 8 },
    { name: 'Victoria Falls', code: 'VF', region: 'Matabeleland North', managerEmail: 'vicfalls.manager@parksconnect.local', dailyCapacityLimit: 8 }
  ];

  for (const park of parks) {
    await db.run(
      `INSERT INTO parks (name, code, region, manager_email, daily_capacity_limit)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (code) DO UPDATE
       SET region = EXCLUDED.region,
           manager_email = EXCLUDED.manager_email,
           daily_capacity_limit = EXCLUDED.daily_capacity_limit`,
      [park.name, park.code, park.region, park.managerEmail, park.dailyCapacityLimit]
    );
  }

  const parkRows = await db.all(`SELECT id, code FROM parks`);
  const parksByCode = Object.fromEntries(parkRows.map((row) => [row.code, row.id]));

  const adminPasswordHash = await bcrypt.hash(process.env.ADMIN_DEFAULT_PASSWORD || 'changeme123', 12);
  const demoPassword = process.env.DEMO_USER_PASSWORD || 'demo1234';
  const demoPasswordHash = await bcrypt.hash(demoPassword, 12);

  const adminId = await upsertUser(db, {
    name: 'Authority Admin',
    email: process.env.ADMIN_DEFAULT_EMAIL || 'admin@parksconnect.local',
    passwordHash: adminPasswordHash,
    role: 'authority_admin'
  });

  const operatorNorth = await upsertUser(db, {
    name: 'Tourism Operator North',
    email: 'operator1@parksconnect.local',
    passwordHash: demoPasswordHash,
    role: 'tourism_operator'
  });

  const operatorWest = await upsertUser(db, {
    name: 'Tourism Operator West',
    email: 'operator2@parksconnect.local',
    passwordHash: demoPasswordHash,
    role: 'tourism_operator'
  });

  const officerNorth = await upsertUser(db, {
    name: 'Environment Officer North',
    email: 'officer1@parksconnect.local',
    passwordHash: demoPasswordHash,
    role: 'environment_officer'
  });

  const officerWest = await upsertUser(db, {
    name: 'Environment Officer West',
    email: 'officer2@parksconnect.local',
    passwordHash: demoPasswordHash,
    role: 'environment_officer'
  });

  const sysadminId = await upsertUser(db, {
    name: 'System Administrator Demo',
    email: 'sysadmin.demo@parksconnect.local',
    passwordHash: demoPasswordHash,
    role: 'authority_admin'
  });

  const hqAnalystId = await upsertUser(db, {
    name: 'HQ Analyst Demo',
    email: 'hqanalyst.demo@parksconnect.local',
    passwordHash: demoPasswordHash,
    role: 'authority_admin'
  });

  const parkManagerId = await upsertUser(db, {
    name: 'Park Manager Demo',
    email: 'parkmanager.demo@parksconnect.local',
    passwordHash: demoPasswordHash,
    role: 'authority_admin'
  });

  const rangerId = await upsertUser(db, {
    name: 'Ranger Demo',
    email: 'ranger.demo@parksconnect.local',
    passwordHash: demoPasswordHash,
    role: 'environment_officer'
  });

  const receptionId = await upsertUser(db, {
    name: 'Reception Demo',
    email: 'reception.demo@parksconnect.local',
    passwordHash: demoPasswordHash,
    role: 'tourism_operator'
  });

  const touristId = await upsertUser(db, {
    name: 'Tourist Demo',
    email: 'tourist.demo@parksconnect.local',
    passwordHash: demoPasswordHash,
    role: 'tourist'
  });

  await ensureAssignment(db, operatorNorth, parksByCode.HNP, 'tourism_operator');
  await ensureAssignment(db, operatorWest, parksByCode.MP, 'tourism_operator');
  await ensureAssignment(db, officerNorth, parksByCode.HNP, 'environment_officer');
  await ensureAssignment(db, officerWest, parksByCode.VF, 'environment_officer');
  await ensureAssignment(db, rangerId, parksByCode.MP, 'environment_officer');
  await ensureAssignment(db, receptionId, parksByCode.VF, 'tourism_operator');

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
    await db.run(
      `INSERT INTO facility_types (name, description)
       VALUES (?, ?)
       ON CONFLICT (name) DO NOTHING`,
      [name, description]
    );
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
    sysadminId,
    hqAnalystId,
    parkManagerId,
    operatorNorth,
    operatorWest,
    officerNorth,
    officerWest,
    rangerId,
    receptionId,
    touristId
  });

  console.log('Demo accounts ready:');
  console.log(`- admin@parksconnect.local / ${process.env.ADMIN_DEFAULT_PASSWORD || 'changeme123'} (authority_admin)`);
  console.log(`- sysadmin.demo@parksconnect.local / ${demoPassword} (sysadmin demo -> authority_admin)`);
  console.log(`- hqanalyst.demo@parksconnect.local / ${demoPassword} (hq analyst demo -> authority_admin)`);
  console.log(`- parkmanager.demo@parksconnect.local / ${demoPassword} (park manager demo -> authority_admin)`);
  console.log(`- officer1@parksconnect.local / ${demoPassword} (environment_officer)`);
  console.log(`- ranger.demo@parksconnect.local / ${demoPassword} (ranger demo -> environment_officer)`);
  console.log(`- operator1@parksconnect.local / ${demoPassword} (tourism_operator)`);
  console.log(`- reception.demo@parksconnect.local / ${demoPassword} (reception demo -> tourism_operator)`);
  console.log(`- tourist.demo@parksconnect.local / ${demoPassword} (tourist mobile account)`);
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
