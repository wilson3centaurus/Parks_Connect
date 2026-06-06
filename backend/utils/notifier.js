import { getDb } from './db.js';
import { sendAlertEmail } from './mailer.js';
import { detectFeedbackAlerts } from './alertEngine.js';

const LEGACY_STATUS_MAP = {
  open: 'new',
  acknowledged: 'assigned',
  resolved: 'resolved'
};

const LEGACY_SEVERITY_MAP = {
  low: 'info',
  medium: 'info',
  high: 'warning',
  critical: 'critical'
};

const OPEN_ALERT_STATUSES = ['open', 'acknowledged'];

function normalizeAlertStatus(status = 'open') {
  const normalized = String(status || 'open').trim().toLowerCase();
  return ['open', 'acknowledged', 'resolved'].includes(normalized) ? normalized : 'open';
}

function normalizeAlertSeverity(severity = 'medium') {
  const normalized = String(severity || 'medium').trim().toLowerCase();
  return ['low', 'medium', 'high', 'critical'].includes(normalized) ? normalized : 'medium';
}

async function findManagerEmail(parkId) {
  if (!parkId) return null;
  const db = await getDb();
  const row = await db.get(`SELECT manager_email, name FROM parks WHERE id = ?`, [parkId]);
  return row || null;
}

export async function createAlert({
  alertType,
  message,
  summaryText = null,
  severity = 'medium',
  parkId = null,
  sourceType = null,
  sourceId = null,
  status = 'open',
  triggeredAt = null
}) {
  const db = await getDb();
  const normalizedStatus = normalizeAlertStatus(status);
  const normalizedSeverity = normalizeAlertSeverity(severity);
  const duplicate = await db.get(
    `SELECT id
     FROM alerts
     WHERE alert_type = ?
       AND COALESCE(park_id, -1) = COALESCE(?, -1)
       AND COALESCE(summary_text, message) = ?
       AND COALESCE(alert_status, 'open') IN ('open', 'acknowledged')
       AND COALESCE(triggered_at, created_at) >= NOW() - INTERVAL '12 hours'
     LIMIT 1`,
    [alertType, parkId, summaryText || message]
  );

  if (duplicate) {
    return duplicate.id;
  }

  const result = await db.run(
    `INSERT INTO alerts (
      park_id,
      source_type,
      source_id,
      alert_type,
      message,
      summary_text,
      severity_level,
      alert_status,
      triggered_at,
      severity,
      status,
      escalation_state,
      due_at,
      created_at,
      updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, 'none', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )`,
    [
      parkId,
      sourceType,
      sourceId,
      alertType,
      message,
      summaryText || message,
      normalizedSeverity,
      normalizedStatus,
      triggeredAt,
      LEGACY_SEVERITY_MAP[normalizedSeverity],
      LEGACY_STATUS_MAP[normalizedStatus]
    ]
  );

  const manager = await findManagerEmail(parkId);
  if (manager?.manager_email) {
    await sendAlertEmail({
      to: manager.manager_email,
      subject: `Parks Connect alert: ${alertType}`,
      text: `${summaryText || message}\n\nPark: ${manager.name || parkId}\nSeverity: ${normalizedSeverity}\nStatus: ${normalizedStatus}`
    });
  }

  return result.lastID;
}

export async function evaluateFeedbackAlerts() {
  const db = await getDb();
  const parks = await db.all(`SELECT id, name, daily_capacity_limit, manager_email FROM parks`);

  const droughtRows = await db.all(
    `SELECT park_id, comments, rating, category
     FROM tourist_feedback
     WHERE submitted_at >= NOW() - INTERVAL '7 days'`
  );

  const infrastructureRows = await db.all(
    `SELECT park_id, comments, rating, category
     FROM tourist_feedback
     WHERE submitted_at >= NOW() - INTERVAL '48 hours'`
  );

  const securityRows = await db.all(
    `SELECT park_id, comments, rating, category
     FROM tourist_feedback
     WHERE submitted_at >= NOW() - INTERVAL '15 minutes'`
  );

  const capacityRows = await db.all(
    `SELECT park_id, comments, rating, category
     FROM tourist_feedback
     WHERE submitted_at >= DATE_TRUNC('day', NOW())`
  );

  const alerts = [
    ...detectFeedbackAlerts(droughtRows, parks).filter((alert) => alert.alertType === 'drought_indicator'),
    ...detectFeedbackAlerts(infrastructureRows, parks).filter((alert) => alert.alertType === 'infrastructure_failure'),
    ...detectFeedbackAlerts(securityRows, parks).filter((alert) => alert.alertType === 'security_incident'),
    ...detectFeedbackAlerts(capacityRows, parks).filter((alert) => alert.alertType === 'capacity_threshold')
  ];

  let created = 0;
  for (const alert of alerts) {
    const id = await createAlert({
      alertType: alert.alertType,
      message: alert.summaryText,
      summaryText: alert.summaryText,
      severity: alert.severity,
      parkId: alert.parkId,
      sourceType: 'feedback_cron'
    });
    if (id) created += 1;
  }

  return created;
}

export async function generateThresholdNotifications() {
  return 0;
}

export async function listOpenAlerts({ parkIds = null } = {}) {
  const db = await getDb();
  const params = [];
  const filters = [`COALESCE(a.alert_status, CASE WHEN a.status = 'resolved' THEN 'resolved' ELSE 'open' END) IN ('open','acknowledged')`];

  if (parkIds !== null) {
    if (!parkIds.length) return [];
    filters.push(`a.park_id IN (${parkIds.map(() => '?').join(',')})`);
    params.push(...parkIds);
  }

  return db.all(
    `SELECT
      a.id,
      a.park_id,
      p.name AS park_name,
      a.alert_type,
      COALESCE(a.summary_text, a.message) AS summary_text,
      COALESCE(a.triggered_at, a.created_at) AS triggered_at,
      COALESCE(a.severity_level,
        CASE a.severity WHEN 'critical' THEN 'critical' WHEN 'warning' THEN 'high' ELSE 'medium' END
      ) AS severity,
      COALESCE(a.alert_status,
        CASE
          WHEN a.status = 'resolved' THEN 'resolved'
          WHEN a.status IN ('assigned','in_progress','escalated') THEN 'acknowledged'
          ELSE 'open'
        END
      ) AS status
     FROM alerts a
     LEFT JOIN parks p ON p.id = a.park_id
     WHERE ${filters.join(' AND ')}
     ORDER BY COALESCE(a.triggered_at, a.created_at) DESC`,
    params
  );
}

export async function updateAlertStatus(id, status) {
  const db = await getDb();
  const normalizedStatus = normalizeAlertStatus(status);
  await db.run(
    `UPDATE alerts
     SET alert_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [normalizedStatus, LEGACY_STATUS_MAP[normalizedStatus], id]
  );
}

export async function escalateOverdueAlerts() {
  return 0;
}

export { normalizeAlertSeverity, normalizeAlertStatus, OPEN_ALERT_STATUSES };
