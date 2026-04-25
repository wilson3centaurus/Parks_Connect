import { getDb } from '../utils/db.js';
import { generateThresholdNotifications } from '../utils/notifier.js';

const DUPLICATE_RADIUS_METERS = Number(process.env.INCIDENT_DUPLICATE_RADIUS_METERS || 300);
const DUPLICATE_WINDOW_MINUTES = Number(process.env.INCIDENT_DUPLICATE_WINDOW_MINUTES || 60);

function parseNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSeverity(value) {
  const normalized = String(value || 'medium').trim().toLowerCase();
  if (['low', 'medium', 'high', 'critical'].includes(normalized)) {
    return normalized;
  }
  return 'medium';
}

function resolveDeviceId(req) {
  const headerValue = req.headers['x-device-id'];
  const bodyValue = req.body?.device_id;
  return String(bodyValue || headerValue || '').trim() || null;
}

function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function toUploadUrl(file) {
  if (!file?.filename) return null;
  return `/uploads/${file.filename}`;
}

function normalizeFeedbackStatus(rawStatus = 'new') {
  const status = String(rawStatus || 'new').trim().toLowerCase();
  if (status === 'open') return 'new';
  if (status === 'closed') return 'resolved';
  if (['new', 'assigned', 'in_progress', 'resolved', 'escalated'].includes(status)) return status;
  return 'new';
}

