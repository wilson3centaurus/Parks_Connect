import { getDb } from './db.js';

const WORKFLOW_STATUSES = ['new', 'assigned', 'in_progress', 'resolved', 'escalated'];

function normalizeStatus(status) {
  const normalized = String(status || 'new').trim().toLowerCase();
  if (normalized === 'open') return 'new';
  if (normalized === 'closed') return 'resolved';
  return WORKFLOW_STATUSES.includes(normalized) ? normalized : 'new';
}

function evaluateComparator(value, threshold, comparator = '>') {
  const left = Number(value);
  const right = Number(threshold);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (comparator === '>') return left > right;
  if (comparator === '>=') return left >= right;
  if (comparator === '<') return left < right;
  if (comparator === '<=') return left <= right;
  return false;
}

async function getThreshold(metric, parkId, defaultThreshold, defaultComparator = '>') {
  const db = await getDb();
  const row = await db.get(
    `SELECT threshold, comparator
     FROM alert_thresholds
     WHERE metric = ? AND (park_id = ? OR park_id IS NULL)
     ORDER BY CASE WHEN park_id = ? THEN 0 ELSE 1 END, id DESC
     LIMIT 1`,
    [metric, parkId || null, parkId || null]
  );
  return {
    threshold: row ? Number(row.threshold) : Number(defaultThreshold),
    comparator: row?.comparator || defaultComparator
  };
}

export async function createAlert({
  alertType,
  message,
  severity = 'warning',
  parkId = null,
  sourceType = null,
  sourceId = null,
  status = 'new',
  slaHours = Number(process.env.ALERT_SLA_HOURS || 24)
}) {
  const db = await getDb();
  const normalizedStatus = normalizeStatus(status);
  const safeSeverity = ['info', 'warning', 'critical'].includes(String(severity).toLowerCase())
    ? String(severity).toLowerCase()
    : 'warning';

  const duplicate = await db.get(
    `SELECT id
     FROM alerts
     WHERE alert_type = ?
       AND COALESCE(park_id, -1) = COALESCE(?, -1)
       AND message = ?
       AND status IN ('new','assigned','in_progress','escalated')
       AND created_at >= datetime('now', '-6 hours')
     LIMIT 1`,
    [alertType, parkId, message]
  );

  if (duplicate) {
    return duplicate.id;
  }

  const dueAt = normalizedStatus === 'resolved'
    ? null
    : `datetime('now', '+${Math.max(Number(slaHours) || 24, 1)} hours')`;

  const result = await db.run(
    `INSERT INTO alerts (
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
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ${dueAt ? dueAt : 'NULL'}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )`,
    [parkId, sourceType, sourceId, alertType, message, safeSeverity, normalizedStatus, 'none']
  );

  await db.run(
    `INSERT INTO notifications (park_id, type, message, severity, resolved)
     VALUES (?, ?, ?, ?, ?)`,
    [parkId, alertType, message, safeSeverity, normalizedStatus === 'resolved' ? 1 : 0]
  );

  return result.lastID;
}

export async function createNotification(type, message, severity = 'info', parkId = null) {
  await createAlert({
    alertType: type,
    message,
    severity,
    parkId,
    sourceType: 'manual_notification'
  });
}

async function handleRatingDropAlert(parkId, sourceType = 'tourist_feedback', sourceId = null) {
  const db = await getDb();
  const rule = await getThreshold('rating_drop_7d', parkId, 3, '<');
  const averageRow = await db.get(
    `SELECT AVG(rating) AS avg_rating
     FROM tourist_feedback
     WHERE park_id = ?
       AND submitted_at >= datetime('now', '-7 days')
       AND rating IS NOT NULL`,
    [parkId]
  );

  const avgRating = Number(averageRow?.avg_rating);
  if (!Number.isFinite(avgRating)) return;

  if (evaluateComparator(avgRating, rule.threshold, rule.comparator)) {
    await createAlert({
      parkId,
      sourceType,
      sourceId,
      alertType: 'rating_drop_7d',
      severity: 'warning',
      message: `Average rating over the last 7 days dropped to ${avgRating.toFixed(2)}.`
    });
  }
}

