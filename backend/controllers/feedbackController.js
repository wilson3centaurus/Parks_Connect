import { getDb } from '../utils/db.js';
import { getAssignedParkIds, normalizeRole, resolveParkId } from '../utils/parks.js';
import {
  feedbackConstants,
  normalizeFeedbackCategory,
  normalizeFeedbackChannel,
  normalizeVisitDate,
  validateFeedbackPayload
} from '../utils/feedbackSchema.js';
import { anchorRecordSafely } from '../services/blockchainService.js';

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

async function insertUnifiedFeedback(db, {
  parkId,
  submittedBy,
  type,
  rating,
  comments,
  category,
  channel,
  visitDate,
  gpsLat,
  gpsLng,
  photoPath,
  deviceId = null,
  sourceEmail = null,
  status = 'new'
}) {
  const legacyInsert = await db.run(
    `INSERT INTO feedback (
      park_id, submitted_by, type, category, rating, comments, channel, visit_date,
      gps_lat, gps_lng, photo_path, device_id, source_email, status, submitted_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      parkId,
      submittedBy,
      type === 'tourism_operator' ? 'operator' : 'tourist',
      category,
      rating,
      comments,
      channel,
      visitDate,
      gpsLat,
      gpsLng,
      photoPath,
      deviceId,
      sourceEmail,
      status
    ]
  );

  const inserted = await db.run(
    `INSERT INTO tourist_feedback (
      legacy_feedback_id, park_id, submitted_by, type, category, rating, comments, channel,
      visit_date, gps_lat, gps_lng, photo_path, device_id, source_email, status, submitted_at, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      legacyInsert.lastID,
      parkId,
      submittedBy,
      type,
      category,
      rating,
      comments,
      channel,
      visitDate,
      gpsLat,
      gpsLng,
      photoPath,
      deviceId,
      sourceEmail,
      status
    ]
  );

  return inserted.lastID;
}

export async function submitFeedback(req, res) {
  const role = normalizeRole(req.user?.role);
  const requestedParkNumeric = req.body.park_id ? Number(req.body.park_id) : null;
  const parkId = await resolveParkId(req.user, requestedParkNumeric, { allowFallbackToFirstPark: false });
  const validation = validateFeedbackPayload({ ...req.body, park_id: parkId });

  if (!validation.valid) {
    return res.status(400).json({ message: 'Validation failed', errors: validation.errors });
  }

  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;
  const gpsLat = parseNullableFloat(req.body?.gps_lat);
  const gpsLng = parseNullableFloat(req.body?.gps_lng);
  if (gpsLat !== null && (gpsLat < -90 || gpsLat > 90)) {
    return res.status(400).json({ message: 'gps_lat must be between -90 and 90' });
  }
  if (gpsLng !== null && (gpsLng < -180 || gpsLng > 180)) {
    return res.status(400).json({ message: 'gps_lng must be between -180 and 180' });
  }

  const type = role === 'tourism_operator' ? 'tourism_operator' : 'tourist';
  const db = await getDb();
  const id = await insertUnifiedFeedback(db, {
    parkId,
    submittedBy: req.body.submitted_by || req.user?.name || null,
    type,
    rating: validation.values.rating,
    comments: validation.values.comments,
    category: validation.values.category,
    channel: 'web',
    visitDate: validation.values.visitDate,
    gpsLat,
    gpsLng,
    photoPath
  });

  void anchorRecordSafely('FEEDBACK', String(id), {
    feedback_id: id,
    park_id: parkId,
    rating: validation.values.rating,
    channel: 'web'
  });

  return res.status(201).json({ id, photo_path: photoPath, park_id: parkId });
}

export async function submitPublicFeedback(req, res) {
  const validation = validateFeedbackPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ message: 'Validation failed', errors: validation.errors });
  }

  const db = await getDb();
  const id = await insertUnifiedFeedback(db, {
    parkId: validation.values.parkId,
    submittedBy: String(req.body.submitted_by || 'Web visitor').trim(),
    type: 'tourist',
    rating: validation.values.rating,
    comments: validation.values.comments,
    category: validation.values.category,
    channel: 'web',
    visitDate: validation.values.visitDate
  });

  void anchorRecordSafely('FEEDBACK', String(id), {
    feedback_id: id,
    park_id: validation.values.parkId,
    rating: validation.values.rating,
    channel: 'web'
  });

  return res.status(201).json({ id });
}

function extractEmailText(body) {
  return String(
    body.text ||
    body['body-plain'] ||
    body.plain ||
    body.html ||
    body.email_body ||
    ''
  );
}

function parseEmailStructuredPayload(text) {
  const lines = text.split(/\r?\n/);
  const parsed = {};
  for (const line of lines) {
    const match = line.match(/^\s*([a-z _-]+)\s*:\s*(.+)\s*$/i);
    if (!match) continue;
    const key = match[1].trim().toLowerCase().replace(/[\s-]+/g, '_');
    parsed[key] = match[2].trim();
  }
  return parsed;
}