export async function submitMobileFeedback(req, res) {
  try {
    const db = await getDb();
    const parkId = parseNumber(req.body?.park_id);
    const rating = parseNumber(req.body?.rating);
    const comments = String(req.body?.comments || '').trim();
    const submittedBy = String(req.body?.submitted_by || '').trim() || null;
    const deviceId = resolveDeviceId(req);
    const gpsLat = parseNumber(req.body?.gps_lat);
    const gpsLng = parseNumber(req.body?.gps_lng);
    const status = normalizeFeedbackStatus(req.body?.status || 'new');

    if (!parkId) {
      return res.status(400).json({ message: 'park_id is required' });
    }
    if (!comments) {
      return res.status(400).json({ message: 'comments required' });
    }
    if (rating === null || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'rating must be between 1 and 5' });
    }

    const park = await db.get(`SELECT id FROM parks WHERE id = ?`, [parkId]);
    if (!park) {
      return res.status(400).json({ message: 'Invalid park_id' });
    }

    const photoPath = toUploadUrl(req.file);
    const legacyInsert = await db.run(
      `INSERT INTO feedback (park_id, submitted_by, type, rating, comments, gps_lat, gps_lng, photo_path, device_id, status, submitted_at)
       VALUES (?, ?, 'tourist', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [parkId, submittedBy, rating, comments, gpsLat, gpsLng, photoPath, deviceId, status]
    );

    const inserted = await db.run(
      `INSERT INTO tourist_feedback (legacy_feedback_id, park_id, submitted_by, type, rating, comments, gps_lat, gps_lng, photo_path, device_id, status)
       VALUES (?, ?, ?, 'tourist', ?, ?, ?, ?, ?, ?, ?)`,
      [legacyInsert.lastID, parkId, submittedBy, rating, comments, gpsLat, gpsLng, photoPath, deviceId, status]
    );

    await generateThresholdNotifications({
      rating,
      parkId,
      triggerRatingDropCheck: true,
      sourceType: 'tourist_feedback',
      sourceId: inserted.lastID
    });

    return res.status(201).json({
      id: inserted.lastID,
      park_id: parkId,
      device_id: deviceId,
      photo_path: photoPath
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to submit mobile feedback' });
  }
}

export async function listMobileFeedback(req, res) {
  try {
    const db = await getDb();
    const deviceId = String(req.query?.device_id || req.headers['x-device-id'] || '').trim();
    if (!deviceId) {
      return res.status(400).json({ message: 'device_id is required' });
    }

    const rows = await db.all(
      `SELECT id, park_id, submitted_by, type, rating, comments, gps_lat, gps_lng, photo_path, status, submitted_at
       FROM tourist_feedback
       WHERE device_id = ?
       ORDER BY submitted_at DESC
       LIMIT 100`,
      [deviceId]
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to fetch mobile feedback' });
  }
}

export async function submitMobileIncident(req, res) {
  try {
    const db = await getDb();

    const parkId = parseNumber(req.body?.park_id);
    const incidentType = String(req.body?.incident_type || '').trim().toLowerCase();
    const description = String(req.body?.description || '').trim() || null;
    const severity = normalizeSeverity(req.body?.severity);
    const status = normalizeFeedbackStatus(req.body?.status || 'new');
    const deviceId = resolveDeviceId(req);
    const gpsLat = parseNumber(req.body?.gps_lat ?? req.body?.location_lat);
    const gpsLng = parseNumber(req.body?.gps_lng ?? req.body?.location_lng);

    if (!parkId) {
      return res.status(400).json({ message: 'park_id is required' });
    }
    if (!incidentType) {
      return res.status(400).json({ message: 'incident_type is required' });
    }

    const park = await db.get(`SELECT id FROM parks WHERE id = ?`, [parkId]);
    if (!park) {
      return res.status(400).json({ message: 'Invalid park_id' });
    }

    if (gpsLat !== null && (gpsLat < -90 || gpsLat > 90)) {
      return res.status(400).json({ message: 'gps_lat is invalid' });
    }
    if (gpsLng !== null && (gpsLng < -180 || gpsLng > 180)) {
      return res.status(400).json({ message: 'gps_lng is invalid' });
    }

    const timeWindow = `-${Math.max(DUPLICATE_WINDOW_MINUTES, 1)} minutes`;
    const potentialDuplicates = await db.all(
      `SELECT id, gps_lat, gps_lng, reported_at
       FROM incidents
       WHERE park_id = ?
         AND lower(incident_type) = ?
         AND reported_at >= datetime('now', ?)
       ORDER BY reported_at DESC`,
      [parkId, incidentType, timeWindow]
    );

    if (gpsLat !== null && gpsLng !== null) {
      for (const existing of potentialDuplicates) {
        if (existing.gps_lat === null || existing.gps_lng === null) continue;
        const distance = haversineDistanceMeters(gpsLat, gpsLng, Number(existing.gps_lat), Number(existing.gps_lng));
        if (distance <= DUPLICATE_RADIUS_METERS) {
          return res.status(200).json({
            duplicate: true,
            id: existing.id,
            message: 'Existing incident found in the same area and time window.'
          });
        }
      }
    }

    const photoPath = toUploadUrl(req.file);
    const created = await db.run(
      `INSERT INTO incidents (park_id, incident_type, description, severity, status, gps_lat, gps_lng, photo_path, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [parkId, incidentType, description, severity, status, gpsLat, gpsLng, photoPath, deviceId]
    );

    await generateThresholdNotifications({
      parkId,
      incidentSeverity: severity,
      incidentType,
      sourceType: 'incident',
      sourceId: created.lastID
    });

    return res.status(201).json({
      duplicate: false,
      id: created.lastID,
      park_id: parkId,
      device_id: deviceId,
      photo_path: photoPath
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to submit mobile incident' });
  }
}

export async function listMobileIncidents(req, res) {
  try {
    const db = await getDb();
    const deviceId = String(req.query?.device_id || req.headers['x-device-id'] || '').trim();
    if (!deviceId) {
      return res.status(400).json({ message: 'device_id is required' });
    }

    const rows = await db.all(
      `SELECT id, park_id, incident_type, description, severity, status, gps_lat, gps_lng, photo_path, reported_at
       FROM incidents
       WHERE device_id = ?
       ORDER BY reported_at DESC
       LIMIT 100`,
      [deviceId]
    );

    return res.json(rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Unable to fetch mobile incidents' });
  }
}
