import { getAssignedParkIds, normalizeRole } from '../utils/parks.js';
import { listOpenAlerts, updateAlertStatus } from '../utils/notifier.js';

export async function listNotifications(req, res) {
  const role = normalizeRole(req.user.role);
  const allowedParks = await getAssignedParkIds(req.user);
  const parkIds = role === 'authority_admin' ? null : allowedParks;
  const rows = await listOpenAlerts({ parkIds });

  res.json(
    rows.map((row) => ({
      id: row.id,
      park_id: row.park_id,
      park_name: row.park_name,
      type: row.alert_type,
      message: row.summary_text,
      summary_text: row.summary_text,
      severity: row.severity,
      status: row.status,
      created_at: row.triggered_at,
      triggered_at: row.triggered_at
    }))
  );
}

export async function resolveNotification(req, res) {
  await updateAlertStatus(req.params.id, 'resolved');
  res.json({ message: 'resolved' });
}
