import { getDb } from '../utils/db.js';
import { generateThresholdNotifications } from '../utils/notifier.js';
import { getAssignedParkIds, normalizeRole, resolveParkId } from '../utils/parks.js';

const ALLOWED_STATUSES = new Set(['new', 'assigned', 'in_progress', 'resolved', 'escalated']);

function normalizeStatus(status) {
  const normalized = String(status || 'new').trim().toLowerCase();
  if (normalized === 'open') return 'new';
  if (normalized === 'closed') return 'resolved';
  return ALLOWED_STATUSES.has(normalized) ? normalized : null;
}

function parseNullableFloat(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function submitFeedback(req, res) {
  const {
    submitted_by: submittedBy,
    type: typeInput,
    rating: ratingInput,
    comments,
    gps_lat: gpsLatInput,
    gps_lng: gpsLngInput,
    park_id: requestedParkId
  } = req.body;

  if (!comments || !String(comments).trim()) {
    return res.status(400).json({ message: 'comments required' });
  }

  const role = normalizeRole(req.user?.role);
  const requestedParkNumeric = requestedParkId ? Number(requestedParkId) : null;
  const parkId = await resolveParkId(req.user, requestedParkNumeric, { allowFallbackToFirstPark: false });
  if (!parkId) {
    return res.status(400).json({ message: 'park_id is required' });
  }

  const parsedRating = Number(ratingInput);
  if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return res.status(400).json({ message: 'rating must be between 1 and 5' });
  }

  const type = role === 'tourism_operator' || String(typeInput).toLowerCase() === 'tourism_operator'
    ? 'tourism_operator'
    : 'tourist';
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
  const gpsLat = parseNullableFloat(gpsLatInput);
  const gpsLng = parseNullableFloat(gpsLngInput);

  if (gpsLat !== null && (gpsLat < -90 || gpsLat > 90)) {
    return res.status(400).json({ message: 'gps_lat must be between -90 and 90' });
  }
  if (gpsLng !== null && (gpsLng < -180 || gpsLng > 180)) {
    return res.status(400).json({ message: 'gps_lng must be between -180 and 180' });
  }

  const db = await getDb();
  const legacyInsert = await db.run(
    `INSERT INTO feedback (park_id, submitted_by, type, rating, comments, gps_lat, gps_lng, photo_path, status, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP)`,
    [
      parkId,
      submittedBy || req.user?.name || null,
      type === 'tourism_operator' ? 'operator' : 'tourist',
      parsedRating,
      String(comments).trim(),
      gpsLat,
      gpsLng,
      photoPath
    ]
  );

  const inserted = await db.run(
    `INSERT INTO tourist_feedback (legacy_feedback_id, park_id, submitted_by, type, rating, comments, gps_lat, gps_lng, photo_path, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
    [
      legacyInsert.lastID,
      parkId,
      submittedBy || req.user?.name || null,
      type,
      parsedRating,
      String(comments).trim(),
      gpsLat,
      gpsLng,
      photoPath
    ]
  );

  await generateThresholdNotifications({
    rating: parsedRating,
    parkId,
    triggerRatingDropCheck: true,
    sourceType: 'tourist_feedback',
    sourceId: inserted.lastID
  });

  return res.status(201).json({ id: inserted.lastID, photo_path: photoPath, park_id: parkId });
}

export async function listFeedback(req, res) {
  const db = await getDb();
  const role = normalizeRole(req.user.role);
  const allowedParks = await getAssignedParkIds(req.user);
  const requestedParkId = req.query.park_id ? Number(req.query.park_id) : null;
  const filters = [];
  const params = [];

  if (role !== 'authority_admin') {
    if (allowedParks.length === 0) return res.json([]);
    filters.push(`f.park_id IN (${allowedParks.map(() => '?').join(',')})`);
    params.push(...allowedParks);
  } else if (requestedParkId) {
    filters.push('f.park_id = ?');
    params.push(requestedParkId);
  }

  if (req.query.type) {
    filters.push('f.type = ?');
    params.push(String(req.query.type).trim().toLowerCase());
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await db.all(
    `SELECT f.*, p.name as park_name
     FROM tourist_feedback f
     LEFT JOIN parks p ON p.id = f.park_id
     ${whereClause}
     ORDER BY f.submitted_at DESC`,
    params
  );

  return res.json(rows);
}

export async function updateFeedbackStatus(req, res) {
  const { id } = req.params;
  const status = normalizeStatus(req.body?.status);
  if (!status) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  const db = await getDb();
  const feedback = await db.get(`SELECT id, park_id, legacy_feedback_id FROM tourist_feedback WHERE id = ?`, [id]);
  if (!feedback) return res.status(404).json({ message: 'Feedback not found' });

  if (normalizeRole(req.user?.role) !== 'authority_admin') {
    const allowed = await getAssignedParkIds(req.user);
    if (!allowed.includes(feedback.park_id)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
  }

  await db.run(`UPDATE tourist_feedback SET status = ? WHERE id = ?`, [status, id]);
  if (feedback.legacy_feedback_id) {
    await db.run(`UPDATE feedback SET status = ? WHERE id = ?`, [status, feedback.legacy_feedback_id]);
  }

  return res.json({ message: 'updated' });
}
