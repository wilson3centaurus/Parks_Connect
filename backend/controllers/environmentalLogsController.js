import { getDb } from '../utils/db.js';
import { generateThresholdNotifications } from '../utils/notifier.js';
import { getAssignedParkIds, normalizeRole, resolveParkId } from '../utils/parks.js';

const ALLOWED_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_ENV_STATUSES = new Set(['new', 'assigned', 'in_progress', 'resolved', 'escalated']);

function normalizeSeverity(value) {
  const normalized = String(value || 'medium').trim().toLowerCase();
  return ALLOWED_SEVERITIES.has(normalized) ? normalized : null;
}

function normalizeStatus(value) {
  const normalized = String(value || 'new').trim().toLowerCase();
  if (normalized === 'open') return 'new';
  if (normalized === 'closed') return 'resolved';
  return ALLOWED_ENV_STATUSES.has(normalized) ? normalized : null;
}

function parseNullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createEnvironmentalLog(req, res) {
  const {
    category,
    description,
    severity: severityInput,
    incident_type: incidentTypeInput,
    event_type: eventTypeInput,
    status: statusInput,
    location_lat: locationLatInput,
    location_lng: locationLngInput,
    park_id: requestedParkId
  } = req.body;

  const normalizedCategory = String(category || '').trim().toLowerCase();
  if (!normalizedCategory || !description) {
    return res.status(400).json({ message: 'category and description required' });
  }

  const parkId = await resolveParkId(req.user, Number(requestedParkId), { allowFallbackToFirstPark: false });
  if (!parkId) {
    return res.status(400).json({ message: 'park_id is required for environmental logs' });
  }

  const severity = normalizeSeverity(severityInput || 'medium');
  if (!severity) {
    return res.status(400).json({ message: 'Invalid severity' });
  }

  const status = normalizeStatus(statusInput || 'new');
  if (!status) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const incidentType = String(incidentTypeInput || '').trim().toLowerCase() || null;
  const eventType = String(eventTypeInput || '').trim().toLowerCase() || null;

  const locationLat = parseNullableNumber(locationLatInput);
  const locationLng = parseNullableNumber(locationLngInput);
  if (locationLat !== null && (locationLat < -90 || locationLat > 90)) {
    return res.status(400).json({ message: 'location_lat must be between -90 and 90' });
  }
  if (locationLng !== null && (locationLng < -180 || locationLng > 180)) {
    return res.status(400).json({ message: 'location_lng must be between -180 and 180' });
  }

  const db = await getDb();
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
  const result = await db.run(
    `INSERT INTO environmental_logs (
      park_id,
      staff_id,
      category,
      description,
      incident_type,
      event_type,
      severity,
      status,
      location_lat,
      location_lng,
      photo_path
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      parkId,
      req.user?.id || null,
      normalizedCategory,
      String(description).trim(),
      incidentType,
      eventType,
      severity,
      status,
      locationLat,
      locationLng,
      photoPath
    ]
  );

  await generateThresholdNotifications({
    parkId,
    envCategory: normalizedCategory,
    envStatus: incidentType || status,
    envSeverity: severity,
    eventType,
    sourceType: 'environmental_log',
    sourceId: result.lastID
  });

  return res.status(201).json({
    id: result.lastID,
    park_id: parkId,
    photo_path: photoPath
  });
}

export async function listEnvironmentalLogs(req, res) {
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
    filters.push(`e.park_id IN (${allowedParks.map(() => '?').join(',')})`);
    params.push(...allowedParks);
  } else if (requestedParkId) {
    filters.push('e.park_id = ?');
    params.push(requestedParkId);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const logs = await db.all(
    `SELECT e.*, u.name as staff_name, p.name as park_name
     FROM environmental_logs e
     LEFT JOIN users u ON u.id = e.staff_id
     LEFT JOIN parks p ON p.id = e.park_id
     ${whereClause}
     ORDER BY e.created_at DESC`,
    params
  );

  return res.json(logs);
}