export async function submitEmailFeedback(req, res) {
  const text = extractEmailText(req.body);
  const structured = parseEmailStructuredPayload(text);
  const merged = {
    park_id: req.body.park_id || structured.park_id,
    visit_date: req.body.visit_date || structured.visit_date,
    rating: req.body.rating || structured.rating,
    category: req.body.category || structured.category,
    comments: req.body.comments || structured.comment || structured.comments || text,
    channel: 'email'
  };

  const validation = validateFeedbackPayload(merged);
  if (!validation.valid) {
    return res.status(400).json({ message: 'Validation failed', errors: validation.errors });
  }

  const fromAddress = String(req.body.from || req.body.sender || req.body.email || '').trim() || null;
  const db = await getDb();
  const id = await insertUnifiedFeedback(db, {
    parkId: validation.values.parkId,
    submittedBy: fromAddress || 'Inbound email',
    type: 'tourist',
    rating: validation.values.rating,
    comments: validation.values.comments,
    category: validation.values.category,
    channel: 'email',
    visitDate: validation.values.visitDate,
    sourceEmail: fromAddress
  });

  void anchorRecordSafely('FEEDBACK', String(id), {
    feedback_id: id,
    park_id: validation.values.parkId,
    rating: validation.values.rating,
    channel: 'email'
  });

  return res.status(201).json({ id, channel: 'email' });
}

export async function listFeedback(req, res) {
  const db = await getDb();
  const role = normalizeRole(req.user.role);
  const allowedParks = await getAssignedParkIds(req.user);
  const requestedParkId = req.query.park_id ? Number(req.query.park_id) : null;
  const filters = [];
  const params = [];

  if (role !== 'authority_admin') {
    if (allowedParks.length === 0) return res.json(req.query.export === 'csv' ? '' : { rows: [], pagination: { total: 0 } });
    filters.push(`f.park_id IN (${allowedParks.map(() => '?').join(',')})`);
    params.push(...allowedParks);
  } else if (requestedParkId) {
    filters.push('f.park_id = ?');
    params.push(requestedParkId);
  }

  if (req.query.channel) {
    filters.push('f.channel = ?');
    params.push(normalizeFeedbackChannel(req.query.channel));
  }
  if (req.query.category) {
    filters.push('f.category = ?');
    params.push(normalizeFeedbackCategory(req.query.category));
  }
  if (req.query.rating) {
    filters.push('f.rating = ?');
    params.push(Number(req.query.rating));
  }
  if (req.query.start_date) {
    filters.push('f.visit_date >= ?');
    params.push(req.query.start_date);
  }
  if (req.query.end_date) {
    filters.push('f.visit_date <= ?');
    params.push(req.query.end_date);
  }
  if (req.query.search) {
    filters.push(`(LOWER(COALESCE(f.comments, '')) LIKE ? OR LOWER(COALESCE(f.submitted_by, '')) LIKE ?)`);
    params.push(`%${String(req.query.search).toLowerCase()}%`, `%${String(req.query.search).toLowerCase()}%`);
  }
  if (req.query.type) {
    filters.push('f.type = ?');
    params.push(String(req.query.type).trim().toLowerCase());
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const allowedSort = new Set(['visit_date', 'submitted_at', 'rating', 'category', 'channel', 'park_name']);
  const rawSort = String(req.query.sort_by || 'submitted_at');
  const sortBy = allowedSort.has(rawSort) ? rawSort : 'submitted_at';
  const sortDirection = String(req.query.sort_dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.page_size || 20), 1), 100);
  const offset = (page - 1) * pageSize;

  const totalRow = await db.get(
    `SELECT COUNT(*) AS total
     FROM tourist_feedback f
     ${whereClause}`,
    params
  );

  const rows = await db.all(
    `SELECT
      f.*,
      p.name as park_name
     FROM tourist_feedback f
     LEFT JOIN parks p ON p.id = f.park_id
     ${whereClause}
     ORDER BY ${sortBy === 'park_name' ? 'p.name' : `f.${sortBy}`} ${sortDirection}
     LIMIT ${pageSize}
     OFFSET ${offset}`,
    params
  );

  if (req.query.export === 'csv') {
    const header = ['park', 'visit_date', 'rating', 'category', 'channel', 'submitted_by', 'status', 'comments'];
    const lines = [header.join(',')];
    for (const row of rows) {
      lines.push([
        row.park_name || '',
        row.visit_date || '',
        row.rating || '',
        row.category || '',
        row.channel || '',
        row.submitted_by || '',
        row.status || '',
        `"${String(row.comments || '').replace(/"/g, '""')}"`
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="feedback_export.csv"');
    return res.send(lines.join('\n'));
  }

  return res.json({
    filters: {
      channels: feedbackConstants.ALLOWED_CHANNELS,
      categories: feedbackConstants.ALLOWED_CATEGORIES
    },
    rows,
    pagination: {
      total: Number(totalRow?.total || 0),
      page,
      pageSize
    }
  });
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

  await db.run(`UPDATE tourist_feedback SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, id]);
  if (feedback.legacy_feedback_id) {
    await db.run(`UPDATE feedback SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, feedback.legacy_feedback_id]);
  }

  return res.json({ message: 'updated' });
}
