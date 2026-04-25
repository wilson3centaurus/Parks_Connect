import { getDb } from '../utils/db.js';
import { generateThresholdNotifications } from '../utils/notifier.js';
import { getAssignedParkIds, normalizeRole, resolveParkId } from '../utils/parks.js';

function parseInteger(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatValue(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

export async function createVisitorLog(req, res) {
  const {
    visit_date: visitDate,
    visitors_count: visitorsCountRaw,
    local_visitors: localVisitorsRaw,
    international_visitors: internationalVisitorsRaw,
    occupancy_rate: occupancyRateRaw,
    units_available: unitsAvailableRaw,
    units_occupied: unitsOccupiedRaw,
    facility_feedback: facilityFeedback,
    park_id: requestedParkId
  } = req.body;

  if (!visitDate || !isValidDate(visitDate)) {
    return res.status(400).json({ message: 'visit_date is required in YYYY-MM-DD format' });
  }

  const parkId = await resolveParkId(req.user, Number(requestedParkId), { allowFallbackToFirstPark: false });
  if (!parkId) {
    return res.status(400).json({ message: 'park_id is required for visitor logs' });
  }

  const localCount = parseInteger(localVisitorsRaw, 0);
  const intlCount = parseInteger(internationalVisitorsRaw, 0);
  let total = visitorsCountRaw !== undefined ? parseInteger(visitorsCountRaw, null) : localCount + intlCount;

  if (localCount === null || intlCount === null || total === null) {
    return res.status(400).json({ message: 'visitor counts must be integers' });
  }
  if (localCount < 0 || intlCount < 0 || total < 0) {
    return res.status(400).json({ message: 'visitor counts cannot be negative' });
  }

  if (visitorsCountRaw === undefined) {
    total = localCount + intlCount;
  }

  const unitsAvailable = parseInteger(unitsAvailableRaw, 0);
  const unitsOccupied = parseInteger(unitsOccupiedRaw, 0);
  if (unitsAvailable === null || unitsOccupied === null || unitsAvailable < 0 || unitsOccupied < 0) {
    return res.status(400).json({ message: 'units_available and units_occupied must be non-negative integers' });
  }
  if (unitsOccupied > unitsAvailable) {
    return res.status(400).json({ message: 'units_occupied cannot exceed units_available' });
  }

  const occupancyRate = parseFloatValue(occupancyRateRaw, null);
  if (occupancyRate !== null && (occupancyRate < 0 || occupancyRate > 1)) {
    return res.status(400).json({ message: 'occupancy_rate must be between 0 and 1' });
  }

  const db = await getDb();
  const result = await db.run(
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
      req.user?.id || null,
      visitDate,
      visitDate,
      total,
      localCount,
      intlCount,
      unitsAvailable,
      unitsOccupied,
      occupancyRate,
      facilityFeedback || null
    ]
  );

  await db.run(
    `INSERT INTO occupancy_logs (park_id, operator_id, log_date, units_available, units_occupied)
     VALUES (?, ?, ?, ?, ?)`,
    [parkId, req.user?.id || null, visitDate, unitsAvailable, unitsOccupied]
  );

  await generateThresholdNotifications({
    visitorsCount: total,
    occupancyRate,
    parkId,
    sourceType: 'visitor_log',
    sourceId: result.lastID
  });

  return res.status(201).json({ id: result.lastID, park_id: parkId });
}

export async function listVisitorLogs(req, res) {
  const db = await getDb();
  const role = normalizeRole(req.user.role);
  const allowedParks = await getAssignedParkIds(req.user);
  const requestedParkId = req.query.park_id ? Number(req.query.park_id) : null;
  const filters = [];
  const params = [];

  if (role !== 'authority_admin') {
    if (allowedParks.length === 0) {
      return res.json([]);
    }
    filters.push(`v.park_id IN (${allowedParks.map(() => '?').join(',')})`);
    params.push(...allowedParks);
  } else if (requestedParkId) {
    filters.push('v.park_id = ?');
    params.push(requestedParkId);
  }

  if (role === 'tourism_operator') {
    filters.push('v.operator_id = ?');
    params.push(req.user.id);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const logs = await db.all(
    `SELECT v.*, u.name as operator_name, p.name as park_name
     FROM visitor_logs v
     LEFT JOIN users u ON u.id = v.operator_id
     LEFT JOIN parks p ON p.id = v.park_id
     ${whereClause}
     ORDER BY v.log_date DESC, v.created_at DESC`,
    params
  );

  return res.json(logs);
}