export async function generateThresholdNotifications({
  visitorsCount,
  occupancyRate,
  envCategory,
  envStatus,
  envSeverity,
  eventType,
  incidentSeverity,
  incidentType,
  rating,
  triggerRatingDropCheck,
  parkId,
  sourceType,
  sourceId
}) {
  if (!parkId) {
    return;
  }

  if (visitorsCount !== undefined && visitorsCount !== null) {
    const rule = await getThreshold('visitors', parkId, 500, '>');
    if (evaluateComparator(visitorsCount, rule.threshold, rule.comparator)) {
      await createAlert({
        parkId,
        sourceType: sourceType || 'visitor_log',
        sourceId,
        alertType: 'visitor_volume_high',
        message: `High visitor volume detected (${visitorsCount}).`,
        severity: 'warning'
      });
    }
  }

  if (occupancyRate !== undefined && occupancyRate !== null) {
    const rule = await getThreshold('occupancy', parkId, 0.85, '>');
    if (evaluateComparator(occupancyRate, rule.threshold, rule.comparator)) {
      await createAlert({
        parkId,
        sourceType: sourceType || 'visitor_log',
        sourceId,
        alertType: 'occupancy_threshold_exceeded',
        message: `Occupancy exceeded threshold at ${(Number(occupancyRate) * 100).toFixed(0)}%.`,
        severity: 'critical'
      });
    }
  }

  const category = String(envCategory || '').toLowerCase();
  const normalizedEnvStatus = String(envStatus || '').toLowerCase();
  const normalizedEventType = String(eventType || '').toLowerCase();

  if (category === 'water' && ['dry', 'broken'].includes(normalizedEnvStatus)) {
    await createAlert({
      parkId,
      sourceType: sourceType || 'environmental_log',
      sourceId,
      alertType: 'water_status_issue',
      message: `Water status flagged as ${normalizedEnvStatus}.`,
      severity: 'critical'
    });
  }

  if (category === 'waste' && ['overflow', 'illegal_dump'].includes(normalizedEnvStatus)) {
    await createAlert({
      parkId,
      sourceType: sourceType || 'environmental_log',
      sourceId,
      alertType: 'waste_status_issue',
      message: `Waste status flagged as ${normalizedEnvStatus}.`,
      severity: 'critical'
    });
  }

  if (category === 'wildlife' && ['mortality', 'conflict'].includes(normalizedEventType)) {
    await createAlert({
      parkId,
      sourceType: sourceType || 'environmental_log',
      sourceId,
      alertType: 'wildlife_event_issue',
      message: `Wildlife event recorded: ${normalizedEventType}.`,
      severity: 'critical'
    });
  }

  const normalizedEnvSeverity = String(envSeverity || '').toLowerCase();
  if (normalizedEnvSeverity === 'high' || normalizedEnvSeverity === 'critical') {
    await createAlert({
      parkId,
      sourceType: sourceType || 'environmental_log',
      sourceId,
      alertType: 'environment_high_severity',
      message: `Environmental severity reported as ${normalizedEnvSeverity}.`,
      severity: 'critical'
    });
  }

  const normalizedIncidentSeverity = String(incidentSeverity || '').toLowerCase();
  if (['high', 'critical'].includes(normalizedIncidentSeverity)) {
    await createAlert({
      parkId,
      sourceType: sourceType || 'incident',
      sourceId,
      alertType: 'incident_high_severity',
      message: `High-severity incident reported (${incidentType || 'incident'}).`,
      severity: 'critical'
    });
  }

  if (rating !== undefined && rating !== null && Number(rating) <= 2) {
    await createAlert({
      parkId,
      sourceType: sourceType || 'tourist_feedback',
      sourceId,
      alertType: 'low_feedback_rating',
      message: `Low feedback rating submitted (${Number(rating).toFixed(1)}/5).`,
      severity: 'warning'
    });
  }

  if (triggerRatingDropCheck) {
    await handleRatingDropAlert(parkId, sourceType, sourceId);
  }
}

export async function escalateOverdueAlerts() {
  const db = await getDb();
  const overdue = await db.all(
    `SELECT id, park_id, alert_type
     FROM alerts
     WHERE status IN ('new','assigned','in_progress')
       AND due_at IS NOT NULL
       AND due_at <= CURRENT_TIMESTAMP`
  );

  if (!overdue.length) {
    return 0;
  }

  for (const alert of overdue) {
    await db.run(
      `UPDATE alerts
       SET status = 'escalated',
           escalation_state = 'auto_sla',
           escalated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [alert.id]
    );

    await db.run(
      `INSERT INTO notifications (park_id, type, message, severity, resolved)
       VALUES (?, 'sla_escalation', ?, 'critical', 0)`,
      [alert.park_id, `Alert #${alert.id} escalated automatically after SLA breach.`]
    );
  }

  return overdue.length;
}
